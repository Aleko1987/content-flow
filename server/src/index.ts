import express from 'express';
import * as dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/error-handler';
import { logger } from './utils/logger';
import channelsRouter from './routes/channels';
import contentItemsRouter from './routes/content-items';
import variantsRouter from './routes/variants';
import publishTasksRouter from './routes/publish-tasks';
import seedRouter from './routes/seed';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/content-ops', seedRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});


