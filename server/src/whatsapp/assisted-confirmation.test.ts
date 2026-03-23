import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://user:password@localhost:5432/content_flow_test';

const modulePromise = import('./assisted-confirmation.js');

test('valid token with inbound message processes confirmation', async () => {
  const {
    validateForwardToken,
    processIncomingConfirmationWebhook,
  } = await modulePromise;

  const auth = validateForwardToken('shared-secret', 'shared-secret');
  assert.equal(auth.ok, true);

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.001',
                  from: '15551234567',
                  text: { body: 'publish' },
                  context: { id: 'prompt-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload, {
    findPending: async () =>
      ({
        id: 'confirmation-1',
        scheduled_post_id: 'scheduled-1',
        recipient_phone: '15551234567',
        prompt_message_id: 'prompt-1',
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.processed, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('invalid or missing token is rejected', async () => {
  const { validateForwardToken } = await modulePromise;

  assert.deepEqual(validateForwardToken(undefined, 'shared-secret'), {
    ok: false,
    status: 401,
  });
  assert.deepEqual(validateForwardToken('wrong-secret', 'shared-secret'), {
    ok: false,
    status: 403,
  });
});

test('payload with no messages is a no-op', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [{ id: 'status-only-event' }],
            },
          },
        ],
      },
    ],
  } as any;

  const result = await processIncomingConfirmationWebhook(payload, {
    recordInbound: async () => ({ eventId: null, duplicate: false }),
    updateInbound: async () => {},
    findPending: async () => null,
  });

  assert.equal(result.received, 0);
  assert.equal(result.processed, 0);
  assert.equal(result.confirmed, 0);
  assert.equal(result.declined, 0);
});

test('duplicate provider message id is deduped', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const seen = new Set<string>();
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.duplicate',
                  from: '15550001111',
                  text: { body: 'yes' },
                  context: { id: 'prompt-9' },
                },
                {
                  id: 'wamid.duplicate',
                  from: '15550001111',
                  text: { body: 'yes' },
                  context: { id: 'prompt-9' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload, {
    findPending: async () =>
      ({
        id: 'confirmation-9',
        scheduled_post_id: 'scheduled-9',
        recipient_phone: '15550001111',
        prompt_message_id: 'prompt-9',
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async ({ providerMessageId }) => {
      const id = providerMessageId || '';
      if (id && seen.has(id)) {
        return { eventId: null, duplicate: true };
      }
      if (id) {
        seen.add(id);
      }
      return { eventId: `evt-${seen.size}`, duplicate: false };
    },
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.duplicates, 1);
  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('duplicate assisted confirmation operation id is deduped', async () => {
  const { startAssistedConfirmationForScheduledPost } = await modulePromise;

  let outboundInsertCount = 0;
  let promptSendCount = 0;
  const outboundByKey = new Map<
    string,
    { providerMessageId: string | null; responseStatus: number | null; requestId: string | null }
  >();

  const deps = {
    loadScheduledPostTime: async () => new Date('2026-03-23T10:00:00.000Z'),
    loadOutboundByOperationKey: async (operationKey: string) => outboundByKey.get(operationKey) || null,
    insertOutboundOperation: async ({ operationKey }: { operationKey: string }) => {
      outboundInsertCount += 1;
      outboundByKey.set(operationKey, { providerMessageId: null, responseStatus: null, requestId: null });
    },
    updateOutboundSent: async ({
      operationKey,
      status,
      providerMessageId,
      requestId,
    }: {
      operationKey: string;
      status: number;
      providerMessageId: string;
      requestId: string;
    }) => {
      outboundByKey.set(operationKey, { providerMessageId, responseStatus: status, requestId });
    },
    updateOutboundFailed: async (_params: { operationKey: string; errorMessage: string }) => {},
    upsertConfirmationRecord: async () => {},
    sendPrompt: async () => {
      promptSendCount += 1;
      return {
        ok: true as const,
        status: 200,
        conversationId: 'conv-1',
        providerMessageId: 'wamid.operation',
        requestId: 'req-1',
      };
    },
  };

  const params = {
    scheduledPostId: 'scheduled-dup',
    caption: 'Caption',
    mediaUrl: 'https://example.com/image.jpg',
    mimeType: 'image/jpeg',
    recipientPhone: '15550001111',
    operationId: 'op-123',
  };

  const first = await startAssistedConfirmationForScheduledPost(params, deps);
  const second = await startAssistedConfirmationForScheduledPost(params, deps);

  assert.equal(first.promptMessageId, 'wamid.operation');
  assert.equal(second.promptMessageId, 'wamid.operation');
  assert.equal(promptSendCount, 1);
  assert.equal(outboundInsertCount, 1);
});
