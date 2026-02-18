import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { channelVariants, contentItems, contentItemMedia, mediaAssets, publishLogs, publishTasks } from '../db/schema.js';
import { sendWhatsAppMedia, sendWhatsAppTemplate, sendWhatsAppText } from './cloud-api.js';

// Generate UUID (keep local to avoid circular deps)
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const buildWhatsAppText = (params: {
  defaultText: string;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  linkUrl?: string | null;
}) => {
  const parts = [
    (params.caption || '').trim() || params.defaultText,
    (params.hashtags || '').trim(),
    (params.cta || '').trim(),
    (params.linkUrl || '').trim(),
  ].filter(Boolean);
  return parts.join('\n\n').trim();
};

const trimTo = (value: string, max: number) => {
  if (value.length <= max) return { head: value, tail: '' };
  const head = value.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  const tail = value;
  return { head, tail };
};

export const sendWhatsAppAssistedStatus = async (params: {
  text: string;
  mediaUrl: string;
  mimeType?: string | null;
}): Promise<{ messageId: string }> => {
  const fullText = (params.text || '').trim();
  if (!fullText) {
    throw new Error('WhatsApp status requires caption text');
  }
  const mediaUrl = (params.mediaUrl || '').trim();
  if (!mediaUrl) {
    throw new Error('WhatsApp status requires a media URL');
  }

  const mimeType = (params.mimeType || '').trim();
  const isImage = mimeType.startsWith('image/') || (!mimeType && /\.(png|jpe?g|webp|gif)$/i.test(mediaUrl));
  const isVideo = mimeType.startsWith('video/') || (!mimeType && /\.(mp4|mov|webm)$/i.test(mediaUrl));
  if (!isImage && !isVideo) {
    throw new Error(`WhatsApp status media must be image/video (found ${mimeType || 'unknown'})`);
  }

  // WhatsApp Cloud API image/video caption limits are documented at 1024 chars.
  const captionLimit = 1024;
  const { head: mediaCaption, tail: tailText } = trimTo(fullText, captionLimit);

  const templateName = (process.env.WA_TEMPLATE_NAME || '').trim();
  const templateLang = (process.env.WA_TEMPLATE_LANGUAGE || 'en_US').trim();

  let mediaResultId: string;
  try {
    const mediaType = isImage ? 'image' : 'video';
    const result = await sendWhatsAppMedia(mediaType, mediaUrl, mediaCaption);
    mediaResultId = result.messageId;
  } catch (error) {
    // If we hit a template-required condition (often outside the 24h window),
    // try sending a template first, then retry media.
    if (templateName) {
      await sendWhatsAppTemplate({
        name: templateName,
        language: templateLang,
        bodyText: fullText,
      });
      const mediaType = isImage ? 'image' : 'video';
      const retry = await sendWhatsAppMedia(mediaType, mediaUrl, mediaCaption);
      mediaResultId = retry.messageId;
    } else {
      throw error;
    }
  }

  // If the text was longer than the caption limit, send full text as a follow-up message.
  // This works only inside a session window; if it fails, we still consider the media send a success.
  if (tailText && tailText.length > captionLimit) {
    try {
      await sendWhatsAppText(fullText);
    } catch {
      // ignore
    }
  }

  return { messageId: mediaResultId };
};

const resolveVariantAsset = async (contentItemId: string, channelKey: string) => {
  const [variant] = await db
    .select()
    .from(channelVariants)
    .where(and(eq(channelVariants.contentItemId, contentItemId), eq(channelVariants.channelKey, channelKey)))
    .limit(1);

  const [contentItem] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  if (!contentItem) {
    throw new Error('Content item not found');
  }

  const defaultText = contentItem.hook ? `${contentItem.hook}\n\n${contentItem.title}` : contentItem.title;

  const resolveAsset = async () => {
    if (variant?.mediaAssetId) {
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, variant.mediaAssetId))
        .limit(1);
      return asset || null;
    }

    const [link] = await db
      .select()
      .from(contentItemMedia)
      .where(eq(contentItemMedia.contentItemId, contentItemId))
      .limit(1);

    if (!link) {
      return null;
    }

    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, link.mediaAssetId))
      .limit(1);

    return asset || null;
  };

  const asset = await resolveAsset();

  return {
    variant,
    contentItem,
    asset,
    defaultText,
  };
};

export const sendWhatsAppStatusForPublishTask = async (params: {
  publishTaskId: string;
  force?: boolean;
}) => {
  const { publishTaskId, force = false } = params;

  const [task] = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.id, publishTaskId))
    .limit(1);

  if (!task) {
    throw new Error('Publish task not found');
  }
  if (task.channelKey !== 'whatsapp_status') {
    throw new Error(`Task channel is not whatsapp_status (found: ${task.channelKey})`);
  }

  if (!force && task.providerRef) {
    return { alreadySent: true, messageId: task.providerRef };
  }

  const { variant, asset, defaultText } = await resolveVariantAsset(task.contentItemId, task.channelKey);
  const mimeType = asset?.mimeType || '';
  const publicUrl = asset?.publicUrl || '';

  const fullText = buildWhatsAppText({
    defaultText,
    caption: variant?.caption,
    hashtags: variant?.hashtags,
    cta: variant?.cta,
    linkUrl: variant?.linkUrl,
  });

  if (!publicUrl) {
    throw new Error('WhatsApp status requires a media asset with a public URL');
  }

  const now = new Date();
  const { messageId } = await sendWhatsAppAssistedStatus({
    text: fullText,
    mediaUrl: publicUrl,
    mimeType,
  });

  // Persist: providerRef and a publish log entry.
  await db
    .update(publishTasks)
    .set({
      status: 'success',
      providerRef: messageId,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(publishTasks.id, publishTaskId));

  await db.insert(publishLogs).values({
    id: generateId(),
    publishTaskId,
    postedAt: now,
    postUrl: null,
    reach: null,
    clicks: null,
    notes: `whatsapp.sent - message_id: ${messageId}`,
  });

  return { alreadySent: false, messageId };
};

