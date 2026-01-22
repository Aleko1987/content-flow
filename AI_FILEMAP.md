# AI File Map - Content Flow App

## Root Structure
```
├── src/                    # Frontend React application
├── server/                 # Backend API (Hono + Drizzle, future use)
├── public/                 # Static assets
├── AI_CONTEXT.md          # App purpose and data models
├── AI_FILEMAP.md          # This file - directory guide
└── API_INTEGRATION.md     # API documentation
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
| `CalendarPage.tsx` | Main calendar view with month/week toggle, navigation, grid display |
| `ScheduledPostCard.tsx` | Small card showing post in calendar cell (time, platforms, media indicator) |
| `ScheduledPostDrawer.tsx` | Right-side drawer for creating/editing scheduled posts |
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
| `scheduledPostService.ts` | Repository pattern for ScheduledPost CRUD (localStorage) |

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

## Server (`server/`) - Future Use
| Path | Purpose |
|------|---------|
| `src/db/schema.ts` | Drizzle ORM schema definitions |
| `src/db/migrate.ts` | Database migration runner |
| `src/db/seed.ts` | Seed data script |
| `src/routes/` | API route handlers |
| `src/middleware/` | CORS, error handling |

## Key Data Flows

### Creating a Scheduled Post
1. User clicks day in `CalendarPage.tsx`
2. `ScheduledPostDrawer.tsx` opens with date prefilled
3. User sets time, adds media via `MediaDropzone.tsx`
4. User selects platforms via `PlatformMultiSelect.tsx`
5. Save calls `scheduledPostService.create()`
6. localStorage updated, UI refreshes

### Drag-and-Drop Rescheduling
1. User drags `ScheduledPostCard` to new day
2. `CalendarPage.tsx` handles drop event
3. Calls `scheduledPostService.moveToDate()`
4. Post's scheduledDate/scheduledAt updated

### Media Upload
1. Files dropped on `MediaDropzone.tsx`
2. Validation: type, size checks
3. Preview URL created via `URL.createObjectURL()`
4. MediaItem added to post's media array
5. Object URLs cleaned up on unmount
