import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contentItems, scheduledPosts } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from './cloud-api.js';
import { sendWhatsAppAssistedStatus } from './status-service.js';

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
  prompt_message_id: string;
  final_text: string;
  media_url: string;
  mime_type: string | null;
};

let ensureTablePromise: Promise<void> | null = null;
let ensureInboundTablePromise: Promise<void> | null = null;

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
          status TEXT NOT NULL DEFAULT 'pending',
          confirmed_at TIMESTAMPTZ,
          completed_at TIMESTAMPTZ,
          response_message_id TEXT,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_assisted_prompt_message_id
        ON whatsapp_assisted_confirmations (prompt_message_id)
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

const getConfirmationTemplateName = () => {
  const specific = (process.env.WA_CONFIRMATION_TEMPLATE_NAME || '').trim();
  const fallback = (process.env.WA_TEMPLATE_NAME || '').trim();
  return specific || fallback;
};

const getConfirmationTemplateLanguage = () => {
  const specific = (process.env.WA_CONFIRMATION_TEMPLATE_LANGUAGE || '').trim();
  const fallback = (process.env.WA_TEMPLATE_LANGUAGE || '').trim();
  return specific || fallback || 'en_US';
};

const parseQuickReplyButtons = () => {
  const buttonMapRaw = (process.env.WA_CONFIRM_BUTTON_PAYLOAD_MAP || '').trim();
  if (buttonMapRaw) {
    const mapped = buttonMapRaw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [indexRaw, payloadRaw = ''] = entry.split(':');
        const index = Number.parseInt((indexRaw || '').trim(), 10);
        const payload = payloadRaw.trim();
        if (Number.isNaN(index) || index < 0 || index > 9) return null;
        return { index, payload };
      })
      .filter((entry): entry is { index: number; payload: string } => !!entry);
    if (mapped.length > 0) {
      return mapped;
    }
  }

  const yesPayload = (process.env.WA_CONFIRM_YES_PAYLOAD || '').trim();
  const yesIndexRaw = (process.env.WA_CONFIRM_YES_BUTTON_INDEX || '0').trim();
  const yesIndex = Number.parseInt(yesIndexRaw, 10);
  if (!yesPayload || Number.isNaN(yesIndex)) {
    return [];
  }
  return [{ index: yesIndex, payload: yesPayload }];
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

const getTemplateRetryWithoutComponents = () => {
  const value = (process.env.WA_CONFIRMATION_TEMPLATE_RETRY_PLAIN || 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'off' && value !== 'no';
};

const createPromptPreview = (caption: string) => {
  const trimmed = caption.trim();
  const max = 120;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
};

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
    | { button_reply?: { id?: unknown; title?: unknown } }
    | undefined;
  const replyId = interactive?.button_reply?.id;
  if (typeof replyId === 'string' && replyId.trim()) return replyId;
  const replyTitle = interactive?.button_reply?.title;
  if (typeof replyTitle === 'string' && replyTitle.trim()) return replyTitle;

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
        AND status = 'pending'
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
      AND status = 'pending'
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

export const startAssistedConfirmationForScheduledPost = async (params: {
  scheduledPostId: string;
  caption: string;
  mediaUrl: string;
  mimeType?: string | null;
  recipientPhone?: string | null;
}) => {
  await ensureConfirmationsTable();
  const recipientPhone = resolveRecipientPhone(params.recipientPhone);

  const templateName = getConfirmationTemplateName();
  if (!templateName) {
    throw new Error(
      'Missing confirmation template configuration. Set WA_CONFIRMATION_TEMPLATE_NAME (or WA_TEMPLATE_NAME).'
    );
  }

  const templateLang = getConfirmationTemplateLanguage();
  const quickReplyButtons = parseQuickReplyButtons();
  const previewText = createPromptPreview(params.caption);
  const [scheduledPost] = await db
    .select({ scheduledAt: scheduledPosts.scheduledAt })
    .from(scheduledPosts)
    .where(eq(scheduledPosts.id, params.scheduledPostId))
    .limit(1);
  const scheduledDate = scheduledPost?.scheduledAt ? scheduledPost.scheduledAt.toISOString().slice(0, 10) : '';
  const scheduledTime = scheduledPost?.scheduledAt ? scheduledPost.scheduledAt.toISOString().slice(11, 16) : '';
  const bodyParams = parseBodyParamsTemplate(previewText, scheduledDate, scheduledTime);

  let prompt;
  try {
    prompt = await sendWhatsAppTemplate({
      name: templateName,
      language: templateLang,
      bodyParams,
      quickReplyButtons,
      recipientPhone,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    const shouldRetryPlain = getTemplateRetryWithoutComponents();
    const parameterMismatch = messageText.includes('code=132000');
    if (!shouldRetryPlain || !parameterMismatch) {
      throw error;
    }
    logger.warn('Retrying confirmation template without components due to parameter mismatch', {
      scheduledPostId: params.scheduledPostId,
      templateName,
      templateLang,
      reason: messageText,
    });
    prompt = await sendWhatsAppTemplate({
      name: templateName,
      language: templateLang,
      recipientPhone,
    });
  }

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
      created_at,
      updated_at
    )
    VALUES (
      ${generateId()},
      ${params.scheduledPostId},
      ${recipientPhone},
      ${prompt.messageId},
      ${params.caption},
      ${params.mediaUrl},
      ${params.mimeType ?? null},
      'pending',
      now(),
      now()
    )
  `);

  return { promptMessageId: prompt.messageId };
};

const handleAffirmativeReply = async (pending: PendingConfirmation, now: Date) => {
  const result = await sendWhatsAppAssistedStatus({
    text: pending.final_text,
    mediaUrl: pending.media_url,
    mimeType: pending.mime_type,
    recipientPhone: pending.recipient_phone,
  });
  await updateConfirmationState(pending.id, {
    status: 'sent',
    confirmedAt: now,
    completedAt: now,
    responseMessageId: result.messageId,
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
};

const handleNegativeReply = async (pending: PendingConfirmation, now: Date) => {
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
    await sendWhatsAppText('Okay, skipped this scheduled post.', pending.recipient_phone);
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
  onAffirmativeFailure?: (pending: PendingConfirmation, now: Date, messageText: string) => Promise<void>;
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
    (async (pending: PendingConfirmation, now: Date, messageText: string) => {
      await updateConfirmationState(pending.id, {
        status: 'failed',
        confirmedAt: now,
        completedAt: now,
        responseMessageId: null,
        lastError: messageText,
      });
      await db
        .update(scheduledPosts)
        .set({
          status: 'failed',
          updatedAt: now,
        })
        .where(eq(scheduledPosts.id, pending.scheduled_post_id));
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
        await onAffirmative(pending, now);
        confirmed += 1;
        await updateInbound(inboundEventId, {
          status: 'confirmed',
          matchedConfirmationId: pending.id,
          errorText: null,
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        failed += 1;
        await onAffirmativeFailure(pending, now, messageText);
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
        await onNegative(pending, now);
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

