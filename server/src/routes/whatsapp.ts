import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendWhatsAppStatusForPublishTask } from '../whatsapp/status-service.js';

const router = Router();

// POST /api/content-ops/whatsapp/send-status
// Sends an assisted WhatsApp Status message (to yourself) for a publish_task.
router.post(
  '/send-status',
  asyncHandler(async (req: Request, res: Response) => {
    const { publish_task_id, force } = req.body as { publish_task_id?: string; force?: boolean };
    if (!publish_task_id) {
      return res.status(400).json({ error: 'publish_task_id is required' });
    }

    const result = await sendWhatsAppStatusForPublishTask({
      publishTaskId: publish_task_id,
      force: force === true,
    });

    res.json({ ok: true, ...result });
  })
);

export default router;

