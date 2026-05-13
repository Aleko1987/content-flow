# AI Architecture

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript, React Router, TanStack Query |
| UI | Tailwind CSS, shadcn/ui, Radix UI, lucide-react |
| Backend | Node.js, Express, TypeScript |
| Database | Neon Postgres via Drizzle ORM |
| Storage | Cloudflare R2 / S3-compatible presigned uploads where configured |
| Integrations | X OAuth/API, Meta/Facebook Graph API, Instagram Graph API, WhatsApp Cloud API/bridge, DO-Intent social ingest |
| Tests | Node test runner through `tsx --test src/**/*.test.ts` in `server/` |

## Runtime Architecture
- The frontend is a Vite single-page React app.
- The backend is a separate Express server mounted primarily under `/api/content-ops`.
- The frontend derives its API base from `VITE_API_BASE_URL` or `VITE_API_URL`; fallback behavior exists for localhost and a Render URL.
- The server connects to Neon Postgres through Drizzle and starts a scheduled-post runner on boot.
- Social providers are called from backend code only; tokens are stored encrypted in `connected_accounts`.

## Main Application Flow
1. User works in the React marketing app at `/`.
2. Content items and channel variants are created/edited through API-backed content ops routes.
3. Media can be uploaded through R2 presign/complete style routes when storage env vars are configured.
4. Publish tasks or scheduled posts are created.
5. Due scheduled posts are processed by `server/src/scheduled-posts/runner.ts` or manually triggered through API routes.
6. Provider-specific publishing calls are made for X, Facebook, Instagram, or assisted WhatsApp Status.
7. Publish status, logs, intent events, social execution attempts, and posted video history are persisted.

## Key Services / Modules
| Module | Purpose |
|---|---|
| `server/src/index.ts` | Express app, route mounts, compliance pages, health checks, runner startup. |
| `server/src/scheduled-posts/runner.ts` | Polls due scheduled posts, claims them, executes platform publishing, records status. |
| `server/src/publish/providers/*` | Provider-specific publishing implementations for X, Instagram, and Facebook. |
| `server/src/routes/integrations.ts` | OAuth connection flows and connected-account status endpoints. |
| `server/src/socials/execution-service.ts` | Shared social task execution endpoint logic. |
| `server/src/socials/event-producer.ts` | Produces normalized social events to DO-Intent. |
| `server/src/socials/service-auth.ts` | Bearer/HMAC service auth for social contract endpoints. |
| `server/src/whatsapp/*` | WhatsApp assisted send and confirmation workflow. |
| `server/src/db/connectedAccounts.ts` | Encrypted connected account storage. |

## Data Flow
- **Content plan:** UI -> content item routes -> `content_items` and `content_item_media`.
- **Channel variants:** UI -> variant routes -> `channel_variants`.
- **Publish queue:** UI/API -> publish task routes -> `publish_tasks`, `publish_logs`, provider calls.
- **Calendar:** UI -> scheduled post routes -> `scheduled_posts`, `scheduled_post_media`; runner processes due rows.
- **Social events:** inbound route/service -> `social_event_deliveries` -> outbound DO-Intent ingest.
- **Social execution:** authenticated caller -> `social-execution/execute-task` -> capability checks, throttles, providers, idempotency, execution attempts.
- **Inbound Instagram:** Meta webhook -> normalized processing -> DO-Intent event forwarding.
- **WhatsApp confirmation:** scheduled post or publish task -> WhatsApp prompt -> forwarded webhook -> confirmation processing.

## External Integrations
| Integration | Evidence | Notes |
|---|---|---|
| Neon Postgres | `DATABASE_URL`, Drizzle schema/migrations | Primary persistence. |
| Cloudflare R2 / S3-compatible storage | AWS SDK S3 client in media routes | Requires R2 env vars. |
| X | OAuth route and X provider | Text publishing path exists. |
| Facebook Pages | OAuth route and Facebook provider | Page selection can be pinned by `FB_PAGE_ID`. |
| Instagram Graph API | OAuth route, provider, webhook | Media publishing requires public media URL. |
| WhatsApp Cloud API / Earthcure bridge | WhatsApp routes/services/env | Assisted/manual status workflow. |
| DO-Intent | social event producer env vars | Used for normalized social events. |

## Auth Model
- General application API routes do not show user/session auth.
- Social contract routes require service auth through bearer or HMAC configuration.
- Scheduled post `process-due` can be protected with `SCHEDULED_POSTS_CRON_TOKEN`; if unset, it is open.
- OAuth callback state is stored in process memory with a 10-minute TTL.
- Connected social tokens are encrypted before storage.

## Background Jobs / Queues / Webhooks
- `startScheduledPostRunner()` runs in-process on server startup unless `SCHEDULED_POSTS_ENABLED=false`.
- Runner interval defaults to 60 seconds; max batch defaults to 10.
- Manual/cron due processing exists at `GET/POST /api/content-ops/scheduled-posts/process-due`.
- Webhooks:
  - WhatsApp verification and forwarded confirmation webhook.
  - Instagram webhook verification and inbound event processing.
- No external queue worker is present; processing is in-process.

## Known Architectural Weaknesses
- No first-class multi-tenant user/workspace model.
- Most API routes lack end-user auth and permissions.
- OAuth state and throttling are in memory, which is fragile across restarts and multi-instance deploys.
- Some schema safety is handled at route runtime with `CREATE TABLE IF NOT EXISTS` or `ALTER TABLE`, which should move into migrations.
- `content_items.media_ids` and `content_item_media` coexist, creating migration ambiguity.
- `scheduled_posts.status` uses values in routes/runner that are broader than the Drizzle comment/history in older docs.
- CORS env naming appears inconsistent: code reads `ALLOWED_ORIGINS`, while examples mention `CORS_ORIGINS`.

## Open Questions / Needs Review
- NEEDS REVIEW: Confirm target hosting topology: single Render instance, multiple instances, or unified worker/API platform.
- NEEDS REVIEW: Decide whether background due processing should become a real queue/cron worker.
- NEEDS REVIEW: Align CORS environment variable names in docs/code.
- UNKNOWN: Whether DO-Intent is the only event consumer planned for social events.
