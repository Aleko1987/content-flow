import { Router } from 'express';
import { db } from '../db';
import { publishTasks, publishLogs, intentEvents, channels, contentItems, channelVariants } from '../db/schema';
import { eq, and, or, gte, lte, inArray, sql } from 'drizzle-orm';
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

// GET /api/content-ops/publish-tasks
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { state, channel_key, date_from, date_to, due } = req.query;

  let query = db.select().from(publishTasks);

  const conditions = [];

  if (state) {
    const stateArray = Array.isArray(state) ? state : [state];
    conditions.push(inArray(publishTasks.state, stateArray as string[]));
  }

  if (channel_key) {
    const channelArray = Array.isArray(channel_key) ? channel_key : [channel_key];
    conditions.push(inArray(publishTasks.channelKey, channelArray as string[]));
  }

  if (date_from) {
    conditions.push(gte(publishTasks.createdAt, new Date(date_from as string)));
  }

  if (date_to) {
    conditions.push(lte(publishTasks.createdAt, new Date(date_to as string)));
  }

  // Due filter: scheduled_for <= now and state is scheduled (not posted)
  if (due === 'true') {
    const now = new Date();
    conditions.push(
      and(
        eq(publishTasks.state, 'scheduled'),
        sql`${publishTasks.scheduledFor} IS NOT NULL`,
        lte(publishTasks.scheduledFor, now)
      )!
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const tasks = await query;
  res.json(tasks);
}));

// POST /api/content-ops/publish-tasks
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const {
    content_item_id,
    channel_key,
    scheduled_for,
    state = 'todo',
    assignee,
    checklist,
  } = req.body;

  if (!content_item_id || !channel_key) {
    return res.status(400).json({ error: 'content_item_id and channel_key are required' });
  }

  // Get channel for default checklist
  const channel = await db
    .select()
    .from(channels)
    .where(eq(channels.key, channel_key))
    .limit(1);

  const now = new Date();
  const newTask = {
    id: generateId(),
    contentItemId: content_item_id,
    channelKey: channel_key,
    scheduledFor: scheduled_for ? new Date(scheduled_for) : null,
    state,
    assignee: assignee || null,
    checklist: checklist || channel[0]?.defaultChecklist || [],
    createdAt: now,
    updatedAt: now,
  };

  const inserted = await db.insert(publishTasks).values(newTask).returning();
  res.status(201).json(inserted[0]);
}));

// POST /api/content-ops/publish-tasks/bulk-create
router.post('/bulk-create', asyncHandler(async (req: Request, res: Response) => {
  const { content_item_id } = req.body;

  if (!content_item_id) {
    return res.status(400).json({ error: 'content_item_id is required' });
  }

  // Get enabled channels
  const enabledChannels = await db
    .select()
    .from(channels)
    .where(eq(channels.enabled, true));

  // Get existing tasks for this content item
  const existingTasks = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.contentItemId, content_item_id));

  const existingChannelKeys = existingTasks.map(t => t.channelKey);

  // Create tasks for enabled channels that don't have tasks yet
  const now = new Date();
  const newTasks = enabledChannels
    .filter(c => !existingChannelKeys.includes(c.key))
    .map(channel => ({
      id: generateId(),
      contentItemId: content_item_id,
      channelKey: channel.key,
      scheduledFor: null,
      state: 'todo' as const,
      assignee: null,
      checklist: [...channel.defaultChecklist],
      createdAt: now,
      updatedAt: now,
    }));

  if (newTasks.length > 0) {
    await db.insert(publishTasks).values(newTasks);
  }

  res.status(201).json({ created: newTasks.length, tasks: newTasks });
}));

// PATCH /api/content-ops/publish-tasks/:id
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { state, scheduled_for, checklist, assignee } = req.body;

  const updates: Record<string, unknown> = {};
  if (state !== undefined) updates.state = state;
  if (scheduled_for !== undefined) updates.scheduledFor = scheduled_for ? new Date(scheduled_for) : null;
  if (checklist !== undefined) updates.checklist = checklist;
  if (assignee !== undefined) updates.assignee = assignee;
  updates.updatedAt = new Date();

  const updated = await db
    .update(publishTasks)
    .set(updates)
    .where(eq(publishTasks.id, id))
    .returning();

  if (updated.length === 0) {
    return res.status(404).json({ error: 'Publish task not found' });
  }

  res.json(updated[0]);
}));

// POST /api/content-ops/publish-tasks/:id/log-publish
router.post('/:id/log-publish', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { posted_at, post_url, reach, clicks, notes } = req.body;

  // Get the task
  const task = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.id, id))
    .limit(1);

  if (task.length === 0) {
    return res.status(404).json({ error: 'Publish task not found' });
  }

  const now = new Date();

  // Create publish log
  const newLog = {
    id: generateId(),
    publishTaskId: id,
    postedAt: posted_at ? new Date(posted_at) : now,
    postUrl: post_url || null,
    reach: reach || null,
    clicks: clicks || null,
    notes: notes || null,
  };

  await db.insert(publishLogs).values(newLog);

  // Update task state to posted
  await db
    .update(publishTasks)
    .set({ state: 'posted', updatedAt: now })
    .where(eq(publishTasks.id, id));

  // Get variant for additional context
  const variant = await db
    .select()
    .from(channelVariants)
    .where(
      and(
        eq(channelVariants.contentItemId, task[0].contentItemId),
        eq(channelVariants.channelKey, task[0].channelKey)
      )
    )
    .limit(1);

  // Create intent event with enhanced payload
  const event = {
    id: generateId(),
    eventType: 'post_published',
    source: 'content_ops',
    channelKey: task[0].channelKey,
    contentItemId: task[0].contentItemId,
    payload: {
      channel_key: task[0].channelKey,
      url: newLog.postUrl || null,
      scheduled_for: task[0].scheduledFor?.toISOString() || null,
      published_at: newLog.postedAt.toISOString(),
      content_item_id: task[0].contentItemId,
      channel_variant_id: variant[0]?.id || null,
      publish_task_id: id,
      metrics: {
        reach: newLog.reach || null,
        clicks: newLog.clicks || null,
      },
      notes: newLog.notes || null,
    },
    createdAt: now,
  };

  await db.insert(intentEvents).values(event);

  res.status(201).json({ log: newLog, event });
}));

// PUT /api/content-ops/publish-tasks/:id
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    content_item_id,
    channel_key,
    scheduled_for,
    state,
    assignee,
    checklist,
  } = req.body;

  const existing = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.id, id))
    .limit(1);

  if (existing.length === 0) {
    return res.status(404).json({ error: 'Publish task not found' });
  }

  const updates: Record<string, unknown> = {};
  if (content_item_id !== undefined) updates.contentItemId = content_item_id;
  if (channel_key !== undefined) updates.channelKey = channel_key;
  if (scheduled_for !== undefined) updates.scheduledFor = scheduled_for ? new Date(scheduled_for) : null;
  if (state !== undefined) updates.state = state;
  if (assignee !== undefined) updates.assignee = assignee;
  if (checklist !== undefined) updates.checklist = checklist;
  updates.updatedAt = new Date();

  const updated = await db
    .update(publishTasks)
    .set(updates)
    .where(eq(publishTasks.id, id))
    .returning();

  res.json(updated[0]);
}));

// DELETE /api/content-ops/publish-tasks/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const deleted = await db
    .delete(publishTasks)
    .where(eq(publishTasks.id, id))
    .returning();

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Publish task not found' });
  }

  res.status(204).send();
}));

export default router;


