export const reasonCodes = {
  actionNotSupportedByProvider: 'action_not_supported_by_provider',
  actionSupportedButNotEnabled: 'action_supported_but_not_enabled',
  missingContent: 'missing_content',
  missingRequiredMetadata: 'missing_required_metadata',
  missingProviderCredentials: 'missing_provider_credentials',
  throttledByPolicy: 'throttled_by_policy',
  humanApprovalRequired: 'human_approval_required',
  providerPermissionMissing: 'provider_permission_missing',
  providerRateLimited: 'provider_rate_limited',
  providerAuthFailed: 'provider_auth_failed',
  providerRequestFailed: 'provider_request_failed',
  executionError: 'execution_error',
  riskDailyCapExceeded: 'risk_daily_cap_exceeded',
  riskCooldownActive: 'risk_cooldown_active',
  riskDuplicateTargetSuppressed: 'risk_duplicate_target_suppressed',
} as const;

export type ReasonCode = (typeof reasonCodes)[keyof typeof reasonCodes];
