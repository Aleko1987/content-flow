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

test('context-only interactive confirm without from still processes publish', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.ctx-only.1',
                  interactive: {
                    button_reply: { id: 'opaque-context-confirm-token' },
                  },
                  context: { id: 'prompt-ctx-only-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-ctx-only-1',
        scheduled_post_id: 'scheduled-ctx-only-1',
        recipient_phone: '15551112222',
        prompt_message_id: 'prompt-ctx-only-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-ctx-only-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

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

test('interactive list_reply confirmation text is normalized and triggers publish once', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.list.1',
                  from: '15550002222',
                  interactive: {
                    list_reply: { id: 'confirm_choice', title: 'Confirm' },
                  },
                  context: { id: 'prompt-list-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-list-1',
        scheduled_post_id: 'scheduled-list-1',
        recipient_phone: '15550002222',
        prompt_message_id: 'prompt-list-1',
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-list-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('interactive button reply with numeric id uses title intent', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.button.1',
                  from: '15550004444',
                  interactive: {
                    button_reply: { id: '0', title: 'Confirm' },
                  },
                  context: { id: 'prompt-button-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-button-1',
        scheduled_post_id: 'scheduled-button-1',
        recipient_phone: '15550004444',
        prompt_message_id: 'prompt-button-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-button-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('button payload confirmation token like CF_CONFIRM_YES triggers publish', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.payload.1',
                  from: '15550005555',
                  button: { payload: 'CF_CONFIRM_YES' },
                  context: { id: 'prompt-payload-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-payload-1',
        scheduled_post_id: 'scheduled-payload-1',
        recipient_phone: '15550005555',
        prompt_message_id: 'prompt-payload-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-payload-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('interactive button with opaque id confirms when title is affirmative', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.button.opaque',
                  from: '15550006666',
                  interactive: {
                    button_reply: { id: 'opaque-confirm-id-123', title: 'Confirm' },
                  },
                  context: { id: 'prompt-opaque-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-opaque-1',
        scheduled_post_id: 'scheduled-opaque-1',
        recipient_phone: '15550006666',
        prompt_message_id: 'prompt-opaque-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-opaque-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('unknown opaque interactive id with mismatched context does not publish', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.opaque.unmatched.1',
                  from: '15550007777',
                  interactive: {
                    button_reply: { id: 'r4nd0m-opaque-template-token' },
                  },
                  context: { id: 'prompt-opaque-unmatched-1-other' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-opaque-unmatched-1',
        scheduled_post_id: 'scheduled-opaque-unmatched-1',
        recipient_phone: '15550007777',
        prompt_message_id: 'prompt-opaque-unmatched-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-opaque-unmatched-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 0);
  assert.equal(result.unmatched, 1);
  assert.equal(confirmActions, 0);
});

test('unknown opaque interactive id with matching context confirms', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.opaque.contextmatch.1',
                  from: '15550007778',
                  interactive: {
                    button_reply: { id: 'r4nd0m-opaque-template-token' },
                  },
                  context: { id: 'prompt-opaque-contextmatch-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-opaque-contextmatch-1',
        scheduled_post_id: 'scheduled-opaque-contextmatch-1',
        recipient_phone: '15550007778',
        prompt_message_id: 'prompt-opaque-contextmatch-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-opaque-contextmatch-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('direct button_reply shape without interactive wrapper and configured opaque payload confirms', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  const previousPayload = process.env.WA_CONFIRM_YES_PAYLOAD;
  process.env.WA_CONFIRM_YES_PAYLOAD = 'opaque-template-yes-token';
  try {
    let confirmActions = 0;
    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.directbutton.1',
                    from: '15550007777',
                    button_reply: { id: 'opaque-template-yes-token' },
                    context: { id: 'prompt-direct-1' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const result = await processIncomingConfirmationWebhook(payload as any, {
      findPending: async () =>
        ({
          id: 'confirmation-direct-1',
          scheduled_post_id: 'scheduled-direct-1',
          recipient_phone: '15550007777',
          prompt_message_id: 'prompt-direct-1',
          media_queue_json: [],
          final_text: 'Caption',
          media_url: 'https://example.com/image.jpg',
          mime_type: 'image/jpeg',
        }) as any,
      recordInbound: async () => ({ eventId: 'evt-direct-1', duplicate: false }),
      updateInbound: async () => {},
      onAffirmative: async () => {
        confirmActions += 1;
      },
      onAffirmativeFailure: async () => {},
    });

    assert.equal(result.confirmed, 1);
    assert.equal(confirmActions, 1);
  } finally {
    if (previousPayload === undefined) {
      delete process.env.WA_CONFIRM_YES_PAYLOAD;
    } else {
      process.env.WA_CONFIRM_YES_PAYLOAD = previousPayload;
    }
  }
});

test('negative template response declines and does not publish', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  let negativeActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.button.no.1',
                  from: '15550009991',
                  interactive: {
                    button_reply: { id: 'decline_choice', title: 'No' },
                  },
                  context: { id: 'prompt-no-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-no-1',
        scheduled_post_id: 'scheduled-no-1',
        recipient_phone: '15550009991',
        prompt_message_id: 'prompt-no-1',
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-no-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onNegative: async () => {
      negativeActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 0);
  assert.equal(result.declined, 1);
  assert.equal(confirmActions, 0);
  assert.equal(negativeActions, 1);
});

test('single recent pending fallback confirms when phone/context matching misses', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let confirmActions = 0;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.fallback.1',
                  from: '15550008888',
                  interactive: {
                    button_reply: { id: 'opaque-id' },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    // Simulate fallback selection path by always returning one pending.
    findPending: async () =>
      ({
        id: 'confirmation-fallback-1',
        scheduled_post_id: 'scheduled-fallback-1',
        recipient_phone: '15550009999',
        prompt_message_id: null,
        media_queue_json: [],
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-fallback-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      confirmActions += 1;
    },
    onAffirmativeFailure: async () => {},
  });

  assert.equal(result.confirmed, 1);
  assert.equal(confirmActions, 1);
});

test('affirmative execution failure calls retryable failure handler once', async () => {
  const { processIncomingConfirmationWebhook } = await modulePromise;

  let failureCalls = 0;
  let failureProviderMessageId: string | null = null;
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: 'wamid.fail.1',
                  from: '15550003333',
                  text: { body: 'confirm' },
                  context: { id: 'prompt-fail-1' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = await processIncomingConfirmationWebhook(payload as any, {
    findPending: async () =>
      ({
        id: 'confirmation-fail-1',
        scheduled_post_id: 'scheduled-fail-1',
        recipient_phone: '15550003333',
        prompt_message_id: 'prompt-fail-1',
        final_text: 'Caption',
        media_url: 'https://example.com/image.jpg',
        mime_type: 'image/jpeg',
      }) as any,
    recordInbound: async () => ({ eventId: 'evt-fail-1', duplicate: false }),
    updateInbound: async () => {},
    onAffirmative: async () => {
      throw new Error('forced media send failure');
    },
    onAffirmativeFailure: async (_pending, _now, _messageText, providerMessageId) => {
      failureCalls += 1;
      failureProviderMessageId = providerMessageId || null;
    },
  });

  assert.equal(result.failed, 1);
  assert.equal(failureCalls, 1);
  assert.equal(failureProviderMessageId, 'wamid.fail.1');
});

