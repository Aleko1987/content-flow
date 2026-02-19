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

// Public compliance pages (required to take Meta apps Live)
app.get('/privacy', (_req: Request, res: Response) => {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Privacy Policy - Content Flow</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; padding: 24px; max-width: 900px;">
    <h1>Privacy Policy</h1>
    <p><strong>Product:</strong> Content Flow (Do Socials)</p>
    <p><strong>Last updated:</strong> ${new Date().toISOString().slice(0, 10)}</p>

    <h2>What we do</h2>
    <p>
      Content Flow helps page administrators schedule and publish content to connected social media accounts
      (for example Facebook Pages and Instagram business accounts) using the official Meta APIs.
    </p>

    <h2>Information we store</h2>
    <ul>
      <li>Connected account tokens and identifiers required to publish posts on your behalf.</li>
      <li>Content you create in the app (captions, titles, scheduling metadata).</li>
      <li>Media URLs you upload for publishing (images/videos).</li>
    </ul>

    <h2>How we use information</h2>
    <ul>
      <li>To authenticate your connected accounts and publish the content you request.</li>
      <li>To display publishing history and troubleshoot publishing failures.</li>
    </ul>

    <h2>Sharing</h2>
    <p>
      We do not sell your data. We share data only with service providers needed to operate the product
      (for example hosting/storage) and with the social networks you choose to publish to.
    </p>

    <h2>Data retention</h2>
    <p>
      You can disconnect social accounts at any time from the app Settings. You can also request deletion of
      stored data as described on our data deletion page.
    </p>

    <h2>Contact</h2>
    <p>
      For privacy questions or deletion requests, contact:
      <a href="mailto:alexmichaelides1987@gmail.com">alexmichaelides1987@gmail.com</a>
    </p>

    <p>
      <a href="/data-deletion">Data deletion instructions</a>
    </p>
  </body>
</html>`);
});

app.get('/data-deletion', (_req: Request, res: Response) => {
  res
    .status(200)
    .type('html')
    .send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Data Deletion - Content Flow</title>
  </head>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; padding: 24px; max-width: 900px;">
    <h1>Data Deletion Instructions</h1>
    <p><strong>Product:</strong> Content Flow (Do Socials)</p>

    <h2>Disconnect from the app</h2>
    <ol>
      <li>Open Content Flow.</li>
      <li>Go to <strong>Settings</strong>.</li>
      <li>Under Facebook Pages, click <strong>Disconnect</strong>.</li>
    </ol>
    <p>
      Disconnecting removes the stored Facebook and Instagram tokens from our database and prevents future posting.
    </p>

    <h2>Request full deletion</h2>
    <p>
      Email <a href="mailto:alexmichaelides1987@gmail.com">alexmichaelides1987@gmail.com</a> with:
    </p>
    <ul>
      <li>The Facebook Page ID and/or Instagram Business Account ID used in the integration</li>
      <li>The email address associated with your Meta account (if applicable)</li>
      <li>The words: "Content Flow data deletion request"</li>
    </ul>

    <h2>What will be deleted</h2>
    <ul>
      <li>Connected account tokens and identifiers stored by Content Flow</li>
      <li>Content items and scheduling records stored in Content Flow (upon request)</li>
    </ul>

    <p>
      <a href="/privacy">Privacy policy</a>
    </p>
  </body>
</html>`);
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


