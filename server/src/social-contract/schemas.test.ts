import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizedSocialEventSchema,
  executeTaskRequestSchema,
  executeTaskResponseSchema,
} from './schemas.js';

test('NormalizedSocialEvent v1 parses exact shared payload', () => {
  const parsed = normalizedSocialEventSchema.parse({
    version: 'v1',
    source_event_id: 'evt_123',
    platform: 'instagram',
    event_type: 'comment',
    actor_ref: 'ig:1789',
    actor_display: 'James Pilsner',
    lead_match_confidence: 0.82,
    occurred_at: '2026-04-24T16:10:00.000Z',
    source_url: 'https://instagram.com/p/abc',
    content_excerpt: 'Need diesel quote',
    metadata: { owner_user_id: 'user_abc' },
  });

  assert.equal(parsed.version, 'v1');
  assert.equal(parsed.platform, 'instagram');
});

test('ExecuteTaskRequest rejects unknown fields to prevent schema drift', () => {
  assert.throws(() =>
    executeTaskRequestSchema.parse({
      version: 'v1',
      task_id: 'task_1',
      idempotency_key: 'task_1:1',
      platform: 'whatsapp',
      action_type: 'dm',
      target_ref: '+15551234567',
      lead_ref: null,
      content: 'hello',
      metadata: {},
      renamed_field: 'not allowed',
    })
  );
});

test('ExecuteTaskResponse validates shared status values', () => {
  const parsed = executeTaskResponseSchema.parse({
    version: 'v1',
    task_id: 'task_1',
    status: 'succeeded',
    provider_action_id: 'wamid.1',
    occurred_at: '2026-04-24T16:12:00.000Z',
    reason_code: null,
    reason_message: null,
    raw: {},
  });
  assert.equal(parsed.status, 'succeeded');
});
