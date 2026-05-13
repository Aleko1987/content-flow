# AI Keep / Delete

## Valuable Parts To Keep
- Content operations domain model: content items, channel variants, publish tasks, publish logs.
- Calendar scheduled posts and due-post processing model.
- Drizzle schema and migrations as the best source of current persistence truth.
- Social contract implementation:
  - `server/src/social-contract/schemas.ts`
  - `server/src/socials/execution-service.ts`
  - `server/src/socials/event-producer.ts`
  - capability matrix JSON files
- Provider abstraction in `server/src/publish/providers/`.
- Encrypted connected-account storage in `server/src/db/connectedAccounts.ts`.
- R2/S3-compatible media asset model and upload flow.
- Tests under `server/src/**/*.test.ts`, especially contract, idempotency, inbound, and WhatsApp bridge coverage.
- Existing docs in `server/docs/`, `API_INTEGRATION.md`, and `WHATSAPP_STATUS_INTEGRATION.md` as historical implementation context.

## Fragile Parts To Be Careful With
- OAuth flow and token handling; do not log or expose token values.
- `connected_accounts` encryption/decryption logic.
- Migration history; do not rewrite applied migrations casually.
- DO-Socials contract schemas and capability matrices because other repos may depend on them.
- Scheduled post runner status transitions.
- `publish_tasks.state` versus `publish_tasks.status`; changing either can break UI and execution.
- WhatsApp assisted confirmation workflow; it depends on forwarded webhook token, operation IDs, and stale-pending behavior.
- Runtime schema repair logic in routes may mask missing migrations.

## Dead / Duplicated / Transitional Code
| Item | Status | Notes |
|---|---|---|
| `content_items.media_ids` | Deprecated | Code comments say `content_item_media` is the source of truth, but fallback remains. |
| `src/services/scheduledPostService.ts` | Likely legacy | LocalStorage implementation kept alongside API-backed service. |
| `server/src/routes/media.ts` and `server/src/routes/media-assets.ts` | Duplicative | Both provide media upload/asset behavior; canonical API needs review. |
| Runtime schema creation/altering | Transitional | Should be replaced by normal migrations where possible. |
| In-memory OAuth state | Prototype-grade | Needs durable store for multi-instance production. |
| `dist/` | Generated | Should not be hand edited. |

## Technical Debt
- No general user auth or authorization on most API routes.
- No tenant/workspace ownership columns on primary entities.
- Mixed casing conventions across API examples and route bodies.
- CORS env var mismatch risk: code reads `ALLOWED_ORIGINS`, examples mention `CORS_ORIGINS`.
- Mixed lock files at root (`bun.lockb` and `package-lock.json`) may confuse package manager ownership.
- Several route modules contain business logic directly; service boundaries are uneven.
- Background processing is in-process and may double-run in multi-instance deployments.
- Some status values are not centralized as shared enums across frontend/backend.

## Things To Remove Later
- Remove `content_items.media_ids` after a verified data migration to `content_item_media`.
- Remove or archive `src/services/scheduledPostService.ts` after confirming no active consumers.
- Consolidate media routes into one canonical media asset API.
- Remove runtime schema mutation once migrations are reliable in all environments.
- Remove committed generated build artifacts if `dist/` is not intentionally part of deployment.
- Remove stale Lovable-specific docs/comments once ownership and deployment are finalized.

## Things To Migrate Into A Unified System
- Content item, variant, task, log, and scheduled post models.
- Media asset library with global ownership and permissions.
- Connected accounts and provider token storage.
- Social execution contract and idempotency store.
- Posting history and intent event/audit trail.
- Platform capability matrix model.
- Background scheduler as a shared worker/queue service.

## Open Questions / Needs Review
- NEEDS REVIEW: Confirm whether `dist/` should remain committed.
- NEEDS REVIEW: Decide exact deprecation timeline for localStorage/demo paths.
- NEEDS REVIEW: Define canonical status enums across content, tasks, scheduled posts, and provider execution.
- UNKNOWN: Which parts are actively used in production versus experimental.
