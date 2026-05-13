# AI Unification Notes

## Recommended Role In A Unified Platform
- Treat this repo as the basis for a **Content and Social Operations service/module**.
- Do not merge it as a standalone app without adding shared identity, tenancy, and platform-level integration boundaries.
- Preserve the social execution contract as a reusable service interface, but review naming and ownership before making it global.

## Entities That Should Become Shared Globally
| Entity | Why |
|---|---|
| User | Required for ownership, audit, permissions, and OAuth attribution. |
| Workspace / Organization | Required for multi-tenant content operations. |
| ConnectedAccount | Social tokens should be global and permissioned, not per isolated repo. |
| MediaAsset | Content, social publishing, and other modules need one asset library. |
| Audit/Event | Publish logs, intent events, and social events should share an event/audit substrate. |
| PlatformCapability | Capability matrices should be discoverable across social automation modules. |
| ScheduledJob / QueueTask | Due-post processing should use unified worker infrastructure. |

## Modules That Should Remain Separate
- Content planning UI and content-specific workflows.
- Social provider execution adapters.
- WhatsApp assisted confirmation workflow.
- Posted video filename parsing/history if it remains specific to this product's content format.
- Provider capability matrix ownership, as long as the interface is shared.

## Logic That Could Be Reused
- Drizzle model concepts for content items, variants, scheduled posts, media assets, publish tasks, and logs.
- Idempotent task creation and execution locking patterns.
- Service-auth pattern for cross-service contract endpoints.
- Social execution request/response schemas.
- Provider registry abstraction.
- Inbound social event normalization flow.
- Media URL preflight/reachability checks.
- Friendly token-expiry error handling for Meta integrations.

## Parts That Should Probably Be Rebuilt Cleanly
- Authentication and authorization, because most general routes are currently unauthenticated.
- Tenancy and ownership, because core tables lack workspace/user scope.
- OAuth state storage, because process memory is not suitable for distributed deployments.
- Background runner, because in-process intervals can duplicate work across instances.
- Media modeling, because scheduled post media and media assets are not fully unified.
- Route-level runtime schema mutation, because migrations should own database shape.
- API contract casing/schema consistency, because examples and implementations mix casing conventions.

## Migration Strategy
1. Freeze current repo behavior with docs and tests.
2. Define global platform primitives: user, workspace, connected account, media asset, audit event.
3. Add tenant/owner columns through additive migrations.
4. Create compatibility adapters for existing frontend route shapes.
5. Move OAuth state, throttling, and background jobs to shared durable infrastructure.
6. Consolidate media routes and scheduled media references around global media assets.
7. Promote social contract schemas into a shared package only after versioning rules are defined.

## Risks When Merging With Other Repos
- Data leakage risk if unauthenticated routes are mounted behind a unified public API.
- Token ownership risk if connected accounts remain unique by provider instead of scoped by workspace/user.
- Duplicate job execution risk if multiple API instances start `startScheduledPostRunner()`.
- Schema conflict risk from deprecated columns and runtime table alteration.
- Contract drift risk if DO-Socials schemas are changed without versioning.
- Media inconsistency risk if other modules use a different asset model.
- Status vocabulary conflicts across repos (`draft`, `ready`, `scheduled`, `posted`, `planned`, `queued`, `published`, `failed`, etc.).

## Open Questions / Needs Review
- NEEDS REVIEW: Identify all repos that will share DO-Socials or DO-Intent contracts.
- NEEDS REVIEW: Decide whether Content Flow becomes a module in one monolith, a separate service, or a package plus service.
- NEEDS REVIEW: Define tenant boundaries before migrating production data.
- UNKNOWN: Which unified platform entity names already exist in other repos.
