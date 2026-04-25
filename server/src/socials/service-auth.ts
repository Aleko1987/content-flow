import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const getHeaderValue = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) {
    return String(value[0] || '').trim();
  }
  return String(value || '').trim();
};

const safeCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const verifyBearer = (req: Request): boolean => {
  const expected = (process.env.DO_SOCIALS_AUTH_BEARER_TOKEN || '').trim();
  if (!expected) return false;
  const authHeader = getHeaderValue(req.headers.authorization);
  if (!authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice('Bearer '.length).trim();
  return provided.length > 0 && safeCompare(provided, expected);
};

const verifyHmac = (req: Request): boolean => {
  const secret = (process.env.DO_SOCIALS_AUTH_HMAC_SECRET || '').trim();
  if (!secret) return false;

  const signatureHeader = getHeaderValue(req.headers['x-content-flow-signature']);
  const timestampHeader = getHeaderValue(req.headers['x-content-flow-timestamp']);
  if (!signatureHeader || !timestampHeader) return false;

  const timestampMs = Number(timestampHeader);
  if (!Number.isFinite(timestampMs)) return false;
  if (Math.abs(Date.now() - timestampMs) > FIVE_MINUTES_MS) return false;

  const body = JSON.stringify(req.body ?? {});
  const expectedDigest = createHmac('sha256', secret).update(`${timestampHeader}.${body}`).digest('hex');
  const providedDigest = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length).trim()
    : signatureHeader;

  if (!providedDigest) return false;
  return safeCompare(providedDigest, expectedDigest);
};

export const requireServiceAuth: RequestHandler = (req, res, next) => {
  const authorized = verifyBearer(req) || verifyHmac(req);
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized service request' });
  }
  return next();
};
