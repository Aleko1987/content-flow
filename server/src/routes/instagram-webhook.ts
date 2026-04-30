import { Router } from 'express';
import type { Request, Response } from 'express';
import { processInstagramInboundWebhook } from '../socials/instagram-inbound.js';
import { asyncHandler } from '../middleware/error-handler.js';

const router = Router();

// GET /api/content-ops/instagram/webhook
// Meta webhook verification endpoint.
router.get('/webhook', (req: Request, res: Response) => {
  const mode = String(req.query['hub.mode'] || '');
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = String(req.query['hub.challenge'] || '');
  const verifyToken = (process.env.IG_WEBHOOK_VERIFY_TOKEN || '').trim();

  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge || 'ok');
  }
  return res.status(403).json({ error: 'Webhook verification failed' });
});

// POST /api/content-ops/instagram/webhook
// Receives inbound Instagram events and forwards normalized payloads to DO-Intent.
router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await processInstagramInboundWebhook(req.body);
    return res.status(200).json({ ok: true, ...result });
  })
);

export default router;
