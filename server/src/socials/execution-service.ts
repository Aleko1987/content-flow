import { randomUUID } from 'node:crypto';
import { executeTaskRequestSchema, executeTaskResponseSchema, type ExecuteTaskRequest, type ExecuteTaskResponse } from '../social-contract/schemas.js';
import { logger } from '../utils/logger.js';
import { sendViaEarthcureWhatsAppWithRetry } from '../whatsapp/earthcure-bridge.js';
import {
  facebookCapabilityMatrix,
  instagramCapabilityMatrix,
  resolveFacebookCapability,
  resolveInstagramCapability,
  resolveWhatsAppCapability,
  socialCapabilityMatrices,
} from './capability-matrix.js';
import { executeFacebookAction } from './facebook-executor.js';
import { executeInstagramAction } from './instagram-executor.js';
import { reasonCodes } from './reason-codes.js';
import { socialsThrottle } from './throttle.js';

type ExecutionStore = {
  getExecutionResponse: (idempotencyKey: string) => Promise<ExecuteTaskResponse | null>;
  ensureExecutionRequest: (request: ExecuteTaskRequest) => Promise<void>;
  saveExecutionResponse: (request: ExecuteTaskRequest, response: ExecuteTaskResponse) => Promise<void>;
  logExecutionAttempt: (params: {
    attemptId: string;
    correlationId: string;
    request: ExecuteTaskRequest;
    response: ExecuteTaskResponse;
    accountRef: string | null;
    providerPayload: Record<string, unknown> | null;
  }) => Promise<void>;
  countRecentAttempts: (params: { platform: string; actionType: string; accountRef: string; since: Date }) => Promise<number>;
  hasRecentTargetAttempt: (params: {
    platform: string;
    actionType: string;
    accountRef: string;
    targetRef: string;
    since: Date;
  }) => Promise<boolean>;
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
const now = () => new Date();

const getStringMetadata = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

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
  reasonCode: string,
  reasonMessage: string
): ExecuteTaskResponse =>
  toResponse({
    version: 'v1',
    task_id: request.task_id,
    status: 'unsupported',
    provider_action_id: null,
    occurred_at: nowIso(),
    reason_code: reasonCode,
    reason_message: reasonMessage,
    raw: null,
  });

const makeFailed = (
  request: ExecuteTaskRequest,
  reasonCode: string,
  reasonMessage: string,
  raw: Record<string, unknown> | null = null
): ExecuteTaskResponse =>
  toResponse({
    version: 'v1',
    task_id: request.task_id,
    status: 'failed',
    provider_action_id: null,
    occurred_at: nowIso(),
    reason_code: reasonCode,
    reason_message: reasonMessage,
    raw,
  });

const getDailyCapForAction = (actionType: string): number => {
  const key = `DO_SOCIALS_RISK_DAILY_CAP_${actionType.toUpperCase()}`;
  const specificValue = Number(process.env[key] ?? NaN);
  if (Number.isFinite(specificValue) && specificValue > 0) return specificValue;
  const defaultValue = Number(process.env.DO_SOCIALS_RISK_DAILY_CAP_DEFAULT ?? 0);
  return Number.isFinite(defaultValue) && defaultValue > 0 ? defaultValue : 0;
};

const getRiskConfig = () => ({
  cooldownSeconds: Math.max(0, Number(process.env.DO_SOCIALS_RISK_COOLDOWN_SECONDS ?? 0)),
  duplicateTargetWindowSeconds: Math.max(0, Number(process.env.DO_SOCIALS_RISK_DUPLICATE_TARGET_WINDOW_SECONDS ?? 0)),
});

const enforceRiskControls = async (
  request: ExecuteTaskRequest,
  accountRef: string,
  store: ExecutionStore
): Promise<ExecuteTaskResponse | null> => {
  const dailyCap = getDailyCapForAction(request.action_type);
  if (dailyCap > 0) {
    const count = await store.countRecentAttempts({
      platform: request.platform,
      actionType: request.action_type,
      accountRef,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    if (count >= dailyCap) {
      return makeBlocked(
        request,
        reasonCodes.riskDailyCapExceeded,
        `Daily cap reached for action_type="${request.action_type}" on account "${accountRef}".`,
        { daily_cap: dailyCap, observed_count: count }
      );
    }
  }

  const riskConfig = getRiskConfig();
  if (riskConfig.cooldownSeconds > 0) {
    const hasRecent = await store.hasRecentTargetAttempt({
      platform: request.platform,
      actionType: request.action_type,
      accountRef,
      targetRef: request.target_ref,
      since: new Date(Date.now() - riskConfig.cooldownSeconds * 1000),
    });
    if (hasRecent) {
      return makeBlocked(
        request,
        reasonCodes.riskCooldownActive,
        `Cooldown is active for target_ref="${request.target_ref}".`,
        { cooldown_seconds: riskConfig.cooldownSeconds }
      );
    }
  }

  if (riskConfig.duplicateTargetWindowSeconds > 0) {
    const duplicated = await store.hasRecentTargetAttempt({
      platform: request.platform,
      actionType: request.action_type,
      accountRef,
      targetRef: request.target_ref,
      since: new Date(Date.now() - riskConfig.duplicateTargetWindowSeconds * 1000),
    });
    if (duplicated) {
      return makeBlocked(
        request,
        reasonCodes.riskDuplicateTargetSuppressed,
        `Duplicate target suppressed for target_ref="${request.target_ref}".`,
        { duplicate_window_seconds: riskConfig.duplicateTargetWindowSeconds }
      );
    }
  }
  return null;
};

const executeForPlatform = async (
  request: ExecuteTaskRequest,
  deps: ExecutionDeps
): Promise<ExecuteTaskResponse> => {
  if (request.platform === 'whatsapp') {
    const capability = resolveWhatsAppCapability(request.action_type);
    if (!capability.supported) {
      return makeUnsupported(
        request,
        capability.reason_code_when_unsupported ?? reasonCodes.actionNotSupportedByProvider,
        `WhatsApp action_type="${request.action_type}" is unsupported for this integration.`
      );
    }
    const content = (request.content || '').trim();
    if (!content) {
      return makeBlocked(request, reasonCodes.missingContent, 'action_type="dm" requires non-empty content.');
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
    const capability = resolveInstagramCapability(request.action_type);
    if (!capability.supported) {
      return makeUnsupported(
        request,
        capability.reason_code_when_unsupported ?? reasonCodes.actionNotSupportedByProvider,
        `Instagram action_type="${request.action_type}" is unsupported by official Meta APIs for this integration.`
      );
    }
    const result = await executeInstagramAction(request);
    if (result.ok) {
      return toResponse({
        version: 'v1',
        task_id: request.task_id,
        status: 'succeeded',
        provider_action_id: result.providerActionId,
        occurred_at: nowIso(),
        reason_code: null,
        reason_message: null,
        raw: result.raw,
      });
    }
    return makeFailed(request, result.reasonCode, result.reasonMessage, result.raw);
  }

  if (request.platform === 'facebook') {
    const capability = resolveFacebookCapability(request.action_type);
    if (!capability.supported) {
      return makeUnsupported(
        request,
        capability.reason_code_when_unsupported ?? reasonCodes.actionNotSupportedByProvider,
        `Facebook action_type="${request.action_type}" is unsupported by official APIs for this integration.`
      );
    }
    const result = await executeFacebookAction(request);
    if (result.ok) {
      return toResponse({
        version: 'v1',
        task_id: request.task_id,
        status: 'succeeded',
        provider_action_id: result.providerActionId,
        occurred_at: nowIso(),
        reason_code: null,
        reason_message: null,
        raw: result.raw,
      });
    }
    return makeFailed(request, result.reasonCode, result.reasonMessage, result.raw);
  }

  return makeUnsupported(request, reasonCodes.actionNotSupportedByProvider, 'No adapter configured for platform.');
};

export const executeSocialTask = async (
  input: unknown,
  deps?: ExecutionDeps
): Promise<ExecuteTaskResponse> => {
  const startedAt = now();
  const resolvedDeps = deps ?? (await defaultDeps());
  const request = executeTaskRequestSchema.parse(input);
  const correlationId = getStringMetadata(request.metadata?.correlation_id) || request.task_id || request.idempotency_key;
  const attemptId = randomUUID();
  const accountRef = getStringMetadata(request.metadata?.account_ref) || getStringMetadata(request.metadata?.instagram_account_ref) || 'global';

  const cached = await resolvedDeps.store.getExecutionResponse(request.idempotency_key);
  if (cached) return executeTaskResponseSchema.parse(cached);

  await resolvedDeps.store.ensureExecutionRequest(request);

  if (requiresHumanApproval(request) && request.metadata?.human_approved !== true) {
    const response = makeBlocked(
      request,
      reasonCodes.humanApprovalRequired,
      'Risky actions require metadata.human_approved=true in v1.'
    );
    await resolvedDeps.store.saveExecutionResponse(request, response);
    await resolvedDeps.store.logExecutionAttempt({
      attemptId,
      correlationId,
      request,
      response,
      accountRef,
      providerPayload: null,
    });
    return response;
  }

  const throttleDecision = resolvedDeps.throttle.allow(request.platform, request.action_type);
  if (!throttleDecision.allowed) {
    const response = makeBlocked(
      request,
      reasonCodes.throttledByPolicy,
      'Platform/action throttled by DO-Socials policy.',
      { retry_after_seconds: throttleDecision.retryAfterSeconds ?? 1 }
    );
    await resolvedDeps.store.saveExecutionResponse(request, response);
    await resolvedDeps.store.logExecutionAttempt({
      attemptId,
      correlationId,
      request,
      response,
      accountRef,
      providerPayload: null,
    });
    return response;
  }

  const riskBlocked = await enforceRiskControls(request, accountRef, resolvedDeps.store);
  if (riskBlocked) {
    await resolvedDeps.store.saveExecutionResponse(request, riskBlocked);
    await resolvedDeps.store.logExecutionAttempt({
      attemptId,
      correlationId,
      request,
      response: riskBlocked,
      accountRef,
      providerPayload: null,
    });
    return riskBlocked;
  }

  try {
    const response = await executeForPlatform(request, resolvedDeps);
    await resolvedDeps.store.saveExecutionResponse(request, response);
    await resolvedDeps.store.logExecutionAttempt({
      attemptId,
      correlationId,
      request,
      response,
      accountRef,
      providerPayload: response.raw,
    });
    logger.info('[social_execution] completed', {
      correlation_id: correlationId,
      task_id: request.task_id,
      platform: request.platform,
      action_type: request.action_type,
      status: response.status,
      reason_code: response.reason_code,
      latency_ms: Date.now() - startedAt.getTime(),
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = makeFailed(request, reasonCodes.executionError, message);
    await resolvedDeps.store.saveExecutionResponse(request, failed);
    await resolvedDeps.store.logExecutionAttempt({
      attemptId,
      correlationId,
      request,
      response: failed,
      accountRef,
      providerPayload: null,
    });
    logger.error('[social_execution] exception', {
      correlation_id: correlationId,
      task_id: request.task_id,
      platform: request.platform,
      action_type: request.action_type,
      status: failed.status,
      reason_code: failed.reason_code,
      latency_ms: Date.now() - startedAt.getTime(),
      error: message,
    });
    return failed;
  }
};

export const getSocialExecutionCapabilities = (platform: string) => {
  if (!platform || platform === 'all') {
    return socialCapabilityMatrices;
  }
  if (platform === 'instagram' || platform === 'facebook' || platform === 'whatsapp') {
    return socialCapabilityMatrices[platform];
  }
  return null;
};
