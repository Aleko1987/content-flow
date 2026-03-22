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
  const yesPayload = (process.env.WA_CONFIRM_YES_PAYLOAD || '').trim();
  const yesIndexRaw = (process.env.WA_CONFIRM_YES_BUTTON_INDEX || '0').trim();
  const yesIndex = Number.parseInt(yesIndexRaw, 10);
  if (!yesPayload || Number.isNaN(yesIndex)) {
    return [];
  }
  return [{ index: yesIndex, payload: yesPayload }];
};

const createPromptPreview = (caption: string) => {
  const trimmed = caption.trim();
  const max = 120;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}...`;
};

const isAffirmativeReply = (text: string) => {
  const value = text.trim().toLowerCase();
  return value === 'yes' || value === 'y' || value === 'ok' || value === 'confirm' || value === 'publish';
};

const isNegativeReply = (text: string) => {
  const value = text.trim().toLowerCase();
  return value === 'no' || value === 'n' || value === 'cancel' || value === 'skip';
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
  const prompt = await sendWhatsAppTemplate({
    name: templateName,
    language: templateLang,
    bodyText: previewText,
    quickReplyButtons,
    recipientPhone,
  });

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

export const processIncomingConfirmationWebhook = async (payload: IncomingWebhookPayload) => {
  const messages = (payload.entry || [])
    .flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || []);

  let processed = 0;
  let confirmed = 0;
  let declined = 0;

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue;
    }
    const from = typeof message.from === 'string' ? message.from : '';
    const replyText = extractReplyText(message);
    if (!from || !replyText) {
      continue;
    }

    const contextMessageId = extractContextMessageId(message);
    const pending = await findPendingConfirmation(from, contextMessageId);
    if (!pending) {
      continue;
    }

    const now = new Date();
    processed += 1;

    if (isAffirmativeReply(replyText)) {
      try {
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

        confirmed += 1;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
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
        logger.error(`Failed to send confirmed WhatsApp assisted post ${pending.scheduled_post_id}: ${messageText}`);
      }
      continue;
    }

    if (isNegativeReply(replyText)) {
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
      declined += 1;
    }
  }

  return { processed, confirmed, declined };
};

