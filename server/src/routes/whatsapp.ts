import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import {
  sendWhatsAppStatusForPublishTask,
  sendWhatsAppVerificationTemplate,
} from '../whatsapp/status-service.js';
import {
  getForwardTokenFromHeader,
  processIncomingConfirmationWebhook,
  validateForwardToken,
} from '../whatsapp/assisted-confirmation.js';
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

// POST /api/content-ops/whatsapp/send-verification-template
// Sends either generic verification template or confirmation-template test.
router.post(
  '/send-verification-template',
  asyncHandler(async (req: Request, res: Response) => {
    const { recipient_phone, template_type, scheduled_post_id, caption, scheduled_date, scheduled_time } = req.body as {
      recipient_phone?: string;
      template_type?: 'verification' | 'confirmation';
      scheduled_post_id?: string;
      caption?: string;
      scheduled_date?: string;
      scheduled_time?: string;
    };
    logger.info('Received WhatsApp template test request', {
      templateType: template_type || 'verification',
      hasScheduledPostId: !!String(scheduled_post_id || '').trim(),
      hasRecipientPhone: !!String(recipient_phone || '').trim(),
    });
    const result = await sendWhatsAppVerificationTemplate({
      recipientPhone: recipient_phone || null,
      templateType: template_type || 'verification',
      scheduledPostId: scheduled_post_id || null,
      caption: caption || null,
      scheduledDate: scheduled_date || null,
      scheduledTime: scheduled_time || null,
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
  async (req: Request, res: Response) => {
    const providedToken = getForwardTokenFromHeader(req.headers['x-content-flow-forward-token']);
    const auth = validateForwardToken(providedToken, process.env.CONTENT_FLOW_FORWARD_TOKEN);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: 'Unauthorized webhook request' });
    }

    try {
      const result = await processIncomingConfirmationWebhook(req.body as any);
      logger.info('Forwarded WhatsApp webhook processed', result);

      // Also relay to unified operator platform (margins invoice + assisted posting).
      const unifiedUrl = String(process.env.UNIFIED_WHATSAPP_WEBHOOK_URL || process.env.CONTENT_FLOW_UNIFIED_WEBHOOK_URL || '').trim();
      const unifiedToken = String(process.env.CONTENT_FLOW_FORWARD_TOKEN || '').trim();
      if (unifiedUrl) {
        try {
          const relay = await fetch(unifiedUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(unifiedToken ? { 'x-content-flow-forward-token': unifiedToken } : {}),
              'x-earthcure-forwarded': '1',
            },
            body: JSON.stringify(req.body || {}),
          });
          logger.info('Relayed WhatsApp webhook to unified', {
            status: relay.status,
            ok: relay.ok,
            endpoint: unifiedUrl,
          });
        } catch (relayError) {
          logger.error('Unified WhatsApp relay failed', {
            error: relayError instanceof Error ? relayError.message : String(relayError),
          });
        }
      }

      return res.status(200).json({ ok: true, ...result });
    } catch (error) {
      logger.error('Forwarded WhatsApp webhook processing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(200).json({
        ok: true,
        processed: 0,
        confirmed: 0,
        declined: 0,
        ignored: 0,
        unmatched: 0,
        duplicates: 0,
        failed: 1,
        received: 0,
      });
    }
  }
);

export default router;

