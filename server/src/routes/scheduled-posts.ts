import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db/index.js';
import { scheduledPosts, scheduledPostMedia } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schemas
const platformSchema = z.enum(['linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'youtube-shorts']);
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
  scheduledAt: z.string().datetime(),
  platforms: z.array(platformSchema).default([]),
  status: statusSchema.default('planned'),
  media: z.array(mediaItemSchema).default([]),
});

const updateScheduledPostSchema = z.object({
  title: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
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

// GET /api/scheduled-posts?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;
    
    if (!from || !to) {
      return res.status(400).json({ error: 'Missing required query params: from, to' });
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Fetch posts in date range
    const posts = await db
      .select()
      .from(scheduledPosts)
      .where(
        and(
          gte(scheduledPosts.scheduledAt, fromDate),
          lte(scheduledPosts.scheduledAt, toDate)
        )
      )
      .orderBy(scheduledPosts.scheduledAt);

    // Fetch media for all posts
    const postIds = posts.map(p => p.id);
    let mediaItems: typeof scheduledPostMedia.$inferSelect[] = [];
    
    if (postIds.length > 0) {
      // Fetch all media for the posts
      const allMedia = await db.select().from(scheduledPostMedia);
      mediaItems = allMedia.filter(m => postIds.includes(m.scheduledPostId));
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
    const response = posts.map(post => ({
      id: post.id,
      title: post.title,
      caption: post.caption,
      scheduledAt: post.scheduledAt.toISOString(),
      scheduledDate: post.scheduledAt.toISOString().split('T')[0],
      scheduledTime: post.scheduledAt.toISOString().split('T')[1].substring(0, 5),
      platforms: post.platforms,
      status: post.status,
      media: mediaByPost[post.id] || [],
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }));

    logger.info(`Fetched ${response.length} scheduled posts for range ${from} to ${to}`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// POST /api/scheduled-posts
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createScheduledPostSchema.safeParse(req.body);
    
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const { title, caption, scheduledAt, platforms, status, media } = parsed.data;
    const postId = generateId();
    const now = new Date();

    // Insert the post
    await db.insert(scheduledPosts).values({
      id: postId,
      title: title ?? null,
      caption: caption ?? null,
      scheduledAt: new Date(scheduledAt),
      platforms,
      status,
      createdAt: now,
      updatedAt: now,
    });

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

    const response = {
      id: createdPost.id,
      title: createdPost.title,
      caption: createdPost.caption,
      scheduledAt: createdPost.scheduledAt.toISOString(),
      scheduledDate: createdPost.scheduledAt.toISOString().split('T')[0],
      scheduledTime: createdPost.scheduledAt.toISOString().split('T')[1].substring(0, 5),
      platforms: createdPost.platforms,
      status: createdPost.status,
      media: createdMedia.map(m => ({
        id: m.id,
        type: m.type,
        fileName: m.fileName,
        mimeType: m.mimeType,
        size: m.size,
        storageUrl: m.storageUrl,
      })),
      createdAt: createdPost.createdAt.toISOString(),
      updatedAt: createdPost.updatedAt.toISOString(),
    };

    logger.info(`Created scheduled post ${postId}`);
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /api/scheduled-posts/:id
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

    const { title, caption, scheduledAt, platforms, status, media } = parsed.data;
    const now = new Date();

    // Build update object
    const updates: Partial<typeof scheduledPosts.$inferInsert> = {
      updatedAt: now,
    };
    
    if (title !== undefined) updates.title = title;
    if (caption !== undefined) updates.caption = caption;
    if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
    if (platforms !== undefined) updates.platforms = platforms;
    if (status !== undefined) updates.status = status;

    // Update the post
    await db.update(scheduledPosts).set(updates).where(eq(scheduledPosts.id, id));

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

    const response = {
      id: updatedPost.id,
      title: updatedPost.title,
      caption: updatedPost.caption,
      scheduledAt: updatedPost.scheduledAt.toISOString(),
      scheduledDate: updatedPost.scheduledAt.toISOString().split('T')[0],
      scheduledTime: updatedPost.scheduledAt.toISOString().split('T')[1].substring(0, 5),
      platforms: updatedPost.platforms,
      status: updatedPost.status,
      media: updatedMedia.map(m => ({
        id: m.id,
        type: m.type,
        fileName: m.fileName,
        mimeType: m.mimeType,
        size: m.size,
        storageUrl: m.storageUrl,
      })),
      createdAt: updatedPost.createdAt.toISOString(),
      updatedAt: updatedPost.updatedAt.toISOString(),
    };

    logger.info(`Updated scheduled post ${id}`);
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/scheduled-posts/:id
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
