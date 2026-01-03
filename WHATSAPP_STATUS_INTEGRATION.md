# WhatsApp Status Integration - Media Library & Manual Posting

## Overview

This integration adds WhatsApp Status support with Cloudflare R2 media storage, enabling manual posting workflows with media attachment, scheduling, and intent event tracking.

## Environment Variables

### Backend (server/.env)

```env
# Existing
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:8080,https://lovable.dev

# New - Cloudflare R2
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
R2_BUCKET=your-bucket-name
R2_PUBLIC_BASE_URL=https://your-bucket.r2.dev  # Optional, if bucket is public
```

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3001/api/content-ops
```

## Database Schema Changes

### New Table: media_assets
- Stores metadata for files uploaded to R2
- Fields: id, storage_provider, bucket, object_key, public_url, mime_type, size_bytes, sha256, created_at

### Updated Table: channel_variants
- Added: media_asset_id (nullable, references media_assets)

### New Channel: whatsapp_status
- Added to channels table via seed
- Default checklist: ['Select media', 'Write caption', 'Post manually']

## CURL TESTS

### Media Assets

```bash
# Presign upload URL
curl -X POST http://localhost:3001/api/content-ops/media-assets/presign \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test-image.jpg",
    "mime_type": "image/jpeg",
    "size_bytes": 102400
  }'

# Response:
# {
#   "uploadUrl": "https://...",
#   "objectKey": "media/1234567890-test-image.jpg",
#   "bucket": "your-bucket",
#   "publicUrl": "https://your-bucket.r2.dev/media/...",
#   "expiresAt": "2024-01-15T12:00:00Z"
# }

# Upload file to presigned URL (direct to R2)
curl -X PUT "{uploadUrl}" \
  -H "Content-Type: image/jpeg" \
  --data-binary @test-image.jpg

# Complete upload (create DB record)
curl -X POST http://localhost:3001/api/content-ops/media-assets/complete \
  -H "Content-Type: application/json" \
  -d '{
    "object_key": "media/1234567890-test-image.jpg",
    "bucket": "your-bucket",
    "mime_type": "image/jpeg",
    "size_bytes": 102400,
    "public_url": "https://your-bucket.r2.dev/media/..."
  }'

# List media assets
curl "http://localhost:3001/api/content-ops/media-assets?search=test&type=image&limit=20"

# Delete media asset
curl -X DELETE http://localhost:3001/api/content-ops/media-assets/{id}
```

### WhatsApp Status Tasks

```bash
# Get due WhatsApp Status tasks
curl "http://localhost:3001/api/content-ops/publish-tasks?channel_key=whatsapp_status&state=scheduled&due=true"

# Create WhatsApp Status variant with media
curl -X PUT http://localhost:3001/api/content-ops/content-items/{id}/variants/whatsapp_status \
  -H "Content-Type: application/json" \
  -d '{
    "caption": "Check out our new product!",
    "hashtags": "#product #launch",
    "media_asset_id": "{media_asset_id}"
  }'

# Log WhatsApp Status publish (URL optional)
curl -X POST http://localhost:3001/api/content-ops/publish-tasks/{id}/log-publish \
  -H "Content-Type: application/json" \
  -d '{
    "posted_at": "2024-01-15T10:00:00Z",
    "post_url": null,
    "notes": "Status posted manually via WhatsApp app",
    "reach": null,
    "clicks": null
  }'
```

## MANUAL TEST PLAN

### Setup
1. Configure R2 credentials in `server/.env`
2. Run migrations: `cd server && npm run db:migrate`
3. Seed data: `curl -X POST http://localhost:3001/api/content-ops/seed-demo`
4. Start backend: `cd server && npm run dev`
5. Start frontend: `npm run dev`

### Test Flow: Upload Media → Attach to Variant → Schedule → Post → Log

1. **Upload Media**
   - Open content item drawer
   - Add WhatsApp Status variant
   - Click "Select" in Media picker
   - Upload an image or video
   - Verify: Media appears in library and is selected

2. **Create WhatsApp Status Variant**
   - In content item drawer, add WhatsApp Status variant
   - Select uploaded media
   - Add caption and hashtags
   - Save
   - Verify: Variant shows media thumbnail

3. **Create Publish Task**
   - In content item drawer, click "Create Tasks for All Channels"
   - OR manually create task for WhatsApp Status
   - Set scheduled_for to today or past date
   - Verify: Task appears in Publish Queue

4. **View Due Tasks**
   - Go to Publish Queue tab
   - Verify: "WhatsApp Status - Due Today" section appears if tasks are due
   - Verify: Media thumbnails, captions, and hashtags are visible
   - Test copy buttons for caption and hashtags

5. **View Instructions**
   - Click "Instructions" button in WhatsApp Status due section
   - Verify: Dialog shows manual posting steps
   - Close dialog

6. **Post Manually (Simulated)**
   - Open WhatsApp on phone
   - Follow instructions to post status
   - Return to web app

7. **Log Publish**
   - Click "Mark Posted" on a due task
   - Fill in notes (required for WhatsApp Status)
   - Leave URL empty (optional for WhatsApp Status)
   - Submit
   - Verify:
     - Task moves from "scheduled" to "posted" column
     - Log appears in Logs tab
     - Intent event created (check DB: `SELECT * FROM intent_events WHERE channel_key='whatsapp_status'`)

8. **Verify Intent Event Payload**
   - Check database for intent_events row
   - Verify payload includes:
     - channel_key: 'whatsapp_status'
     - url: null (or value if provided)
     - published_at: timestamp
     - content_item_id, channel_variant_id, publish_task_id
     - metrics: { reach, clicks } (both null for WhatsApp)
     - notes: "Status posted manually..."

9. **Test Media Library**
   - Open Media Picker
   - Search for uploaded media
   - Select different media
   - Verify: Selection updates variant

10. **Test Due Filter**
    - Create task scheduled for yesterday
    - Query: `GET /publish-tasks?channel_key=whatsapp_status&state=scheduled&due=true`
    - Verify: Task appears in results
    - Create task scheduled for tomorrow
    - Verify: Task does NOT appear in due results

## Key Features

### Media Library (R2)
- Direct browser uploads via presigned URLs
- No file proxying through server
- Public or private URLs based on R2 configuration
- Search and filter by type

### WhatsApp Status Channel
- Manual execution mode (no automation)
- Media attachment support (images/videos)
- Copy buttons for caption and hashtags
- Instructions dialog for posting workflow

### Publish Logging
- URL optional for WhatsApp Status (no shareable links)
- Notes required for WhatsApp Status
- Intent events include full context (variant_id, task_id, etc.)
- Metrics optional (reach/clicks typically not available)

### Intent Events
Enhanced payload structure:
```json
{
  "channel_key": "whatsapp_status",
  "url": null,
  "scheduled_for": "2024-01-15T10:00:00Z",
  "published_at": "2024-01-15T10:05:00Z",
  "content_item_id": "...",
  "channel_variant_id": "...",
  "publish_task_id": "...",
  "metrics": {
    "reach": null,
    "clicks": null
  },
  "notes": "Status posted manually via WhatsApp app"
}
```

## Troubleshooting

### R2 Upload Fails
- Check R2 credentials in .env
- Verify bucket name is correct
- Check CORS settings on R2 bucket (allow PUT from your domain)
- Verify presigned URL hasn't expired (1 hour validity)

### Media Not Showing
- Check R2_PUBLIC_BASE_URL is set if using public bucket
- Verify media_asset.public_url is populated
- Check browser console for CORS errors

### Due Tasks Not Appearing
- Verify task.scheduled_for <= now
- Verify task.state === 'scheduled'
- Check channel_key === 'whatsapp_status'

### Intent Event Not Created
- Check server logs for errors
- Verify publish log was created successfully
- Check database constraints (foreign keys)

## Architecture Notes

- **No Automation**: WhatsApp Status posting is 100% manual
- **R2 Storage**: Files stored in Cloudflare R2, metadata in Neon
- **Presigned URLs**: Direct browser-to-R2 uploads (no server proxy)
- **Intent Events**: Write-only integration point for DO Intent system
- **State Transitions**: scheduled → posted only via log creation (single source of truth)

