import { z } from 'zod';
import { SafeError } from '../utils/errors.js';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}

const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';

// Scopes usados no fluxo de autorização.
// openid/profile/email: identidade via OpenID Connect.
// w_member_social: publicar posts em nome do membro.
export const SCOPES = ['openid', 'profile', 'email', 'w_member_social'] as const;

const tokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.number().optional(),
  scope: z.string().optional(),
});

export interface TokenResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
  authorizedScopes: string;
}

/** Gera a URL de autorização do LinkedIn. */
export function buildAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES.join(' '),
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

/** Troca o authorization code por tokens. */
export async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const fetcher = config.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SafeError('LINKEDIN_TOKEN_NETWORK_ERROR');
  }

  if (!response.ok) throw new SafeError(`LINKEDIN_TOKEN_HTTP_${response.status}`, response.status);
  const raw = await response.json().catch(() => { throw new SafeError('LINKEDIN_TOKEN_INVALID_JSON'); });
  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new SafeError('LINKEDIN_TOKEN_INVALID_RESPONSE');

  const d = parsed.data;
  const now = Date.now();
  return {
    accessToken: d.access_token,
    accessTokenExpiresAt: new Date(now + d.expires_in * 1000).toISOString(),
    refreshToken: d.refresh_token ?? null,
    refreshTokenExpiresAt: d.refresh_token_expires_in
      ? new Date(now + d.refresh_token_expires_in * 1000).toISOString()
      : null,
    authorizedScopes: d.scope ?? SCOPES.join(' '),
  };
}

/** Usa refresh token para obter novo access token. */
export async function refreshAccessToken(
  refreshToken: string,
  config: OAuthConfig,
): Promise<TokenResult> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const fetcher = config.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new SafeError('LINKEDIN_REFRESH_NETWORK_ERROR'); }

  if (!response.ok) throw new SafeError(`LINKEDIN_REFRESH_HTTP_${response.status}`, response.status);
  const raw = await response.json().catch(() => { throw new SafeError('LINKEDIN_REFRESH_INVALID_JSON'); });
  const parsed = tokenResponseSchema.safeParse(raw);
  if (!parsed.success) throw new SafeError('LINKEDIN_REFRESH_INVALID_RESPONSE');

  const d = parsed.data;
  const now = Date.now();
  return {
    accessToken: d.access_token,
    accessTokenExpiresAt: new Date(now + d.expires_in * 1000).toISOString(),
    refreshToken: d.refresh_token ?? refreshToken, // preserva o existente se não vier novo
    refreshTokenExpiresAt: d.refresh_token_expires_in
      ? new Date(now + d.refresh_token_expires_in * 1000).toISOString()
      : null,
    authorizedScopes: d.scope ?? SCOPES.join(' '),
  };
}

/** Obtém o URN do membro autenticado via /v2/userinfo. */
export async function getMemberUrn(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new SafeError('LINKEDIN_USERINFO_NETWORK_ERROR'); }

  if (!response.ok) throw new SafeError(`LINKEDIN_USERINFO_HTTP_${response.status}`, response.status);
  const raw = await response.json().catch(() => { throw new SafeError('LINKEDIN_USERINFO_INVALID_JSON'); });
  const parsed = z.object({ sub: z.string() }).safeParse(raw);
  if (!parsed.success) throw new SafeError('LINKEDIN_USERINFO_NO_SUB');
  return `urn:li:person:${parsed.data.sub}`;
}

/** Verifica se o access token está expirado ou expira em breve (margem de 5 min). */
export function isTokenExpired(expiresAt: string, marginMs = 5 * 60_000): boolean {
  return new Date(expiresAt).getTime() - Date.now() < marginMs;
}
