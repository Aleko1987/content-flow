import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { scheduledPosts, scheduledPostMedia, publishTasks, channelVariants, contentItems } from '../db/schema.js';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { processDueScheduledPosts, executePost } from '../scheduled-posts/runner.js';

const router = Router();
let ensureScheduledPostsSchemaPromise: Promise<void> | null = null;

const ensureScheduledPostsSchema = async () => {
  if (!ensureScheduledPostsSchemaPromise) {
    ensureScheduledPostsSchemaPromise = (async () => {
      await db.execute(sql`
        ALTER TABLE "scheduled_posts"
        ADD COLUMN IF NOT EXISTS "content_item_id" text
      `);
      await db.execute(sql`
        ALTER TABLE "scheduled_posts"
        ADD COLUMN IF NOT EXISTS "channel_key" varchar(50)
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_posts_content_item_channel_key_unique"
        ON "scheduled_posts" ("content_item_id", "channel_key")
      `);
    })().catch((error) => {
      ensureScheduledPostsSchemaPromise = null;
      throw error;
    });
  }
  await ensureScheduledPostsSchemaPromise;
};

router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureScheduledPostsSchema();
    next();
  } catch (error) {
    next(error);
  }
});

// Type alias for scheduled post from database
type ScheduledPost = typeof scheduledPosts.$inferSelect & {
  contentItemId?: string | null;
  channelKey?: string | null;
};

type ScheduledPostInsert = typeof scheduledPosts.$inferInsert & {
  contentItemId?: string | null;
  channelKey?: string | null;
};

// Validation schemas
// Note: frontend uses `youtube_shorts` (underscore). Accept legacy `youtube-shorts` and normalize.
const platformSchema = z
  .union([
    z.literal('linkedin'),
    z.literal('x'),
    z.literal('instagram'),
    z.literal('facebook'),
    z.literal('tiktok'),
    z.literal('youtube_shorts'),
    z.literal('youtube-shorts'),
    z.literal('whatsapp_status'),
  ])
  .transform((value) => (value === 'youtube-shorts' ? 'youtube_shorts' : value));
const statusSchema = z.enum(['planned', 'queued', 'published', 'failed']);

const mediaItemSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['image', 'video']),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive(),
  storageUrl: z.string().nullable().optional(),
});

const createScheduledPostSchema = z.object({
  title: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  contentItemId: z.string().nullable().optional(),
  channelKey: z.string().nullable().optional(),
  scheduledAt: z.string().datetime(),
  platforms: z.array(platformSchema).default([]),
  status: statusSchema.default('planned'),
  media: z.array(mediaItemSchema).default([]),
});

const updateScheduledPostSchema = z.object({
  title: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  contentItemId: z.string().nullable().optional(),
  channelKey: z.string().nullable().optional(),
  scheduledAt: z.string().datetime().optional(),
  platforms: z.array(platformSchema).optional(),
  status: statusSchema.optional(),
  media: z.array(mediaItemSchema).optional(),
});

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Helper to transform scheduled post response with derived mediaIds
// SANITY CHECK: mediaIds is ALWAYS derived from joined media rows (scheduled_post_media),
// never from scheduled_posts.media_ids (which doesn't exist in the schema).
// If media array is empty, mediaIds must be [].
const transformScheduledPost = (post: ScheduledPost, media: typeof scheduledPostMedia.$inferSelect[]) => {
  const mediaArray = media.map(m => ({
    id: m.id,
    type: m.type,
    fileName: m.fileName,
    mimeType: m.mimeType,
    size: m.size,
    storageUrl: m.storageUrl || '',
  }));

  // Derive mediaIds from media array (source of truth - never use post.mediaIds from DB)
  const mediaIds = mediaArray.map(m => m.id);
  // Ensure empty array if no media (never null/undefined)
  if (!Array.isArray(mediaIds)) {
    throw new Error('mediaIds must be an array');
  }

  return {
    id: post.id,
    title: post.title,
    caption: post.caption,
    contentItemId: post.contentItemId ?? null,
    channelKey: post.channelKey ?? null,
    scheduledAt: post.scheduledAt.toISOString(),
    scheduledDate: post.scheduledAt.toISOString().split('T')[0],
    scheduledTime: post.scheduledAt.toISOString().split('T')[1].substring(0, 5),
    platforms: Array.isArray(post.platforms) ? post.platforms : [],
    status: post.status,
    mediaIds: mediaIds,
    media: mediaArray,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
};

// GET /api/content-ops/scheduled-posts?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;
    
    let posts: ScheduledPost[] = [];
    
    if (from && to) {
      // Fetch posts in date range
      const fromDate = new Date(`${from}T00:00:00.000Z`);
      const toDate = new Date(`${to}T23:59:59.999Z`);

      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      }

      posts = await db
        .select()
        .from(scheduledPosts)
        .where(
          and(
            gte(scheduledPosts.scheduledAt, fromDate),
            lte(scheduledPosts.scheduledAt, toDate)
          )
        )
        .orderBy(scheduledPosts.scheduledAt);
    } else {
      // If no date range provided, return all posts (or empty array if too many)
      // For now, return empty array to avoid loading too much data
      posts = [];
    }

    // Fetch media for all posts (optimized: use WHERE clause instead of fetching all)
    const postIds = posts.map(p => p.id);
    let mediaItems: typeof scheduledPostMedia.$inferSelect[] = [];
    
    if (postIds.length > 0) {
      // Fetch only media for the posts in this range
      mediaItems = await db
        .select()
        .from(scheduledPostMedia)
        .where(inArray(scheduledPostMedia.scheduledPostId, postIds));
    }

    // Group media by post
    const mediaByPost = mediaItems.reduce((acc, m) => {
      if (!acc[m.scheduledPostId]) acc[m.scheduledPostId] = [];
      acc[m.scheduledPostId].push({
        id: m.id,
        type: m.type,
        fileName: m.fileName,
        mimeType: m.mimeType,
        size: m.size,
        storageUrl: m.storageUrl,
      });
      return acc;
    }, {} as Record<string, any[]>);

    // Transform to camelCase response
    const response = posts.map(post => {
      const postMedia = mediaByPost[post.id] || [];
      return transformScheduledPost(post, postMedia);
    });

    logger.info(`Fetched ${response.length} scheduled posts for range ${from} to ${to}`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/content-ops/scheduled-posts/process-due
router.post('/process-due', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await processDueScheduledPosts();
    res.json(result ?? { processed: 0, published: 0, failed: 0 });
  } catch (error) {
    next(error);
  }
});

// POST /api/content-ops/scheduled-posts/:id/execute
router.post('/:id/execute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    if (!post) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    await db
      .update(scheduledPosts)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(scheduledPosts.id, id));

    const result = await executePost(post);

    const [updated] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    res.json({ status: updated?.status ?? post.status, results: result?.results ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute scheduled post';
    logger.error(
      `Manual execute failed for scheduled post ${req.params.id}: ${message}`
    );
    res.status(400).json({ error: message });
  }
});

// POST /api/content-ops/scheduled-posts
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createScheduledPostSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const { title, caption, contentItemId, channelKey, scheduledAt, platforms, status, media } = parsed.data;
    const postId = generateId();
    const now = new Date();
    
    // Insert the post (no mediaIds stored - derived from scheduled_post_media)
    await db.insert(scheduledPosts).values({
      id: postId,
      title: title ?? null,
      caption: caption ?? null,
      contentItemId: contentItemId ?? null,
      channelKey: channelKey ?? null,
      scheduledAt: new Date(scheduledAt),
      platforms,
      status,
      createdAt: now,
      updatedAt: now,
    } as ScheduledPostInsert);

    // Insert media items
    if (media.length > 0) {
      await db.insert(scheduledPostMedia).values(
        media.map(m => ({
          id: m.id || generateId(),
          scheduledPostId: postId,
          type: m.type,
          fileName: m.fileName,
          mimeType: m.mimeType,
          size: m.size,
          storageUrl: m.storageUrl ?? null,
          createdAt: now,
        }))
      );
    }

    // Fetch the created post with media
    const [createdPost] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, postId));
    const createdMedia = await db.select().from(scheduledPostMedia).where(eq(scheduledPostMedia.scheduledPostId, postId));

    const response = transformScheduledPost(createdPost, createdMedia);

    logger.info(`Created scheduled post ${postId}`);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /api/content-ops/scheduled-posts/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const parsed = updateScheduledPostSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    // Check if post exists
    const [existing] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    const { title, caption, contentItemId, channelKey, scheduledAt, platforms, status, media } = parsed.data;
    const now = new Date();

    // Build update object (no mediaIds - derived from scheduled_post_media)
    const updates: Partial<ScheduledPostInsert> = {
      updatedAt: now,
    };
    
    if (title !== undefined) updates.title = title;
    if (caption !== undefined) updates.caption = caption;
    if (scheduledAt !== undefined) {
      updates.scheduledAt = new Date(scheduledAt);
      // Reset status to planned when rescheduling unless explicitly overridden
      if (status === undefined) {
        updates.status = 'planned';
      }
    }
    if (platforms !== undefined) updates.platforms = platforms;
    if (status !== undefined) updates.status = status;
    if (contentItemId !== undefined) updates.contentItemId = contentItemId;
    if (channelKey !== undefined) updates.channelKey = channelKey;

    // Update the post
    await db.update(scheduledPosts).set(updates).where(eq(scheduledPosts.id, id));

    // Sync linked publish task if scheduledAt updated
    if (scheduledAt !== undefined && (existing.contentItemId || contentItemId) && (existing.channelKey || channelKey)) {
      const linkedContentItemId = contentItemId ?? existing.contentItemId;
      const linkedChannelKey = channelKey ?? existing.channelKey;
      if (linkedContentItemId && linkedChannelKey) {
        await db
          .update(publishTasks)
          .set({
            scheduledFor: new Date(scheduledAt),
            state: 'scheduled',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(publishTasks.contentItemId, linkedContentItemId),
              eq(publishTasks.channelKey, linkedChannelKey)
            )
          );
        await db
          .update(contentItems)
          .set({ status: 'scheduled', updatedAt: new Date() })
          .where(eq(contentItems.id, linkedContentItemId));
      }
    }

    // Replace media if provided
    if (media !== undefined) {
      // Delete existing media
      await db.delete(scheduledPostMedia).where(eq(scheduledPostMedia.scheduledPostId, id));
      
      // Insert new media
      if (media.length > 0) {
        await db.insert(scheduledPostMedia).values(
          media.map(m => ({
            id: m.id || generateId(),
            scheduledPostId: id,
            type: m.type,
            fileName: m.fileName,
            mimeType: m.mimeType,
            size: m.size,
            storageUrl: m.storageUrl ?? null,
            createdAt: now,
          }))
        );
      }
    }

    // Fetch updated post with media
    const [updatedPost] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    const updatedMedia = await db.select().from(scheduledPostMedia).where(eq(scheduledPostMedia.scheduledPostId, id));

    const response = transformScheduledPost(updatedPost, updatedMedia);

    logger.info(`Updated scheduled post ${id}`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// GET /api/content-ops/scheduled-posts/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Fetch the post
    const [post] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    
    if (!post) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    // Fetch media for the post
    const media = await db.select().from(scheduledPostMedia).where(eq(scheduledPostMedia.scheduledPostId, id));

    const response = transformScheduledPost(post, media);

    logger.info(`Fetched scheduled post ${id}`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/content-ops/scheduled-posts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // Check if post exists
    const [existing] = await db.select().from(scheduledPosts).where(eq(scheduledPosts.id, id));
    if (!existing) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    // Delete (cascade will handle media)
    await db.delete(scheduledPosts).where(eq(scheduledPosts.id, id));

    logger.info(`Deleted scheduled post ${id}`);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
