# AI File Map - Content Flow App

## Root Structure
```
├── src/                    # Frontend React application
├── server/                 # Backend API (Express + Drizzle + Neon)
├── public/                 # Static assets
├── AI_CONTEXT.md          # App purpose and data models
├── AI_FILEMAP.md          # This file - directory guide
├── API_INTEGRATION.md     # API documentation
├── .env.example           # Frontend env template
└── server/.env.example    # Backend env template
```

## Source Code (`src/`)

### Pages
| File | Purpose |
|------|---------|
| `pages/Index.tsx` | Landing/home page |
| `pages/Marketing.tsx` | Marketing hub with tabs for Content Plan, Publish Queue, Calendar, Logs, Settings |
| `pages/NotFound.tsx` | 404 page |

### Calendar Feature (`src/components/calendar/`)
| File | Purpose |
|------|---------|
| `CalendarPage.tsx` | Main calendar view with month/week toggle, navigation, API data loading |
| `ScheduledPostCard.tsx` | Small card showing post in calendar cell (time, platforms, media indicator) |
| `ScheduledPostDrawer.tsx` | Right-side drawer for creating/editing scheduled posts via API |
| `MediaDropzone.tsx` | Drag-and-drop zone for uploading images/videos with validation |
| `PlatformMultiSelect.tsx` | Multi-select component for choosing target platforms |

### Marketing Components (`src/components/marketing/`)
| File | Purpose |
|------|---------|
| `MarketingNav.tsx` | Tab navigation: Content Plan, Publish Queue, Calendar, Logs, Settings |
| `ContentPlanTab.tsx` | Table view of content items with filters |
| `ContentItemDrawer.tsx` | Detail drawer for content item editing |
| `PublishQueueTab.tsx` | Kanban board for publish tasks |
| `LogsTab.tsx` | Publish history log viewer |
| `SettingsTab.tsx` | Channel settings management |
| `NewContentModal.tsx` | Modal for creating new content items |
| `MediaPicker.tsx` | Media selection component |

### UI Components (`src/components/ui/`)
- shadcn/ui components (button, card, drawer, dialog, etc.)
- Customized with design system tokens

### Types (`src/types/`)
| File | Purpose |
|------|---------|
| `scheduled-post.ts` | ScheduledPost, MediaItem, Platform types and file limits |
| `content-ops.ts` | ContentItem, ChannelVariant, PublishTask, PublishLog types |

### Services (`src/services/`)
| File | Purpose |
|------|---------|
| `scheduledPostApiService.ts` | **API-backed** CRUD for ScheduledPost (Neon Postgres) |
| `scheduledPostService.ts` | Legacy localStorage implementation (deprecated) |

### Context (`src/contexts/`)
| File | Purpose |
|------|---------|
| `ContentOpsContext.tsx` | React Context for content ops state management |

### Data (`src/data/`)
| File | Purpose |
|------|---------|
| `demo-data.ts` | Demo/seed data for development |

### Lib (`src/lib/`)
| File | Purpose |
|------|---------|
| `api-client.ts` | HTTP client for backend API calls |
| `utils.ts` | Utility functions (cn for classnames) |

### Hooks (`src/hooks/`)
| File | Purpose |
|------|---------|
| `use-toast.ts` | Toast notification hook |
| `use-mobile.tsx` | Mobile detection hook |
| `use-keyboard-shortcuts.ts` | Keyboard shortcut management |

### Styles
| File | Purpose |
|------|---------|
| `index.css` | Global styles, CSS variables, design tokens |
| `App.css` | App-specific styles |

## Server (`server/`)

### Database (`server/src/db/`)
| File | Purpose |
|------|---------|
| `schema.ts` | Drizzle ORM schema (all tables including scheduled_posts) |
| `index.ts` | Database connection pool (Neon serverless) |
| `migrate.ts` | Migration runner script |
| `seed.ts` | Seed data script (content ops) |
| `migrations/` | Generated SQL migration files |

### API Routes (`server/src/routes/`)
| File | Purpose |
|------|---------|
| `scheduled-posts.ts` | **NEW** - CRUD for scheduled posts + media |
| `channels.ts` | Channel management |
| `content-items.ts` | Content item CRUD |
| `variants.ts` | Channel variant management |
| `publish-tasks.ts` | Publish task management |
| `publish-logs.ts` | Publish log recording |
| `media-assets.ts` | Media asset management |
| `seed.ts` | Demo data seeding endpoint |

### Middleware (`server/src/middleware/`)
| File | Purpose |
|------|---------|
| `cors.ts` | CORS configuration |
| `error-handler.ts` | Global error handling |

### Utils (`server/src/utils/`)
| File | Purpose |
|------|---------|
| `logger.ts` | Logging utility |

### Config
| File | Purpose |
|------|---------|
| `server/package.json` | Server dependencies and scripts |
| `server/tsconfig.json` | TypeScript config |
| `server/drizzle.config.ts` | Drizzle ORM configuration |

## Key Data Flows

### Creating a Scheduled Post (API-backed)
1. User clicks day in `CalendarPage.tsx`
2. `ScheduledPostDrawer.tsx` opens with date prefilled
3. User sets time, adds media via `MediaDropzone.tsx`
4. User selects platforms via `PlatformMultiSelect.tsx`
5. Save calls `scheduledPostApiService.create()` → POST /api/scheduled-posts
6. API inserts into `scheduled_posts` + `scheduled_post_media` tables
7. UI refreshes via `loadPosts()` → GET /api/scheduled-posts

### Drag-and-Drop Rescheduling
1. User drags `ScheduledPostCard` to new day
2. `CalendarPage.tsx` handles drop event
3. Calls `scheduledPostApiService.moveToDate()` → PUT /api/scheduled-posts/:id
4. Post's `scheduled_at` updated in database

### Media Handling (Phase 1)
1. Files dropped on `MediaDropzone.tsx`
2. Validation: type, size checks
3. Preview URL created via `URL.createObjectURL()`
4. MediaItem metadata saved to `scheduled_post_media` table
5. `storage_url` is null - actual upload to S3/R2 is Phase 2
6. Object URLs cleaned up on component unmount

## Database Schema (Drizzle)

### scheduled_posts
| Column | Type | Notes |
|--------|------|-------|
| id | text | UUID primary key |
| title | text | nullable |
| caption | text | nullable |
| scheduled_at | timestamptz | indexed |
| platforms | jsonb | array of platform strings |
| status | varchar(50) | planned/queued/published/failed |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### scheduled_post_media
| Column | Type | Notes |
|--------|------|-------|
| id | text | UUID primary key |
| scheduled_post_id | text | FK → scheduled_posts (cascade delete) |
| type | varchar(20) | image/video |
| file_name | text | |
| mime_type | varchar(100) | |
| size | integer | bytes |
| storage_url | text | null for now |
| created_at | timestamptz | |
