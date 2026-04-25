import { executeTaskRequestSchema, executeTaskResponseSchema, type ExecuteTaskRequest, type ExecuteTaskResponse } from '../social-contract/schemas.js';
import { sendViaEarthcureWhatsAppWithRetry } from '../whatsapp/earthcure-bridge.js';
import { socialsThrottle } from './throttle.js';

type ExecutionStore = {
  getExecutionResponse: (idempotencyKey: string) => Promise<ExecuteTaskResponse | null>;
  ensureExecutionRequest: (request: ExecuteTaskRequest) => Promise<void>;
  saveExecutionResponse: (request: ExecuteTaskRequest, response: ExecuteTaskResponse) => Promise<void>;
};

type ExecutionDeps = {
  store: ExecutionStore;
  throttle: {
    allow: (platform: string, actionType: string) => { allowed: boolean; retryAfterSeconds?: number };
  };
  sendWhatsAppDm: (params: { targetRef: string; content: string; operationId: string }) => Promise<{
    providerActionId: string;
    raw: Record<string, unknown>;
  }>;
};

const runtimeDefaults: Omit<ExecutionDeps, 'store'> = {
  throttle: socialsThrottle,
  sendWhatsAppDm: async ({ targetRef, content, operationId }) => {
    const result = await sendViaEarthcureWhatsAppWithRetry({
      to: targetRef,
      body: content,
      source: 'content_flow_do_socials_execute',
      operationId,
      maxAttempts: 2,
    });
    return {
      providerActionId: result.providerMessageId,
      raw: {
        status: result.status,
        conversation_id: result.conversationId,
        request_id: result.requestId,
      },
    };
  },
};

const defaultDeps = async (): Promise<ExecutionDeps> => {
  const { socialIdempotencyStore } = await import('./idempotency-store.js');
  return {
    store: socialIdempotencyStore,
    ...runtimeDefaults,
  };
};

const nowIso = () => new Date().toISOString();

const toResponse = (input: ExecuteTaskResponse): ExecuteTaskResponse =>
  executeTaskResponseSchema.parse(input);

const requiresHumanApproval = (request: ExecuteTaskRequest) =>
  request.action_type === 'comment' || request.action_type === 'reply' || request.action_type === 'dm';

const makeBlocked = (
  request: ExecuteTaskRequest,
  reasonCode: string,
  reasonMessage: string,
  raw: Record<string, unknown> | null = null
): ExecuteTaskResponse =>
  toResponse({
    version: 'v1',
    task_id: request.task_id,
    status: 'blocked',
    provider_action_id: null,
    occurred_at: nowIso(),
    reason_code: reasonCode,
    reason_message: reasonMessage,
    raw,
  });

const makeUnsupported = (
  request: ExecuteTaskRequest,
  reasonMessage: string
): ExecuteTaskResponse =>
  toResponse({
    version: 'v1',
    task_id: request.task_id,
    status: 'unsupported',
    provider_action_id: null,
    occurred_at: nowIso(),
    reason_code: 'UNSUPPORTED_ACTION',
    reason_message: reasonMessage,
    raw: null,
  });

const executeForPlatform = async (
  request: ExecuteTaskRequest,
  deps: ExecutionDeps
): Promise<ExecuteTaskResponse> => {
  if (request.platform === 'whatsapp') {
    if (request.action_type !== 'dm') {
      return makeUnsupported(request, 'WhatsApp adapter supports only action_type="dm" in v1.');
    }
    const content = (request.content || '').trim();
    if (!content) {
      return makeBlocked(request, 'MISSING_CONTENT', 'action_type="dm" requires non-empty content.');
    }
    const sent = await deps.sendWhatsAppDm({
      targetRef: request.target_ref,
      content,
      operationId: request.idempotency_key,
    });
    return toResponse({
      version: 'v1',
      task_id: request.task_id,
      status: 'succeeded',
      provider_action_id: sent.providerActionId,
      occurred_at: nowIso(),
      reason_code: null,
      reason_message: null,
      raw: sent.raw,
    });
  }

  if (request.platform === 'instagram') {
    return makeUnsupported(
      request,
      `Instagram adapter does not support action_type="${request.action_type}" yet (requires moderation/reply API integration).`
    );
  }

  if (request.platform === 'facebook') {
    return makeUnsupported(
      request,
      `Facebook adapter does not support action_type="${request.action_type}" yet (requires comment/reply/DM Graph API integration).`
    );
  }

  return makeUnsupported(request, 'No adapter configured for platform.');
};

export const executeSocialTask = async (
  input: unknown,
  deps?: ExecutionDeps
): Promise<ExecuteTaskResponse> => {
  const resolvedDeps = deps ?? (await defaultDeps());
  const request = executeTaskRequestSchema.parse(input);
  const cached = await resolvedDeps.store.getExecutionResponse(request.idempotency_key);
  if (cached) return executeTaskResponseSchema.parse(cached);

  await resolvedDeps.store.ensureExecutionRequest(request);

  if (requiresHumanApproval(request) && request.metadata?.human_approved !== true) {
    const response = makeBlocked(
      request,
      'HUMAN_APPROVAL_REQUIRED',
      'Risky actions require metadata.human_approved=true in v1.'
    );
    await resolvedDeps.store.saveExecutionResponse(request, response);
    return response;
  }

  const throttleDecision = resolvedDeps.throttle.allow(request.platform, request.action_type);
  if (!throttleDecision.allowed) {
    const response = makeBlocked(
      request,
      'THROTTLED',
      'Platform/action throttled by DO-Socials policy.',
      { retry_after_seconds: throttleDecision.retryAfterSeconds ?? 1 }
    );
    await resolvedDeps.store.saveExecutionResponse(request, response);
    return response;
  }

  try {
    const response = await executeForPlatform(request, resolvedDeps);
    await resolvedDeps.store.saveExecutionResponse(request, response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = toResponse({
      version: 'v1',
      task_id: request.task_id,
      status: 'failed',
      provider_action_id: null,
      occurred_at: nowIso(),
      reason_code: 'EXECUTION_ERROR',
      reason_message: message,
      raw: null,
    });
    await resolvedDeps.store.saveExecutionResponse(request, failed);
    return failed;
  }
};
