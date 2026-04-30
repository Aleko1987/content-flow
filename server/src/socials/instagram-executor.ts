import type { ExecuteTaskRequest } from '../social-contract/schemas.js';
import { reasonCodes, type ReasonCode } from './reason-codes.js';

const GRAPH_BASE_URL = process.env.INSTAGRAM_GRAPH_BASE_URL?.trim() || 'https://graph.facebook.com/v21.0';
const MAX_RETRIES = Number(process.env.DO_SOCIALS_PROVIDER_MAX_RETRIES ?? 2);
const RETRY_BASE_MS = Number(process.env.DO_SOCIALS_PROVIDER_RETRY_BASE_MS ?? 250);

export type InstagramExecutionResult =
  | {
      ok: true;
      providerActionId: string | null;
      raw: Record<string, unknown>;
    }
  | {
      ok: false;
      reasonCode: ReasonCode;
      reasonMessage: string;
      raw: Record<string, unknown> | null;
    };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getStringMetadata = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mapProviderErrorReason = (status: number, body: Record<string, unknown> | null): ReasonCode => {
  const providerError = body?.error;
  const providerErrorObj = providerError && typeof providerError === 'object' ? providerError as Record<string, unknown> : null;
  const code = typeof providerErrorObj?.code === 'number' ? providerErrorObj.code : null;

  if (status === 401 || code === 190) return reasonCodes.providerAuthFailed;
  if (status === 403 || code === 10 || code === 200) return reasonCodes.providerPermissionMissing;
  if (status === 429 || code === 4 || code === 17 || code === 32) return reasonCodes.providerRateLimited;
  return reasonCodes.providerRequestFailed;
};

const shouldRetry = (status: number, reasonCode: ReasonCode) =>
  status >= 500 || reasonCode === reasonCodes.providerRateLimited;

const callGraphApi = async (
  path: string,
  payload: Record<string, unknown>,
  token: string
): Promise<InstagramExecutionResult> => {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    try {
      const response = await fetch(`${GRAPH_BASE_URL}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const body = (await response.json()) as Record<string, unknown>;
      if (response.ok) {
        const providerActionId = typeof body.id === 'string'
          ? body.id
          : typeof body.message_id === 'string'
            ? body.message_id
            : null;
        return { ok: true, providerActionId, raw: body };
      }

      const reasonCode = mapProviderErrorReason(response.status, body);
      if (attempt <= MAX_RETRIES && shouldRetry(response.status, reasonCode)) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
        continue;
      }
      return {
        ok: false,
        reasonCode,
        reasonMessage: `Instagram API request failed with status ${response.status}`,
        raw: body,
      };
    } catch (error) {
      if (attempt <= MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
        continue;
      }
      return {
        ok: false,
        reasonCode: reasonCodes.providerRequestFailed,
        reasonMessage: error instanceof Error ? error.message : String(error),
        raw: null,
      };
    }
  }

  return {
    ok: false,
    reasonCode: reasonCodes.providerRequestFailed,
    reasonMessage: 'Instagram request exhausted retries',
    raw: null,
  };
};

export const executeInstagramAction = async (request: ExecuteTaskRequest): Promise<InstagramExecutionResult> => {
  const { getConnectedAccount } = await import('../db/connectedAccounts.js');
  const account = await getConnectedAccount('instagram');
  if (!account || account.status !== 'connected') {
    return {
      ok: false,
      reasonCode: reasonCodes.missingProviderCredentials,
      reasonMessage: 'Instagram account is not connected in DO-Socials.',
      raw: null,
    };
  }

  const token = getStringMetadata(account.tokenData.access_token);
  const igUserId = getStringMetadata(account.tokenData.ig_user_id);
  const pageId = getStringMetadata(account.tokenData.page_id);
  if (!token || !igUserId || !pageId) {
    return {
      ok: false,
      reasonCode: reasonCodes.missingProviderCredentials,
      reasonMessage: 'Instagram account token metadata is incomplete (access_token, ig_user_id, page_id required).',
      raw: null,
    };
  }

  const content = (request.content || '').trim();
  if (['comment', 'reply', 'dm', 'mention', 'story_reply'].includes(request.action_type) && !content) {
    return {
      ok: false,
      reasonCode: reasonCodes.missingContent,
      reasonMessage: `${request.action_type} requires non-empty content.`,
      raw: null,
    };
  }

  if (request.action_type === 'comment') {
    return callGraphApi(`${encodeURIComponent(request.target_ref)}/comments`, { message: content }, token);
  }

  if (request.action_type === 'reply') {
    return callGraphApi(`${encodeURIComponent(request.target_ref)}/replies`, { message: content }, token);
  }

  if (request.action_type === 'dm' || request.action_type === 'story_reply') {
    const recipientId = getStringMetadata(request.metadata?.recipient_igsid) || request.target_ref;
    return callGraphApi(
      `${encodeURIComponent(pageId)}/messages`,
      {
        recipient: { id: recipientId },
        messaging_type: 'RESPONSE',
        message: { text: content },
      },
      token
    );
  }

  if (request.action_type === 'mention') {
    const mediaId = getStringMetadata(request.metadata?.media_id);
    if (!mediaId) {
      return {
        ok: false,
        reasonCode: reasonCodes.missingRequiredMetadata,
        reasonMessage: 'mention action requires metadata.media_id.',
        raw: null,
      };
    }

    const commentId = getStringMetadata(request.metadata?.comment_id);
    const payload: Record<string, unknown> = { media_id: mediaId, message: content };
    if (commentId) {
      payload.comment_id = commentId;
    }
    return callGraphApi(`${encodeURIComponent(igUserId)}/mentions`, payload, token);
  }

  return {
    ok: false,
    reasonCode: reasonCodes.actionNotSupportedByProvider,
    reasonMessage: `Instagram action_type="${request.action_type}" is not supported by official APIs.`,
    raw: null,
  };
};
