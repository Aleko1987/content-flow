import { Router } from 'express';
import { db } from '../db';
import { channels } from '../db/schema';
import { eq } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler';
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

// GET /api/content-ops/channels
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const allChannels = await db.select().from(channels);
  res.json(allChannels);
}));

// POST /api/content-ops/channels
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { key, name, enabled = true, default_checklist = [] } = req.body;

  if (!key || !name) {
    return res.status(400).json({ error: 'key and name are required' });
  }

  const newChannel = {
    id: generateId(),
    key,
    name,
    enabled,
    defaultChecklist: default_checklist,
    createdAt: new Date(),
  };

  try {
    const inserted = await db.insert(channels).values(newChannel).returning();
    res.status(201).json(inserted[0]);
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Channel with this key already exists' });
    }
    throw error;
  }
}));

// PUT /api/content-ops/channels/:key
router.put('/:key', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { name, enabled, default_checklist } = req.body;

  const existing = await db.select().from(channels).where(eq(channels.key, key)).limit(1);

  if (existing.length === 0) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (enabled !== undefined) updates.enabled = enabled;
  if (default_checklist !== undefined) updates.defaultChecklist = default_checklist;

  const updated = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.key, key))
    .returning();

  res.json(updated[0]);
}));

// PATCH /api/content-ops/channels/:key
router.patch('/:key', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;
  const { enabled, default_checklist } = req.body;

  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.enabled = enabled;
  if (default_checklist !== undefined) updates.defaultChecklist = default_checklist;

  const updated = await db
    .update(channels)
    .set(updates)
    .where(eq(channels.key, key))
    .returning();

  if (updated.length === 0) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  res.json(updated[0]);
}));

// DELETE /api/content-ops/channels/:key
router.delete('/:key', asyncHandler(async (req: Request, res: Response) => {
  const { key } = req.params;

  const deleted = await db
    .delete(channels)
    .where(eq(channels.key, key))
    .returning();

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  res.status(204).send();
}));

export default router;


