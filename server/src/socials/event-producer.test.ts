import assert from 'node:assert/strict';
import test from 'node:test';
import { produceNormalizedSocialEvent } from './event-producer.js';
import type { NormalizedSocialEvent } from '../social-contract/schemas.js';

const originalEnv = {
  DO_INTENT_SOCIAL_EVENTS_INGEST_URL: process.env.DO_INTENT_SOCIAL_EVENTS_INGEST_URL,
  DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS: process.env.DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS,
  DO_INTENT_AUTH_BEARER_TOKEN: process.env.DO_INTENT_AUTH_BEARER_TOKEN,
};

test.afterEach(() => {
  process.env.DO_INTENT_SOCIAL_EVENTS_INGEST_URL = originalEnv.DO_INTENT_SOCIAL_EVENTS_INGEST_URL;
  process.env.DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS = originalEnv.DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS;
  process.env.DO_INTENT_AUTH_BEARER_TOKEN = originalEnv.DO_INTENT_AUTH_BEARER_TOKEN;
});

const eventPayload: NormalizedSocialEvent = {
  version: 'v1',
  source_event_id: 'evt_123',
  platform: 'instagram',
  event_type: 'comment',
  actor_ref: 'ig:1789',
  actor_display: 'James',
  lead_match_confidence: 0.82,
  occurred_at: '2026-04-24T16:10:00.000Z',
  source_url: 'https://instagram.com/p/abc',
  content_excerpt: 'Need diesel quote',
  metadata: { owner_user_id: 'user_abc' },
};

const makeStore = () => {
  let status: 'pending' | 'failed' | 'delivered' = 'pending';
  let attempts = 0;
  const errors: string[] = [];
  return {
    store: {
      getEventDelivery: async () =>
        status === 'delivered' ? { deliveryStatus: 'delivered', deliveryAttempts: attempts } : null,
      upsertEventPending: async () => {},
      markEventDeliveryAttempt: async (_sourceEventId: string, errorMessage: string | null) => {
        attempts += 1;
        if (errorMessage) {
          status = 'failed';
          errors.push(errorMessage);
        }
      },
      markEventDelivered: async () => {
        status = 'delivered';
      },
    },
    inspect: () => ({ status, attempts, errors }),
  };
};

test('dedupes event already marked delivered', async () => {
  const result = await produceNormalizedSocialEvent(eventPayload, {
    fetchImpl: (async () => {
      throw new Error('network should not be called for duplicate');
    }) as typeof fetch,
    store: {
      getEventDelivery: async () => ({ deliveryStatus: 'delivered', deliveryAttempts: 3 }),
      upsertEventPending: async () => {},
      markEventDeliveryAttempt: async () => {},
      markEventDelivered: async () => {},
    },
  });

  assert.equal(result.duplicate, true);
  assert.equal(result.delivered, true);
  assert.equal(result.attempts, 3);
});

test('retries transient upstream failure then succeeds', async () => {
  process.env.DO_INTENT_SOCIAL_EVENTS_INGEST_URL = 'https://intent.local/social-events/ingest';
  process.env.DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS = '2';
  process.env.DO_INTENT_AUTH_BEARER_TOKEN = 'token';

  const deps = makeStore();
  let callCount = 0;
  const result = await produceNormalizedSocialEvent(eventPayload, {
    fetchImpl: (async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 502,
          text: async () => 'bad gateway',
        } as Response;
      }
      return {
        ok: true,
        status: 202,
        text: async () => '',
      } as Response;
    }) as typeof fetch,
    store: deps.store,
  });

  const observed = deps.inspect();
  assert.equal(result.delivered, true);
  assert.equal(result.duplicate, false);
  assert.equal(callCount, 2);
  assert.equal(observed.status, 'delivered');
  assert.equal(observed.attempts >= 2, true);
});
