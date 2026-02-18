import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import * as dotenv from 'dotenv';
import cors from "cors";
import { errorHandler } from './middleware/error-handler.js';
import { logger } from './utils/logger.js';
import channelsRouter from './routes/channels.js';
import contentItemsRouter from './routes/content-items.js';
import variantsRouter from './routes/variants.js';
import publishTasksRouter from './routes/publish-tasks.js';
import publishLogsRouter from './routes/publish-logs.js';
import mediaAssetsRouter from './routes/media-assets.js';
import mediaRouter from './routes/media.js';
import seedRouter from './routes/seed.js';
import scheduledPostsRouter from './routes/scheduled-posts.js';
import integrationsRouter from './routes/integrations.js';
import whatsappRouter from './routes/whatsapp.js';
import { startScheduledPostRunner } from './scheduled-posts/runner.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT ?? 10000);

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // allow server-to-server and curl (no Origin header)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // IMPORTANT: do not error — silently disallow
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ensure preflight never hits auth or routes
app.options("*", cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check (production-safe, no DB, no auth)
app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/content-ops/channels', channelsRouter);
app.use('/api/content-ops/content-items', contentItemsRouter);
app.use('/api/content-ops/variants', variantsRouter);
app.use('/api/content-ops/publish-tasks', publishTasksRouter);
app.use('/api/content-ops/publish-logs', publishLogsRouter);
app.use('/api/content-ops/media-assets', mediaAssetsRouter);
app.use('/api/content-ops/media', mediaRouter);
app.use('/api/content-ops', seedRouter);

// Scheduled Posts API (Calendar feature)
app.use('/api/content-ops/scheduled-posts', scheduledPostsRouter);

// Integrations API (OAuth connections)
app.use('/api/content-ops/integrations', integrationsRouter);

// WhatsApp assisted workflow (manual status posting helper)
app.use('/api/content-ops/whatsapp', whatsappRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  startScheduledPostRunner();
});


