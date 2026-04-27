# DO-Socials Contract (v1)

This repository acts as **DO-Socials** for the cross-repo integration.

## Implementation Progress (Apr 2026)

### Completed

- DO-Socials execute endpoint is live at `POST /api/content-ops/social-execution/execute-task`.
- DO-Socials event producer endpoint is live at `POST /api/content-ops/social-events/produce`.
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

### Remaining Functional Gap (Expected)

- A "succeeded" path is not exercised by current DO-Intent event-to-action mapping in dogfood flows.
- Current adapter support is intentionally narrow (`whatsapp + dm` only for successful execution path).

## Endpoints Implemented

- `POST /api/content-ops/social-events/produce`
  - Accepts `NormalizedSocialEvent` (`v1`) and forwards to DO-Intent `POST /social-events/ingest`.
  - Enforces service-to-service auth and source-event idempotency.
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
  - Outbound to DO-Intent with `DO_INTENT_AUTH_BEARER_TOKEN`
- **HMAC mode**:
  - Inbound validation with `DO_SOCIALS_AUTH_HMAC_SECRET`
  - Outbound signing with `DO_INTENT_AUTH_HMAC_SECRET`

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

## Unsupported Actions (Current)

- `instagram`: `like`, `comment`, `reply`, `dm` -> `status="unsupported"`
  - Reason: this repo currently has publishing adapters, not moderation/reply APIs for those actions.
- `facebook`: `like`, `comment`, `reply`, `dm` -> `status="unsupported"`
  - Reason: no comment/reply/DM execution adapter implemented yet.
- `whatsapp`: only `dm` is supported; other actions return `unsupported`.

This is intentionally conservative and backward-compatible. Risky actions still default to blocked unless `metadata.human_approved=true`.
