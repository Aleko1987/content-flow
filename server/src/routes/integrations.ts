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
  codeVerifier?: string;
  provider: 'x' | 'instagram';
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
    { provider: 'instagram', status: 'disconnected' },
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
  
  // Validate required environment variables
  if (!clientId || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push('X_CLIENT_ID');
    if (!redirectUri) missing.push('X_REDIRECT_URI');
    return res.status(400).json({ 
      error: 'Missing required environment variables',
      missing: missing
    });
  }
  
  // Ensure client_id is exactly from env, nothing appended
  // Use clientId directly without any modification
  const cleanClientId = clientId.trim();
  
  // Debug log: non-secret info only
  try {
    const redirectUrl = new URL(redirectUri);
    const redirectHostPath = `${redirectUrl.host}${redirectUrl.pathname}`;
    console.log(`[X OAuth] connect/start - redirect_uri: ${redirectHostPath}, client_id length: ${cleanClientId.length}`);
  } catch (error) {
    console.log(`[X OAuth] connect/start - redirect_uri parse error, client_id length: ${cleanClientId.length}`);
  }
  
  // Generate state and PKCE
  const state = randomBytes(32).toString('base64url');
  const { codeVerifier, codeChallenge } = generatePKCE();
  
  // Store state with TTL (10 minutes)
  oauthStates.set(state, {
    state,
    codeVerifier,
    provider: 'x',
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  
  // Build authorization URL - use client_id exactly as from env
  const scopes = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cleanClientId,
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
 * GET /api/content-ops/integrations/x/debug
 * Returns non-secret config info for troubleshooting OAuth setup
 */
router.get('/x/debug', asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.X_CLIENT_ID || '';
  const redirectUri = process.env.X_REDIRECT_URI || '';
  const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  let connectedAccountsColumns: string[] | null = null;
  let connectedAccountsError: string | null = null;

  let redirectHostPath: string | null = null;
  try {
    const redirectUrl = new URL(redirectUri);
    redirectHostPath = `${redirectUrl.host}${redirectUrl.pathname}`;
  } catch {
    redirectHostPath = null;
  }

  try {
    const { db } = await import('../db/index.js');
    const result = await db.execute(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'connected_accounts'
      ORDER BY ordinal_position
    `);
    connectedAccountsColumns = (result.rows || []).map((row: any) => row.column_name);
  } catch (error) {
    connectedAccountsError = error instanceof Error ? error.message : 'unknown_error';
  }

  res.json({
    ok: true,
    app_base_url: appBaseUrl,
    client_id_length: clientId.length,
    client_id_prefix: clientId ? clientId.slice(0, 6) : null,
    redirect_uri: redirectUri,
    redirect_host_path: redirectHostPath,
    scopes: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    connected_accounts_columns: connectedAccountsColumns,
    connected_accounts_error: connectedAccountsError,
  });
}));

/**
 * GET /api/content-ops/integrations/x/connect/callback
 * Handles OAuth callback from X
 */
router.get('/x/connect/callback', asyncHandler(async (req: Request, res: Response) => {
  const { state, code, error } = req.query;
  
  // Helper to get app base URL without trailing slash
  const getAppBaseUrl = () => {
    const url = process.env.APP_BASE_URL || 'http://localhost:8080';
    return url.replace(/\/+$/, ''); // Remove trailing slashes
  };
  
  // Redirect to settings tab (which exists) instead of /integrations (which doesn't)
  const buildRedirectUrl = (success: boolean, errorMsg?: string) => {
    const base = getAppBaseUrl();
    const params = new URLSearchParams({
      provider: 'x',
      success: success ? '1' : '0',
    });
    if (errorMsg) {
      params.set('error', errorMsg);
    }
    // Redirect to /?tab=settings which exists, with query params for the integration result
    return `${base}/?tab=settings&${params.toString()}`;
  };
  
  if (error) {
    return res.redirect(buildRedirectUrl(false, error as string));
  }
  
  if (!state || !code) {
    return res.redirect(buildRedirectUrl(false, 'missing_params'));
  }
  
  // Validate state
  const stateData = oauthStates.get(state as string);
  if (!stateData || stateData.expiresAt < Date.now()) {
    console.log(`[X OAuth] callback - invalid_state, state exists: ${oauthStates.has(state as string)}, expired: ${stateData ? stateData.expiresAt < Date.now() : 'N/A'}`);
    return res.redirect(buildRedirectUrl(false, 'invalid_state'));
  }
  
  // Remove state from memory
  oauthStates.delete(state as string);
  
  if (stateData.provider !== 'x') {
    return res.redirect(buildRedirectUrl(false, 'invalid_provider'));
  }

  // Exchange code for tokens
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;
  
  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(buildRedirectUrl(false, 'config_missing'));
  }
  
  // Ensure client_id is exactly from env, nothing appended
  const cleanClientId = clientId.trim();
  
  console.log(`[X OAuth] callback - exchanging code for tokens, client_id length: ${cleanClientId.length}`);
  
  try {
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${cleanClientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code: code as string,
        grant_type: 'authorization_code',
        client_id: cleanClientId,
        redirect_uri: redirectUri,
        code_verifier: stateData.codeVerifier || '',
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.log(`[X OAuth] callback - token exchange failed: ${tokenResponse.status} - ${errorText}`);
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json() as TokenData;
    
    console.log(`[X OAuth] callback - token exchange successful, has refresh_token: ${!!tokenData.refresh_token}`);
    
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
    
    console.log(`[X OAuth] callback - account stored successfully`);
    
    res.redirect(buildRedirectUrl(true));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown_error';
    console.log(`[X OAuth] callback - error: ${errorMsg}`);
    res.redirect(buildRedirectUrl(false, errorMsg));
  }
}));

/**
 * POST /api/content-ops/integrations/instagram/connect/start
 * Initiates Facebook OAuth flow for Instagram Graph API
 */
router.post('/instagram/connect/start', asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.IG_CLIENT_ID;
  const redirectUri = process.env.IG_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    const missing = [];
    if (!clientId) missing.push('IG_CLIENT_ID');
    if (!redirectUri) missing.push('IG_REDIRECT_URI');
    return res.status(400).json({
      error: 'Missing required environment variables',
      missing,
    });
  }

  const state = randomBytes(32).toString('base64url');
  oauthStates.set(state, {
    state,
    provider: 'instagram',
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  const scopes = [
    'instagram_basic',
    'instagram_content_publish',
    'pages_show_list',
    'pages_read_engagement',
  ];

  const params = new URLSearchParams({
    client_id: clientId.trim(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(','),
    state,
    // Force re-consent so newly added page permissions are actually granted.
    auth_type: 'rerequest',
  });

  const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  res.json({ url: authUrl });
}));

/**
 * GET /api/content-ops/integrations/instagram/connect/callback
 * Handles OAuth callback from Facebook for Instagram
 */
router.get('/instagram/connect/callback', asyncHandler(async (req: Request, res: Response) => {
  const { state, code, error } = req.query;

  const getAppBaseUrl = () => {
    const url = process.env.APP_BASE_URL || 'http://localhost:8080';
    return url.replace(/\/+$/, '');
  };

  const buildRedirectUrl = (success: boolean, errorMsg?: string) => {
    const base = getAppBaseUrl();
    const params = new URLSearchParams({
      provider: 'instagram',
      success: success ? '1' : '0',
    });
    if (errorMsg) {
      params.set('error', errorMsg);
    }
    return `${base}/?tab=settings&${params.toString()}`;
  };

  if (error) {
    return res.redirect(buildRedirectUrl(false, error as string));
  }

  if (!state || !code) {
    return res.redirect(buildRedirectUrl(false, 'missing_params'));
  }

  const stateData = oauthStates.get(state as string);
  if (!stateData || stateData.expiresAt < Date.now()) {
    return res.redirect(buildRedirectUrl(false, 'invalid_state'));
  }

  if (stateData.provider !== 'instagram') {
    return res.redirect(buildRedirectUrl(false, 'invalid_provider'));
  }

  oauthStates.delete(state as string);

  const clientId = process.env.IG_CLIENT_ID;
  const clientSecret = process.env.IG_CLIENT_SECRET;
  const redirectUri = process.env.IG_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return res.redirect(buildRedirectUrl(false, 'config_missing'));
  }

  const graphBase = 'https://graph.facebook.com/v19.0';

  try {
    const tokenParams = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      client_secret: clientSecret,
      code: code as string,
    });

    const tokenResponse = await fetch(`${graphBase}/oauth/access_token?${tokenParams.toString()}`);
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorText}`);
    }

    const shortToken = await tokenResponse.json() as { access_token: string; expires_in?: number };
    if (!shortToken.access_token) {
      throw new Error('Token exchange failed: missing access_token');
    }

    const longParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: clientId.trim(),
      client_secret: clientSecret,
      fb_exchange_token: shortToken.access_token,
    });

    const longResponse = await fetch(`${graphBase}/oauth/access_token?${longParams.toString()}`);
    if (!longResponse.ok) {
      const errorText = await longResponse.text();
      throw new Error(`Long-lived token exchange failed: ${longResponse.status} - ${errorText}`);
    }

    const longToken = await longResponse.json() as { access_token: string; expires_in?: number };
    const longAccessToken = longToken.access_token;
    if (!longAccessToken) {
      throw new Error('Long-lived token exchange failed: missing access_token');
    }

    const appToken = `${clientId.trim()}|${clientSecret}`;
    const debugResponse = await fetch(
      `${graphBase}/debug_token?input_token=${encodeURIComponent(longAccessToken)}&access_token=${encodeURIComponent(appToken)}`
    );
    const debugData = debugResponse.ok
      ? await debugResponse.json() as {
          data?: {
            scopes?: string[];
            granular_scopes?: Array<{ scope?: string; target_ids?: string[] }>;
          };
        }
      : null;
    if (debugData) {
      console.log('[Instagram OAuth] debug_token user_id:', debugData?.data?.user_id);
      console.log('[Instagram OAuth] debug_token scopes:', debugData?.data?.scopes);
      console.log('[Instagram OAuth] debug_token granular_scopes:', debugData?.data?.granular_scopes);
    }

    const meResponse = await fetch(
      `${graphBase}/me?fields=id,name&access_token=${encodeURIComponent(longAccessToken)}`
    );
    const meData = meResponse.ok
      ? await meResponse.json() as { id?: string; name?: string }
      : null;
    if (meData) {
      console.log('[Instagram OAuth] me:', meData);
    }

    const pagesResponse = await fetch(`${graphBase}/me/accounts?access_token=${encodeURIComponent(longAccessToken)}`);
    if (!pagesResponse.ok) {
      const errorText = await pagesResponse.text();
      throw new Error(`Failed to list pages: ${pagesResponse.status} - ${errorText}`);
    }

    const pagesData = await pagesResponse.json() as { data?: Array<{ id: string; access_token?: string; name?: string; tasks?: string[] }> };
    console.log('[Instagram OAuth] pages response:', pagesData);
    const pages = Array.isArray(pagesData.data) ? pagesData.data : [];
    if (pages.length === 0) {
      const scopes = Array.isArray(debugData?.data?.scopes) ? debugData.data.scopes.join(',') : 'unknown';
      const userId = typeof debugData?.data?.user_id === 'string' ? debugData.data.user_id : (meData?.id || 'unknown');
      const userName = meData?.name || 'unknown';
      throw new Error(`No Facebook pages found for this account (user_id: ${userId}, user_name: ${userName}, scopes: ${scopes})`);
    }

    let igUserId: string | null = null;
    let pageAccessToken: string | null = null;
    let pageId: string | null = null;

    for (const page of pages) {
      const candidateToken = page.access_token || longAccessToken;
      const igResponse = await fetch(`${graphBase}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(candidateToken)}`);
      if (!igResponse.ok) {
        continue;
      }
      const igData = await igResponse.json() as { instagram_business_account?: { id?: string } };
      if (igData.instagram_business_account?.id) {
        igUserId = igData.instagram_business_account.id;
        pageAccessToken = candidateToken;
        pageId = page.id;
        break;
      }
    }

    if (!igUserId || !pageAccessToken) {
      throw new Error('No Instagram business account linked to available pages');
    }

    const expiresAt = longToken.expires_in
      ? Date.now() + (typeof longToken.expires_in === 'number' ? longToken.expires_in : 0) * 1000
      : undefined;

    const { upsertConnectedAccount } = await import('../db/connectedAccounts.js');
    await upsertConnectedAccount(
      'instagram',
      {
        access_token: pageAccessToken,
        ig_user_id: igUserId,
        page_id: pageId,
        expires_at: expiresAt,
      },
      {
        expires_at: expiresAt,
        page_id: pageId,
      },
      null,
      'connected',
      igUserId
    );

    res.redirect(buildRedirectUrl(true));
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'unknown_error';
    res.redirect(buildRedirectUrl(false, errorMsg));
  }
}));

export default router;

