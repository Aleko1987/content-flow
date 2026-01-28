import { Router } from 'express';
import { db } from '../db/index.js';
import { contentItems, contentItemMedia } from '../db/schema.js';
import { eq, and, or, like, gte, lte, inArray } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
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

// Helper to check if error is PostgreSQL "relation does not exist" (42P01)
const isRelationNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  
  // Check for PostgreSQL error code 42P01
  const err = error as any;
  if (err.code === '42P01') return true;
  if (err.message && typeof err.message === 'string' && err.message.includes('relation') && err.message.includes('does not exist')) return true;
  
  // Check nested error (some drivers wrap errors)
  if (err.cause && isRelationNotFoundError(err.cause)) return true;
  
  return false;
};

// Helper to normalize and validate mediaIds
const normalizeMediaIds = (mediaIds: unknown): string[] => {
  if (!Array.isArray(mediaIds)) {
    return [];
  }
  return mediaIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
};

// Helper to sync content_item_media join table with mediaIds array
// Deletes existing associations and inserts new ones
// If join table doesn't exist (42P01), silently skips join table operations (column-only mode)
const syncContentItemMedia = async (itemId: string, mediaIds: string[]): Promise<void> => {
  try {
    // Delete existing associations
    await db.delete(contentItemMedia).where(eq(contentItemMedia.contentItemId, itemId));
    
    // Insert new associations if any
    if (mediaIds.length > 0) {
      await db.insert(contentItemMedia).values(
        mediaIds.map(mediaAssetId => ({
          contentItemId: itemId,
          mediaAssetId,
          createdAt: new Date(),
        }))
      );
    }
  } catch (error) {
    // If join table doesn't exist, skip join table operations (column-only mode)
    if (isRelationNotFoundError(error)) {
      logger.warn('content_item_media table not found, operating in column-only mode', { itemId });
      return; // Silently skip - column already updated
    }
    // For other errors, log and rethrow
    logger.error('Failed to sync content_item_media', { itemId, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

// Helper to fetch mediaIds from content_item_media join table
// If no media found, returns empty array (never null/undefined).
// If join table doesn't exist (42P01), returns empty array (fallback to column).
const fetchMediaIdsForContentItem = async (contentItemId: string): Promise<string[]> => {
  try {
    const mediaRows = await db
      .select({ mediaAssetId: contentItemMedia.mediaAssetId })
      .from(contentItemMedia)
      .where(eq(contentItemMedia.contentItemId, contentItemId));
    
    return mediaRows.map(row => row.mediaAssetId);
  } catch (error) {
    // If join table doesn't exist, return empty array (will fallback to column)
    if (isRelationNotFoundError(error)) {
      return [];
    }
    // For other errors, log and rethrow
    logger.error('Failed to fetch mediaIds from join table', { contentItemId, error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
};

// Helper to fetch mediaIds for multiple content items (batch)
// If join table doesn't exist (42P01), returns empty map (fallback to column).
const fetchMediaIdsForContentItems = async (contentItemIds: string[]): Promise<Record<string, string[]>> => {
  if (contentItemIds.length === 0) {
    return {};
  }
  
  try {
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
  } catch (error) {
    // If join table doesn't exist, return empty map (will fallback to column)
    if (isRelationNotFoundError(error)) {
      return {};
    }
    // For other errors, log and rethrow
    logger.error('Failed to fetch mediaIds from join table (batch)', { error: error instanceof Error ? error.message : 'Unknown error' });
    throw error;
  }
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
  // Fallback to column value if join table is empty but column has values (backward compatibility)
  const response = items.map(item => {
    const joinTableMediaIds = mediaIdsMap[item.id] || [];
    // If join table has rows, use those; otherwise fallback to column if it has values
    const finalMediaIds = joinTableMediaIds.length > 0 
      ? joinTableMediaIds 
      : (Array.isArray(item.mediaIds) && item.mediaIds.length > 0 ? item.mediaIds : []);
    return normalizeContentItem(item, finalMediaIds);
  });
  
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

  // Normalize and validate mediaIds if provided
  const normalizedMediaIds = mediaIds !== undefined ? normalizeMediaIds(mediaIds) : [];

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
    mediaIds: normalizedMediaIds, // Store in column
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await db.insert(contentItems).values(newItem).returning();
  
  // Sync join table with mediaIds
  await syncContentItemMedia(itemId, normalizedMediaIds);
  
  // Fetch derived mediaIds for response (from join table)
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

  // Fetch derived mediaIds from join table, with fallback to column
  const joinTableMediaIds = await fetchMediaIdsForContentItem(id);
  const finalMediaIds = joinTableMediaIds.length > 0 
    ? joinTableMediaIds 
    : (Array.isArray(item[0].mediaIds) && item[0].mediaIds.length > 0 ? item[0].mediaIds : []);
  res.json(normalizeContentItem(item[0], finalMediaIds));
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

    // Handle mediaIds separately (update both column and join table)
    if ('mediaIds' in body) {
      mediaIdsToUpdate = normalizeMediaIds(body.mediaIds);
      // Also update the column
      safeUpdates.mediaIds = mediaIdsToUpdate;
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

    // Update content item fields (including mediaIds in column if provided)
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

    // Sync join table if mediaIds provided in request
    if (mediaIdsToUpdate !== undefined) {
      await syncContentItemMedia(id, mediaIdsToUpdate);
    }

    // Fetch derived mediaIds for response (from join table, with fallback to column)
    const joinTableMediaIds = await fetchMediaIdsForContentItem(id);
    const finalMediaIds = joinTableMediaIds.length > 0 
      ? joinTableMediaIds 
      : (Array.isArray(updated[0].mediaIds) && updated[0].mediaIds.length > 0 ? updated[0].mediaIds : []);
    res.json(normalizeContentItem(updated[0], finalMediaIds));
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


