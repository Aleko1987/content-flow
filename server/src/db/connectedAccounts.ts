import { db } from './index.js';
import { connectedAccounts } from './schema.js';
import { eq, sql } from 'drizzle-orm';
import { encrypt, decrypt } from '../utils/crypto.js';

let ensureConnectedAccountsPromise: Promise<void> | null = null;

async function ensureConnectedAccountsTable() {
  if (!ensureConnectedAccountsPromise) {
    ensureConnectedAccountsPromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS connected_accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider TEXT NOT NULL,
          label TEXT,
          status TEXT NOT NULL DEFAULT 'connected',
          account_ref TEXT,
          token_ciphertext TEXT NOT NULL,
          token_meta JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_connected_accounts_provider
        ON connected_accounts (provider)
      `);
    })().catch((error) => {
      ensureConnectedAccountsPromise = null;
      throw error;
    });
  }
  await ensureConnectedAccountsPromise;
}

// Generate UUID
const generateId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export type ConnectedAccountStatus = 'connected' | 'revoked' | 'error';

export type TokenData = Record<string, unknown> & {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

export interface TokenMeta {
  expires_at?: number;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Get connected account for a provider
 */
export async function getConnectedAccount(provider: string) {
  await ensureConnectedAccountsTable();
  const accounts = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.provider, provider))
    .limit(1);
  
  if (accounts.length === 0) {
    return null;
  }
  
  const account = accounts[0];
  
  // Decrypt token
  let tokenData: TokenData;
  try {
    const decrypted = decrypt(account.tokenCiphertext);
    tokenData = JSON.parse(decrypted);
  } catch (error) {
    throw new Error(`Failed to decrypt token for provider ${provider}: ${error}`);
  }
  
  return {
    ...account,
    tokenData,
  };
}

/**
 * Upsert connected account (insert or update)
 */
export async function upsertConnectedAccount(
  provider: string,
  tokenData: TokenData,
  tokenMeta: TokenMeta | null = null,
  label: string | null = null,
  status: ConnectedAccountStatus = 'connected',
  accountRef: string | null = null
) {
  await ensureConnectedAccountsTable();
  // Encrypt token
  const tokenCiphertext = encrypt(JSON.stringify(tokenData));
  
  // Check if account exists
  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(eq(connectedAccounts.provider, provider))
    .limit(1);
  
  if (existing.length > 0) {
    // Update existing
    const updated = await db
      .update(connectedAccounts)
      .set({
        tokenCiphertext,
        tokenMeta: tokenMeta || existing[0].tokenMeta,
        label: label ?? existing[0].label,
        status,
        accountRef: accountRef ?? existing[0].accountRef,
        updatedAt: sql`now()`,
      })
      .where(eq(connectedAccounts.provider, provider))
      .returning();
    
    return updated[0];
  } else {
    // Insert new
    const inserted = await db
      .insert(connectedAccounts)
      .values({
        id: generateId(),
        provider,
        tokenCiphertext,
        tokenMeta: tokenMeta || null,
        label,
        status,
        accountRef,
        createdAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .returning();
    
    return inserted[0];
  }
}

