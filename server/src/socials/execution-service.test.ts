import assert from 'node:assert/strict';
import test from 'node:test';
import { executeSocialTask } from './execution-service.js';
import type { ExecuteTaskRequest, ExecuteTaskResponse } from '../social-contract/schemas.js';

const baseRequest: ExecuteTaskRequest = {
  version: 'v1',
  task_id: 'task_uuid',
  idempotency_key: 'task_uuid:1',
  platform: 'whatsapp',
  action_type: 'dm',
  target_ref: '+15550001111',
  lead_ref: null,
  content: 'Thanks for your message.',
  metadata: { human_approved: true },
};

const makeStore = () => {
  const cache = new Map<string, ExecuteTaskResponse>();
  return {
    getExecutionResponse: async (idempotencyKey: string) => cache.get(idempotencyKey) || null,
    ensureExecutionRequest: async () => {},
    saveExecutionResponse: async (request: ExecuteTaskRequest, response: ExecuteTaskResponse) => {
      cache.set(request.idempotency_key, response);
    },
  };
};

test('returns cached response for duplicate idempotency key', async () => {
  const store = makeStore();
  await store.saveExecutionResponse(baseRequest, {
    version: 'v1',
    task_id: 'task_uuid',
    status: 'succeeded',
    provider_action_id: 'cached_action',
    occurred_at: '2026-04-24T16:12:00.000Z',
    reason_code: null,
    reason_message: null,
    raw: {},
  });

  const response = await executeSocialTask(baseRequest, {
    store,
    throttle: { allow: () => ({ allowed: true }) },
    sendWhatsAppDm: async () => {
      throw new Error('should not execute sender for cached request');
    },
  });

  assert.equal(response.provider_action_id, 'cached_action');
});

test('blocks risky action without human approval metadata', async () => {
  const request = {
    ...baseRequest,
    idempotency_key: 'task_uuid:2',
    metadata: {},
  };

  const response = await executeSocialTask(request, {
    store: makeStore(),
    throttle: { allow: () => ({ allowed: true }) },
    sendWhatsAppDm: async () => ({ providerActionId: 'unused', raw: {} }),
  });

  assert.equal(response.status, 'blocked');
  assert.equal(response.reason_code, 'HUMAN_APPROVAL_REQUIRED');
});

test('returns unsupported for non-dm whatsapp actions', async () => {
  const response = await executeSocialTask(
    {
      ...baseRequest,
      idempotency_key: 'task_uuid:3',
      action_type: 'comment',
      content: 'hello',
      metadata: { human_approved: true },
    },
    {
      store: makeStore(),
      throttle: { allow: () => ({ allowed: true }) },
      sendWhatsAppDm: async () => ({ providerActionId: 'unused', raw: {} }),
    }
  );

  assert.equal(response.status, 'unsupported');
  assert.equal(response.reason_code, 'UNSUPPORTED_ACTION');
});

test('returns blocked when throttled', async () => {
  const response = await executeSocialTask(
    { ...baseRequest, idempotency_key: 'task_uuid:4' },
    {
      store: makeStore(),
      throttle: { allow: () => ({ allowed: false, retryAfterSeconds: 42 }) },
      sendWhatsAppDm: async () => ({ providerActionId: 'unused', raw: {} }),
    }
  );

  assert.equal(response.status, 'blocked');
  assert.equal(response.reason_code, 'THROTTLED');
});

test('returns succeeded for approved whatsapp dm action', async () => {
  const response = await executeSocialTask(
    { ...baseRequest, idempotency_key: 'task_uuid:5' },
    {
      store: makeStore(),
      throttle: { allow: () => ({ allowed: true }) },
      sendWhatsAppDm: async () => ({
        providerActionId: 'wamid.555',
        raw: { request_id: 'req_1' },
      }),
    }
  );

  assert.equal(response.status, 'succeeded');
  assert.equal(response.provider_action_id, 'wamid.555');
});
