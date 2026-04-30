import { createHmac } from 'node:crypto';
import { normalizedSocialEventSchema, type NormalizedSocialEvent } from '../social-contract/schemas.js';
import { logger } from '../utils/logger.js';

type EventProducerResult = {
  duplicate: boolean;
  delivered: boolean;
  attempts: number;
};

type DeliveryStore = {
  getEventDelivery: (sourceEventId: string) => Promise<{ deliveryStatus: string; deliveryAttempts: number } | null>;
  upsertEventPending: (event: NormalizedSocialEvent) => Promise<void>;
  markEventDeliveryAttempt: (sourceEventId: string, errorMessage: string | null) => Promise<void>;
  markEventDelivered: (sourceEventId: string) => Promise<void>;
};

type ProducerDeps = {
  fetchImpl: typeof fetch;
  store: DeliveryStore;
};

const buildAuthHeaders = (payload: string): Record<string, string> => {
  const bearerToken = (
    process.env.DO_SOCIALS_INGEST_TOKEN ||
    process.env.DO_INTENT_AUTH_BEARER_TOKEN ||
    ''
  ).trim();
  if (bearerToken) {
    return { Authorization: `Bearer ${bearerToken}` };
  }

  const hmacSecret = (process.env.DO_INTENT_AUTH_HMAC_SECRET || '').trim();
  if (!hmacSecret) {
    return {};
  }

  const timestamp = Date.now().toString();
  const digest = createHmac('sha256', hmacSecret).update(`${timestamp}.${payload}`).digest('hex');
  return {
    'x-content-flow-timestamp': timestamp,
    'x-content-flow-signature': `sha256=${digest}`,
  };
};

const resolveTargetUrl = () => {
  const explicit = (
    process.env.DO_INTENT_SOCIAL_INGEST_URL ||
    process.env.DO_INTENT_SOCIAL_EVENTS_INGEST_URL ||
    ''
  ).trim();
  if (explicit) return explicit;
  const baseUrl = (process.env.DO_INTENT_BASE_URL || '').trim();
  if (!baseUrl) {
    throw new Error(
      'Missing DO_INTENT_SOCIAL_INGEST_URL (or DO_INTENT_SOCIAL_EVENTS_INGEST_URL) or DO_INTENT_BASE_URL'
    );
  }
  return `${baseUrl.replace(/\/+$/, '')}/social-events/ingest`;
};

const shouldRetry = (status: number) => status === 429 || status >= 500;

export const produceNormalizedSocialEvent = async (
  input: unknown,
  deps?: ProducerDeps
): Promise<EventProducerResult> => {
  const resolvedDeps = deps ?? {
    fetchImpl: fetch,
    store: (await import('./idempotency-store.js')).socialIdempotencyStore,
  };
  const event = normalizedSocialEventSchema.parse(input);
  const existing = await resolvedDeps.store.getEventDelivery(event.source_event_id);
  if (existing?.deliveryStatus === 'delivered') {
    return {
      duplicate: true,
      delivered: true,
      attempts: existing.deliveryAttempts,
    };
  }

  await resolvedDeps.store.upsertEventPending(event);

  const targetUrl = resolveTargetUrl();
  const payload = JSON.stringify(event);
  const maxAttempts = Math.max(1, Number(process.env.DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS || 3));

  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const authHeaders = buildAuthHeaders(payload);
      for (const [key, value] of Object.entries(authHeaders)) {
        headers.set(key, value);
      }
      const response = await resolvedDeps.fetchImpl(targetUrl, {
        method: 'POST',
        headers,
        body: payload,
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const message = `DO-Intent ingest failed (${response.status}) ${bodyText}`.trim();
        await resolvedDeps.store.markEventDeliveryAttempt(event.source_event_id, message);
        if (shouldRetry(response.status) && attempt < maxAttempts) {
          continue;
        }
        throw new Error(message);
      }

      await resolvedDeps.store.markEventDeliveryAttempt(event.source_event_id, null);
      await resolvedDeps.store.markEventDelivered(event.source_event_id);
      return {
        duplicate: false,
        delivered: true,
        attempts: attempt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await resolvedDeps.store.markEventDeliveryAttempt(event.source_event_id, message);
      if (attempt >= maxAttempts) {
        logger.error('Normalized social event delivery failed', {
          sourceEventId: event.source_event_id,
          attempt,
          maxAttempts,
          error: message,
        });
        throw error;
      }
    }
  }

  throw new Error('Event delivery exhausted retries');
};
