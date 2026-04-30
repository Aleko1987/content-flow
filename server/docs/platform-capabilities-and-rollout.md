# Social Platform Capabilities and Rollout Checklist

This is the methodical rollout guide for DO-Socials execution actions across connected platforms.

## 1) What Is Implemented Now

### Instagram (execution engine)

- Supported:
  - `dm`
  - `story_reply`
  - `comment`
  - `reply`
  - `mention`
- Unsupported (deterministic): `like`, `share`, `follow`, `account_follow`, `add`, `group_join`
- Machine-readable matrix: `src/socials/instagram-capability-matrix.v1.json`

### Facebook (execution engine)

- Supported:
  - `dm`
  - `comment`
  - `reply`
- Unsupported (deterministic): `like`, `share`, `follow`, `account_follow`, `add`, `group_join`, `mention`, `story_reply`
- Machine-readable matrix: `src/socials/facebook-capability-matrix.v1.json`

### WhatsApp (execution engine)

- Supported:
  - `dm` (through configured Earthcure bridge)
- Unsupported (deterministic): all other action types in v1
- Machine-readable matrix: `src/socials/whatsapp-capability-matrix.v1.json`

## 2) Capability Discovery Endpoints

- All platforms:
  - `GET /api/content-ops/social-execution/capabilities`
- Single platform:
  - `GET /api/content-ops/social-execution/capabilities/instagram`
  - `GET /api/content-ops/social-execution/capabilities/facebook`
  - `GET /api/content-ops/social-execution/capabilities/whatsapp`

All capability endpoints are protected with service auth.

## 3) Connection Prerequisites

### Instagram

- Connected account exists under provider `instagram`
- Token data includes:
  - `access_token`
  - `ig_user_id`
  - `page_id`
- Required scopes (depending on action):
  - `instagram_manage_messages`
  - `instagram_manage_comments`
  - `pages_manage_metadata`
  - `pages_read_engagement`
  - `pages_show_list`

### Facebook

- Connected account exists under provider `facebook`
- Token data includes:
  - `access_token`
  - `page_id`
- Required scopes (depending on action):
  - `pages_messaging`
  - `pages_manage_engagement`

### WhatsApp

- Bridge configured with:
  - `EARTHCURE_WHATSAPP_SEND_URL`
  - `CONTENT_FLOW_FORWARD_TOKEN`

## 4) What Is Remaining (Recommended Next Steps)

1. Add token-scope introspection preflight before executing each platform action.
2. Add contract-level metadata validators per action:
   - Instagram mention (`media_id`) already checked
   - Add explicit checks for all platform-specific metadata keys
3. Add provider integration tests (mocked HTTP):
   - Facebook: `dm/comment/reply`
   - Instagram: `dm/comment/reply/mention/story_reply`
4. Add metrics export sink (Prometheus/Otel):
   - success rate by platform/action
   - unsupported rate by reason code
   - provider error rate
   - p95 execution latency
5. Add async outcome path (webhook/queue) if delayed provider results are required.
6. Add operational dashboards + alerts for reason-code spikes.

## 5) What Is Possible to Add Next

- Facebook:
  - broaden moderation flows where official APIs and app permissions permit
- Instagram:
  - tighten policy-aware windows and conversation-state gating
- WhatsApp:
  - richer message types through bridge (media/templates) mapped to explicit action contract extensions

Any newly added action should first be declared in capability matrix (supported/unsupported + reason codes), then executed.
