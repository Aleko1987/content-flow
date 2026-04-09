import { Router } from 'express';
import { db } from '../db/index.js';
import { publishTasks, publishLogs, intentEvents, channels, contentItems, channelVariants, mediaAssets, contentItemMedia } from '../db/schema.js';
import { eq, and, or, gte, lte, inArray, sql } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { sha256 } from '../utils/crypto.js';
import { getConnectedAccount } from '../db/connectedAccounts.js';
import { getProvider } from '../publish/providers/registry.js';
import { sendWhatsAppStatusForPublishTask } from '../whatsapp/status-service.js';
import { recordPostedVideo } from '../posting-history/service.js';

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
    contentItemId,
    channelVariantId,
    scheduledFor,
  } = req.body;

  if (!contentItemId || !channelVariantId) {
    return res.status(400).json({ error: 'contentItemId and channelVariantId are required' });
  }

  // Load content item and channel variant
  const [contentItem] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);

  if (!contentItem) {
    return res.status(404).json({ error: 'Content item not found' });
  }

  const [variant] = await db
    .select()
    .from(channelVariants)
    .where(eq(channelVariants.id, channelVariantId))
    .limit(1);

  if (!variant) {
    return res.status(404).json({ error: 'Channel variant not found' });
  }

  if (variant.contentItemId !== contentItemId) {
    return res.status(400).json({ error: 'Channel variant does not belong to content item' });
  }

  // Render text: ${hook}\n\n${title} (fallback to title)
  const normalizedText = contentItem.hook
    ? `${contentItem.hook}\n\n${contentItem.title}`
    : contentItem.title;

  // scheduledFor defaults to now()
  const scheduledForDate = scheduledFor ? new Date(scheduledFor) : new Date();
  const scheduledForISO = scheduledForDate.toISOString();

  // Compute idempotency_key
  const idempotencyKey = sha256(
    `${contentItemId}:${channelVariantId}:${scheduledForISO}:${normalizedText}`
  );

  // Check if task already exists with this idempotency key
  const existing = await db
    .select()
    .from(publishTasks)
    .where(eq(publishTasks.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    // Return existing task (idempotent)
    return res.status(200).json(existing[0]);
  }

  // Get channel for default checklist
  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.key, variant.channelKey))
    .limit(1);

  const now = new Date();
  const newTask = {
    id: generateId(),
    contentItemId,
    channelKey: variant.channelKey,
    scheduledFor: scheduledForDate,
    state: 'todo',
    status: 'queued',
    assignee: null,
    checklist: channel?.defaultChecklist || [],
    idempotencyKey,
    providerRef: null,
    attempts: 0,
    maxAttempts: 5,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const inserted = await db.insert(publishTasks).values(newTask).returning();
    
    // Write publish_log for task.created
    await db.insert(publishLogs).values({
      id: generateId(),
      publishTaskId: inserted[0].id,
      postedAt: now,
      postUrl: null,
      reach: null,
      clicks: null,
      notes: `task.created - idempotency_key: ${idempotencyKey}`,
    });

    res.status(201).json(inserted[0]);
  } catch (error: unknown) {
    // If unique constraint hit (idempotency_key), reselect and return existing
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      const existingTask = await db
        .select()
        .from(publishTasks)
        .where(eq(publishTasks.idempotencyKey, idempotencyKey))
        .limit(1);
      
      if (existingTask.length > 0) {
        return res.status(200).json(existingTask[0]);
      }
    }
    throw error;
  }
}));

// POST /api/content-ops/publish-tasks/bulk-create
router.post('/bulk-create', asyncHandler(async (req: Request, res: Response) => {
  const { content_item_id } = req.body;

  if (!content_item_id) {
    return res.status(400).json({ error: 'content_item_id is required' });
  }

  // Get enabled channels
  const enabledChannels = await db
    .select({
      key: channels.key,
      defaultChecklist: channels.defaultChecklist,
    })
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
      status: 'queued' as const,
      assignee: null,
      checklist: [...(channel.defaultChecklist ?? [])],
      idempotencyKey: null,
      providerRef: null,
      attempts: 0,
      maxAttempts: 5,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
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

// POST /api/content-ops/publish-tasks/:id/execute
router.post('/:id/execute', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const instanceId = process.env.INSTANCE_ID || 'default';

  // Use transaction with FOR UPDATE lock
  let result;
  try {
    result = await db.transaction(async (tx) => {
    // SELECT ... FOR UPDATE to lock the row (using raw SQL)
    const taskResult = await tx.execute(
      sql`SELECT * FROM ${publishTasks} WHERE ${publishTasks.id} = ${id} FOR UPDATE LIMIT 1`
    );
    
    if (taskResult.rows.length === 0) {
      throw new Error('Publish task not found');
    }
    
    // Get typed task by querying again (row is already locked)
    const [task] = await tx
      .select()
      .from(publishTasks)
      .where(eq(publishTasks.id, id))
      .limit(1);
    
    if (!task) {
      throw new Error('Publish task not found');
    }

    // If status='success', return immediately
    if (task.status === 'success') {
      return { task, action: 'already_success' };
    }

    // If locked_at within 2 minutes, return 409
    if (task.lockedAt) {
      const lockAge = Date.now() - task.lockedAt.getTime();
      const twoMinutes = 2 * 60 * 1000;
      if (lockAge < twoMinutes) {
        const error: Error & { status?: number } = new Error('Task is currently locked');
        error.status = 409;
        throw error;
      }
    }

    // Set status='running', attempts+=1, locked_at=now, locked_by=INSTANCE_ID
    const now = new Date();
    const updated = await tx
      .update(publishTasks)
      .set({
        status: 'running',
        attempts: (task.attempts || 0) + 1,
        lockedAt: sql`now()`,
        lockedBy: instanceId,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(publishTasks.id, id))
      .returning();

    // Write publish_log for task.locked
    await tx.insert(publishLogs).values({
      id: generateId(),
      publishTaskId: id,
      postedAt: now,
      postUrl: null,
      reach: null,
      clicks: null,
      notes: `task.locked - instance: ${instanceId}, attempt: ${(task.attempts || 0) + 1}`,
    });

    return { task: updated[0], action: 'executing' };
    });
  } catch (error: unknown) {
    // Handle 409 lock error
    if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
      return res.status(409).json({ error: 'Task is currently locked' });
    }
    throw error;
  }

  if (result.action === 'already_success') {
    return res.json({ task: result.task, message: 'Task already completed' });
  }

  const task = result.task;

  try {
    // Assisted WhatsApp Status workflow (manual publish via message to self).
    if (task.channelKey === 'whatsapp_status') {
      // Write publish_log for provider.request
      await db.insert(publishLogs).values({
        id: generateId(),
        publishTaskId: task.id,
        postedAt: new Date(),
        postUrl: null,
        reach: null,
        clicks: null,
        notes: `provider.request - provider: whatsapp_cloud_api, channel: whatsapp_status`,
      });

      const sendResult = await sendWhatsAppStatusForPublishTask({ publishTaskId: task.id, force: true });

      const updatedTask = await db
        .select()
        .from(publishTasks)
        .where(eq(publishTasks.id, task.id))
        .limit(1);

      return res.json({
        task: updatedTask[0],
        providerRef: sendResult.messageId,
        alreadySent: sendResult.alreadySent,
      });
    }

    // Get channel variant to determine provider
    const [variant] = await db
      .select()
      .from(channelVariants)
      .where(
        and(
          eq(channelVariants.contentItemId, task.contentItemId),
          eq(channelVariants.channelKey, task.channelKey)
        )
      )
      .limit(1);

    if (!variant) {
      throw new Error('Channel variant not found');
    }

    const providerKey = task.channelKey === 'x'
      ? 'x'
      : task.channelKey === 'instagram'
        ? 'instagram'
        : null;

    if (!providerKey) {
      throw new Error(`No publish provider configured for channel: ${task.channelKey}`);
    }
    
    // Get connected account
    const account = await getConnectedAccount(providerKey);
    if (!account || account.status !== 'connected') {
      throw new Error(`No connected account found for provider: ${providerKey}`);
    }

    // Load content item to render text
    const [contentItem] = await db
      .select()
      .from(contentItems)
      .where(eq(contentItems.id, task.contentItemId))
      .limit(1);

    if (!contentItem) {
      throw new Error('Content item not found');
    }

    // Render text: ${hook}\n\n${title} (fallback to title)
    const defaultText = contentItem.hook
      ? `${contentItem.hook}\n\n${contentItem.title}`
      : contentItem.title;
    const text = providerKey === 'instagram'
      ? [
        (variant.caption || '').trim() || defaultText,
        (variant.hashtags || '').trim(),
      ].filter(Boolean).join('\n\n')
      : defaultText;

    // Write publish_log for provider.request
    const requestLogId = generateId();
    await db.insert(publishLogs).values({
      id: requestLogId,
      publishTaskId: task.id,
      postedAt: new Date(),
      postUrl: null,
      reach: null,
      clicks: null,
      notes: `provider.request - provider: ${providerKey}, text_length: ${text.length}`,
    });

    // Execute provider call
    const provider = getProvider(providerKey);
    let providerResult: { providerRef: string; canonicalUrl?: string };
    let postedFilename: string | null = null;
    try {
      if (providerKey === 'instagram') {
        if (!provider.postImage && !provider.postVideo) {
          throw new Error('Instagram provider does not support media publishing');
        }

        const resolveMediaUrl = async () => {
          if (variant.mediaAssetId) {
            const [asset] = await db
              .select()
              .from(mediaAssets)
              .where(eq(mediaAssets.id, variant.mediaAssetId))
              .limit(1);
            return asset || null;
          }

          const [link] = await db
            .select()
            .from(contentItemMedia)
            .where(eq(contentItemMedia.contentItemId, task.contentItemId))
            .limit(1);

          if (!link) {
            return null;
          }

          const [asset] = await db
            .select()
            .from(mediaAssets)
            .where(eq(mediaAssets.id, link.mediaAssetId))
            .limit(1);

          return asset || null;
        };

        const asset = await resolveMediaUrl();
        const mediaUrl = asset?.publicUrl || null;
        const mimeType = asset?.mimeType || '';
        // media_assets currently persists objectKey (not original upload name), so use it as the canonical asset name.
        postedFilename = asset?.objectKey || null;

        if (!mediaUrl) {
          throw new Error('Instagram publishing requires a media asset with a public URL');
        }
        const isVideo = mimeType.startsWith('video/');
        const isImage = mimeType.startsWith('image/');
        let result: string | { providerRef: string; canonicalUrl?: string };
        if (isVideo && provider.postVideo) {
          result = await provider.postVideo(
            { caption: text, videoUrl: mediaUrl },
            account.tokenData
          );
        } else if ((!mimeType || isImage) && provider.postImage) {
          result = await provider.postImage(
            { caption: text, imageUrl: mediaUrl },
            account.tokenData
          );
        } else if (isVideo && !provider.postVideo) {
          throw new Error('Instagram provider does not support video publishing');
        } else {
          throw new Error(`Unsupported Instagram media type: ${mimeType || 'unknown'}`);
        }
        providerResult = typeof result === 'string' ? { providerRef: result } : result;
      } else {
        const result = await provider.postText(text, account.tokenData);
        providerResult = typeof result === 'string' ? { providerRef: result } : result;
      }
    } catch (providerError) {
      // Write publish_log for provider.response (error)
      await db.insert(publishLogs).values({
        id: generateId(),
        publishTaskId: task.id,
        postedAt: new Date(),
        postUrl: null,
        reach: null,
        clicks: null,
        notes: `provider.response - error: ${providerError instanceof Error ? providerError.message : String(providerError)}`,
      });
      throw providerError;
    }

    // Write publish_log for provider.response (success)
    await db.insert(publishLogs).values({
      id: generateId(),
      publishTaskId: task.id,
      postedAt: new Date(),
      postUrl: null,
      reach: null,
      clicks: null,
      notes: `provider.response - provider_ref: ${providerResult.providerRef}`,
    });

    // On success: status='success', provider_ref=tweetId, clear locks
    const canonicalUrl = providerKey === 'x'
      ? providerResult.canonicalUrl || `https://twitter.com/i/web/status/${providerResult.providerRef}`
      : providerResult.canonicalUrl || null;
    await db
      .update(publishTasks)
      .set({
        status: 'success',
        providerRef: providerResult.providerRef,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(publishTasks.id, id));

    if (postedFilename) {
      await recordPostedVideo({
        contentItemId: task.contentItemId,
        publishTaskId: task.id,
        filename: postedFilename,
        platform: providerKey,
        postedAt: new Date(),
        status: 'success',
        externalPostId: providerResult.providerRef,
      });
    }

    // Write publish_log for task.succeeded
    await db.insert(publishLogs).values({
      id: generateId(),
      publishTaskId: task.id,
      postedAt: new Date(),
      postUrl: canonicalUrl,
      reach: null,
      clicks: null,
      notes: `task.succeeded - provider_ref: ${providerResult.providerRef}`,
    });

    const updatedTask = await db
      .select()
      .from(publishTasks)
      .where(eq(publishTasks.id, id))
      .limit(1);

    res.json({ task: updatedTask[0], providerRef: providerResult.providerRef });
  } catch (error) {
    // Classify error: retryable (429/5xx/network) => retryable_failed, else failed
    const errorMessage = error instanceof Error ? error.message : String(error);
    let status: 'retryable_failed' | 'failed' = 'failed';
    
    // Check for HTTP status codes in error message
    const statusMatch = errorMessage.match(/\b(\d{3})\b/);
    const httpStatus = statusMatch ? parseInt(statusMatch[1], 10) : null;
    
    // Check for network errors
    const isNetworkError = errorMessage.includes('network') ||
      errorMessage.includes('timeout') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ECONNRESET');
    
    if (httpStatus === 429 || (httpStatus && httpStatus >= 500) || isNetworkError) {
      status = 'retryable_failed';
    }

    // Set status, last_error, clear locks
    await db
      .update(publishTasks)
      .set({
        status,
        lastError: errorMessage.substring(0, 1000), // Limit error length
        lockedAt: null,
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(publishTasks.id, id));

    // Write publish_log for task.failed (never log tokens)
    await db.insert(publishLogs).values({
      id: generateId(),
      publishTaskId: task.id,
      postedAt: new Date(),
      postUrl: null,
      reach: null,
      clicks: null,
      notes: `task.failed - status: ${status}, error: ${errorMessage.substring(0, 500)}`,
    });

    res.status(500).json({ 
      error: 'Task execution failed',
      status,
      message: errorMessage,
    });
  }
}));

export default router;


