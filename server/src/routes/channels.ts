import { Router } from 'express';
import { db } from '../db';
import { channels } from '../db/schema';
import { eq } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler';
import type { Request, Response } from 'express';

const router = Router();

// GET /api/content-ops/channels
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const allChannels = await db.select().from(channels);
  res.json(allChannels);
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

export default router;


