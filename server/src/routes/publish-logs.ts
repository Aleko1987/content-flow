import { Router } from 'express';
import { db } from '../db/index.js';
import { publishLogs } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
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

// GET /api/content-ops/publish-logs
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { publish_task_id, date_from, date_to } = req.query;

  let query = db.select().from(publishLogs);

  const conditions = [];

  if (publish_task_id) {
    conditions.push(eq(publishLogs.publishTaskId, publish_task_id as string));
  }

  if (date_from) {
    conditions.push(gte(publishLogs.postedAt, new Date(date_from as string)));
  }

  if (date_to) {
    conditions.push(lte(publishLogs.postedAt, new Date(date_to as string)));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const logs = await query;
  res.json(logs);
}));

// POST /api/content-ops/publish-logs
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    publish_task_id,
    posted_at,
    post_url,
    reach,
    clicks,
    notes,
  } = req.body;

  if (!publish_task_id) {
    return res.status(400).json({ error: 'publish_task_id is required' });
  }

  const newLog = {
    id: generateId(),
    publishTaskId: publish_task_id,
    postedAt: posted_at ? new Date(posted_at) : new Date(),
    postUrl: post_url || null,
    reach: reach || null,
    clicks: clicks || null,
    notes: notes || null,
  };

  const inserted = await db.insert(publishLogs).values(newLog).returning();
  res.status(201).json(inserted[0]);
}));

// GET /api/content-ops/publish-logs/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const log = await db.select().from(publishLogs).where(eq(publishLogs.id, id)).limit(1);

  if (log.length === 0) {
    return res.status(404).json({ error: 'Publish log not found' });
  }

  res.json(log[0]);
}));

// PUT /api/content-ops/publish-logs/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    publish_task_id,
    posted_at,
    post_url,
    reach,
    clicks,
    notes,
  } = req.body;

  const existing = await db
    .select()
    .from(publishLogs)
    .where(eq(publishLogs.id, id))
    .limit(1);

  if (existing.length === 0) {
    return res.status(404).json({ error: 'Publish log not found' });
  }

  const updates: Record<string, unknown> = {};
  if (publish_task_id !== undefined) updates.publishTaskId = publish_task_id;
  if (posted_at !== undefined) updates.postedAt = new Date(posted_at);
  if (post_url !== undefined) updates.postUrl = post_url;
  if (reach !== undefined) updates.reach = reach;
  if (clicks !== undefined) updates.clicks = clicks;
  if (notes !== undefined) updates.notes = notes;

  const updated = await db
    .update(publishLogs)
    .set(updates)
    .where(eq(publishLogs.id, id))
    .returning();

  res.json(updated[0]);
}));

// DELETE /api/content-ops/publish-logs/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const deleted = await db
    .delete(publishLogs)
    .where(eq(publishLogs.id, id))
    .returning();

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Publish log not found' });
  }

  res.status(204).send();
}));

export default router;

