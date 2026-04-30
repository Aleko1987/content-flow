import { db } from './index.js';
import { instagramOwnerUserMap } from './schema.js';
import { inArray, sql } from 'drizzle-orm';

let ensureInstagramOwnerMapPromise: Promise<void> | null = null;

async function ensureInstagramOwnerMapTable() {
  if (!ensureInstagramOwnerMapPromise) {
    ensureInstagramOwnerMapPromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS instagram_owner_user_map (
          account_ref TEXT PRIMARY KEY,
          owner_user_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_instagram_owner_user_map_owner_user
        ON instagram_owner_user_map (owner_user_id)
      `);
    })().catch((error) => {
      ensureInstagramOwnerMapPromise = null;
      throw error;
    });
  }
  await ensureInstagramOwnerMapPromise;
}

const normalizeRefs = (accountRefs: string[]): string[] =>
  Array.from(
    new Set(
      accountRefs
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0)
    )
  );

export async function findOwnerUserIdByAccountRefs(accountRefs: string[]): Promise<string | null> {
  await ensureInstagramOwnerMapTable();
  const refs = normalizeRefs(accountRefs);
  if (refs.length === 0) {
    return null;
  }

  const rows = await db
    .select({
      accountRef: instagramOwnerUserMap.accountRef,
      ownerUserId: instagramOwnerUserMap.ownerUserId,
    })
    .from(instagramOwnerUserMap)
    .where(inArray(instagramOwnerUserMap.accountRef, refs));

  const byRef = new Map(rows.map((row) => [row.accountRef, row.ownerUserId]));
  for (const ref of refs) {
    const ownerUserId = byRef.get(ref);
    if (ownerUserId) {
      return ownerUserId;
    }
  }
  return null;
}
