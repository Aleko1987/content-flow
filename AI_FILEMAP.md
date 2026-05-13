# AI File Map

## Repository Structure
| Path | Purpose |
|---|---|
| `src/` | React/Vite frontend application. |
| `server/` | Express API server, Drizzle schema, migrations, integrations, social execution, and background runner. |
| `public/` | Static frontend assets. |
| `server/docs/` | Design/rollout docs for social actions and platform capabilities. |
| `dist/` | Generated frontend build output; do not document or edit casually. |
| `node_modules/` | Installed dependencies; generated and excluded. |

## Root Files
| File | Purpose |
|---|---|
| `README.md` | Setup, app overview, commands, and recent progress notes. |
| `AI_CONTEXT.md` | AI-readable product and maturity summary. |
| `AI_FILEMAP.md` | This repo map. |
| `AI_ARCHITECTURE.md` | AI-readable architecture overview. |
| `AI_DATABASE.md` | AI-readable database/schema overview. |
| `AI_API.md` | AI-readable API route overview. |
| `AI_KEEP_DELETE.md` | Keep/delete/technical debt guidance. |
| `AI_UNIFICATION_NOTES.md` | Notes for merging into a larger platform. |
| `API_INTEGRATION.md` | Existing API integration guide. |
| `WHATSAPP_STATUS_INTEGRATION.md` | Existing WhatsApp Status integration notes. |
| `.env.example` | Frontend env template. |
| `server/.env.example` | Backend env template. |
| `package.json` | Frontend dependencies and scripts. |
| `server/package.json` | Backend dependencies and scripts. |

## Frontend Entry Points
| File | Purpose |
|---|---|
| `src/main.tsx` | Vite/React bootstrap. |
| `src/App.tsx` | Router setup. `/` renders the marketing app; catch-all renders `NotFound`. |
| `src/pages/Marketing.tsx` | Main application shell with tabs for content plan, publish queue, calendar, logs, social actions, and settings. |
| `src/pages/NotFound.tsx` | 404 page. |

## Frontend Feature Folders
| Folder | Purpose |
|---|---|
| `src/components/calendar/` | Calendar scheduling UI, scheduled post drawer/cards, media dropzone, platform selector. |
| `src/components/marketing/` | Content plan, publish queue, logs, settings, social actions, and modals. |
| `src/components/ui/` | shadcn/ui component layer. Treat as design-system infrastructure. |
| `src/contexts/` | `ContentOpsContext` state provider for the marketing app. |
| `src/services/` | Frontend services, including API-backed scheduled posts and legacy local scheduled post storage. |
| `src/types/` | Shared frontend TypeScript types for content ops and scheduled posts. |
| `src/lib/` | API base URL/client helpers and utility functions. |
| `src/data/` | Demo content data. |
| `src/hooks/` | UI hooks for keyboard shortcuts, mobile detection, and toast behavior. |

## Backend Entry Points
| File | Purpose |
|---|---|
| `server/src/index.ts` | Express app setup, CORS, health/compliance pages, route mounting, background runner startup. |
| `server/src/db/index.ts` | Database connection. |
| `server/src/db/schema.ts` | Drizzle table definitions. |
| `server/src/db/migrate.ts` | Migration runner. |
| `server/src/db/seed.ts` | Demo seed script. |

## Backend Major Folders
| Folder | Purpose |
|---|---|
| `server/src/routes/` | HTTP route modules. |
| `server/src/db/` | DB connection, schema, account helpers, migrations, seed data. |
| `server/src/publish/providers/` | X, Instagram, and Facebook publish provider implementations. |
| `server/src/scheduled-posts/` | Due-post processing runner and manual execution logic. |
| `server/src/social-contract/` | Shared social contract schemas and tests. |
| `server/src/socials/` | Social execution/event producer, capability matrices, throttling, service auth, Instagram inbound processing. |
| `server/src/whatsapp/` | WhatsApp assisted confirmation and bridge/cloud API helpers. |
| `server/src/posting-history/` | Posted video filename parsing and history recording. |
| `server/src/middleware/` | Error handler and CORS middleware. |
| `server/src/utils/` | Crypto and logger helpers. |

## Config And Deployment Files
| File | Purpose |
|---|---|
| `vite.config.ts` | Frontend Vite config. |
| `tailwind.config.ts` | Tailwind theme/config. |
| `components.json` | shadcn/ui configuration. |
| `eslint.config.js` | Frontend lint config. |
| `tsconfig*.json` | TypeScript configs for frontend and server. |
| `server/drizzle.config.ts` | Drizzle migration/config file. |

## Files Not To Touch Casually
- `server/src/db/migrations/`: historical DB migrations; do not rewrite applied migrations without an explicit migration plan.
- `server/src/db/schema.ts`: source of truth for database shape.
- `server/src/social-contract/schemas.ts`: cross-repo contract surface.
- `server/src/socials/*-capability-matrix.v1.json`: platform capability contracts.
- `server/src/utils/crypto.ts` and `server/src/db/connectedAccounts.ts`: token encryption and account storage.
- `package-lock.json`, `bun.lockb`, and `server/package-lock.json`: dependency locks; do not change for docs-only work.
- `.env.example` and `server/.env.example`: safe templates only; never include secrets.

## Open Questions / Needs Review
- NEEDS REVIEW: Decide whether `server/src/routes/media.ts` and `server/src/routes/media-assets.ts` are both required long term.
- NEEDS REVIEW: Confirm if `src/services/scheduledPostService.ts` should remain as historical reference or be removed after migration.
- UNKNOWN: Whether `dist/` is intentionally committed as deployment artifact or should be ignored in future.
