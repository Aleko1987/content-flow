# AI Context - Content Flow App

## Purpose
Content Flow is a marketing content operations platform for planning, scheduling, and publishing content across multiple social media channels. It replaces Buffer-like workflows with integrated content planning, calendar scheduling, and publish logging.

## Main Flows

### 1. Content Planning (Content Plan Tab)
- Create content items with title, hook, pillar, format, status, priority
- Manage content lifecycle from idea → draft → review → approved → published
- Table view with filters, search, and quick status updates

### 2. Channel Variants
- Each content item can have platform-specific variants
- Variants include: caption, hashtags, media_prompt, CTA, link_url, UTM parameters
- Supports: LinkedIn, X (Twitter), Instagram, Facebook, TikTok, YouTube Shorts

### 3. Publish Queue (Kanban)
- Visual board with columns: todo, scheduled, posted, skipped
- Drag-and-drop to update publish task state
- Each task links to content item + channel variant

### 4. Calendar Scheduling (Calendar Tab)
- Month and Week view modes
- Click any day to create/edit scheduled posts
- Drag-and-drop media files from desktop to create posts
- Drag existing posts between days to reschedule
- Each scheduled post has: time, caption, platforms, media attachments
- **Now persisted to Neon Postgres via API**

### 5. Publish Logging (Logs Tab)
- Records all publish events with timestamps
- Tracks: channel, status, post URL, error messages

## Data Models

### ContentItem
- id, title, hook, pillar, format, status, priority, notes
- Status: idea, draft, review, approved, published, archived

### ChannelVariant
- content_item_id, channel_key, caption, hashtags, media_prompt, cta, link_url

### PublishTask
- content_item_id, channel_key, state, scheduled_for, checklist
- State: todo, scheduled, posted, skipped

### PublishLog
- publish_task_id, channel_key, status, post_url, error_message, published_at

### ScheduledPost (Calendar) - **DB-backed**
- id (uuid), title, caption, scheduled_at (timestamptz)
- platforms: jsonb array of platform keys
- status: planned, queued, published, failed
- created_at, updated_at

### ScheduledPostMedia (Calendar) - **DB-backed**
- id (uuid), scheduled_post_id (FK), type (image/video)
- file_name, mime_type, size
- storage_url (null for now - frontend uses object URLs for preview)

### MediaItem (Frontend type)
- id, type (image/video), fileName, mimeType, size
- localObjectUrl (for frontend preview)
- storageUrl (for persistence, future)

## Persistence

### Backend (Neon Postgres + Drizzle)
- **Database**: Neon Postgres via `DATABASE_URL` env var
- **ORM**: Drizzle ORM with TypeScript schema
- **Migrations**: `server/src/db/migrations/` (run via `npm run db:migrate`)

### API Endpoints (Scheduled Posts)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/scheduled-posts?from=&to=` | GET | Fetch posts in date range |
| `/api/scheduled-posts` | POST | Create new post with media |
| `/api/scheduled-posts/:id` | PUT | Update post (replaces media) |
| `/api/scheduled-posts/:id` | DELETE | Delete post (cascades media) |

### Content Ops (Legacy)
- **Content Items, Variants, Tasks, Logs**: Still uses mock API layer
- Future: migrate to same backend pattern

### Frontend Services
| Service | Storage |
|---------|---------|
| `scheduledPostApiService.ts` | Neon Postgres via API |
| `scheduledPostService.ts` | localStorage (deprecated, kept for reference) |
| `ContentOpsContext.tsx` | React Context + mock data |

## Design System
- **Theme**: Dark neon aesthetic (Linear/Raycast inspired)
- **Colors**: HSL-based semantic tokens in index.css
- **Components**: shadcn/ui with custom variants
- **Typography**: Clean, high-contrast

## File Validation (Calendar Media)
- Images: PNG, JPG, JPEG, WEBP, GIF (max 20MB)
- Videos: MP4, WEBM, MOV (max 200MB)
- Previews via URL.createObjectURL with cleanup
- **Note**: Media uploads to S3/R2 not yet implemented

## Platforms Supported
- LinkedIn, X (Twitter), Instagram, Facebook, TikTok, YouTube Shorts

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
```

### Server (server/.env)
```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:5173,http://localhost:8080
```

## Development Commands

### Database
```bash
cd server
npm run db:generate   # Generate migrations from schema
npm run db:migrate    # Run migrations
npm run db:seed       # Seed demo data (content ops only)
```

### Running
```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend  
npm run dev
```
