# API Integration Summary

## CURL TESTS

### Channels

```bash
# Get all channels
curl http://localhost:3001/api/content-ops/channels

# Create channel
curl -X POST http://localhost:3001/api/content-ops/channels \
  -H "Content-Type: application/json" \
  -d '{"key":"test","name":"Test Channel","enabled":true,"default_checklist":["Item 1"]}'

# Update channel (PATCH)
curl -X PATCH http://localhost:3001/api/content-ops/channels/x \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'

# Update channel (PUT)
curl -X PUT http://localhost:3001/api/content-ops/channels/x \
  -H "Content-Type: application/json" \
  -d '{"name":"X (Twitter) Updated","enabled":true,"default_checklist":["Updated"]}'

# Delete channel
curl -X DELETE http://localhost:3001/api/content-ops/channels/test
```

### Content Items

```bash
# Get all content items
curl http://localhost:3001/api/content-ops/content-items

# Get with filters
curl "http://localhost:3001/api/content-ops/content-items?status=draft,ready&pillar=product&q=launch"

# Get single item
curl http://localhost:3001/api/content-ops/content-items/{id}

# Create content item
curl -X POST http://localhost:3001/api/content-ops/content-items \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Test Post",
    "hook":"Test hook",
    "pillar":"product",
    "format":"post",
    "status":"draft",
    "priority":2
  }'

# Update content item
curl -X PATCH http://localhost:3001/api/content-ops/content-items/{id} \
  -H "Content-Type: application/json" \
  -d '{"status":"ready","priority":1}'

# Delete content item
curl -X DELETE http://localhost:3001/api/content-ops/content-items/{id}
```

### Channel Variants

```bash
# Get variants for content item
curl http://localhost:3001/api/content-ops/content-items/{id}/variants

# Create variant
curl -X POST http://localhost:3001/api/content-ops/content-items/{id}/variants \
  -H "Content-Type: application/json" \
  -d '{
    "channel_key":"x",
    "caption":"Test caption",
    "hashtags":"#test",
    "link_url":"https://example.com"
  }'

# Upsert variant (PUT)
curl -X PUT http://localhost:3001/api/content-ops/content-items/{id}/variants/x \
  -H "Content-Type: application/json" \
  -d '{
    "caption":"Updated caption",
    "hashtags":"#updated",
    "utm_campaign":"test-campaign",
    "utm_source":"x",
    "utm_medium":"social"
  }'

# Delete variant
curl -X DELETE http://localhost:3001/api/content-ops/content-items/{id}/variants/x
```

### Publish Tasks

```bash
# Get all tasks
curl http://localhost:3001/api/content-ops/publish-tasks

# Get with filters
curl "http://localhost:3001/api/content-ops/publish-tasks?state=todo,scheduled&channel_key=x"

# Create task
curl -X POST http://localhost:3001/api/content-ops/publish-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "content_item_id":"{id}",
    "channel_key":"x",
    "state":"todo",
    "scheduled_for":"2024-01-15T10:00:00Z"
  }'

# Bulk create tasks
curl -X POST http://localhost:3001/api/content-ops/publish-tasks/bulk-create \
  -H "Content-Type: application/json" \
  -d '{"content_item_id":"{id}"}'

# Update task
curl -X PATCH http://localhost:3001/api/content-ops/publish-tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{"state":"scheduled","scheduled_for":"2024-01-20T10:00:00Z"}'

# Update task (PUT)
curl -X PUT http://localhost:3001/api/content-ops/publish-tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "content_item_id":"{id}",
    "channel_key":"x",
    "state":"scheduled",
    "scheduled_for":"2024-01-20T10:00:00Z",
    "checklist":["Item 1","Item 2"]
  }'

# Log publish (creates log, updates task state, creates intent event)
curl -X POST http://localhost:3001/api/content-ops/publish-tasks/{id}/log-publish \
  -H "Content-Type: application/json" \
  -d '{
    "posted_at":"2024-01-15T10:00:00Z",
    "post_url":"https://x.com/post/123",
    "reach":5000,
    "clicks":250,
    "notes":"Published successfully"
  }'

# Delete task
curl -X DELETE http://localhost:3001/api/content-ops/publish-tasks/{id}
```

### Publish Logs

```bash
# Get all logs
curl http://localhost:3001/api/content-ops/publish-logs

# Get with filters
curl "http://localhost:3001/api/content-ops/publish-logs?publish_task_id={id}&date_from=2024-01-01&date_to=2024-01-31"

# Get single log
curl http://localhost:3001/api/content-ops/publish-logs/{id}

# Create log
curl -X POST http://localhost:3001/api/content-ops/publish-logs \
  -H "Content-Type: application/json" \
  -d '{
    "publish_task_id":"{id}",
    "posted_at":"2024-01-15T10:00:00Z",
    "post_url":"https://x.com/post/123",
    "reach":5000,
    "clicks":250,
    "notes":"Test notes"
  }'

# Update log
curl -X PUT http://localhost:3001/api/content-ops/publish-logs/{id} \
  -H "Content-Type: application/json" \
  -d '{
    "reach":6000,
    "clicks":300,
    "notes":"Updated notes"
  }'

# Delete log
curl -X DELETE http://localhost:3001/api/content-ops/publish-logs/{id}
```

### Seed

```bash
# Seed demo data
curl -X POST http://localhost:3001/api/content-ops/seed-demo
```

## MANUAL TEST PLAN

### Setup
1. Start backend: `cd server && npm run dev`
2. Start frontend: `npm run dev`
3. Ensure DATABASE_URL is set in `server/.env`
4. Run migrations: `cd server && npm run db:migrate`
5. Seed data: `curl -X POST http://localhost:3001/api/content-ops/seed-demo`

### Test Flow: Create Content → Variants → Tasks → Log Publish → Intent Event

1. **Create Content Item**
   - Open frontend at http://localhost:8080
   - Click "New Content" button
   - Fill in title, hook, pillar, format
   - Submit
   - Verify: Item appears in content plan tab

2. **Create Channel Variant**
   - Click on the created content item
   - In drawer, click "Add Variant" for a channel (e.g., X)
   - Fill in caption, hashtags, link URL
   - Save
   - Verify: Variant appears in drawer

3. **Create Publish Task**
   - In content item drawer, click "Create Tasks for All Channels"
   - OR manually create task via API
   - Verify: Task appears in Publish Queue tab

4. **Update Task State**
   - In Publish Queue, drag task from "todo" to "scheduled"
   - OR update via API
   - Verify: Task moves to scheduled column

5. **Log Publish**
   - Click on task in Publish Queue
   - Click "Mark as Posted"
   - Fill in post URL, posted date, reach, clicks, notes
   - Submit
   - Verify:
     - Task state changes to "posted"
     - Log appears in Logs tab
     - Intent event created (check database: `SELECT * FROM intent_events WHERE event_type='post_published'`)

6. **Verify Uniqueness Constraints**
   - Try to create duplicate variant (same content_item_id + channel_key)
   - Verify: API returns 409 error
   - Try to create duplicate task (same content_item_id + channel_key)
   - Verify: API returns 409 error

7. **Test Filters**
   - In Content Plan tab, use status/pillar/format filters
   - Verify: Only matching items shown
   - Use search box
   - Verify: Search works across title, hook, notes

8. **Test Channel Settings**
   - Go to Settings tab
   - Toggle channel enabled/disabled
   - Edit default checklist
   - Verify: Changes persist

9. **Test Delete Operations**
   - Delete a content item
   - Verify: Item, variants, and tasks are deleted (cascade)
   - Delete a variant
   - Verify: Variant removed
   - Delete a task
   - Verify: Task and associated log removed

10. **Verify CORS**
    - Check browser console for CORS errors
    - Verify: No CORS errors when calling API from frontend
    - Test with different origins if needed

## CORS Configuration

CORS is configured in `server/src/middleware/cors.ts` to allow:
- `http://localhost:8080` (Vite dev server)
- Origins specified in `CORS_ORIGINS` env var

For production, update `CORS_ORIGINS` in server `.env`:
```
CORS_ORIGINS=https://your-production-domain.com
```

## Environment Variables

### Frontend (.env in root)
```
VITE_API_URL=http://localhost:3001/api/content-ops
```

### Backend (server/.env)
```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:8080,https://lovable.dev
```

## Database Schema Notes

- **Unique Constraints**:
  - `channel_variants`: unique on (content_item_id, channel_key)
  - `publish_tasks`: unique on (content_item_id, channel_key)
  
- **Cascade Deletes**:
  - Deleting content_item deletes variants and tasks
  - Deleting task deletes logs

- **Intent Events**:
  - Write-only integration point
  - Created automatically when logging publish
  - Contains: event_type, source, channel_key, content_item_id, payload

