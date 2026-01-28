import { Router } from 'express';
import { db } from '../db/index.js';
import { contentItems, contentItemMedia } from '../db/schema.js';
import { eq, and, or, like, gte, lte, inArray } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';

const router = Router();

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Helper to fetch mediaIds from content_item_media join table
// SANITY CHECK: mediaIds is ALWAYS derived from content_item_media, never from content_items.media_ids.
// If no media found, returns empty array (never null/undefined).
const fetchMediaIdsForContentItem = async (contentItemId: string): Promise<string[]> => {
  const mediaRows = await db
    .select({ mediaAssetId: contentItemMedia.mediaAssetId })
    .from(contentItemMedia)
    .where(eq(contentItemMedia.contentItemId, contentItemId));
  
  return mediaRows.map(row => row.mediaAssetId);
};

// Helper to fetch mediaIds for multiple content items (batch)
const fetchMediaIdsForContentItems = async (contentItemIds: string[]): Promise<Record<string, string[]>> => {
  if (contentItemIds.length === 0) {
    return {};
  }
  
  const mediaRows = await db
    .select({ 
      contentItemId: contentItemMedia.contentItemId,
      mediaAssetId: contentItemMedia.mediaAssetId 
    })
    .from(contentItemMedia)
    .where(inArray(contentItemMedia.contentItemId, contentItemIds));
  
  const result: Record<string, string[]> = {};
  // Initialize all items with empty arrays
  for (const id of contentItemIds) {
    result[id] = [];
  }
  // Populate with actual media IDs
  for (const row of mediaRows) {
    if (!result[row.contentItemId]) {
      result[row.contentItemId] = [];
    }
    result[row.contentItemId].push(row.mediaAssetId);
  }
  
  return result;
};

// Helper to normalize content item response with derived mediaIds
const normalizeContentItem = (item: any, mediaIds: string[] = []) => {
  // Ensure mediaIds is always an array (never null/undefined)
  const safeMediaIds = Array.isArray(mediaIds) ? mediaIds : [];
  
  return {
    id: item.id,
    title: item.title,
    hook: item.hook,
    pillar: item.pillar,
    format: item.format,
    status: item.status,
    priority: item.priority,
    owner: item.owner,
    notes: item.notes,
    mediaIds: safeMediaIds, // Always derived from content_item_media, never from item.mediaIds
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
  };
};

// GET /api/content-ops/content-items
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    status,
    pillar,
    format,
    channel_key,
    date_from,
    date_to,
    q,
  } = req.query;

  let query = db.select().from(contentItems);

  const conditions = [];

  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    conditions.push(inArray(contentItems.status, statusArray as string[]));
  }

  if (pillar) {
    const pillarArray = Array.isArray(pillar) ? pillar : [pillar];
    conditions.push(inArray(contentItems.pillar, pillarArray as string[]));
  }

  if (format) {
    const formatArray = Array.isArray(format) ? format : [format];
    conditions.push(inArray(contentItems.format, formatArray as string[]));
  }

  if (date_from) {
    conditions.push(gte(contentItems.createdAt, new Date(date_from as string)));
  }

  if (date_to) {
    conditions.push(lte(contentItems.createdAt, new Date(date_to as string)));
  }

  if (q) {
    conditions.push(
      or(
        like(contentItems.title, `%${q}%`),
        like(contentItems.hook, `%${q}%`),
        like(contentItems.notes, `%${q}%`)
      )!
    );
  }

  // Note: channel_key filter would require a join, simplified for now
  // In production, you'd join with channel_variants or publish_tasks

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const items = await query;
  
  // Fetch mediaIds for all items from join table
  const itemIds = items.map(item => item.id);
  const mediaIdsMap = await fetchMediaIdsForContentItems(itemIds);
  
  // Transform to response with derived mediaIds
  const response = items.map(item => 
    normalizeContentItem(item, mediaIdsMap[item.id] || [])
  );
  
  res.json(response);
}));

// POST /api/content-ops/content-items
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    hook,
    pillar,
    format,
    status = 'draft',
    priority = 2,
    owner,
    notes,
    mediaIds, // Optional: array of media asset IDs to associate
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  // Validate mediaIds if provided
  if (mediaIds !== undefined) {
    if (!Array.isArray(mediaIds)) {
      return res.status(400).json({ error: 'mediaIds must be an array' });
    }
    if (!mediaIds.every((id: unknown) => typeof id === 'string')) {
      return res.status(400).json({ error: 'mediaIds must be an array of strings' });
    }
  }

  const now = new Date();
  const itemId = generateId();
  const newItem = {
    id: itemId,
    title,
    hook: hook || null,
    pillar: pillar || null,
    format: format || null,
    status,
    priority,
    owner: owner || null,
    notes: notes || null,
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await db.insert(contentItems).values(newItem).returning();
  
  // Create content_item_media associations if mediaIds provided
  if (mediaIds && Array.isArray(mediaIds) && mediaIds.length > 0) {
    await db.insert(contentItemMedia).values(
      mediaIds.map(mediaAssetId => ({
        id: generateId(),
        contentItemId: itemId,
        mediaAssetId,
        createdAt: now,
      }))
    );
  }
  
  // Fetch derived mediaIds for response
  const derivedMediaIds = await fetchMediaIdsForContentItem(itemId);
  res.status(201).json(normalizeContentItem(inserted[0], derivedMediaIds));
}));

// GET /api/content-ops/content-items/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const item = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);

  if (item.length === 0) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  // Fetch derived mediaIds from join table
  const mediaIds = await fetchMediaIdsForContentItem(id);
  res.json(normalizeContentItem(item[0], mediaIds));
}));

// PATCH /api/content-ops/content-items/:id
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = req.body;

  try {
    // Ensure req.body is a plain object
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    // Find item by id (same approach as GET)
    const items = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
    
    if (items.length === 0) {
      return res.status(404).json({ error: 'Content item not found' });
    }

    const item = items[0];

    // Build safe updates object containing only allowed keys (exclude mediaIds - handled separately)
    const allowedFields = ['title', 'hook', 'pillar', 'format', 'status', 'priority', 'owner', 'notes'];
    const safeUpdates: Record<string, unknown> = {};
    let mediaIdsToUpdate: string[] | undefined = undefined;

    for (const field of allowedFields) {
      if (field in body) {
        safeUpdates[field] = body[field];
      }
    }

    // Handle mediaIds separately (update content_item_media join table)
    if ('mediaIds' in body) {
      if (!Array.isArray(body.mediaIds)) {
        return res.status(400).json({ error: 'mediaIds must be an array' });
      }
      if (!body.mediaIds.every((id: unknown) => typeof id === 'string')) {
        return res.status(400).json({ error: 'mediaIds must be an array of strings' });
      }
      mediaIdsToUpdate = body.mediaIds as string[];
    }

    // Validate status if provided
    if (safeUpdates.status !== undefined) {
      const validStatuses = ['draft', 'ready', 'scheduled', 'posted'];
      if (!validStatuses.includes(safeUpdates.status as string)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
    }

    // Always set updatedAt
    const now = new Date();

    // Update content item fields (excluding mediaIds - that's in join table)
    const updated = await db
      .update(contentItems)
      .set({
        ...safeUpdates,
        updatedAt: now,
      })
      .where(eq(contentItems.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Content item not found' });
    }

    // Update content_item_media associations if mediaIds provided
    if (mediaIdsToUpdate !== undefined) {
      // Delete existing associations
      await db.delete(contentItemMedia).where(eq(contentItemMedia.contentItemId, id));
      
      // Insert new associations
      if (mediaIdsToUpdate.length > 0) {
        await db.insert(contentItemMedia).values(
          mediaIdsToUpdate.map(mediaAssetId => ({
            id: generateId(),
            contentItemId: id,
            mediaAssetId,
            createdAt: now,
          }))
        );
      }
    }

    // Fetch derived mediaIds for response (always from join table)
    const derivedMediaIds = await fetchMediaIdsForContentItem(id);
    res.json(normalizeContentItem(updated[0], derivedMediaIds));
  } catch (error) {
    console.error('PATCH /api/content-ops/content-items/:id error:', error, 'id:', id, 'body:', body);
    return res.status(500).json({ error: 'Internal server error' });
  }
}));

// DELETE /api/content-ops/content-items/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const deleted = await db
    .delete(contentItems)
    .where(eq(contentItems.id, id))
    .returning();

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  res.status(204).send();
}));

export default router;


