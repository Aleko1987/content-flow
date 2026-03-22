type WhatsAppSendResult = {
  messageId: string;
  raw: unknown;
};

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  defaultRecipientPhone: string | null;
  apiVersion: string;
};

type WhatsAppApiErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: {
      details?: string;
      messaging_product?: string;
    };
    fbtrace_id?: string;
  };
};

const requiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value.trim();
};

const normalizePhone = (value: string): string => {
  // WhatsApp Cloud API expects E.164 digits without '+' in "to".
  return value.replace(/[^\d]/g, '');
};

export const getWhatsAppConfig = (): WhatsAppConfig => {
  const rawDefaultRecipient = (process.env.WA_DEFAULT_RECIPIENT_PHONE || process.env.WA_RECIPIENT_PHONE || '').trim();
  return {
    accessToken: requiredEnv('WA_ACCESS_TOKEN'),
    phoneNumberId: requiredEnv('WA_PHONE_NUMBER_ID'),
    defaultRecipientPhone: rawDefaultRecipient ? normalizePhone(rawDefaultRecipient) : null,
    apiVersion: (process.env.WA_API_VERSION || 'v19.0').trim(),
  };
};

const resolveRecipientPhone = (config: WhatsAppConfig, recipientPhone?: string | null): string => {
  const override = (recipientPhone || '').trim();
  if (override) {
    return normalizePhone(override);
  }
  if (config.defaultRecipientPhone) {
    return config.defaultRecipientPhone;
  }
  throw new Error('Missing recipient phone. Provide a recipient or set WA_DEFAULT_RECIPIENT_PHONE (or WA_RECIPIENT_PHONE).');
};

const parseMessageId = (data: any): string | null => {
  const id = data?.messages?.[0]?.id;
  return typeof id === 'string' && id.trim() ? id : null;
};

const shortJson = (value: unknown, maxLength = 280): string => {
  try {
    const json = JSON.stringify(value);
    if (json.length <= maxLength) return json;
    return `${json.slice(0, maxLength)}...`;
  } catch {
    return '[unserializable]';
  }
};

const buildWhatsAppApiErrorMessage = (
  status: number,
  payload: WhatsAppApiErrorPayload,
  requestBody: unknown
) => {
  const apiError = payload?.error || {};
  const parts: string[] = [`WhatsApp Cloud API error HTTP ${status}`];

  if (typeof apiError.code === 'number') {
    parts.push(`code=${apiError.code}`);
  }
  if (typeof apiError.error_subcode === 'number') {
    parts.push(`subcode=${apiError.error_subcode}`);
  }
  if (typeof apiError.type === 'string' && apiError.type.trim()) {
    parts.push(`type=${apiError.type}`);
  }
  if (typeof apiError.message === 'string' && apiError.message.trim()) {
    parts.push(`message=${apiError.message}`);
  }
  if (typeof apiError.error_data?.details === 'string' && apiError.error_data.details.trim()) {
    parts.push(`details=${apiError.error_data.details}`);
  }
  if (typeof apiError.fbtrace_id === 'string' && apiError.fbtrace_id.trim()) {
    parts.push(`fbtrace_id=${apiError.fbtrace_id}`);
  }

  // Add request context so invalid-parameter cases are diagnosable from UI logs.
  parts.push(`request=${shortJson(requestBody)}`);
  return parts.join(' | ');
};

const waFetch = async (config: WhatsAppConfig, body: unknown): Promise<WhatsAppSendResult> => {
  const url = `https://graph.facebook.com/${encodeURIComponent(config.apiVersion)}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as WhatsAppApiErrorPayload;
  if (!response.ok) {
    throw new Error(buildWhatsAppApiErrorMessage(response.status, data, body));
  }

  const messageId = parseMessageId(data);
  if (!messageId) {
    throw new Error('WhatsApp Cloud API response missing message id');
  }

  return { messageId, raw: data };
};

export const sendWhatsAppText = async (
  text: string,
  recipientPhone?: string | null
): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const to = resolveRecipientPhone(config, recipientPhone);
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: text,
      preview_url: false,
    },
  };
  return waFetch(config, body);
};

export const sendWhatsAppMedia = async (
  mediaType: 'image' | 'video',
  mediaUrl: string,
  caption?: string | null,
  recipientPhone?: string | null
): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const to = resolveRecipientPhone(config, recipientPhone);
  const safeCaption = (caption ?? '').trim();
  const body: any = {
    messaging_product: 'whatsapp',
    to,
    type: mediaType,
    [mediaType]: {
      link: mediaUrl,
      ...(safeCaption ? { caption: safeCaption } : {}),
    },
  };
  return waFetch(config, body);
};

export const sendWhatsAppTemplate = async (params: {
  name: string;
  language: string;
  bodyText?: string;
  bodyParams?: string[];
  quickReplyButtons?: Array<{ index: number; payload?: string | null }>;
  recipientPhone?: string | null;
}): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const to = resolveRecipientPhone(config, params.recipientPhone);
  const bodyText = (params.bodyText ?? '').trim();
  const bodyParams = Array.isArray(params.bodyParams)
    ? params.bodyParams
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
    : [];
  const buttonComponents =
    Array.isArray(params.quickReplyButtons) && params.quickReplyButtons.length > 0
      ? params.quickReplyButtons
          .filter((button) => Number.isInteger(button.index) && button.index >= 0 && button.index <= 9)
          .map((button) => {
            const payload = (button.payload ?? '').trim();
            return {
              type: 'button',
              sub_type: 'quick_reply',
              index: String(button.index),
              ...(payload ? { parameters: [{ type: 'payload', payload }] } : {}),
            };
          })
      : [];
  const resolvedBodyParams = bodyParams.length > 0 ? bodyParams : bodyText ? [bodyText] : [];
  const bodyComponents = resolvedBodyParams.length > 0
    ? [
        {
          type: 'body',
          parameters: resolvedBodyParams.map((value) => ({ type: 'text', text: value })),
        },
      ]
    : [];
  const components = [...bodyComponents, ...buttonComponents];
  const body: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: params.name,
      language: { code: params.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  return waFetch(config, body);
};

