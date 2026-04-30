import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { requireServiceAuth } from '../socials/service-auth.js';
import { executeSocialTask, getSocialExecutionCapabilities } from '../socials/execution-service.js';

const router = Router();

router.get(
  '/capabilities',
  requireServiceAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const capabilities = getSocialExecutionCapabilities('all');
    return res.json(capabilities);
  })
);

router.get(
  '/capabilities/:platform',
  requireServiceAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const capabilities = getSocialExecutionCapabilities(String(req.params.platform || '').trim().toLowerCase());
    if (!capabilities) {
      return res.status(404).json({ error: 'Capability matrix not found for platform.' });
    }
    return res.json(capabilities);
  })
);

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
