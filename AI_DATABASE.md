# AI Database

## Provider
- **Database:** Neon Postgres.
- **ORM:** Drizzle ORM.
- **Schema file:** `server/src/db/schema.ts`.
- **Migrations:** `server/src/db/migrations/`.
- **Migration runner:** `server/src/db/migrate.ts`.

## Migration Files
| Migration | Purpose Inferred From Filename |
|---|---|
| `0000_eager_doctor_doom.sql` | Initial schema. |
| `0002_add_scheduled_posts.sql` | Scheduled posts/calendar tables. |
| `0003_publish_tasks_idempotency_locking.sql` | Publish task idempotency/locking fields. |
| `0004_connected_accounts.sql` | Connected social account storage. |
| `0005_connected_accounts_metadata.sql` | Connected account metadata. |
| `0006_publish_tasks_state_status_sync.sql` | Publish task state/status migration. |
| `0007_add_publish_tasks_missing_columns.sql` | Additional publish task columns. |
| `0008_connected_accounts_account_ref.sql` | Connected account account reference. |
| `0009_create_connected_accounts.sql` | Connected accounts creation fallback/repair. |
| `0010_add_scheduled_posts_content_item_id.sql` | Link scheduled posts to content items. |
| `0011_create_posted_videos.sql` | Posted video history table. |
| `0012_social_contract_idempotency.sql` | Social contract idempotency table. |
| `0013_instagram_owner_user_map.sql` | Instagram owner-user mapping. |
| `0014_social_execution_attempts.sql` | Social execution attempt audit table. |

## Tables / Models
| Table | Purpose | Important Fields |
|---|---|---|
| `channels` | Social channel configuration | `key`, `name`, `enabled`, `default_checklist` |
| `content_items` | Core content plan items | `title`, `hook`, `pillar`, `format`, `status`, `priority`, `owner`, `notes`, `media_ids` |
| `media_assets` | R2/S3-backed media records | `storage_provider`, `bucket`, `object_key`, `public_url`, `mime_type`, `size_bytes`, `sha256` |
| `content_item_media` | Join table from content items to media assets | `content_item_id`, `media_asset_id` |
| `channel_variants` | Per-channel copy/metadata | `content_item_id`, `channel_key`, `caption`, `hashtags`, `media_prompt`, `media_asset_id`, `cta`, UTM fields |
| `publish_tasks` | Work units for publishing content to a channel | `content_item_id`, `channel_key`, `scheduled_for`, `state`, `status`, `idempotency_key`, lock/attempt fields |
| `publish_logs` | Event log for publish tasks | `publish_task_id`, `posted_at`, `post_url`, `reach`, `clicks`, `notes` |
| `posted_videos` | Posted video history and filename parsing support | `content_item_id`, `publish_task_id`, filename parts, `platform`, `posted_at`, `status`, `external_post_id` |
| `intent_events` | Internal event tracking | `event_type`, `source`, `channel_key`, `content_item_id`, `payload` |
| `scheduled_posts` | Calendar scheduled posts | `caption`, `content_item_id`, `channel_key`, `recipient_phone`, `scheduled_at`, `platforms`, `status` |
| `scheduled_post_media` | Media attached to scheduled posts | `scheduled_post_id`, `type`, `file_name`, `mime_type`, `size`, `storage_url` |
| `connected_accounts` | Encrypted OAuth token storage | `provider`, `status`, `account_ref`, `token_ciphertext`, `token_meta` |
| `social_event_deliveries` | Normalized social event delivery/idempotency | `source_event_id`, `platform`, `event_type`, `payload`, delivery status/attempt fields |
| `social_execution_idempotency` | ExecuteTaskRequest idempotency and cached response | `idempotency_key`, `task_id`, payloads, `status`, `provider_action_id` |
| `social_execution_attempts` | Audit trail for social execution attempts | `attempt_id`, `idempotency_key`, `task_id`, `platform`, `action_type`, payloads, `status`, `reason_code`, `correlation_id` |
| `instagram_owner_user_map` | Maps Instagram account/page refs to owner user IDs | `account_ref`, `owner_user_id` |

## Relationships
- `channel_variants.content_item_id` -> `content_items.id` with cascade delete.
- `channel_variants.media_asset_id` -> `media_assets.id` with set null.
- `publish_tasks.content_item_id` -> `content_items.id` with cascade delete.
- `publish_logs.publish_task_id` -> `publish_tasks.id` with cascade delete.
- `scheduled_posts.content_item_id` -> `content_items.id` with set null.
- `scheduled_post_media.scheduled_post_id` -> `scheduled_posts.id` with cascade delete.
- `content_item_media.content_item_id` -> `content_items.id` with cascade delete.
- `content_item_media.media_asset_id` -> `media_assets.id` with cascade delete.
- `posted_videos.content_item_id` and `posted_videos.publish_task_id` use set null.

## Data Ownership Model
- Current schema has no explicit `user_id`, `workspace_id`, `organization_id`, or tenant partition on core tables.
- Connected accounts are unique by provider, implying one connected account per provider for the deployment.
- `instagram_owner_user_map` introduces owner mapping for inbound Instagram events, but that is not a general platform tenant model.

## Soft Delete Logic
- No general soft delete fields were found in the schema.
- Deletes are hard deletes in routes, often relying on cascade behavior.
- Connected accounts are deleted on disconnect for Facebook/Instagram; token status can also be marked `revoked`.

## Duplicated Or Confusing Entities
- `content_items.media_ids` is marked deprecated but still stored and used as a fallback.
- `content_item_media` is documented in code as the current source of truth for content item/media relationships.
- `scheduled_post_media.storage_url` overlaps conceptually with `media_assets.public_url`, but scheduled post media stores direct metadata rather than always linking to `media_assets`.
- `publish_tasks.state` and `publish_tasks.status` both exist and represent different workflow/publishing states; this needs strict vocabulary.
- `server/src/routes/media.ts` and `server/src/routes/media-assets.ts` both expose media-related APIs.

## Open Questions / Needs Review
- NEEDS REVIEW: Add global tenant ownership columns before unifying with other repos.
- NEEDS REVIEW: Decide whether `scheduled_post_media` should link to `media_assets` instead of storing independent media metadata.
- NEEDS REVIEW: Decide when to remove or fully migrate away from `content_items.media_ids`.
- UNKNOWN: Whether all migrations have been applied in current production environments.
