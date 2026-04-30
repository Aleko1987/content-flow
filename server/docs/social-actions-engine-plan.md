# DO-Socials Social Actions Engine Plan (Instagram First)

## Objectives

1. Preserve DO-Intent v1 execute contract exactly.
2. Execute only officially supported provider actions.
3. Fail closed for missing auth/scopes/tokens and unsupported actions.
4. Keep execution framework reusable for Facebook/WhatsApp adapters.

## Implemented in This Iteration

- Added capability-driven routing:
  - `src/socials/capability-matrix.ts`
  - `GET /api/content-ops/social-execution/capabilities/:platform`
- Expanded v1 action schema to include broader social action taxonomy.
- Added Instagram executor scaffold with retry/backoff and provider error mapping:
  - `src/socials/instagram-executor.ts`
- Added stable reason codes:
  - `src/socials/reason-codes.ts`
- Added execution audit persistence:
  - table `social_execution_attempts`
  - migration `0014_social_execution_attempts.sql`
- Added risk controls (configurable):
  - daily caps per action
  - cooldown window
  - duplicate target suppression

## Next Implementation Steps

- Add exact permission preflight checks (token scopes introspection) per action.
- Add async outcome transport (queue/webhook) for delayed provider outcomes.
- Add metrics export sink (Prometheus/OpenTelemetry):
  - success rate by platform/action
  - unsupported rate by reason code
  - provider error rate
  - p95 execution latency
- Implement Facebook adapter using same capability framework.

## Operator Runbook

### Required Environment Variables

- Auth and contract:
  - `DO_SOCIALS_AUTH_BEARER_TOKEN` or `DO_SOCIALS_AUTH_HMAC_SECRET`
- Instagram provider:
  - connected account row for provider `instagram` with tokenData keys:
    - `access_token`
    - `ig_user_id`
    - `page_id`
- Retry behavior:
  - `DO_SOCIALS_PROVIDER_MAX_RETRIES` (default `2`)
  - `DO_SOCIALS_PROVIDER_RETRY_BASE_MS` (default `250`)

### Risk Control Environment Variables

- `DO_SOCIALS_RISK_DAILY_CAP_DEFAULT=0` (0 disables default cap)
- `DO_SOCIALS_RISK_DAILY_CAP_DM=<n>` (optional per action override)
- `DO_SOCIALS_RISK_DAILY_CAP_COMMENT=<n>`
- `DO_SOCIALS_RISK_DAILY_CAP_REPLY=<n>`
- `DO_SOCIALS_RISK_COOLDOWN_SECONDS=0`
- `DO_SOCIALS_RISK_DUPLICATE_TARGET_WINDOW_SECONDS=0`

### Meta App Setup / Permissions

- Required for messaging (`dm`, `story_reply`):
  - `instagram_manage_messages`
  - `pages_manage_metadata`
- Required for comment/reply/mention:
  - `instagram_manage_comments`
  - `pages_read_engagement`
  - `pages_show_list` (where required by endpoint)
- Instagram professional account must be linked to Facebook Page.
- App needs proper access level (standard/advanced) per account ownership and app review state.

### Known Unsupported Actions

- `like`, `share`, `follow`, `account_follow`, `add`, `group_join`
- All return deterministic unsupported response with
  - `status: "unsupported"`
  - `reason_code: "action_not_supported_by_provider"`

### Troubleshooting

- `missing_provider_credentials`:
  - verify connected account exists and includes required tokenData fields.
- `provider_permission_missing`:
  - verify granted scopes and app review access level.
- `provider_auth_failed`:
  - refresh/reconnect Instagram token.
- `provider_rate_limited`:
  - lower action throughput and adjust risk controls.
- `throttled_by_policy` / risk reason codes:
  - check DO-Socials env limits and recent execution history.
