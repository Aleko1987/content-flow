# Instagram Capability Matrix (DO-Socials v1)

Reviewed: 2026-04-30  
Source of truth (machine-readable): `src/socials/instagram-capability-matrix.v1.json`

This matrix maps requested DO-Intent action types to official Instagram/Meta APIs and explicit unsupported reasons.

## Supported Actions

- `dm`
  - Endpoint: `POST /{page-id}/messages`
  - Scopes: `instagram_manage_messages`, `pages_manage_metadata`
  - Requirements: professional IG account linked to Page; connected tools enabled; valid page token
  - Constraints: Meta messaging policy + 24h window
- `story_reply`
  - Endpoint: `POST /{page-id}/messages`
  - Scopes: `instagram_manage_messages`, `pages_manage_metadata`
  - Requirements: same as `dm`
  - Constraints: same as `dm`
- `comment`
  - Endpoint: `POST /{ig-media-id}/comments?message={message}`
  - Scopes: `instagram_manage_comments`, `pages_read_engagement`
  - Constraints: live-video comment creation not supported
- `reply`
  - Endpoint: `POST /{ig-comment-id}/replies?message={message}`
  - Scopes: `instagram_manage_comments`, `pages_read_engagement`, `pages_show_list`
  - Constraints: only top-level comment replies
- `mention`
  - Endpoint: `POST /{ig-user-id}/mentions?media_id={media_id}&message={message}`
  - Scopes: `instagram_manage_comments`, `pages_read_engagement`, `pages_show_list`
  - Requirements: `metadata.media_id` (and optional `metadata.comment_id`)

## Unsupported Actions

The following actions are explicitly unsupported and must return `status: "unsupported"` with `reason_code: "action_not_supported_by_provider"`:

- `like`
- `share`
- `follow`
- `account_follow`
- `add`
- `group_join`

These do not have official equivalent API endpoints for safe production automation under the current Instagram/Meta API surface used by DO-Socials.

## Official Docs Referenced

- https://developers.facebook.com/docs/instagram
- https://developers.facebook.com/docs/instagram-messaging/get-started/
- https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-comment/replies/
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentions/
