import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduledPosts, scheduledPostMedia, contentItems } from '../db/schema.js';
import { getConnectedAccount, setConnectedAccountStatus } from '../db/connectedAccounts.js';
import { getProvider } from '../publish/providers/registry.js';
import { logger } from '../utils/logger.js';
import type { ProviderResult } from '../publish/providers/types.js';
import { sendWhatsAppAssistedStatus } from '../whatsapp/status-service.js';
import { startAssistedConfirmationForScheduledPost } from '../whatsapp/assisted-confirmation.js';
import { recordPostedVideo } from '../posting-history/service.js';

const ENABLED = process.env.SCHEDULED_POSTS_ENABLED !== 'false';
const INTERVAL_MS = Number(process.env.SCHEDULED_POSTS_INTERVAL_MS ?? 60_000);
const MAX_BATCH = Number(process.env.SCHEDULED_POSTS_MAX_BATCH ?? 10);

const claimPost = async (id: string, now: Date) => {
  const updated = await db
    .update(scheduledPosts)
    .set({ status: 'processing', updatedAt: now })
    .where(and(eq(scheduledPosts.id, id), eq(scheduledPosts.status, 'planned')))
    .returning();
  return updated.length > 0;
};

const markStatus = async (id: string, status: string) => {
  await db
    .update(scheduledPosts)
    .set({ status, updatedAt: new Date() })
    .where(eq(scheduledPosts.id, id));
};

const normalizeText = (caption: string | null | undefined) => {
  const text = (caption ?? '').trim();
  return text;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const isMetaAccessTokenExpired = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('error validating access token') ||
    normalized.includes('session has expired') ||
    normalized.includes('code":190') ||
    normalized.includes('code:190') ||
    normalized.includes('invalid oauth access token') ||
    normalized.includes('access token has expired')
  );
};

const toFriendlyPublishError = async (
  platform: 'facebook' | 'instagram' | 'whatsapp_status',
  error: unknown
) => {
  const message = getErrorMessage(error);
  if (!isMetaAccessTokenExpired(message)) {
    return error instanceof Error ? error : new Error(message);
  }

  if (platform === 'whatsapp_status') {
    return new Error(
      'WhatsApp Cloud API session expired. Update WA_ACCESS_TOKEN in your server environment, restart the API, then try again.'
    );
  }

  try {
    await setConnectedAccountStatus(platform, 'revoked');
  } catch (statusError) {
    logger.warn(`Failed to mark ${platform} integration as revoked: ${getErrorMessage(statusError)}`);
  }

  const providerLabel = platform === 'facebook' ? 'Facebook' : 'Instagram';
  return new Error(
    `${providerLabel} session expired. Reconnect ${providerLabel} in Settings > Integrations, then retry this post.`
  );
};

type ScheduledPostRecord = typeof scheduledPosts.$inferSelect & {
  contentItemId?: string | null;
  channelKey?: string | null;
  recipientPhone?: string | null;
};

const isAssistedConfirmationEnabled = () => {
  const value = (process.env.WA_ASSISTED_CONFIRMATION_ENABLED || 'true').trim().toLowerCase();
  return value !== 'false' && value !== '0' && value !== 'no';
};

export const executePost = async (post: ScheduledPostRecord) => {
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const text = normalizeText(post.caption);
  const results: Array<{ providerKey: string; providerRef: string; canonicalUrl?: string }> = [];

  if (!text) {
    logger.warn(`Scheduled post ${post.id} has empty caption; marking failed`);
    await markStatus(post.id, 'failed');
    throw new Error('Caption is required to publish');
  }

  let postedToAny = false;
  let queuedForConfirmation = false;
  const executionAttemptId = `${post.id}:${Date.now()}`;
  let cachedMedia: Array<typeof scheduledPostMedia.$inferSelect> | null = null;
  const getMedia = async () => {
    if (cachedMedia) return cachedMedia;
    cachedMedia = await db
      .select()
      .from(scheduledPostMedia)
      .where(eq(scheduledPostMedia.scheduledPostId, post.id));
    return cachedMedia;
  };
  const media = await getMedia();
  const video = media.find((m) => String(m.type) === 'video') || null;
  const image = media.find((m) => String(m.type) === 'image') || null;
  const publicImageUrl = image?.storageUrl && !image.storageUrl.startsWith('blob:') ? image.storageUrl : null;

  // Product rule: any video post must include an uploaded public image for a reliable cover/thumbnail flow.
  if (video && !publicImageUrl) {
    throw new Error(
      'Video posts require a companion uploaded image with a public URL. Add an image and wait for upload to finish before publishing.'
    );
  }

  if (platforms.includes('x')) {
    const account = await getConnectedAccount('x');
    if (!account || account.status !== 'connected') {
      throw new Error('No connected X account found');
    }
    const provider = getProvider('x');
    const result = await provider.postText(text, account.tokenData);
    const normalized: ProviderResult =
      typeof result === 'string' ? { providerRef: result } : result;
    results.push({ providerKey: 'x', providerRef: normalized.providerRef, canonicalUrl: normalized.canonicalUrl });
    postedToAny = true;
  }

  if (platforms.includes('facebook')) {
    const account = await getConnectedAccount('facebook');
    if (!account || account.status !== 'connected') {
      throw new Error('No connected Facebook account found');
    }
    const provider = getProvider('facebook');
    try {
      let result: string | ProviderResult;

      // Prefer attached video for FB video posts, then attached image, then text-only fallback.
      const videoUrl = video?.storageUrl || null;
      const imageUrl = image?.storageUrl || null;
      if (videoUrl && !videoUrl.startsWith('blob:') && provider.postVideo) {
        result = await provider.postVideo({ caption: text, videoUrl }, account.tokenData);
      } else if (imageUrl && !imageUrl.startsWith('blob:') && provider.postImage) {
        result = await provider.postImage({ caption: text, imageUrl }, account.tokenData);
      } else {
        result = await provider.postText(text, account.tokenData);
      }
      const normalized: ProviderResult =
        typeof result === 'string' ? { providerRef: result } : result;
      results.push({
        providerKey: 'facebook',
        providerRef: normalized.providerRef,
        canonicalUrl: normalized.canonicalUrl,
      });
      postedToAny = true;
    } catch (error) {
      throw await toFriendlyPublishError('facebook', error);
    }
  }

  if (platforms.includes('instagram')) {
    const account = await getConnectedAccount('instagram');
    if (!account || account.status !== 'connected') {
      throw new Error('No connected Instagram account found');
    }
    const provider = getProvider('instagram');
    if (!provider.postImage && !provider.postVideo) {
      throw new Error('Instagram provider does not support media publishing');
    }

    const videoUrl = video?.storageUrl || null;
    const imageUrl = image?.storageUrl || null;

    try {
      let result: string | ProviderResult;
      if (videoUrl && !videoUrl.startsWith('blob:') && provider.postVideo) {
        result = await provider.postVideo({ caption: text, videoUrl, coverImageUrl: publicImageUrl || undefined }, account.tokenData);
      } else if (imageUrl && !imageUrl.startsWith('blob:') && provider.postImage) {
        result = await provider.postImage({ caption: text, imageUrl }, account.tokenData);
      } else {
        throw new Error(
          'Instagram publishing requires an uploaded image or video with a public URL. Add media in the post and wait for upload to finish.'
        );
      }
      const normalized: ProviderResult =
        typeof result === 'string' ? { providerRef: result } : result;
      results.push({ providerKey: 'instagram', providerRef: normalized.providerRef, canonicalUrl: normalized.canonicalUrl });
      postedToAny = true;
    } catch (error) {
      throw await toFriendlyPublishError('instagram', error);
    }
  }

  if (platforms.includes('whatsapp_status')) {
    const best = media.find((m) => String(m.type) === 'video') || media.find((m) => String(m.type) === 'image') || null;
    const mediaUrl = best?.storageUrl || null;
    if (!mediaUrl || mediaUrl.startsWith('blob:')) {
      throw new Error(
        'WhatsApp Status assisted send requires an uploaded media URL. Add an image/video and wait for upload to finish.'
      );
    }

    try {
      if (isAssistedConfirmationEnabled()) {
        const confirmation = await startAssistedConfirmationForScheduledPost({
          scheduledPostId: post.id,
          caption: text,
          mediaUrl,
          mimeType: best?.mimeType || null,
          recipientPhone: post.recipientPhone ?? null,
          operationId: `${executionAttemptId}:prompt`,
        });
        results.push({
          providerKey: 'whatsapp_status',
          providerRef: confirmation.promptMessageId,
        });
        queuedForConfirmation = true;
      } else {
        const result = await sendWhatsAppAssistedStatus({
          text,
          mediaUrl,
          mimeType: best?.mimeType || null,
          recipientPhone: post.recipientPhone ?? null,
        });
        results.push({ providerKey: 'whatsapp_status', providerRef: result.messageId });
      }
      postedToAny = true;
    } catch (error) {
      throw await toFriendlyPublishError('whatsapp_status', error);
    }
  }

  const unsupported = platforms.filter(
    (p) => p !== 'x' && p !== 'facebook' && p !== 'instagram' && p !== 'whatsapp_status'
  );
  if (unsupported.length > 0) {
    logger.warn(`Scheduled post ${post.id} has unsupported platforms: ${unsupported.join(', ')}`);
  }

  if (postedToAny) {
    const publishedAt = new Date();
    await markStatus(post.id, queuedForConfirmation ? 'queued' : 'published');
    if (!queuedForConfirmation && post.contentItemId) {
      await db
        .update(contentItems)
        .set({ status: 'posted', updatedAt: new Date() })
        .where(eq(contentItems.id, post.contentItemId));
    }
    if (!queuedForConfirmation) {
      const media = await getMedia();
      // scheduled_post_media.fileName is the most reliable original filename in this flow.
      const video = media.find((m) => String(m.type) === 'video') || null;
      if (video?.fileName) {
        for (const result of results) {
          await recordPostedVideo({
            contentItemId: post.contentItemId ?? null,
            filename: video.fileName,
            platform: result.providerKey,
            postedAt: publishedAt,
            status: 'success',
            externalPostId: result.providerRef,
          });
        }
      }
    }
  } else {
    await markStatus(post.id, 'failed');
    throw new Error('No supported platforms selected for publishing');
  }

  return { postedToAny, results };
};

export const processDueScheduledPosts = async () => {
  if (!ENABLED) return;

  const now = new Date();
  const duePosts = await db
    .select()
    .from(scheduledPosts)
    .where(and(lte(scheduledPosts.scheduledAt, now), eq(scheduledPosts.status, 'planned')))
    .limit(MAX_BATCH);

  let published = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const post of duePosts) {
    try {
      const claimed = await claimPost(post.id, now);
      if (!claimed) {
        continue;
      }
      await executePost(post);
      published += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to publish scheduled post ${post.id}: ${message}`);
      await markStatus(post.id, 'failed');
      failed += 1;
      errors.push({ id: post.id, error: message });
    }
  }

  return { processed: duePosts.length, published, failed, errors };
};

export const startScheduledPostRunner = () => {
  if (!ENABLED) {
    logger.info('Scheduled post runner disabled');
    return;
  }

  processDueScheduledPosts().catch((error) => {
    logger.error(`Scheduled post runner initial run failed: ${String(error)}`);
  });

  setInterval(() => {
    processDueScheduledPosts().catch((error) => {
      logger.error(`Scheduled post runner failed: ${String(error)}`);
    });
  }, INTERVAL_MS);

  logger.info(`Scheduled post runner started (interval: ${INTERVAL_MS}ms)`);
};

