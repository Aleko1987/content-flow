import 'dotenv/config';
import express from 'express';
import * as dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import channelsRouter from './routes/channels';
import contentItemsRouter from './routes/content-items';
import variantsRouter from './routes/variants';
import publishTasksRouter from './routes/publish-tasks';
import publishLogsRouter from './routes/publish-logs';
import mediaAssetsRouter from './routes/media-assets';
import seedRouter from './routes/seed';
import scheduledPostsRouter from './routes/scheduled-posts';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/content-ops/channels', channelsRouter);
app.use('/api/content-ops/content-items', contentItemsRouter);
app.use('/api/content-ops/content-items', variantsRouter);
app.use('/api/content-ops/publish-tasks', publishTasksRouter);
app.use('/api/content-ops/publish-logs', publishLogsRouter);
app.use('/api/content-ops/media-assets', mediaAssetsRouter);
app.use('/api/content-ops', seedRouter);

// Scheduled Posts API (Calendar feature)
app.use('/api/scheduled-posts', scheduledPostsRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});


