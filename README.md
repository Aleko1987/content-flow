# Content Flow - Marketing Content Operations Platform

A marketing content operations platform for planning, scheduling, and publishing content across multiple social media channels.

## Quick Start

### Prerequisites
- Node.js 18+
- Neon Postgres database

### Environment Setup

1. Copy environment files:
```bash
cp .env.example .env
cp server/.env.example server/.env
```

2. Configure `server/.env`:
```
DATABASE_URL=postgresql://user:password@your-neon-host/database?sslmode=require
PORT=3001
```

3. Configure `.env` (frontend):
```
VITE_API_URL=http://localhost:3001
```

### Database Setup

```bash
cd server
npm install
npm run db:migrate    # Run migrations
npm run db:seed       # (Optional) Seed content ops demo data
```

### Running the App

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Project Structure

See `AI_FILEMAP.md` for detailed file organization and `AI_CONTEXT.md` for architecture documentation.

## API Endpoints

### Scheduled Posts (Calendar)
- `GET /api/scheduled-posts?from=YYYY-MM-DD&to=YYYY-MM-DD` - Fetch posts in range
- `POST /api/scheduled-posts` - Create post with media
- `PUT /api/scheduled-posts/:id` - Update post
- `DELETE /api/scheduled-posts/:id` - Delete post

### Content Ops
- See `API_INTEGRATION.md` for full content ops API documentation
- DO-Socials v1 contract details and runtime notes: `server/DO_SOCIALS_CONTRACT.md`

## Recent Progress (Apr 2026)

- Added DO-Socials shared contract implementation in `server/`:
  - strict v1 schemas for event and execution payloads
  - service auth (Bearer/HMAC), idempotency, throttling, guardrails
  - endpoints:
    - `POST /api/content-ops/social-events/produce`
    - `POST /api/content-ops/social-execution/execute-task`
- Added migration for social idempotency persistence:
  - `server/src/db/migrations/0012_social_contract_idempotency.sql`
- Added tests for schema compatibility, retries, blocked/unsupported handling, and idempotency replay.
- Verified cross-repo dogfood path with DO-Intent:
  - ingest accepted/deduped behavior
  - execute path status persistence (`unsupported` validated)
  - deterministic idempotency replay on duplicate key

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Express + Drizzle ORM + Neon Postgres
- **Deployment**: Render (planned)

## Features

- **Content Planning**: Create and manage content items with lifecycle tracking
- **Calendar Scheduling**: Visual month/week calendar with drag-and-drop
- **Multi-Platform**: Support for LinkedIn, X, Instagram, Facebook, TikTok, YouTube Shorts
- **Media Attachments**: Drag-and-drop images and videos
- **Publish Queue**: Kanban-style workflow management

---

## Lovable Development

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

Changes made via Lovable will be committed automatically to this repo.

For more info on custom domains: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
