import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { requireServiceAuth } from '../socials/service-auth.js';
import { produceNormalizedSocialEvent } from '../socials/event-producer.js';

const router = Router();

// POST /api/content-ops/social-events/produce
// Accepts NormalizedSocialEvent and forwards to DO-Intent /social-events/ingest.
router.post(
  '/produce',
  requireServiceAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await produceNormalizedSocialEvent(req.body);
    return res.status(result.duplicate ? 200 : 202).json({
      ok: true,
      ...result,
    });
  })
);

export default router;
