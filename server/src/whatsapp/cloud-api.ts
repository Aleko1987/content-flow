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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (data as any)?.error?.message === 'string'
        ? (data as any).error.message
        : `WhatsApp Cloud API error: HTTP ${response.status}`;
    throw new Error(message);
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

