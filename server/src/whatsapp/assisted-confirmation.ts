import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contentItems, scheduledPostMedia, scheduledPosts } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { sendWhatsAppText } from './cloud-api.js';
import { EarthcureWhatsAppError, sendViaEarthcureWhatsAppWithRetry } from './earthcure-bridge.js';

type IncomingWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

type InboundEventRecordParams = {
  providerMessageId: string | null;
  fromPhone: string | null;
  contextMessageId: string | null;
  replyText: string | null;
  rawMessage: Record<string, unknown>;
};

type InboundEventRecordResult = {
  eventId: string | null;
  duplicate: boolean;
};

type PendingConfirmation = {
  id: string;
  scheduled_post_id: string;
  recipient_phone: string;
  prompt_message_id: string | null;
  final_text: string;
  media_url: string;
  mime_type: string | null;
};

let ensureTablePromise: Promise<void> | null = null;
let ensureInboundTablePromise: Promise<void> | null = null;
let ensureOutboundsTablePromise: Promise<void> | null = null;
const AWAITING_CONFIRMATION_STATUS = 'awaiting_whatsapp_confirmation';
const LEGACY_PENDING_STATUS = 'pending';

const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const normalizePhone = (value: string) => value.replace(/[^\d]/g, '');

const resolveRecipientPhone = (override?: string | null) => {
  const raw = (override || process.env.WA_DEFAULT_RECIPIENT_PHONE || process.env.WA_RECIPIENT_PHONE || '').trim();
  const normalized = normalizePhone(raw);
  if (!normalized) {
    throw new Error('Missing recipient phone for assisted confirmation prompt');
  }
  return normalized;
};

const ensureConfirmationsTable = async () => {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_assisted_confirmations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          scheduled_post_id TEXT NOT NULL,
          recipient_phone TEXT NOT NULL,
          prompt_message_id TEXT NOT NULL,
          final_text TEXT NOT NULL,
          media_url TEXT NOT NULL,
          mime_type TEXT,
          status TEXT NOT NULL DEFAULT 'awaiting_whatsapp_confirmation',
          confirmed_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          response_message_id TEXT,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        ALTER TABLE whatsapp_assisted_confirmations
        ADD COLUMN IF NOT EXISTS outbound_operation_key TEXT
      `);
      await db.execute(sql`
        ALTER TABLE whatsapp_assisted_confirmations
        ALTER COLUMN prompt_message_id DROP NOT NULL
      `);
      await db.execute(sql`
        ALTER TABLE whatsapp_assisted_confirmations
        ALTER COLUMN status SET DEFAULT 'awaiting_whatsapp_confirmation'
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_assisted_prompt_message_id
        ON whatsapp_assisted_confirmations (prompt_message_id)
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_assisted_outbound_operation_key
        ON whatsapp_assisted_confirmations (outbound_operation_key)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_assisted_status_created
        ON whatsapp_assisted_confirmations (status, created_at DESC)
      `);
    })().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  await ensureTablePromise;
};

const ensureOutboundOperationsTable = async () => {
  if (!ensureOutboundsTablePromise) {
    ensureOutboundsTablePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_outbound_operations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          operation_id TEXT NOT NULL,
          operation_key TEXT NOT NULL,
          destination_phone TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'content_flow',
          status TEXT NOT NULL DEFAULT 'pending',
          response_status INTEGER,
          provider_message_id TEXT,
          request_id TEXT,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbound_operation_key
        ON whatsapp_outbound_operations (operation_key)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_operation_created
        ON whatsapp_outbound_operations (created_at DESC)
      `);
    })().catch((error) => {
      ensureOutboundsTablePromise = null;
      throw error;
    });
  }
  await ensureOutboundsTablePromise;
};

const parseBodyParamsTemplate = (captionPreview: string, publishDate: string, publishTime: string) => {
  const mode = (process.env.WA_CONFIRMATION_BODY_MODE || 'caption').trim().toLowerCase();
  if (mode === 'none' || mode === '0' || mode === 'off') {
    return [] as string[];
  }

  const raw = (process.env.WA_CONFIRMATION_BODY_PARAMS || '').trim();
  if (!raw) {
    return [captionPreview];
  }

  return raw
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\{caption\}/gi, captionPreview)
        .replace(/\{publish_date\}/gi, publishDate)
        .replace(/\{publish_time\}/gi, publishTime)
    );
};

const createPromptPreview = (caption: string) => {
  const trimmed = caption.trim();
  const max = 120;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
};

const buildAssistedPromptText = (params: { captionPreview: string; publishDate: string; publishTime: string }) => {
  const fallbackTemplate = [
    'Scheduled WhatsApp status is ready.',
    '{publish_date_line}',
    '{publish_time_line}',
    'Preview: {caption}',
    'Reply YES to publish, or NO to skip.',
  ].join('\n');
  const rawTemplate = (process.env.WA_ASSISTED_CONFIRMATION_PROMPT_TEXT || fallbackTemplate).trim() || fallbackTemplate;
  const publishDateLine = params.publishDate ? `Date: ${params.publishDate}` : '';
  const publishTimeLine = params.publishTime ? `Time: ${params.publishTime}` : '';
  return rawTemplate
    .replace(/\{caption\}/gi, params.captionPreview)
    .replace(/\{publish_date\}/gi, params.publishDate || '')
    .replace(/\{publish_time\}/gi, params.publishTime || '')
    .replace(/\{publish_date_line\}/gi, publishDateLine)
    .replace(/\{publish_time_line\}/gi, publishTimeLine)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const maskPhoneForLogs = (phone: string) => {
  if (!phone) return '***';
  if (phone.length <= 4) return '***';
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
};

const isSendableMediaLink = (value: string) => /^https?:\/\//i.test(value.trim());

const PUBLISHING_STATUS = 'publishing';
const PUBLISHED_STATUS = 'published';
const RETRYABLE_FAILED_STATUS = 'failed_with_reason';

const normalizeIntentText = (text: string) => {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[!?.;,:'"(){}\[\]]/g, '');
};

const parseIntentTokens = (raw: string): string[] => {
  return raw
    .split(',')
    .map((value) => normalizeIntentText(value))
    .filter(Boolean);
};

export const isAffirmativeReply = (text: string) => {
  const value = normalizeIntentText(text);
  if (!value) return false;
  const defaults = [
    'yes',
    'y',
    'ok',
    'okay',
    'confirm',
    'confirmed',
    'post',
    'publish',
    'ship it',
    'go live',
    'do it',
    '👍',
    '👍🏽',
    '👍🏿',
  ];
  const fromEnv = parseIntentTokens((process.env.WA_CONFIRM_AFFIRMATIVE_TOKENS || '').trim());
  const accepted = new Set([...defaults, ...fromEnv]);
  return accepted.has(value);
};

const isNegativeReply = (text: string) => {
  const value = normalizeIntentText(text);
  const defaults = ['no', 'n', 'cancel', 'skip'];
  const fromEnv = parseIntentTokens((process.env.WA_CONFIRM_NEGATIVE_TOKENS || '').trim());
  const accepted = new Set([...defaults, ...fromEnv]);
  return accepted.has(value);
};

export const extractInboundMessagesFromWebhook = (payload: IncomingWebhookPayload) => {
  return (payload.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || [])
    .filter((message): message is Record<string, unknown> => !!message && typeof message === 'object');
};

const extractReplyText = (message: Record<string, unknown>): string | null => {
  const textBody = (message.text as { body?: unknown } | undefined)?.body;
  if (typeof textBody === 'string' && textBody.trim()) return textBody;

  const buttonPayload = (message.button as { payload?: unknown } | undefined)?.payload;
  if (typeof buttonPayload === 'string' && buttonPayload.trim()) return buttonPayload;

  const buttonText = (message.button as { text?: unknown } | undefined)?.text;
  if (typeof buttonText === 'string' && buttonText.trim()) return buttonText;

  const interactive = message.interactive as
    | {
        button_reply?: { id?: unknown; title?: unknown };
        list_reply?: { id?: unknown; title?: unknown };
      }
    | undefined;
  const replyId = interactive?.button_reply?.id;
  if (typeof replyId === 'string' && replyId.trim()) return replyId;
  const replyTitle = interactive?.button_reply?.title;
  if (typeof replyTitle === 'string' && replyTitle.trim()) return replyTitle;
  const listReplyId = interactive?.list_reply?.id;
  if (typeof listReplyId === 'string' && listReplyId.trim()) return listReplyId;
  const listReplyTitle = interactive?.list_reply?.title;
  if (typeof listReplyTitle === 'string' && listReplyTitle.trim()) return listReplyTitle;

  return null;
};

const extractContextMessageId = (message: Record<string, unknown>): string | null => {
  const contextId = (message.context as { id?: unknown } | undefined)?.id;
  return typeof contextId === 'string' && contextId.trim() ? contextId : null;
};

const extractProviderMessageId = (message: Record<string, unknown>): string | null => {
  const id = message.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
};

const ensureInboundEventsTable = async () => {
  if (!ensureInboundTablePromise) {
    ensureInboundTablePromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_inbound_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider_message_id TEXT,
          from_phone TEXT,
          context_message_id TEXT,
          reply_text TEXT,
          matched_confirmation_id UUID,
          status TEXT NOT NULL DEFAULT 'received',
          error_text TEXT,
          raw_message_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_inbound_provider_message_id
        ON whatsapp_inbound_events (provider_message_id)
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_created
        ON whatsapp_inbound_events (created_at DESC)
      `);
    })().catch((error) => {
      ensureInboundTablePromise = null;
      throw error;
    });
  }
  await ensureInboundTablePromise;
};

const recordInboundEvent = async (params: InboundEventRecordParams): Promise<InboundEventRecordResult> => {
  await ensureInboundEventsTable();
  const rawMessageJson = JSON.stringify(params.rawMessage);
  const insert = await db.execute(sql`
    INSERT INTO whatsapp_inbound_events (
      provider_message_id,
      from_phone,
      context_message_id,
      reply_text,
      raw_message_json,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${params.providerMessageId},
      ${params.fromPhone},
      ${params.contextMessageId},
      ${params.replyText},
      ${rawMessageJson}::jsonb,
      'received',
      now(),
      now()
    )
    ON CONFLICT (provider_message_id) DO NOTHING
    RETURNING id
  `);
  const rows = Array.isArray((insert as any).rows) ? ((insert as any).rows as Array<{ id?: string }>) : [];
  if (rows.length > 0 && rows[0]?.id) {
    return { eventId: rows[0].id, duplicate: false };
  }

  if (params.providerMessageId) {
    return { eventId: null, duplicate: true };
  }

  const fallbackInsert = await db.execute(sql`
    INSERT INTO whatsapp_inbound_events (
      provider_message_id,
      from_phone,
      context_message_id,
      reply_text,
      raw_message_json,
      status,
      created_at,
      updated_at
    )
    VALUES (
      NULL,
      ${params.fromPhone},
      ${params.contextMessageId},
      ${params.replyText},
      ${rawMessageJson}::jsonb,
      'received',
      now(),
      now()
    )
    RETURNING id
  `);
  const fallbackRows = Array.isArray((fallbackInsert as any).rows)
    ? ((fallbackInsert as any).rows as Array<{ id?: string }>)
    : [];
  return { eventId: fallbackRows[0]?.id || null, duplicate: false };
};

const updateInboundEventOutcome = async (
  eventId: string | null,
  params: { status: string; matchedConfirmationId?: string | null; errorText?: string | null }
) => {
  if (!eventId) return;
  await ensureInboundEventsTable();
  await db.execute(sql`
    UPDATE whatsapp_inbound_events
    SET status = ${params.status},
        matched_confirmation_id = ${params.matchedConfirmationId ?? null},
        error_text = ${params.errorText ?? null},
        updated_at = now()
    WHERE id = ${eventId}
  `);
};

const findPendingConfirmation = async (
  fromPhone: string,
  contextMessageId: string | null
): Promise<PendingConfirmation | null> => {
  await ensureConfirmationsTable();

  if (contextMessageId) {
    const byContext = await db.execute(sql`
      SELECT id, scheduled_post_id, recipient_phone, prompt_message_id, final_text, media_url, mime_type
      FROM whatsapp_assisted_confirmations
      WHERE prompt_message_id = ${contextMessageId}
        AND status IN (${AWAITING_CONFIRMATION_STATUS}, ${LEGACY_PENDING_STATUS}, ${RETRYABLE_FAILED_STATUS})
      ORDER BY created_at DESC
      LIMIT 1
    `);
    if (Array.isArray((byContext as any).rows) && (byContext as any).rows.length > 0) {
      return (byContext as any).rows[0] as PendingConfirmation;
    }
  }

  const normalizedPhone = normalizePhone(fromPhone);
  const byPhone = await db.execute(sql`
    SELECT id, scheduled_post_id, recipient_phone, prompt_message_id, final_text, media_url, mime_type
    FROM whatsapp_assisted_confirmations
    WHERE recipient_phone = ${normalizedPhone}
      AND status IN (${AWAITING_CONFIRMATION_STATUS}, ${LEGACY_PENDING_STATUS}, ${RETRYABLE_FAILED_STATUS})
    ORDER BY created_at DESC
    LIMIT 1
  `);
  if (Array.isArray((byPhone as any).rows) && (byPhone as any).rows.length > 0) {
    return (byPhone as any).rows[0] as PendingConfirmation;
  }

  return null;
};

const updateConfirmationState = async (
  id: string,
  update: {
    status: string;
    confirmedAt?: Date | null;
    completedAt?: Date | null;
    responseMessageId?: string | null;
    lastError?: string | null;
  }
) => {
  await ensureConfirmationsTable();
  await db.execute(sql`
    UPDATE whatsapp_assisted_confirmations
    SET status = ${update.status},
        confirmed_at = ${update.confirmedAt ?? null},
        completed_at = ${update.completedAt ?? null},
        response_message_id = ${update.responseMessageId ?? null},
        last_error = ${update.lastError ?? null},
        updated_at = now()
    WHERE id = ${id}
  `);
};

type AssistedConfirmationDeps = {
  loadScheduledPostTime?: (scheduledPostId: string) => Promise<Date | null>;
  loadOutboundByOperationKey?: (operationKey: string) => Promise<{
    providerMessageId: string | null;
    responseStatus: number | null;
    requestId: string | null;
    status?: string | null;
    updatedAt?: Date | string | null;
  } | null>;
  insertOutboundOperation?: (params: {
    operationId: string;
    operationKey: string;
    recipientPhone: string;
  }) => Promise<void>;
  markOutboundOperationRetrying?: (params: { operationKey: string }) => Promise<void>;
  updateOutboundSent?: (params: {
    operationKey: string;
    status: number;
    providerMessageId: string;
    requestId: string;
  }) => Promise<void>;
  updateOutboundFailed?: (params: { operationKey: string; errorMessage: string }) => Promise<void>;
  upsertConfirmationRecord?: (params: {
    scheduledPostId: string;
    recipientPhone: string;
    promptMessageId?: string | null;
    caption: string;
    mediaUrl: string;
    mimeType?: string | null;
    operationKey: string;
  }) => Promise<void>;
  sendPrompt?: typeof sendViaEarthcureWhatsAppWithRetry;
};

export const startAssistedConfirmationForScheduledPost = async (params: {
  scheduledPostId: string;
  caption: string;
  mediaUrl: string;
  mimeType?: string | null;
  recipientPhone?: string | null;
  operationId?: string | null;
}, deps: AssistedConfirmationDeps = {}) => {
  const usesDefaultPersistence =
    !deps.loadScheduledPostTime ||
    !deps.loadOutboundByOperationKey ||
    !deps.insertOutboundOperation ||
    !deps.updateOutboundSent ||
    !deps.updateOutboundFailed ||
    !deps.upsertConfirmationRecord;
  if (usesDefaultPersistence) {
    await ensureConfirmationsTable();
    await ensureOutboundOperationsTable();
  }
  const recipientPhone = resolveRecipientPhone(params.recipientPhone);
  const operationId = (params.operationId || `${params.scheduledPostId}:prompt`).trim();
  const operationKey = `assisted-confirmation:${operationId}`;
  const stalePendingMs = Number(process.env.WA_ASSISTED_CONFIRMATION_PENDING_STALE_MS || 120000);

  const loadScheduledPostTime =
    deps.loadScheduledPostTime ||
    (async (scheduledPostId: string) => {
      const [scheduledPost] = await db
        .select({ scheduledAt: scheduledPosts.scheduledAt })
        .from(scheduledPosts)
        .where(eq(scheduledPosts.id, scheduledPostId))
        .limit(1);
      return scheduledPost?.scheduledAt ?? null;
    });
  const loadOutboundByOperationKey =
    deps.loadOutboundByOperationKey ||
    (async (key: string) => {
      const existingOutbound = await db.execute(sql`
        SELECT provider_message_id, response_status, request_id, status, updated_at
        FROM whatsapp_outbound_operations
        WHERE operation_key = ${key}
        LIMIT 1
      `);
      const rows = Array.isArray((existingOutbound as any).rows) ? ((existingOutbound as any).rows as any[]) : [];
      if (rows.length === 0) return null;
      return {
        providerMessageId: rows[0]?.provider_message_id ?? null,
        responseStatus: rows[0]?.response_status ?? null,
        requestId: rows[0]?.request_id ?? null,
        status: rows[0]?.status ?? null,
        updatedAt: rows[0]?.updated_at ?? null,
      };
    });
  const insertOutboundOperation =
    deps.insertOutboundOperation ||
    (async (input: { operationId: string; operationKey: string; recipientPhone: string }) => {
      await db.execute(sql`
        INSERT INTO whatsapp_outbound_operations (
          id,
          operation_id,
          operation_key,
          destination_phone,
          source,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ${generateId()},
          ${input.operationId},
          ${input.operationKey},
          ${input.recipientPhone},
          'content_flow_assisted_publish',
          'pending',
          now(),
          now()
        )
      `);
    });
  const updateOutboundSent =
    deps.updateOutboundSent ||
    (async (input: { operationKey: string; status: number; providerMessageId: string; requestId: string }) => {
      await db.execute(sql`
        UPDATE whatsapp_outbound_operations
        SET status = 'sent',
            response_status = ${input.status},
            provider_message_id = ${input.providerMessageId},
            request_id = ${input.requestId},
            last_error = NULL,
            updated_at = now()
        WHERE operation_key = ${input.operationKey}
      `);
    });
  const updateOutboundFailed =
    deps.updateOutboundFailed ||
    (async (input: { operationKey: string; errorMessage: string }) => {
      await db.execute(sql`
        UPDATE whatsapp_outbound_operations
        SET status = 'failed',
            last_error = ${input.errorMessage},
            updated_at = now()
        WHERE operation_key = ${input.operationKey}
      `);
    });
  const markOutboundOperationRetrying =
    deps.markOutboundOperationRetrying ||
    (async (input: { operationKey: string }) => {
      await db.execute(sql`
        UPDATE whatsapp_outbound_operations
        SET status = 'pending',
            response_status = NULL,
            provider_message_id = NULL,
            request_id = NULL,
            last_error = NULL,
            updated_at = now()
        WHERE operation_key = ${input.operationKey}
      `);
    });
  const upsertConfirmationRecord =
    deps.upsertConfirmationRecord ||
    (async (input: {
      scheduledPostId: string;
      recipientPhone: string;
      promptMessageId?: string | null;
      caption: string;
      mediaUrl: string;
      mimeType?: string | null;
      operationKey: string;
    }) => {
      await db.execute(sql`
        INSERT INTO whatsapp_assisted_confirmations (
          id,
          scheduled_post_id,
          recipient_phone,
          prompt_message_id,
          final_text,
          media_url,
          mime_type,
          status,
          outbound_operation_key,
          created_at,
          updated_at
        )
        VALUES (
          ${generateId()},
          ${input.scheduledPostId},
          ${input.recipientPhone},
          ${input.promptMessageId ?? null},
          ${input.caption},
          ${input.mediaUrl},
          ${input.mimeType ?? null},
          ${AWAITING_CONFIRMATION_STATUS},
          ${input.operationKey},
          now(),
          now()
        )
        ON CONFLICT (outbound_operation_key) DO UPDATE
        SET recipient_phone = EXCLUDED.recipient_phone,
            prompt_message_id = EXCLUDED.prompt_message_id,
            final_text = EXCLUDED.final_text,
            media_url = EXCLUDED.media_url,
            mime_type = EXCLUDED.mime_type,
            status = ${AWAITING_CONFIRMATION_STATUS},
            last_error = NULL,
            updated_at = now()
      `);
    });
  const sendPrompt = deps.sendPrompt || sendViaEarthcureWhatsAppWithRetry;

  const previewText = createPromptPreview(params.caption);
  const scheduledAt = await loadScheduledPostTime(params.scheduledPostId);
  const scheduledDate = scheduledAt ? scheduledAt.toISOString().slice(0, 10) : '';
  const scheduledTime = scheduledAt ? scheduledAt.toISOString().slice(11, 16) : '';
  const promptText = buildAssistedPromptText({
    captionPreview: parseBodyParamsTemplate(previewText, scheduledDate, scheduledTime)[0] || previewText,
    publishDate: scheduledDate,
    publishTime: scheduledTime,
  });

  const existing = await loadOutboundByOperationKey(operationKey);
  if (existing) {
    if (existing.providerMessageId) {
      logger.info('Assisted confirmation prompt deduped by operation id', {
        requestId: existing.requestId ?? null,
        operationId,
        destination: maskPhoneForLogs(recipientPhone),
        scheduledPostId: params.scheduledPostId,
        responseStatus: existing.responseStatus ?? null,
        providerMessageId: existing.providerMessageId,
      });
      await upsertConfirmationRecord({
        scheduledPostId: params.scheduledPostId,
        recipientPhone,
        promptMessageId: existing.providerMessageId,
        caption: params.caption,
        mediaUrl: params.mediaUrl,
        mimeType: params.mimeType ?? null,
        operationKey,
      });
      return { promptMessageId: existing.providerMessageId };
    }
    const existingStatus = String(existing.status || '').trim().toLowerCase();
    const updatedAtMs =
      existing.updatedAt instanceof Date
        ? existing.updatedAt.getTime()
        : typeof existing.updatedAt === 'string' && existing.updatedAt
          ? new Date(existing.updatedAt).getTime()
          : Number.NaN;
    const isStalePending =
      existingStatus === 'pending' &&
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs >= Math.max(30000, stalePendingMs);
    const canRetry = existingStatus === 'failed' || isStalePending;
    if (!canRetry) {
      throw new Error(`Assisted confirmation prompt already in progress for operation id ${operationId}`);
    }
    logger.warn('Retrying existing assisted confirmation prompt operation', {
      operationId,
      operationKey,
      previousStatus: existingStatus || 'unknown',
      stalePendingMs: isStalePending ? Date.now() - updatedAtMs : null,
      destination: maskPhoneForLogs(recipientPhone),
    });
    await markOutboundOperationRetrying({ operationKey });
  } else {
    await insertOutboundOperation({ operationId, operationKey, recipientPhone });
  }

  try {
    const prompt = await sendPrompt({
      to: recipientPhone,
      body: promptText,
      source: 'content_flow_assisted_publish',
      message_type: 'text',
      operationId,
      maxAttempts: 3,
    });
    await updateOutboundSent({
      operationKey,
      status: prompt.status,
      providerMessageId: prompt.providerMessageId,
      requestId: prompt.requestId,
    });
    await upsertConfirmationRecord({
      scheduledPostId: params.scheduledPostId,
      recipientPhone,
      promptMessageId: prompt.providerMessageId,
      caption: params.caption,
      mediaUrl: params.mediaUrl,
      mimeType: params.mimeType ?? null,
      operationKey,
    });
    logger.info('Assisted confirmation prompt sent via Earthcure bridge', {
      requestId: prompt.requestId,
      operationId,
      destination: maskPhoneForLogs(recipientPhone),
      responseStatus: prompt.status,
      providerMessageId: prompt.providerMessageId,
    });
    return { promptMessageId: prompt.providerMessageId };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await updateOutboundFailed({ operationKey, errorMessage: messageText });
    await upsertConfirmationRecord({
      scheduledPostId: params.scheduledPostId,
      recipientPhone,
      promptMessageId: null,
      caption: params.caption,
      mediaUrl: params.mediaUrl,
      mimeType: params.mimeType ?? null,
      operationKey,
    });
    const genericTransient = /timeout|timed out|HTTP 5\d\d|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(messageText);
    const retryableError =
      (error instanceof EarthcureWhatsAppError && error.retryable) ||
      (!(error instanceof EarthcureWhatsAppError) && genericTransient);
    if (retryableError) {
      logger.warn('Assisted confirmation prompt send is retryable; continuing with phone-based pending confirmation', {
        operationId,
        scheduledPostId: params.scheduledPostId,
        destination: maskPhoneForLogs(recipientPhone),
        error: messageText,
      });
      return { promptMessageId: `pending:${operationKey}` };
    }
    logger.error('Assisted confirmation prompt failed via Earthcure bridge', {
      operationId,
      scheduledPostId: params.scheduledPostId,
      destination: maskPhoneForLogs(recipientPhone),
      error: messageText,
    });
    throw error;
  }
};

const getEarthcureMessageType = (params: { mimeType?: string | null; mediaType?: string | null }) => {
  const mime = (params.mimeType || '').trim().toLowerCase();
  const mediaType = (params.mediaType || '').trim().toLowerCase();
  if (mime.startsWith('video/') || mediaType === 'video') return 'video' as const;
  if (mime.startsWith('audio/')) return 'audio' as const;
  if (mime.startsWith('application/') || mediaType === 'document') return 'document' as const;
  return 'image' as const;
};

const trimCaptionForMedia = (value: string) => {
  const text = value.trim();
  const limit = 1024;
  if (text.length <= limit) {
    return { caption: text, overflowText: '' };
  }
  return {
    caption: `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`,
    overflowText: text,
  };
};

const claimPendingConfirmationForPublish = async (
  confirmationId: string,
  now: Date
): Promise<'claimed' | 'already_in_progress_or_sent'> => {
  await ensureConfirmationsTable();
  const update = await db.execute(sql`
    UPDATE whatsapp_assisted_confirmations
    SET status = ${PUBLISHING_STATUS},
        confirmed_at = ${now},
        updated_at = now()
    WHERE id = ${confirmationId}
      AND status IN (${AWAITING_CONFIRMATION_STATUS}, ${LEGACY_PENDING_STATUS}, ${RETRYABLE_FAILED_STATUS})
    RETURNING id
  `);
  const rows = Array.isArray((update as any).rows) ? ((update as any).rows as Array<{ id?: string }>) : [];
  return rows.length > 0 ? 'claimed' : 'already_in_progress_or_sent';
};

const claimInboundPublishOperation = async (params: {
  pendingConfirmationId: string;
  inboundProviderMessageId?: string | null;
  recipientPhone: string;
}): Promise<{ operationKey: string; claimed: boolean }> => {
  await ensureOutboundOperationsTable();
  const operationKey = `assisted-publish-inbound:${params.pendingConfirmationId}:${params.inboundProviderMessageId || 'no-provider-id'}`;
  const insert = await db.execute(sql`
    INSERT INTO whatsapp_outbound_operations (
      id,
      operation_id,
      operation_key,
      destination_phone,
      source,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ${generateId()},
      ${operationKey},
      ${operationKey},
      ${params.recipientPhone},
      'content_flow_assisted_publish_execute_event',
      'pending',
      now(),
      now()
    )
    ON CONFLICT (operation_key) DO NOTHING
    RETURNING id
  `);
  const rows = Array.isArray((insert as any).rows) ? ((insert as any).rows as Array<{ id?: string }>) : [];
  return { operationKey, claimed: rows.length > 0 };
};

const loadPublishMediaQueue = async (pending: PendingConfirmation) => {
  const rows = await db
    .select({
      storageUrl: scheduledPostMedia.storageUrl,
      mimeType: scheduledPostMedia.mimeType,
      type: scheduledPostMedia.type,
      fileName: scheduledPostMedia.fileName,
    })
    .from(scheduledPostMedia)
    .where(eq(scheduledPostMedia.scheduledPostId, pending.scheduled_post_id));
  const valid = rows
    .filter((row) => {
      const storageUrl = (row.storageUrl || '').trim();
      return !!storageUrl && isSendableMediaLink(storageUrl);
    })
    .map((row) => ({
      mediaUrl: (row.storageUrl || '').trim(),
      mimeType: (row.mimeType || '').trim() || null,
      mediaType: (row.type || '').trim() || null,
      fileName: (row.fileName || '').trim() || null,
    }));
  if (valid.length > 0) return valid;
  return [
    {
      mediaUrl: (pending.media_url || '').trim(),
      mimeType: (pending.mime_type || '').trim() || null,
      mediaType: null,
      fileName: null,
    },
  ].filter((row) => !!row.mediaUrl && isSendableMediaLink(row.mediaUrl));
};

const handleAffirmativeReply = async (
  pending: PendingConfirmation,
  now: Date,
  replyPhone?: string | null,
  inboundProviderMessageId?: string | null
) => {
  const recipientPhone = (replyPhone || '').trim() || pending.recipient_phone;
  const inboundClaim = await claimInboundPublishOperation({
    pendingConfirmationId: pending.id,
    inboundProviderMessageId,
    recipientPhone,
  });
  if (!inboundClaim.claimed) {
    logger.info('Duplicate inbound confirmation publish operation ignored', {
      confirmationId: pending.id,
      scheduledPostId: pending.scheduled_post_id,
      inboundProviderMessageId: inboundProviderMessageId || null,
      operationKey: inboundClaim.operationKey,
    });
    return;
  }

  const claimResult = await claimPendingConfirmationForPublish(pending.id, now);
  if (claimResult !== 'claimed') {
    logger.info('Skipping duplicate assisted publish confirmation execution', {
      confirmationId: pending.id,
      scheduledPostId: pending.scheduled_post_id,
      inboundProviderMessageId: inboundProviderMessageId || null,
    });
    await db.execute(sql`
      UPDATE whatsapp_outbound_operations
      SET status = 'sent',
          response_status = 200,
          provider_message_id = NULL,
          request_id = NULL,
          updated_at = now()
      WHERE operation_key = ${inboundClaim.operationKey}
    `);
    return;
  }
  try {
    const mediaQueue = await loadPublishMediaQueue(pending);
    if (mediaQueue.length === 0) {
      throw new Error('No queued WhatsApp media found for assisted publish execution');
    }

    const providerMessageIds: string[] = [];
    const captionParts = trimCaptionForMedia(pending.final_text || '');
    for (let index = 0; index < mediaQueue.length; index += 1) {
      const item = mediaQueue[index];
      const messageType = getEarthcureMessageType({ mimeType: item.mimeType, mediaType: item.mediaType });
      const operationId = `assisted-publish:${pending.id}:${inboundProviderMessageId || 'unknown'}:${index + 1}`;
      const result = await sendViaEarthcureWhatsAppWithRetry({
        to: recipientPhone,
        message_type: messageType,
        media_link: item.mediaUrl,
        caption: index === 0 ? captionParts.caption : undefined,
        filename: messageType === 'document' ? item.fileName || undefined : undefined,
        source: 'content_flow_assisted_publish_execute',
        operationId,
        maxAttempts: 3,
      });
      providerMessageIds.push(result.providerMessageId);
    }

    if (captionParts.overflowText && captionParts.overflowText.length > captionParts.caption.length) {
      const textResult = await sendViaEarthcureWhatsAppWithRetry({
        to: recipientPhone,
        body: captionParts.overflowText,
        message_type: 'text',
        source: 'content_flow_assisted_publish_execute',
        operationId: `assisted-publish:${pending.id}:${inboundProviderMessageId || 'unknown'}:tail-text`,
        maxAttempts: 3,
      });
      providerMessageIds.push(textResult.providerMessageId);
    }

    await db.execute(sql`
      UPDATE whatsapp_outbound_operations
      SET status = 'sent',
          response_status = 200,
          provider_message_id = ${providerMessageIds.join(',')},
          request_id = NULL,
          last_error = NULL,
          updated_at = now()
      WHERE operation_key = ${inboundClaim.operationKey}
    `);

    await updateConfirmationState(pending.id, {
      status: PUBLISHED_STATUS,
      confirmedAt: now,
      completedAt: now,
      responseMessageId: providerMessageIds.join(','),
      lastError: null,
    });

    await db
      .update(scheduledPosts)
      .set({
        status: 'published',
        updatedAt: now,
      })
      .where(eq(scheduledPosts.id, pending.scheduled_post_id));

    const [post] = await db
      .select({ contentItemId: scheduledPosts.contentItemId })
      .from(scheduledPosts)
      .where(eq(scheduledPosts.id, pending.scheduled_post_id))
      .limit(1);
    if (post?.contentItemId) {
      await db
        .update(contentItems)
        .set({
          status: 'posted',
          updatedAt: now,
        })
        .where(eq(contentItems.id, post.contentItemId));
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    await db.execute(sql`
      UPDATE whatsapp_outbound_operations
      SET status = 'failed',
          last_error = ${messageText},
          updated_at = now()
      WHERE operation_key = ${inboundClaim.operationKey}
    `);
    throw error;
  }
};

const handleNegativeReply = async (pending: PendingConfirmation, now: Date, replyPhone?: string | null) => {
  const recipientPhone = (replyPhone || '').trim() || pending.recipient_phone;
  await updateConfirmationState(pending.id, {
    status: 'declined',
    confirmedAt: now,
    completedAt: now,
    responseMessageId: null,
    lastError: null,
  });
  await db
    .update(scheduledPosts)
    .set({
      status: 'failed',
      updatedAt: now,
    })
    .where(eq(scheduledPosts.id, pending.scheduled_post_id));
  try {
    await sendWhatsAppText('Okay, skipped this scheduled post.', recipientPhone);
  } catch {
    // non-blocking acknowledgement
  }
};

type ProcessorDeps = {
  findPending?: typeof findPendingConfirmation;
  recordInbound?: typeof recordInboundEvent;
  updateInbound?: typeof updateInboundEventOutcome;
  onAffirmative?: typeof handleAffirmativeReply;
  onNegative?: typeof handleNegativeReply;
  onAffirmativeFailure?: (
    pending: PendingConfirmation,
    now: Date,
    messageText: string,
    inboundProviderMessageId?: string | null
  ) => Promise<void>;
};

export const processIncomingConfirmationWebhook = async (
  payload: IncomingWebhookPayload,
  deps: ProcessorDeps = {}
) => {
  const messages = extractInboundMessagesFromWebhook(payload);
  const findPending = deps.findPending || findPendingConfirmation;
  const recordInbound = deps.recordInbound || recordInboundEvent;
  const updateInbound = deps.updateInbound || updateInboundEventOutcome;
  const onAffirmative = deps.onAffirmative || handleAffirmativeReply;
  const onNegative = deps.onNegative || handleNegativeReply;
  const onAffirmativeFailure =
    deps.onAffirmativeFailure ||
    (async (
      pending: PendingConfirmation,
      now: Date,
      messageText: string,
      inboundProviderMessageId?: string | null
    ) => {
      await updateConfirmationState(pending.id, {
        status: RETRYABLE_FAILED_STATUS,
        confirmedAt: now,
        completedAt: null,
        responseMessageId: null,
        lastError: `[retryable] ${messageText}`,
      });
      await db
        .update(scheduledPosts)
        .set({
          status: 'queued',
          updatedAt: now,
        })
        .where(eq(scheduledPosts.id, pending.scheduled_post_id));
      logger.warn('Assisted publish failed but marked retryable', {
        scheduledPostId: pending.scheduled_post_id,
        confirmationId: pending.id,
        inboundProviderMessageId: inboundProviderMessageId || null,
        error: messageText,
      });
    });

  let processed = 0;
  let confirmed = 0;
  let declined = 0;
  let ignored = 0;
  let unmatched = 0;
  let duplicates = 0;
  let failed = 0;

  for (const message of messages) {
    const from = typeof message.from === 'string' ? message.from : '';
    const replyText = extractReplyText(message);
    const providerMessageId = extractProviderMessageId(message);
    const contextMessageId = extractContextMessageId(message);

    let inboundEventId: string | null = null;
    try {
      const inbound = await recordInbound({
        providerMessageId,
        fromPhone: from || null,
        contextMessageId,
        replyText,
        rawMessage: message,
      });
      inboundEventId = inbound.eventId;
      if (inbound.duplicate) {
        duplicates += 1;
        continue;
      }
    } catch (error) {
      logger.warn('Failed to persist inbound WhatsApp event; continuing', {
        providerMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!from || !replyText) {
      ignored += 1;
      await updateInbound(inboundEventId, { status: 'ignored' }).catch((error) => {
        logger.warn('Failed to update inbound event status=ignored', {
          providerMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      continue;
    }

    const pending = await findPending(from, contextMessageId);
    if (!pending) {
      unmatched += 1;
      await updateInbound(inboundEventId, { status: 'unmatched' }).catch((error) => {
        logger.warn('Failed to update inbound event status=unmatched', {
          providerMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      continue;
    }

    processed += 1;
    const now = new Date();

    if (isAffirmativeReply(replyText)) {
      try {
        await onAffirmative(pending, now, from, providerMessageId);
        confirmed += 1;
        await updateInbound(inboundEventId, {
          status: 'confirmed',
          matchedConfirmationId: pending.id,
          errorText: null,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        failed += 1;
        await onAffirmativeFailure(pending, now, messageText, providerMessageId);
        logger.error(`Failed to send confirmed WhatsApp assisted post ${pending.scheduled_post_id}: ${messageText}`);
        await updateInbound(inboundEventId, {
          status: 'failed',
          matchedConfirmationId: pending.id,
          errorText: messageText,
        }).catch((inboundError) => {
          logger.warn('Failed to update inbound event status=failed', {
            providerMessageId,
            error: inboundError instanceof Error ? inboundError.message : String(inboundError),
          });
        });
      }
      continue;
    }

    if (isNegativeReply(replyText)) {
      declined += 1;
      try {
        await onNegative(pending, now, from);
      } catch (error) {
        logger.warn('Failed to process negative WhatsApp confirmation', {
          providerMessageId,
          scheduledPostId: pending.scheduled_post_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await updateInbound(inboundEventId, {
        status: 'declined',
        matchedConfirmationId: pending.id,
        errorText: null,
      }).catch((error) => {
        logger.warn('Failed to update inbound event status=declined', {
          providerMessageId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      continue;
    }

    unmatched += 1;
    await updateInbound(inboundEventId, {
      status: 'unmatched',
      matchedConfirmationId: pending.id,
      errorText: null,
    }).catch((error) => {
      logger.warn('Failed to update inbound event status=unmatched for non-intent reply', {
        providerMessageId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return { processed, confirmed, declined, ignored, unmatched, duplicates, failed, received: messages.length };
};

export const validateForwardToken = (
  headerToken: string | undefined,
  expectedToken: string | undefined
): { ok: boolean; status: 200 | 401 | 403 } => {
  const expected = (expectedToken || '').trim();
  const provided = (headerToken || '').trim();
  if (!provided) {
    return { ok: false, status: 401 };
  }
  if (!expected || provided !== expected) {
    return { ok: false, status: 403 };
  }
  return { ok: true, status: 200 };
};

export const getForwardTokenFromHeader = (headerValue: string | string[] | undefined): string | undefined => {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  if (typeof headerValue === 'string') {
    return headerValue;
  }
  return undefined;
};

