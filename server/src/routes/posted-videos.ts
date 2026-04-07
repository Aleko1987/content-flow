import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { getPostedVideosSummary, listPostedVideos } from '../posting-history/service.js';

const router = Router();

const parsePositiveInt = (value: unknown): number | undefined => {
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
};

// GET /api/content-ops/posted-videos
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;
  const days = parsePositiveInt(req.query.days);
  const hook = parsePositiveInt(req.query.hook);
  const meat = parsePositiveInt(req.query.meat);
  const cta = parsePositiveInt(req.query.cta);
  const limit = parsePositiveInt(req.query.limit);

  const rows = await listPostedVideos({
    platform,
    days,
    hook,
    meat,
    cta,
    limit,
  });

  res.json(rows);
}));

// GET /api/content-ops/posted-videos/summary
router.get('/summary', asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getPostedVideosSummary();
  res.json(summary);
}));

export default router;
