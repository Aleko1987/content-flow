import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import { sendWhatsAppStatusForPublishTask } from '../whatsapp/status-service.js';
import { processIncomingConfirmationWebhook } from '../whatsapp/assisted-confirmation.js';
import { logger } from '../utils/logger.js';

const router = Router();

// POST /api/content-ops/whatsapp/send-status
// Sends an assisted WhatsApp Status message (to yourself) for a publish_task.
router.post(
  '/send-status',
  asyncHandler(async (req: Request, res: Response) => {
    const { publish_task_id, force, recipient_phone } = req.body as {
      publish_task_id?: string;
      force?: boolean;
      recipient_phone?: string;
    };
    if (!publish_task_id) {
      return res.status(400).json({ error: 'publish_task_id is required' });
    }

    const result = await sendWhatsAppStatusForPublishTask({
      publishTaskId: publish_task_id,
      force: force === true,
      recipientPhone: recipient_phone || null,
    });

    res.json({ ok: true, ...result });
  })
);

// GET /api/content-ops/whatsapp/webhook
// Meta webhook verification endpoint.
router.get('/webhook', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const verifyToken = (process.env.WA_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge || 'ok');
  }
  return res.status(403).json({ error: 'Webhook verification failed' });
});

// POST /api/content-ops/whatsapp/webhook
// Receives inbound WhatsApp replies and processes confirmation actions.
router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await processIncomingConfirmationWebhook(req.body as any);
    logger.info(
      `WhatsApp webhook processed=${result.processed} confirmed=${result.confirmed} declined=${result.declined}`
    );
    res.json({ ok: true, ...result });
  })
);

export default router;

