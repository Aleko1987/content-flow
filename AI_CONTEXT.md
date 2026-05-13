# AI Context

## Software Summary
- **Name:** Content Flow.
- **Type:** Marketing content operations and social publishing application.
- **Primary purpose:** Plan, schedule, publish, and track marketing content across social channels.
- **Current shape:** React/Vite frontend with a separate Express API server backed by Neon Postgres through Drizzle ORM.
- **Main user:** A marketer, content operator, or small team managing planned content, channel variants, publish queues, social posting, and publishing history.

## Business Purpose
- Replace spreadsheet/manual social content workflows with a structured content operations system.
- Maintain a content plan, channel-specific variants, publish tasks, scheduled calendar posts, media assets, and publish logs.
- Support direct or assisted publishing to X, Instagram, Facebook, and WhatsApp Status workflows where configured.
- Emit and consume shared social execution/event contracts for use with a broader DO platform.

## Current Product Areas
| Area | Status | Notes |
|---|---:|---|
| Content planning | Implemented | Content items, media associations, filters, drawers, and demo data exist. |
| Channel variants | Implemented | Per-channel caption/hashtag/CTA/link fields exist in backend and UI types. |
| Publish queue | Implemented | Publish tasks can be created, scheduled, executed, and logged. |
| Calendar scheduling | Implemented | Scheduled posts are DB-backed and can process due posts. |
| Media storage | Partially implemented | R2/S3-compatible presigned upload routes exist; scheduled post media may still store metadata and public URLs only. |
| Social publishing | Partially implemented | X, Instagram, Facebook providers exist; WhatsApp Status is assisted/manual rather than true status auto-publish. |
| OAuth integrations | Partially implemented | X, Instagram, and Facebook flows exist; OAuth state is in memory. |
| Social contract | Implemented in server | DO-Socials schemas, execution, capabilities, idempotency, and tests exist. |
| Authentication | Limited | Service-to-service auth exists for social contract routes; general app/API user auth is not implemented. |

## Maturity / Status
- The repo is beyond prototype for several backend workflows, but not a fully unified production platform.
- The backend includes migrations, tests for social contract and WhatsApp helper logic, and production-oriented deployment notes.
- Several parts are transitional:
  - `content_items.media_ids` is marked deprecated but still present for backward compatibility.
  - Some routes defensively create or alter tables at runtime.
  - OAuth state is stored in memory.
  - Frontend still has legacy/local mock or localStorage patterns alongside API-backed services.

## Fit In A Future Unified Platform
- Best role: a **Content/Social Operations module** inside a larger platform.
- Strong candidates to preserve:
  - Content item lifecycle.
  - Channel variants.
  - Publish task execution model.
  - Scheduled post runner and status model.
  - Social execution contract and capability matrices.
  - Media asset abstraction.
- Likely shared platform dependencies:
  - Global users/workspaces/organizations.
  - Global connected social accounts.
  - Global media asset library.
  - Shared audit/event bus.
  - Shared auth and permission model.

## Open Questions / Needs Review
- UNKNOWN: Whether this repo is intended to remain single-tenant or become multi-tenant.
- NEEDS REVIEW: General user authentication and authorization are absent from most API routes.
- NEEDS REVIEW: OAuth state should move from process memory to durable/expiring storage before multi-instance deployment.
- NEEDS REVIEW: Confirm whether both `bun.lockb` and `package-lock.json` are intentionally maintained.
- NEEDS REVIEW: Clarify which frontend service paths are authoritative versus legacy/localStorage fallbacks.
