import { Router } from 'express';
import { asyncHandler } from '../middleware/error-handler.js';
import type { Request, Response } from 'express';
import { getConnectedAccount } from '../db/connectedAccounts.js';
import { createHash, randomBytes } from 'crypto';

const router = Router();

/**
 * Token data from OAuth token response
 */
type TokenData = Record<string, unknown> & {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

// In-memory store for OAuth state (v1 - TTL 10 minutes)
interface OAuthState {
  state: string;
  codeVerifier: string;
  expiresAt: number;
}

const oauthStates = new Map<string, OAuthState>();

// Cleanup expired states every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (data.expiresAt < now) {
      oauthStates.delete(state);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // Generate code verifier (43-128 characters, URL-safe base64)
  const codeVerifier = randomBytes(32).toString('base64url');
  
  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

/**
 * GET /api/content-ops/integrations
 * Returns list of providers with connection status
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const providers: Array<{ provider: string; status: 'connected' | 'disconnected' }> = [
    { provider: 'x', status: 'disconnected' },
  ];
  
  // Check connection status for each provider
  for (const provider of providers) {
    try {
      const account = await getConnectedAccount(provider.provider);
      if (account && account.status === 'connected') {
        provider.status = 'connected';
      }
    } catch (error) {
      // If decryption fails or account not found, status remains disconnected
    }
  }
  
  res.json({ providers });
}));

/**
 * POST /api/content-ops/integrations/x/connect/start
 * Initiates OAuth2 PKCE flow for X
 */
router.post('/x/connect/start', asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push('X_CLIENT_ID');
    if (!redirectUri) missing.push('X_REDIRECT_URI');
    return res.status(400).json({ 
      error: 'Missing required environment variables',
      missing: missing
    });
  }
  
  // Generate state and PKCE
  const state = randomBytes(32).toString('base64url');
  const { codeVerifier, codeChallenge } = generatePKCE();
  
  // Store state with TTL (10 minutes)
  oauthStates.set(state, {
    state,
    codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  
  // Build authorization URL
  const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  const authUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  
  res.json({ url: authUrl });
}));

/**
 * GET /api/content-ops/integrations/x/connect/callback
 * Handles OAuth callback from X
 */
router.get('/x/connect/callback', asyncHandler(async (req: Request, res: Response) => {
  const { state, code, error } = req.query;
  
  if (error) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    return res.redirect(`${appBaseUrl}/integrations?provider=x&success=0&error=${encodeURIComponent(error as string)}`);
  }
  
  if (!state || !code) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    return res.redirect(`${appBaseUrl}/integrations?provider=x&success=0&error=missing_params`);
  }
  
  // Validate state
  const stateData = oauthStates.get(state as string);
  if (!stateData || stateData.expiresAt < Date.now()) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    return res.redirect(`${appBaseUrl}/integrations?provider=x&success=0&error=invalid_state`);
  }
  
  // Remove state from memory
  oauthStates.delete(state as string);
  
  // Exchange code for tokens
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    return res.redirect(`${appBaseUrl}/integrations?provider=x&success=0&error=config_missing`);
  }
  
  try {
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: code as string,
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: stateData.codeVerifier,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json() as TokenData;
    
    // Calculate expires_at if expires_in is provided
    const expiresAt = tokenData.expires_in
      ? Date.now() + (typeof tokenData.expires_in === 'number' ? tokenData.expires_in : 0) * 1000
      : undefined;
    
    // Store encrypted token
    const { upsertConnectedAccount } = await import('../db/connectedAccounts.js');
    await upsertConnectedAccount(
      'x',
      {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      },
      {
        expires_at: expiresAt,
        scope: tokenData.scope,
      },
      null, // label
      'connected',
      null // account_ref (can be fetched later)
    );
    
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    res.redirect(`${appBaseUrl}/integrations?provider=x&success=1`);
  } catch (error) {
    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:8080';
    const errorMsg = error instanceof Error ? error.message : 'unknown_error';
    res.redirect(`${appBaseUrl}/integrations?provider=x&success=0&error=${encodeURIComponent(errorMsg)}`);
  }
}));

export default router;

