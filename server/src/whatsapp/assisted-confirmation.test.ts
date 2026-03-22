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
