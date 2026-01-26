import { Router } from 'express';
import { db } from '../db/index.js';
import { channelVariants } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

// GET /api/content-ops/variants
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const allVariants = await db.select().from(channelVariants);
  res.json(allVariants);
}));

// GET /api/content-ops/content-items/:id/variants
router.get('/:id/variants', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const variants = await db
    .select()
    .from(channelVariants)
    .where(eq(channelVariants.contentItemId, id));

  res.json(variants);
}));

// POST /api/content-ops/content-items/:id/variants
router.post('/:id/variants', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    channel_key,
    caption,
    hashtags,
    media_prompt,
    cta,
    link_url,
    utm_campaign,
    utm_source,
    utm_medium,
  } = req.body;

  if (!channel_key) {
    return res.status(400).json({ error: 'channel_key is required' });
  }

  // Check if variant already exists
  const existing = await db
    .select()
    .from(channelVariants)
    .where(
      and(
        eq(channelVariants.contentItemId, id),
        eq(channelVariants.channelKey, channel_key)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return res.status(409).json({ error: 'Variant for this content item and channel already exists' });
  }

  const now = new Date();
  const newVariant = {
    id: generateId(),
    contentItemId: id,
    channelKey: channel_key,
    caption: caption || null,
    hashtags: hashtags || null,
    mediaPrompt: media_prompt || null,
    cta: cta || null,
    linkUrl: link_url || null,
    utmCampaign: utm_campaign || null,
    utmSource: utm_source || null,
    utmMedium: utm_medium || null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const inserted = await db.insert(channelVariants).values(newVariant).returning();
    res.status(201).json(inserted[0]);
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Variant for this content item and channel already exists' });
    }
    throw error;
  }
}));

// PUT /api/content-ops/content-items/:id/variants/:channel_key (upsert)
router.put('/:id/variants/:channel_key', asyncHandler(async (req: Request, res: Response) => {
  const { id, channel_key } = req.params;
  const {
    caption,
    hashtags,
    media_prompt,
    cta,
    link_url,
    utm_campaign,
    utm_source,
    utm_medium,
  } = req.body;

  const now = new Date();

  // Check if variant exists
  const existing = await db
    .select()
    .from(channelVariants)
    .where(
      and(
        eq(channelVariants.contentItemId, id),
        eq(channelVariants.channelKey, channel_key)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing
    const updated = await db
      .update(channelVariants)
      .set({
        caption: caption !== undefined ? caption : existing[0].caption,
        hashtags: hashtags !== undefined ? hashtags : existing[0].hashtags,
        mediaPrompt: media_prompt !== undefined ? media_prompt : existing[0].mediaPrompt,
        cta: cta !== undefined ? cta : existing[0].cta,
        linkUrl: link_url !== undefined ? link_url : existing[0].linkUrl,
        utmCampaign: utm_campaign !== undefined ? utm_campaign : existing[0].utmCampaign,
        utmSource: utm_source !== undefined ? utm_source : existing[0].utmSource,
        utmMedium: utm_medium !== undefined ? utm_medium : existing[0].utmMedium,
        updatedAt: now,
      })
      .where(eq(channelVariants.id, existing[0].id))
      .returning();

    res.json(updated[0]);
  } else {
    // Insert new
    const newVariant = {
      id: generateId(),
      contentItemId: id,
      channelKey: channel_key,
      caption: caption || null,
      hashtags: hashtags || null,
      mediaPrompt: media_prompt || null,
      cta: cta || null,
      linkUrl: link_url || null,
      utmCampaign: utm_campaign || null,
      utmSource: utm_source || null,
      utmMedium: utm_medium || null,
      createdAt: now,
      updatedAt: now,
    };

    const inserted = await db.insert(channelVariants).values(newVariant).returning();
    res.status(201).json(inserted[0]);
  }
}));

// DELETE /api/content-ops/content-items/:id/variants/:channel_key
router.delete('/:id/variants/:channel_key', asyncHandler(async (req: Request, res: Response) => {
  const { id, channel_key } = req.params;

  const deleted = await db
    .delete(channelVariants)
    .where(
      and(
        eq(channelVariants.contentItemId, id),
        eq(channelVariants.channelKey, channel_key)
      )
    )
    .returning();

  if (deleted.length === 0) {
    return res.status(404).json({ error: 'Variant not found' });
  }

  res.status(204).send();
}));

export default router;


