import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduledPosts } from '../db/schema.js';
import { getConnectedAccount } from '../db/connectedAccounts.js';
import { getProvider } from '../publish/providers/registry.js';
import { logger } from '../utils/logger.js';
import type { ProviderResult } from '../publish/providers/types.js';

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

export const executePost = async (post: typeof scheduledPosts.$inferSelect) => {
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const text = normalizeText(post.caption);
  const results: Array<{ providerKey: string; providerRef: string; canonicalUrl?: string }> = [];

  if (!text) {
    logger.warn(`Scheduled post ${post.id} has empty caption; marking failed`);
    await markStatus(post.id, 'failed');
    throw new Error('Caption is required to publish');
  }

  let postedToAny = false;

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

  const unsupported = platforms.filter(p => p !== 'x');
  if (unsupported.length > 0) {
    logger.warn(`Scheduled post ${post.id} has unsupported platforms: ${unsupported.join(', ')}`);
  }

  if (postedToAny) {
    await markStatus(post.id, 'published');
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

