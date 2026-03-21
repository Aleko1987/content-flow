type WhatsAppSendResult = {
  messageId: string;
  raw: unknown;
};

type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  recipientPhone: string;
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
  return {
    accessToken: requiredEnv('WA_ACCESS_TOKEN'),
    phoneNumberId: requiredEnv('WA_PHONE_NUMBER_ID'),
    recipientPhone: normalizePhone(requiredEnv('WA_RECIPIENT_PHONE')),
    apiVersion: (process.env.WA_API_VERSION || 'v19.0').trim(),
  };
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

export const sendWhatsAppText = async (text: string): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const body = {
    messaging_product: 'whatsapp',
    to: config.recipientPhone,
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
  caption?: string | null
): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const safeCaption = (caption ?? '').trim();
  const body: any = {
    messaging_product: 'whatsapp',
    to: config.recipientPhone,
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
}): Promise<WhatsAppSendResult> => {
  const config = getWhatsAppConfig();
  const bodyText = (params.bodyText ?? '').trim();
  const body: any = {
    messaging_product: 'whatsapp',
    to: config.recipientPhone,
    type: 'template',
    template: {
      name: params.name,
      language: { code: params.language },
      ...(bodyText
        ? {
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: bodyText }],
              },
            ],
          }
        : {}),
    },
  };

  return waFetch(config, body);
};

