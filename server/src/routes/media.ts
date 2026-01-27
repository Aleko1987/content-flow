import { Router } from 'express';
import { db } from '../db/index.js';
import { mediaAssets } from '../db/schema.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';

const router = Router();

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Initialize S3 client for R2
const getS3Client = () => {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials not configured');
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
};

// POST /api/content-ops/media/presign
router.post('/presign', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;

  // Validate body is object with filename and contentType
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const { filename, contentType } = body;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required and must be a string' });
  }

  if (!contentType || typeof contentType !== 'string') {
    return res.status(400).json({ error: 'contentType is required and must be a string' });
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    return res.status(500).json({ error: 'R2_BUCKET not configured' });
  }

  // Generate key: ${R2_PREFIX}${Date.now()}_${random}_${sanitizedFilename}
  const prefix = process.env.R2_PREFIX ?? 'content-flow/';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${prefix}${timestamp}_${random}_${sanitizedFilename}`;

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  // Generate presigned PUT URL (expires ~10 minutes = 600 seconds)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

  // Build public URL: ${R2_PUBLIC_BASE_URL}/${key} (ensure no double slashes)
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL || '';
  const publicUrl = publicBaseUrl
    ? `${publicBaseUrl.replace(/\/$/, '')}/${key.replace(/^\//, '')}`
    : null;

  res.json({
    key,
    uploadUrl,
    publicUrl,
  });
}));

// POST /api/content-ops/media
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body;

  // Validate body is object
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be an object' });
  }

  const { key, url, filename, contentType, size } = body;

  // Validate required fields
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'key is required and must be a string' });
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required and must be a string' });
  }

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'filename is required and must be a string' });
  }

  if (!contentType || typeof contentType !== 'string') {
    return res.status(400).json({ error: 'contentType is required and must be a string' });
  }

  if (size !== undefined && (typeof size !== 'number' || size < 0)) {
    return res.status(400).json({ error: 'size must be a non-negative number' });
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    return res.status(500).json({ error: 'R2_BUCKET not configured' });
  }

  // Store media record in database
  const now = new Date();
  const newMedia = {
    id: generateId(),
    storageProvider: 'r2',
    bucket,
    objectKey: key,
    publicUrl: url,
    mimeType: contentType,
    sizeBytes: size || null,
    sha256: null,
    createdAt: now,
  };

  const inserted = await db.insert(mediaAssets).values(newMedia).returning();

  // Return in the format specified
  res.status(201).json({
    id: inserted[0].id,
    key: inserted[0].objectKey,
    url: inserted[0].publicUrl,
    filename,
    contentType: inserted[0].mimeType,
    size: inserted[0].sizeBytes,
    createdAt: inserted[0].createdAt.toISOString(),
  });
}));

export default router;

