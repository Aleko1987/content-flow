# DO-Socials Contract (v1)

This repository acts as **DO-Socials** for the cross-repo integration.

## Implementation Progress (Apr 2026)

### Completed

- DO-Socials execute endpoint is live at `POST /api/content-ops/social-execution/execute-task`.
- DO-Socials event producer endpoint is live at `POST /api/content-ops/social-events/produce`.
- Instagram inbound webhook intake is live at `GET/POST /api/content-ops/instagram/webhook`.
- Service-to-service auth is enforced on both endpoints.
- Execution idempotency is confirmed: duplicate `idempotency_key` returned deterministic identical responses.
- Cross-repo execution from DO-Intent now reaches DO-Socials and persists returned statuses.

### Validated Runtime Evidence

- Direct execute probe returned `200` contract payload:
  - `status: "unsupported"`
  - `reason_code: "UNSUPPORTED_ACTION"`
- Duplicate execute probe with same key returned identical payload, including same `occurred_at`.
- DO-Intent execute diagnostics showed correct mapping when unsupported:
  - execution status `unsupported`
  - task status `unsupported`

### Current Engine Scope (Apr 2026)

- Execution framework is now capability-driven for Instagram with explicit support vs unsupported routing.
- Unsupported actions never return success and include stable deterministic reason codes.
- Every attempt is audit-logged to `social_execution_attempts`.

## Endpoints Implemented

- `POST /api/content-ops/social-events/produce`
  - Accepts `NormalizedSocialEvent` (`v1`) and forwards to DO-Intent `POST /social-events/ingest`.
  - Enforces service-to-service auth and source-event idempotency.
- `GET/POST /api/content-ops/instagram/webhook`
  - Accepts inbound Instagram webhook events (DM/comment/reply).
  - Normalizes each inbound unit to `NormalizedSocialEvent` (`v1`) and forwards via producer to DO-Intent `/social-events/ingest`.
  - Requires DB mapping from IG account/page `account_ref` to `metadata.owner_user_id` (`instagram_owner_user_map` table).
- `POST /api/content-ops/social-execution/execute-task`
  - Accepts `ExecuteTaskRequest` (`v1`) and returns `ExecuteTaskResponse` (`v1`).
  - Enforces service-to-service auth, idempotency, throttling, and policy guardrails.

## Contract Compliance

### A) NormalizedSocialEvent produced to DO-Intent `/social-events/ingest`

```json
{
  "version": "v1",
  "source_event_id": "evt_123",
  "platform": "instagram",
  "event_type": "comment",
  "actor_ref": "ig:1789...",
  "actor_display": "James Pilsner",
  "lead_match_confidence": 0.82,
  "occurred_at": "2026-04-24T16:10:00.000Z",
  "source_url": "https://instagram.com/p/...",
  "content_excerpt": "Need diesel quote",
  "metadata": {
    "owner_user_id": "user_abc",
    "lead_id": "optional-lead-uuid",
    "priority": 70
  }
}
```

### B) ExecuteTaskRequest accepted by DO-Socials `/social-execution/execute-task`

```json
{
  "version": "v1",
  "task_id": "task_uuid",
  "idempotency_key": "task_uuid:timestamp",
  "platform": "instagram",
  "action_type": "comment",
  "target_ref": "ig:1789...",
  "lead_ref": "optional-lead-uuid",
  "content": "Thanks for your message, sending details now.",
  "metadata": {}
}
```

### C) ExecuteTaskResponse returned by DO-Socials

```json
{
  "version": "v1",
  "task_id": "task_uuid",
  "status": "succeeded",
  "provider_action_id": "ig_action_999",
  "occurred_at": "2026-04-24T16:12:00.000Z",
  "reason_code": null,
  "reason_message": null,
  "raw": {}
}
```

## Security

Service-to-service auth is required for both endpoints:

- **Bearer mode**:
  - Inbound validation with `DO_SOCIALS_AUTH_BEARER_TOKEN`
  - Outbound to DO-Intent with `DO_SOCIALS_INGEST_TOKEN` (fallback: `DO_INTENT_AUTH_BEARER_TOKEN`)
- **HMAC mode**:
  - Inbound validation with `DO_SOCIALS_AUTH_HMAC_SECRET`
  - Outbound signing with `DO_INTENT_AUTH_HMAC_SECRET`

Outbound ingest URL precedence:

1. `DO_INTENT_SOCIAL_INGEST_URL`
2. `DO_INTENT_SOCIAL_EVENTS_INGEST_URL` (legacy)
3. `${DO_INTENT_BASE_URL}/social-events/ingest`

Request HMAC format:

- `x-content-flow-timestamp: <epoch_ms>`
- `x-content-flow-signature: sha256=<hex(hmac(timestamp + "." + jsonBody))>`

## Idempotency

- Inbound event idempotency keyed by `source_event_id` in `social_event_deliveries`.
- Execution idempotency keyed by `idempotency_key` in `social_execution_idempotency`.

## Deployment Notes and Gotchas

- If execute calls return `500` with relation errors for `social_execution_idempotency`, ensure migration `0012_social_contract_idempotency.sql` is applied.
- If DO-Intent execute attempts fail with URL parse errors, check DO-Intent env values for placeholders such as `https://<content-flow-backend>...`.
- Prefer setting explicit `DO_SOCIALS_EXECUTE_URL` in DO-Intent to avoid base URL ambiguity.

## Retry and Throttle Policy

- Event producer retries transient failures (`429`, `5xx`, network errors) up to `DO_SOCIALS_EVENT_RETRY_MAX_ATTEMPTS`.
- Execution requests are rate-limited per `platform + action_type` with:
  - `DO_SOCIALS_THROTTLE_WINDOW_MS`
  - `DO_SOCIALS_THROTTLE_MAX_PER_WINDOW`

## Instagram Capability Matrix

See:

- `docs/instagram-capability-matrix.md` (human readable)
- `src/socials/instagram-capability-matrix.v1.json` (machine readable)
- `GET /api/content-ops/social-execution/capabilities/instagram` (service endpoint)

## Cross-Platform Capability Matrix

Capability matrices are available for all connected execution platforms:

- `GET /api/content-ops/social-execution/capabilities` (all platforms)
- `GET /api/content-ops/social-execution/capabilities/facebook`
- `GET /api/content-ops/social-execution/capabilities/whatsapp`

Machine-readable files:

- `src/socials/instagram-capability-matrix.v1.json`
- `src/socials/facebook-capability-matrix.v1.json`
- `src/socials/whatsapp-capability-matrix.v1.json`

### Deterministic Reason Codes (v1)

Primary reason codes returned by execution responses:

- `action_not_supported_by_provider`
- `missing_content`
- `missing_required_metadata`
- `missing_provider_credentials`
- `throttled_by_policy`
- `human_approval_required`
- `provider_permission_missing`
- `provider_rate_limited`
- `provider_auth_failed`
- `provider_request_failed`
- `risk_daily_cap_exceeded`
- `risk_cooldown_active`
- `risk_duplicate_target_suppressed`
- `execution_error`
