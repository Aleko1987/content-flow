import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

type EarthcureMessageType = 'text' | 'image' | 'video' | 'document' | 'audio' | string;

type SendViaEarthcureParams = {
  to: string;
  body?: string;
  source?: string;
  message_type?: EarthcureMessageType;
  media_link?: string;
  media_id?: string;
  caption?: string;
  filename?: string;
};

type EarthcureSuccessResponse = {
  ok: true;
  conversation_id?: string;
  provider_message_id?: string;
};

type EarthcureSendResult = {
  ok: true;
  status: number;
  conversationId: string | null;
  providerMessageId: string;
  requestId: string;
};

type EarthcureErrorKind = 'config' | 'unauthorized' | 'validation' | 'transient' | 'upstream' | 'network';

export class EarthcureWhatsAppError extends Error {
  readonly kind: EarthcureErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly requestId: string;

  constructor(params: {
    message: string;
    kind: EarthcureErrorKind;
    status?: number | null;
    retryable: boolean;
    requestId: string;
  }) {
    super(params.message);
    this.name = 'EarthcureWhatsAppError';
    this.kind = params.kind;
    this.status = params.status ?? null;
    this.retryable = params.retryable;
    this.requestId = params.requestId;
  }
}

const maskPhone = (phone: string) => {
  const normalized = phone.trim();
  if (!normalized) return '***';
  if (normalized.length <= 4) return '***';
  return `${normalized.slice(0, 3)}***${normalized.slice(-2)}`;
};

const normalizeDestination = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Missing required "to" for Earthcure WhatsApp outbound message');
  }
  const cleaned = trimmed.replace(/[^\d+]/g, '');
  const plusCount = (cleaned.match(/\+/g) || []).length;
  const plusIsValid = plusCount === 0 || (plusCount === 1 && cleaned.startsWith('+'));
  if (!plusIsValid) {
    throw new Error('Invalid destination phone format');
  }
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length < 8) {
    throw new Error('Destination phone must include at least 8 digits');
  }
  return cleaned;
};

const resolveBridgeConfig = () => {
  const url = (
    process.env.EARTHCURE_WHATSAPP_SEND_URL ||
    'https://www.earthcurebiodiesel.com/.netlify/functions/whatsapp-send-content-flow'
  ).trim();
  const token = (process.env.CONTENT_FLOW_FORWARD_TOKEN || '').trim();
  const timeoutRaw = Number(process.env.EARTHCURE_WHATSAPP_TIMEOUT_MS || 7000);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(5000, Math.min(8000, Math.floor(timeoutRaw))) : 7000;
  if (!url) {
    throw new Error('Missing EARTHCURE_WHATSAPP_SEND_URL');
  }
  if (!token) {
    throw new Error('Missing CONTENT_FLOW_FORWARD_TOKEN');
  }
  return { url, token, timeoutMs };
};

const parseErrorBody = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const errorValue = record['error'];
  if (errorValue && typeof errorValue === 'object') {
    const nested = errorValue as Record<string, unknown>;
    const nestedMessage = nested['message'];
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage.trim();
    }
  }
  const candidates = ['error', 'message', 'details'];
  for (const key of candidates) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

export const sendViaEarthcureWhatsApp = async (params: SendViaEarthcureParams): Promise<EarthcureSendResult> => {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const to = normalizeDestination(params.to);
  let config;
  try {
    config = resolveBridgeConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EarthcureWhatsAppError({
      message,
      kind: 'config',
      retryable: false,
      requestId,
    });
  }

  const messageType = (params.message_type || 'text').trim() || 'text';
  const body = (params.body || '').trim();
  const mediaLink = (params.media_link || '').trim();
  const mediaId = (params.media_id || '').trim();
  if (messageType === 'text') {
    if (!body) {
      throw new EarthcureWhatsAppError({
        message: 'Missing required "body" for text Earthcure WhatsApp outbound message',
        kind: 'validation',
        retryable: false,
        requestId,
      });
    }
  } else if (!mediaLink && !mediaId) {
    throw new EarthcureWhatsAppError({
      message: `Missing required media_link or media_id for message_type=${messageType}`,
      kind: 'validation',
      retryable: false,
      requestId,
    });
  }

  const payload = {
    to,
    ...(body ? { body } : {}),
    source: (params.source || 'content_flow').trim() || 'content_flow',
    message_type: messageType,
    ...(mediaLink ? { media_link: mediaLink } : {}),
    ...(mediaId ? { media_id: mediaId } : {}),
    ...((params.caption || '').trim() ? { caption: (params.caption || '').trim() } : {}),
    ...((params.filename || '').trim() ? { filename: (params.filename || '').trim() } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  logger.info('Earthcure WhatsApp outbound request', {
    requestId,
    destination: maskPhone(to),
    source: payload.source,
    messageType: payload.message_type,
  });

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-content-flow-forward-token': config.token,
        'x-content-flow-request-id': requestId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = (await response.json().catch(() => ({}))) as EarthcureSuccessResponse & Record<string, unknown>;

    if (!response.ok) {
      const context = parseErrorBody(responseBody);
      if (response.status === 401) {
        throw new EarthcureWhatsAppError({
          message: `Earthcure WhatsApp unauthorized (401)${context ? `: ${context}` : ''}`,
          kind: 'unauthorized',
          status: response.status,
          retryable: false,
          requestId,
        });
      }
      if (response.status === 400) {
        throw new EarthcureWhatsAppError({
          message: `Earthcure WhatsApp validation error (400)${context ? `: ${context}` : ''}`,
          kind: 'validation',
          status: response.status,
          retryable: false,
          requestId,
        });
      }
      if (response.status >= 500) {
        throw new EarthcureWhatsAppError({
          message: `Earthcure WhatsApp transient upstream failure (HTTP ${response.status})${context ? `: ${context}` : ''}`,
          kind: 'transient',
          status: response.status,
          retryable: true,
          requestId,
        });
      }
      throw new EarthcureWhatsAppError({
        message: `Earthcure WhatsApp upstream request failed (HTTP ${response.status})${context ? `: ${context}` : ''}`,
        kind: 'upstream',
        status: response.status,
        retryable: false,
        requestId,
      });
    }

    const providerMessageId = typeof responseBody.provider_message_id === 'string' ? responseBody.provider_message_id : '';
    if (!providerMessageId) {
      throw new EarthcureWhatsAppError({
        message: 'Earthcure WhatsApp response missing provider_message_id',
        kind: 'upstream',
        status: response.status,
        retryable: false,
        requestId,
      });
    }

    const elapsedMs = Date.now() - startedAt;
    logger.info('Earthcure WhatsApp outbound success', {
      requestId,
      destination: maskPhone(to),
      status: response.status,
      providerMessageId,
      elapsedMs,
    });

    return {
      ok: true,
      status: response.status,
      conversationId: typeof responseBody.conversation_id === 'string' ? responseBody.conversation_id : null,
      providerMessageId,
      requestId,
    };
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const asEarthcure = error instanceof EarthcureWhatsAppError ? error : null;
    if (asEarthcure) {
      logger.warn('Earthcure WhatsApp outbound failed', {
        requestId,
        destination: maskPhone(to),
        status: asEarthcure.status,
        kind: asEarthcure.kind,
        retryable: asEarthcure.retryable,
        elapsedMs,
      });
      throw asEarthcure;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      const timeoutError = new EarthcureWhatsAppError({
        message: `Earthcure WhatsApp request timed out after ${config.timeoutMs}ms`,
        kind: 'transient',
        retryable: true,
        requestId,
      });
      logger.warn('Earthcure WhatsApp outbound timed out', {
        requestId,
        destination: maskPhone(to),
        retryable: timeoutError.retryable,
        elapsedMs,
      });
      throw timeoutError;
    }

    const message = error instanceof Error ? error.message : String(error);
    const networkError = new EarthcureWhatsAppError({
      message: `Earthcure WhatsApp network failure: ${message}`,
      kind: 'network',
      retryable: true,
      requestId,
    });
    logger.warn('Earthcure WhatsApp outbound network failure', {
      requestId,
      destination: maskPhone(to),
      retryable: networkError.retryable,
      elapsedMs,
    });
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
};

export const sendViaEarthcureWhatsAppWithRetry = async (
  params: SendViaEarthcureParams & { operationId: string; maxAttempts?: number }
): Promise<EarthcureSendResult> => {
  const maxAttempts = Math.max(1, Math.min(4, params.maxAttempts ?? 3));
  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const result = await sendViaEarthcureWhatsApp(params);
      if (attempt > 1) {
        logger.info('Earthcure WhatsApp recovered after retry', {
          operationId: params.operationId,
          attempts: attempt,
          providerMessageId: result.providerMessageId,
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      const mapped = error instanceof EarthcureWhatsAppError ? error : null;
      const canRetry = mapped ? mapped.retryable : false;
      logger.warn('Earthcure WhatsApp retry decision', {
        operationId: params.operationId,
        attempt,
        maxAttempts,
        retryable: canRetry,
        kind: mapped?.kind || 'unknown',
        status: mapped?.status ?? null,
      });
      if (!canRetry || attempt >= maxAttempts) {
        throw error;
      }
      const baseDelayMs = 500;
      const backoffMs = Math.min(3000, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
      const jitterMs = Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, backoffMs + jitterMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Earthcure WhatsApp send failed');
};

export type { EarthcureSendResult, SendViaEarthcureParams };
