# Content Ops API Server

External API server for Marketing Content Ops, replacing the Lovable mock storage with a real Neon Postgres backend.

## Tech Stack

- **Runtime**: Node.js with Express
- **Database**: Neon Postgres (serverless)
- **ORM**: Drizzle
- **Language**: TypeScript

## Setup

### Prerequisites

- Node.js 18+ 
- A Neon Postgres database (get one at [neon.tech](https://neon.tech))

### Installation

```bash
cd server
npm install
```

### Environment Variables

Create a `.env` file in the `server` directory:

```env
# Neon Postgres Database URL
DATABASE_URL=postgresql://user:password@host/database?sslmode=require

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS - Allowed origins (comma-separated)
CORS_ORIGINS=http://localhost:8080,https://lovable.dev

# X OAuth (optional)
X_CLIENT_ID=
X_CLIENT_SECRET=
X_REDIRECT_URI=http://localhost:3001/api/content-ops/integrations/x/connect/callback

# Instagram Graph API (via Facebook Login)
IG_CLIENT_ID=
IG_CLIENT_SECRET=
IG_REDIRECT_URI=http://localhost:3001/api/content-ops/integrations/instagram/connect/callback

# App base URL used for OAuth redirects (frontend)
APP_BASE_URL=http://localhost:8080
```

### Database Setup

1. **Generate migrations**:
   ```bash
   npm run db:generate
   ```

2. **Run migrations**:
   ```bash
   npm run db:migrate
   ```

3. **Seed demo data** (optional):
   ```bash
   npm run db:seed
   ```
   Or via API:
   ```bash
   curl -X POST http://localhost:3001/api/content-ops/seed-demo
   ```

### Running Locally

**Development** (with auto-reload):
```bash
npm run dev
```

**Production**:
```bash
npm run build
npm start
```

The server will run on `http://localhost:3001` by default.

## API Endpoints

Base URL: `http://localhost:3001/api/content-ops`

### Channels

- `GET /channels` - Get all channels
- `PATCH /channels/:key` - Update channel (enable/disable, default_checklist)

### Content Items

- `GET /content-items` - List content items
  - Query params: `status`, `pillar`, `format`, `channel_key`, `date_from`, `date_to`, `q` (search)
- `POST /content-items` - Create content item
- `GET /content-items/:id` - Get single content item
- `PATCH /content-items/:id` - Update content item
- `DELETE /content-items/:id` - Delete content item

### Channel Variants

- `GET /content-items/:id/variants` - Get variants for content item
- `PUT /content-items/:id/variants/:channel_key` - Upsert variant

### Publish Tasks

- `GET /publish-tasks` - List publish tasks
  - Query params: `state`, `channel_key`, `date_from`, `date_to`
- `POST /publish-tasks` - Create single task
- `POST /publish-tasks/bulk-create` - Create tasks for all enabled channels
- `PATCH /publish-tasks/:id` - Update task (state, scheduled_for, checklist, assignee)
- `POST /publish-tasks/:id/log-publish` - Log publish and create intent event

### Seed

- `POST /seed-demo` - Seed demo data (same 5 items as Lovable demo)

## Client Integration Guide

### Base URL Configuration

In your Lovable client app, configure the API base URL:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/content-ops';
```

### Example Fetch Calls

#### Get Channels
```typescript
const response = await fetch(`${API_BASE_URL}/channels`);
const channels = await response.json();
```

#### Get Content Items with Filters
```typescript
const params = new URLSearchParams({
  status: 'draft,ready',
  pillar: 'product',
  q: 'launch'
});
const response = await fetch(`${API_BASE_URL}/content-items?${params}`);
const items = await response.json();
```

#### Create Content Item
```typescript
const response = await fetch(`${API_BASE_URL}/content-items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'New Post',
    hook: 'Engaging hook',
    pillar: 'product',
    format: 'post',
    status: 'draft',
    priority: 2
  })
});
const item = await response.json();
```

#### Update Content Item
```typescript
const response = await fetch(`${API_BASE_URL}/content-items/${itemId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'ready',
    priority: 1
  })
});
const updated = await response.json();
```

#### Upsert Variant
```typescript
const response = await fetch(`${API_BASE_URL}/content-items/${itemId}/variants/x`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    caption: 'Post caption',
    hashtags: '#marketing #content',
    link_url: 'https://example.com',
    utm_campaign: 'campaign-name',
    utm_source: 'x',
    utm_medium: 'social'
  })
});
const variant = await response.json();
```

#### Create Publish Task
```typescript
const response = await fetch(`${API_BASE_URL}/publish-tasks`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content_item_id: itemId,
    channel_key: 'x',
    scheduled_for: '2024-01-15T10:00:00Z',
    state: 'scheduled',
    checklist: ['Check character limit', 'Add hashtags']
  })
});
const task = await response.json();
```

#### Log Publish
```typescript
const response = await fetch(`${API_BASE_URL}/publish-tasks/${taskId}/log-publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    posted_at: new Date().toISOString(),
    post_url: 'https://x.com/post/123',
    reach: 5000,
    clicks: 250,
    notes: 'Published successfully'
  })
});
const result = await response.json();
```

### Data Model Mapping

The API uses snake_case for request/response bodies, while your TypeScript types use camelCase. Here's the mapping:

**Content Item**:
- Client: `contentItemId` → API: `content_item_id`
- Client: `createdAt` → API: `created_at`
- Client: `updatedAt` → API: `updated_at`

**Channel Variant**:
- Client: `contentItemId` → API: `content_item_id`
- Client: `channelKey` → API: `channel_key`
- Client: `mediaPrompt` → API: `media_prompt`
- Client: `linkUrl` → API: `link_url`
- Client: `utmCampaign` → API: `utm_campaign`
- Client: `utmSource` → API: `utm_source`
- Client: `utmMedium` → API: `utm_medium`

**Publish Task**:
- Client: `contentItemId` → API: `content_item_id`
- Client: `channelKey` → API: `channel_key`
- Client: `scheduledFor` → API: `scheduled_for`

**Publish Log**:
- Client: `publishTaskId` → API: `publish_task_id`
- Client: `postedAt` → API: `posted_at`
- Client: `postUrl` → API: `post_url`

### Error Handling

All errors follow this format:
```json
{
  "error": "Error message",
  "details": "Additional details (in development mode)"
}
```

Example error handling:
```typescript
try {
  const response = await fetch(`${API_BASE_URL}/content-items/${id}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  const item = await response.json();
} catch (error) {
  console.error('API Error:', error);
}
```

## Deployment to Render

1. **Create a new Web Service** on Render
2. **Connect your repository**
3. **Configure**:
   - **Build Command**: `cd server && npm install && npm run build`
   - **Start Command**: `cd server && npm start`
   - **Environment Variables**:
     - `DATABASE_URL`: Your Neon connection string
     - `PORT`: `10000` (Render default)
     - `NODE_ENV`: `production`
     - `CORS_ORIGINS`: Your production frontend URL(s)

4. **Run migrations** after first deploy:
   - SSH into the service or use a one-off command:
   ```bash
   cd server && npm run db:migrate
   ```

5. **Update your client** to use the production API URL:
   ```typescript
   const API_BASE_URL = 'https://your-api.onrender.com/api/content-ops';
   ```

## Database Schema

### Tables

- `channels` - Social media channels configuration
- `content_items` - Main content pieces
- `channel_variants` - Channel-specific content variants (unique on content_item_id + channel_key)
- `publish_tasks` - Publishing tasks (unique on content_item_id + channel_key)
- `publish_logs` - Publishing history and metrics
- `intent_events` - Event tracking (currently post_published)

All tables use UUID primary keys and include timestamps.

## Notes

- Single-user mode (no auth) - designed to add auth later
- All database access is server-side only
- CORS is configured for specified origins
- Error responses are consistent: `{ error, details? }`
- Minimal logging to console


