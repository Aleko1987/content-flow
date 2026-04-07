import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { postedVideos } from '../db/schema.js';
import { logger } from '../utils/logger.js';
import { parseVideoFilename } from './filename-parser.js';

type RecordPostedVideoInput = {
  contentItemId?: string | null;
  publishTaskId?: string | null;
  filename: string;
  platform: string;
  postedAt?: Date;
  status?: string;
  externalPostId?: string | null;
};

type ListPostedVideosFilters = {
  platform?: string;
  days?: number;
  hook?: number;
  meat?: number;
  cta?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 50;

const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const getDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export const recordPostedVideo = async (input: RecordPostedVideoInput) => {
  const parsed = parseVideoFilename(input.filename);
  if (!parsed) {
    logger.warn('Filename does not match video naming convention; storing unparsed', {
      filename: input.filename,
      platform: input.platform,
    });
  }

  try {
    const [inserted] = await db.insert(postedVideos).values({
      id: generateId(),
      contentItemId: input.contentItemId ?? null,
      publishTaskId: input.publishTaskId ?? null,
      filename: input.filename,
      hookNumber: parsed?.hookNumber ?? null,
      meatNumber: parsed?.meatNumber ?? null,
      ctaNumber: parsed?.ctaNumber ?? null,
      variant: parsed?.variant ?? null,
      platform: input.platform,
      postedAt: input.postedAt ?? new Date(),
      status: input.status ?? 'success',
      externalPostId: input.externalPostId ?? null,
      createdAt: new Date(),
    }).returning();

    return inserted;
  } catch (error) {
    logger.warn('Failed to write posted_videos history row', {
      filename: input.filename,
      platform: input.platform,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const listPostedVideos = async (filters: ListPostedVideosFilters) => {
  const conditions = [];

  if (filters.platform) {
    conditions.push(eq(postedVideos.platform, filters.platform));
  }
  if (typeof filters.hook === 'number') {
    conditions.push(eq(postedVideos.hookNumber, filters.hook));
  }
  if (typeof filters.meat === 'number') {
    conditions.push(eq(postedVideos.meatNumber, filters.meat));
  }
  if (typeof filters.cta === 'number') {
    conditions.push(eq(postedVideos.ctaNumber, filters.cta));
  }
  if (typeof filters.days === 'number' && filters.days > 0) {
    conditions.push(gte(postedVideos.postedAt, getDaysAgo(filters.days)));
  }

  let query = db.select().from(postedVideos);
  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  const limit = Math.max(1, Math.min(filters.limit ?? DEFAULT_LIMIT, 200));
  return query.orderBy(desc(postedVideos.postedAt)).limit(limit);
};

export const getPostedVideosSummary = async () => {
  const since = getDaysAgo(30);

  const [totals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postedVideos)
    .where(gte(postedVideos.postedAt, since));

  const hookUsageLast30Days = await db
    .select({
      hookNumber: postedVideos.hookNumber,
      count: sql<number>`count(*)::int`,
    })
    .from(postedVideos)
    .where(and(gte(postedVideos.postedAt, since), sql`${postedVideos.hookNumber} IS NOT NULL`))
    .groupBy(postedVideos.hookNumber)
    .orderBy(desc(sql`count(*)`));

  const meatUsageLast30Days = await db
    .select({
      meatNumber: postedVideos.meatNumber,
      count: sql<number>`count(*)::int`,
    })
    .from(postedVideos)
    .where(and(gte(postedVideos.postedAt, since), sql`${postedVideos.meatNumber} IS NOT NULL`))
    .groupBy(postedVideos.meatNumber)
    .orderBy(desc(sql`count(*)`));

  const ctaUsageLast30Days = await db
    .select({
      ctaNumber: postedVideos.ctaNumber,
      count: sql<number>`count(*)::int`,
    })
    .from(postedVideos)
    .where(and(gte(postedVideos.postedAt, since), sql`${postedVideos.ctaNumber} IS NOT NULL`))
    .groupBy(postedVideos.ctaNumber)
    .orderBy(desc(sql`count(*)`));

  const recentCombos = await db
    .select({
      filename: postedVideos.filename,
      platform: postedVideos.platform,
      postedAt: postedVideos.postedAt,
    })
    .from(postedVideos)
    .orderBy(desc(postedVideos.postedAt))
    .limit(20);

  return {
    totalPostedLast30Days: totals?.count ?? 0,
    hookUsageLast30Days: hookUsageLast30Days
      .filter((row) => row.hookNumber !== null)
      .map((row) => ({ hookNumber: row.hookNumber as number, count: row.count })),
    meatUsageLast30Days: meatUsageLast30Days
      .filter((row) => row.meatNumber !== null)
      .map((row) => ({ meatNumber: row.meatNumber as number, count: row.count })),
    ctaUsageLast30Days: ctaUsageLast30Days
      .filter((row) => row.ctaNumber !== null)
      .map((row) => ({ ctaNumber: row.ctaNumber as number, count: row.count })),
    recentCombos,
  };
};

export const hasExactFilenameBeenPosted = async (filename: string) => {
  const existing = await db
    .select({ id: postedVideos.id })
    .from(postedVideos)
    .where(eq(postedVideos.filename, filename))
    .limit(1);
  return existing.length > 0;
};

export const getHookUsageLast30Days = async (hookNumber: number) => {
  const since = getDaysAgo(30);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(postedVideos)
    .where(and(eq(postedVideos.hookNumber, hookNumber), gte(postedVideos.postedAt, since)));
  return row?.count ?? 0;
};

export const getLastPostedForMeat = async (meatNumber: number) => {
  const [row] = await db
    .select()
    .from(postedVideos)
    .where(eq(postedVideos.meatNumber, meatNumber))
    .orderBy(desc(postedVideos.postedAt))
    .limit(1);
  return row ?? null;
};

export const getLastPostedForCombo = async (
  hookNumber: number,
  meatNumber: number,
  ctaNumber: number
) => {
  const [row] = await db
    .select()
    .from(postedVideos)
    .where(and(
      eq(postedVideos.hookNumber, hookNumber),
      eq(postedVideos.meatNumber, meatNumber),
      eq(postedVideos.ctaNumber, ctaNumber),
    ))
    .orderBy(desc(postedVideos.postedAt))
    .limit(1);
  return row ?? null;
};
