import { Router } from 'express';
import { seed } from '../db/seed';
import { asyncHandler } from '../middleware/error-handler';
import type { Request, Response } from 'express';

const router = Router();

// POST /api/content-ops/seed-demo
router.post('/seed-demo', asyncHandler(async (req: Request, res: Response) => {
  try {
    await seed();
    res.json({ message: 'Demo data seeded successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Seed execution failed', 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

export default router;

