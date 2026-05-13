# AI API

## Base Paths
- Server root: `server/src/index.ts`.
- Main API prefix: `/api/content-ops`.
- Health/compliance routes:
  - `GET /healthz`
  - `GET /health`
  - `GET /robots.txt`
  - `GET /`
  - `GET /privacy`
  - `GET /data-deletion`

## Authentication Visible In Code
| Area | Auth |
|---|---|
| General content ops routes | No user/session auth visible. |
| Social contract routes | `requireServiceAuth` bearer/HMAC. |
| Scheduled post process-due route | Optional `SCHEDULED_POSTS_CRON_TOKEN`; open when unset. |
| WhatsApp forwarded webhook | `x-content-flow-forward-token` checked against `CONTENT_FLOW_FORWARD_TOKEN`. |
| Meta webhook verification | Verify-token query checks for WhatsApp and Instagram. |

## Content Ops Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/content-ops/channels` | List channels. | None visible |
| POST | `/api/content-ops/channels` | Create channel. | None visible |
| PUT | `/api/content-ops/channels/:key` | Replace/update channel by key. | None visible |
| PATCH | `/api/content-ops/channels/:key` | Partial channel update. | None visible |
| DELETE | `/api/content-ops/channels/:key` | Delete channel. | None visible |
| GET | `/api/content-ops/content-items` | List/filter content items. | None visible |
| POST | `/api/content-ops/content-items` | Create content item. | None visible |
| GET | `/api/content-ops/content-items/:id` | Fetch content item. | None visible |
| PATCH | `/api/content-ops/content-items/:id` | Update content item and media IDs. | None visible |
| DELETE | `/api/content-ops/content-items/:id` | Hard delete content item; idempotent response. | None visible |
| GET | `/api/content-ops/variants` | Route exists; exact utility needs review. | None visible |
| GET | `/api/content-ops/variants/:id/variants` | List variants for content item. | None visible |
| POST | `/api/content-ops/variants/:id/variants` | Create variant for content item. | None visible |
| PUT | `/api/content-ops/variants/:id/variants/:channel_key` | Upsert variant. | None visible |
| DELETE | `/api/content-ops/variants/:id/variants/:channel_key` | Delete variant. | None visible |
| GET | `/api/content-ops/publish-logs` | List publish logs. | None visible |
| POST | `/api/content-ops/publish-logs` | Create publish log. | None visible |
| GET | `/api/content-ops/publish-logs/:id` | Fetch publish log. | None visible |
| PUT | `/api/content-ops/publish-logs/:id` | Update publish log. | None visible |
| DELETE | `/api/content-ops/publish-logs/:id` | Delete publish log. | None visible |
| POST | `/api/content-ops/seed` | Seed demo data. | None visible |

## Publish Task Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/content-ops/publish-tasks` | List/filter tasks; supports due filter. | None visible |
| POST | `/api/content-ops/publish-tasks` | Create idempotent publish task from content item and variant. | None visible |
| POST | `/api/content-ops/publish-tasks/bulk-create` | Create tasks for enabled channels. | None visible |
| PATCH | `/api/content-ops/publish-tasks/:id` | Update state, schedule, checklist, assignee. | None visible |
| PUT | `/api/content-ops/publish-tasks/:id` | Update task fields. | None visible |
| DELETE | `/api/content-ops/publish-tasks/:id` | Delete task. | None visible |
| POST | `/api/content-ops/publish-tasks/:id/log-publish` | Log manual publish and create intent event. | None visible |
| POST | `/api/content-ops/publish-tasks/:id/execute` | Execute task via configured provider or WhatsApp assisted flow. | None visible |

## Scheduled Post Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/content-ops/scheduled-posts?from=&to=` | List scheduled posts in date range. | None visible |
| POST | `/api/content-ops/scheduled-posts` | Create scheduled post with media metadata. | None visible |
| GET | `/api/content-ops/scheduled-posts/:id` | Fetch scheduled post. | None visible |
| PUT | `/api/content-ops/scheduled-posts/:id` | Update scheduled post; can sync linked publish task. | None visible |
| DELETE | `/api/content-ops/scheduled-posts/:id` | Delete scheduled post. | None visible |
| GET/POST | `/api/content-ops/scheduled-posts/process-due` | Process due planned posts. | Optional cron token |
| POST | `/api/content-ops/scheduled-posts/:id/execute` | Manually execute one scheduled post. | None visible |

## Media Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/content-ops/media/presign` | Create R2/S3 presigned upload URL. | None visible |
| POST | `/api/content-ops/media` | Store uploaded media metadata. | None visible |
| POST | `/api/content-ops/media-assets/presign` | Presign media asset upload. | None visible |
| POST | `/api/content-ops/media-assets/complete` | Complete media asset upload. | None visible |
| POST | `/api/content-ops/media-assets` | Create media asset. | None visible |
| GET | `/api/content-ops/media-assets` | List media assets. | None visible |
| DELETE | `/api/content-ops/media-assets/:id` | Delete media asset. | None visible |

## Integration And Webhook Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/content-ops/integrations` | List provider connection status. | None visible |
| GET | `/api/content-ops/integrations/facebook/page` | Get connected Facebook Page details. | None visible |
| POST | `/api/content-ops/integrations/facebook/disconnect` | Disconnect Facebook and Instagram accounts. | None visible |
| POST | `/api/content-ops/integrations/x/connect/start` | Start X OAuth PKCE. | None visible |
| GET | `/api/content-ops/integrations/x/debug` | Non-secret X OAuth debug info. | None visible |
| GET | `/api/content-ops/integrations/x/connect/callback` | X OAuth callback. | State check |
| POST | `/api/content-ops/integrations/instagram/connect/start` | Start Instagram/Facebook OAuth flow. | None visible |
| GET | `/api/content-ops/integrations/instagram/connect/callback` | Instagram OAuth callback. | State check |
| POST | `/api/content-ops/integrations/facebook/connect/start` | Start Facebook Page OAuth flow. | None visible |
| GET | `/api/content-ops/integrations/facebook/connect/callback` | Facebook OAuth callback. | State check |
| POST | `/api/content-ops/whatsapp/send-status` | Send assisted WhatsApp Status for publish task. | None visible |
| POST | `/api/content-ops/whatsapp/send-verification-template` | Send WhatsApp verification/confirmation template. | None visible |
| GET | `/api/content-ops/whatsapp/webhook` | WhatsApp Meta webhook verification. | Verify token |
| POST | `/api/content-ops/whatsapp/webhook` | Forwarded WhatsApp confirmation webhook. | Forward token |
| GET | `/api/content-ops/instagram/webhook` | Instagram webhook verification. | Verify token |
| POST | `/api/content-ops/instagram/webhook` | Process inbound Instagram events and forward normalized data. | None visible |

## Social Contract Routes
| Method | Route | Purpose | Auth |
|---|---|---|---|
| POST | `/api/content-ops/social-events/produce` | Accept `NormalizedSocialEvent` and forward to DO-Intent ingest. | Service auth |
| GET | `/api/content-ops/social-execution/capabilities` | Return all social execution capabilities. | Service auth |
| GET | `/api/content-ops/social-execution/capabilities/:platform` | Return one platform capability matrix. | Service auth |
| POST | `/api/content-ops/social-execution/execute-task` | Execute shared `ExecuteTaskRequest`. | Service auth |

## Other Routes
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/content-ops/posted-videos` | List posted video history. |
| GET | `/api/content-ops/posted-videos/summary` | Posted video summary. |

## Missing Or Unclear API Coverage
- User/workspace auth APIs are absent.
- No clear tenant scoping exists for content, media, tasks, or connected accounts.
- Webhook signature validation beyond verify/forward tokens needs review.
- Some APIs use camelCase request bodies while docs mention snake_case in places; normalize before platform unification.
- `GET /api/content-ops/variants` exists but needs review for intended frontend usage.

## Open Questions / Needs Review
- NEEDS REVIEW: Add explicit auth requirements before exposing admin-like endpoints in production.
- NEEDS REVIEW: Decide canonical media API between `media` and `media-assets`.
- NEEDS REVIEW: Document exact request/response schemas from zod/types for public API consumers.
- UNKNOWN: Whether any external clients besides the frontend and DO-Intent currently call these routes.
