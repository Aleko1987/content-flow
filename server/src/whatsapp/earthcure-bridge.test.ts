import assert from 'node:assert/strict';
import test from 'node:test';

const modulePromise = import('./earthcure-bridge.js');

const originalFetch = globalThis.fetch;
const originalEnv = {
  CONTENT_FLOW_FORWARD_TOKEN: process.env.CONTENT_FLOW_FORWARD_TOKEN,
  EARTHCURE_WHATSAPP_SEND_URL: process.env.EARTHCURE_WHATSAPP_SEND_URL,
  EARTHCURE_WHATSAPP_TIMEOUT_MS: process.env.EARTHCURE_WHATSAPP_TIMEOUT_MS,
};

const restoreEnv = () => {
  process.env.CONTENT_FLOW_FORWARD_TOKEN = originalEnv.CONTENT_FLOW_FORWARD_TOKEN;
  process.env.EARTHCURE_WHATSAPP_SEND_URL = originalEnv.EARTHCURE_WHATSAPP_SEND_URL;
  process.env.EARTHCURE_WHATSAPP_TIMEOUT_MS = originalEnv.EARTHCURE_WHATSAPP_TIMEOUT_MS;
};

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv();
});

test('sendViaEarthcureWhatsApp sends successfully', async () => {
  const { sendViaEarthcureWhatsApp } = await modulePromise;
  process.env.CONTENT_FLOW_FORWARD_TOKEN = 'shared-secret';
  process.env.EARTHCURE_WHATSAPP_SEND_URL = 'https://example.com/bridge';
  process.env.EARTHCURE_WHATSAPP_TIMEOUT_MS = '6500';

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        conversation_id: 'conv-1',
        provider_message_id: 'wamid.123',
      }),
    }) as Response) as typeof fetch;

  const result = await sendViaEarthcureWhatsApp({
    to: '+27690218940',
    body: 'Confirm publish',
    source: 'content_flow_assisted_publish',
    message_type: 'text',
  });

  assert.equal(result.ok, true);
  assert.equal(result.providerMessageId, 'wamid.123');
  assert.equal(result.conversationId, 'conv-1');
});

test('sendViaEarthcureWhatsApp maps unauthorized token to non-retryable error', async () => {
  const { sendViaEarthcureWhatsApp, EarthcureWhatsAppError } = await modulePromise;
  process.env.CONTENT_FLOW_FORWARD_TOKEN = 'wrong-token';
  process.env.EARTHCURE_WHATSAPP_SEND_URL = 'https://example.com/bridge';

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    }) as Response) as typeof fetch;

  await assert.rejects(
    async () =>
      sendViaEarthcureWhatsApp({
        to: '+27690218940',
        body: 'Confirm publish',
      }),
    (error: unknown) => {
      assert.equal(error instanceof EarthcureWhatsAppError, true);
      assert.equal((error as EarthcureWhatsAppError).kind, 'unauthorized');
      assert.equal((error as EarthcureWhatsAppError).retryable, false);
      return true;
    }
  );
});

test('sendViaEarthcureWhatsApp validates invalid number/body inputs', async () => {
  const { sendViaEarthcureWhatsApp, EarthcureWhatsAppError } = await modulePromise;
  process.env.CONTENT_FLOW_FORWARD_TOKEN = 'shared-secret';
  process.env.EARTHCURE_WHATSAPP_SEND_URL = 'https://example.com/bridge';

  await assert.rejects(
    async () =>
      sendViaEarthcureWhatsApp({
        to: '12',
        body: 'ok',
      }),
    /Destination phone must include at least 8 digits/
  );

  await assert.rejects(
    async () =>
      sendViaEarthcureWhatsApp({
        to: '+27690218940',
        body: '   ',
      }),
    (error: unknown) => {
      assert.equal(error instanceof EarthcureWhatsAppError, true);
      assert.equal((error as EarthcureWhatsAppError).kind, 'validation');
      return true;
    }
  );
});

test('sendViaEarthcureWhatsApp sends media payload with caption', async () => {
  const { sendViaEarthcureWhatsApp } = await modulePromise;
  process.env.CONTENT_FLOW_FORWARD_TOKEN = 'shared-secret';
  process.env.EARTHCURE_WHATSAPP_SEND_URL = 'https://example.com/bridge';

  let sentBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url, init) => {
    sentBody = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        conversation_id: 'conv-media',
        provider_message_id: 'wamid.media1',
      }),
    } as Response;
  }) as typeof fetch;

  const result = await sendViaEarthcureWhatsApp({
    to: '+27690218940',
    message_type: 'image',
    media_link: 'https://example.com/a.jpg',
    caption: 'Caption',
    source: 'content_flow_assisted_publish_execute',
  });

  assert.equal(result.providerMessageId, 'wamid.media1');
  assert.equal(sentBody?.message_type, 'image');
  assert.equal(sentBody?.media_link, 'https://example.com/a.jpg');
  assert.equal(sentBody?.caption, 'Caption');
});

test('sendViaEarthcureWhatsAppWithRetry retries transient failures once', async () => {
  const { sendViaEarthcureWhatsAppWithRetry } = await modulePromise;
  process.env.CONTENT_FLOW_FORWARD_TOKEN = 'shared-secret';
  process.env.EARTHCURE_WHATSAPP_SEND_URL = 'https://example.com/bridge';

  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 502,
        json: async () => ({ error: 'upstream failure' }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        conversation_id: 'conv-retry',
        provider_message_id: 'wamid.retry1',
      }),
    } as Response;
  }) as typeof fetch;

  const result = await sendViaEarthcureWhatsAppWithRetry({
    to: '+27690218940',
    body: 'Retry me',
    operationId: 'op-retry',
    maxAttempts: 2,
  });

  assert.equal(attempts, 2);
  assert.equal(result.providerMessageId, 'wamid.retry1');
});
