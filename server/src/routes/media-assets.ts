import { Router } from 'express';
import { db } from '../db';
import { mediaAssets } from '../db/schema';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { eq, and, or, like, lte } from 'drizzle-orm';
import { asyncHandler } from '../middleware/error-handler';
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

// POST /api/content-ops/media-assets/presign
router.post('/presign', asyncHandler(async (req: Request, res: Response) => {
  const { filename, mime_type, size_bytes } = req.body;

  if (!filename || !mime_type) {
    return res.status(400).json({ error: 'filename and mime_type are required' });
  }

  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    return res.status(500).json({ error: 'R2_BUCKET not configured' });
  }

  // Generate object key
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const objectKey = `media/${timestamp}-${sanitizedFilename}`;

  const s3Client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mime_type,
  });

  // Generate presigned URL (valid for 1 hour)
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  // Build public URL if configured
  const publicUrl = process.env.R2_PUBLIC_BASE_URL
    ? `${process.env.R2_PUBLIC_BASE_URL}/${objectKey}`
    : null;

  res.json({
    uploadUrl,
    objectKey,
    bucket,
    publicUrl,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
}));

// POST /api/content-ops/media-assets/complete
router.post('/complete', asyncHandler(async (req: Request, res: Response) => {
  const { object_key, bucket, mime_type, size_bytes, public_url, sha256 } = req.body;

  if (!object_key || !bucket) {
    return res.status(400).json({ error: 'object_key and bucket are required' });
  }

  const newAsset = {
    id: generateId(),
    storageProvider: 'r2',
    bucket,
    objectKey: object_key,
    publicUrl: public_url || (process.env.R2_PUBLIC_BASE_URL ? `${process.env.R2_PUBLIC_BASE_URL}/${object_key}` : null),
    mimeType: mime_type || null,
    sizeBytes: size_bytes || null,
    sha256: sha256 || null,
    createdAt: new Date(),
  };

  const inserted = await db.insert(mediaAssets).values(newAsset).returning();
  res.status(201).json(inserted[0]);
}));

// GET /api/content-ops/media-assets
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { search, type, limit = '50' } = req.query;

  let query = db.select().from(mediaAssets);

  const conditions = [];

  if (search) {
    conditions.push(
      or(
        like(mediaAssets.objectKey, `%${search}%`),
        like(mediaAssets.mimeType, `%${search}%`)
      )!
    );
  }

  if (type) {
    conditions.push(like(mediaAssets.mimeType, `${type}%`));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const limitNum = parseInt(limit as string, 10);
  const assets = await query.limit(limitNum > 0 && limitNum <= 100 ? limitNum : 50);
  res.json(assets);
}));

// DELETE /api/content-ops/media-assets/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const asset = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);

  if (asset.length === 0) {
    return res.status(404).json({ error: 'Media asset not found' });
  }

  // Attempt to delete from R2 (best effort)
  try {
    const s3Client = getS3Client();
    const command = new DeleteObjectCommand({
      Bucket: asset[0].bucket,
      Key: asset[0].objectKey,
    });
    await s3Client.send(command);
  } catch (error) {
    console.warn('Failed to delete from R2:', error);
    // Continue with DB deletion even if R2 delete fails
  }

  await db.delete(mediaAssets).where(eq(mediaAssets.id, id));
  res.status(204).send();
}));

export default router;

