import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { requireServiceAuth } from '../socials/service-auth.js';
import { executeSocialTask } from '../socials/execution-service.js';

const router = Router();

// POST /api/content-ops/social-execution/execute-task
// Consumes ExecuteTaskRequest and returns ExecuteTaskResponse.
router.post(
  '/execute-task',
  requireServiceAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const response = await executeSocialTask(req.body);
    return res.json(response);
  })
);

export default router;
