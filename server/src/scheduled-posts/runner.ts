import { and, eq, lte } from 'drizzle-orm';
import { db } from '../db/index.js';
import { scheduledPosts } from '../db/schema.js';
import { getConnectedAccount } from '../db/connectedAccounts.js';
import { getProvider } from '../publish/providers/registry.js';
import { logger } from '../utils/logger.js';

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

const executePost = async (post: typeof scheduledPosts.$inferSelect) => {
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  const text = normalizeText(post.caption);

  if (!text) {
    logger.warn(`Scheduled post ${post.id} has empty caption; marking failed`);
    await markStatus(post.id, 'failed');
    return;
  }

  let postedToAny = false;

  if (platforms.includes('x')) {
    const account = await getConnectedAccount('x');
    if (!account || account.status !== 'connected') {
      throw new Error('No connected X account found');
    }
    const provider = getProvider('x');
    await provider.postText(text, account.tokenData);
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
  }
};

const processDueScheduledPosts = async () => {
  if (!ENABLED) return;

  const now = new Date();
  const duePosts = await db
    .select()
    .from(scheduledPosts)
    .where(and(lte(scheduledPosts.scheduledAt, now), eq(scheduledPosts.status, 'planned')))
    .limit(MAX_BATCH);

  for (const post of duePosts) {
    try {
      const claimed = await claimPost(post.id, now);
      if (!claimed) {
        continue;
      }
      await executePost(post);
    } catch (error) {
      logger.error(`Failed to publish scheduled post ${post.id}: ${String(error)}`);
      await markStatus(post.id, 'failed');
    }
  }
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

