import { db } from './index.js';
import { connectedAccounts } from './schema.js';
import { eq } from 'drizzle-orm';
import { encrypt, decrypt } from '../utils/crypto.js';

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
  // Encrypt token
  const tokenCiphertext = encrypt(JSON.stringify(tokenData));
  
  // Generate ID if needed
  const generateId = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
  
  const now = new Date();
  
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
        updatedAt: now,
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
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    
    return inserted[0];
  }
}

