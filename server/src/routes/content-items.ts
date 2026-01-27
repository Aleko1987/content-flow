import { Router } from 'express';
import { db } from '../db/index.js';
import { contentItems } from '../db/schema.js';
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
  res.json(items);
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
  } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const now = new Date();
  const newItem = {
    id: generateId(),
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
  res.status(201).json(inserted[0]);
}));

// GET /api/content-ops/content-items/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const item = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);

  if (item.length === 0) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  res.json(item[0]);
}));

// PATCH /api/content-ops/content-items/:id
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Ensure req.body is an object
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be an object' });
    }

    // Allowed fields for update
    const allowedFields = ['title', 'hook', 'pillar', 'format', 'status', 'priority', 'owner', 'notes'];
    const updates: Record<string, unknown> = {};

    // Only include allowed fields from req.body
    for (const field of allowedFields) {
      if (field in req.body) {
        updates[field] = req.body[field];
      }
    }

    // Validate status if provided
    if (updates.status !== undefined) {
      const validStatuses = ['draft', 'ready', 'scheduled', 'posted'];
      if (!validStatuses.includes(updates.status as string)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
    }

    // Set updatedAt
    updates.updatedAt = new Date().toISOString();

    // If no updates to apply, return the existing item
    if (Object.keys(updates).length === 1 && 'updatedAt' in updates) {
      const existing = await db.select().from(contentItems).where(eq(contentItems.id, id)).limit(1);
      if (existing.length === 0) {
        return res.status(404).json({ error: 'Content item not found' });
      }
      return res.json(existing[0]);
    }

    const updated = await db
      .update(contentItems)
      .set(updates)
      .where(eq(contentItems.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'Content item not found' });
    }

    res.json(updated[0]);
  } catch (error) {
    console.error('PATCH /api/content-ops/content-items/:id error:', error);
    throw error;
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


