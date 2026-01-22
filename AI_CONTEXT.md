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

### ScheduledPost (Calendar)
- id, title, caption, scheduledDate, scheduledTime, scheduledAt
- platforms: array of platform keys
- status: planned, queued, published, failed
- media: array of MediaItem objects

### MediaItem
- id, type (image/video), fileName, mimeType, size
- localObjectUrl (for frontend preview)
- storageUrl (for persistence, future)

## Persistence

### Current Implementation
- **Mock API Layer**: React Context with localStorage fallback
- **Calendar Posts**: localStorage via `scheduledPostService` repository pattern
- **Content Ops**: Context-based state management

### Future Migration Path
- Designed for easy swap to Neon Postgres + Drizzle ORM
- Repository pattern abstracts storage implementation
- Server actions ready when backend is enabled

## Design System
- **Theme**: Dark neon aesthetic (Linear/Raycast inspired)
- **Colors**: HSL-based semantic tokens in index.css
- **Components**: shadcn/ui with custom variants
- **Typography**: Clean, high-contrast

## File Validation (Calendar Media)
- Images: PNG, JPG, JPEG, WEBP, GIF (max 20MB)
- Videos: MP4, WEBM, MOV (max 200MB)
- Previews via URL.createObjectURL with cleanup

## Platforms Supported
- LinkedIn, X (Twitter), Instagram, Facebook, TikTok, YouTube Shorts
