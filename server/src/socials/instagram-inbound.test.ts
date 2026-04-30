import assert from 'node:assert/strict';
import test from 'node:test';
import { extractInstagramInboundCandidates, processInstagramInboundWebhook } from './instagram-inbound.js';

const samplePayload = {
  object: 'instagram',
  entry: [
    {
      id: '17841400000000000',
      time: 1777118500,
      messaging: [
        {
          sender: { id: 'ig_sender_1' },
          recipient: { id: '17841400000000000' },
          timestamp: 1777118500000,
          message: { mid: 'mid.abc.123', text: 'Need a quote for biodiesel delivery' },
        },
      ],
      changes: [
        {
          field: 'comments',
          value: {
            id: 'comment_999',
            text: 'Can you share pricing?',
            from: { id: 'ig_sender_2', username: 'earthfriend' },
            created_time: '2026-04-24T16:10:00.000Z',
            instagram_account_id: '17841400000000000',
            permalink_url: 'https://instagram.com/p/example',
          },
        },
      ],
    },
  ],
};

test('extracts messaging and comment events from Instagram webhook payload', () => {
  const candidates = extractInstagramInboundCandidates(samplePayload);
  assert.equal(candidates.length, 2);

  assert.equal(candidates[0].sourceEventId, 'mid.abc.123');
  assert.equal(candidates[0].actorRef, 'ig_sender_1');
  assert.equal(candidates[0].contentExcerpt, 'Need a quote for biodiesel delivery');

  assert.equal(candidates[1].sourceEventId, 'comment_999');
  assert.equal(candidates[1].actorRef, 'ig_sender_2');
  assert.equal(candidates[1].actorDisplay, 'earthfriend');
  assert.equal(candidates[1].sourceUrl, 'https://instagram.com/p/example');
});

test('processes inbound webhook and forwards normalized events with owner metadata', async () => {
  const forwardedPayloads: unknown[] = [];
  const result = await processInstagramInboundWebhook(samplePayload, {
    resolveOwnerUserId: async () => 'user_clerk_123',
    produceEvent: async (payload: unknown) => {
      forwardedPayloads.push(payload);
      return { ok: true };
    },
  });

  assert.deepEqual(result, {
    received: 2,
    forwarded: 2,
    skipped_no_owner: 0,
    skipped_invalid: 0,
    failed: 0,
  });

  const first = forwardedPayloads[0] as Record<string, any>;
  assert.equal(first.version, 'v1');
  assert.equal(first.platform, 'instagram');
  assert.equal(first.event_type, 'inbound_message');
  assert.equal(first.metadata.owner_user_id, 'user_clerk_123');
  assert.equal(first.metadata.lead_id, null);
  assert.equal(first.metadata.priority, 65);
  assert.match(first.occurred_at, /Z$/);
});

test('skips events when owner mapping is missing', async () => {
  const result = await processInstagramInboundWebhook(samplePayload, {
    resolveOwnerUserId: async () => null,
    produceEvent: async () => {
      throw new Error('should not be called');
    },
  });

  assert.equal(result.received, 2);
  assert.equal(result.forwarded, 0);
  assert.equal(result.skipped_no_owner, 2);
  assert.equal(result.failed, 0);
});
