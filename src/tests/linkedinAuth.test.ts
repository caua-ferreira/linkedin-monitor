import { describe, it, expect } from 'vitest';
import {
  buildAuthorizationUrl,
  isTokenExpired,
  exchangeCodeForTokens,
  getMemberUrn,
  SCOPES,
} from '../linkedin/linkedinAuth.js';

describe('buildAuthorizationUrl', () => {
  it('inclui client_id, redirect_uri, state e scopes', () => {
    const url = new URL(buildAuthorizationUrl('client123', 'http://localhost:3000/cb', 'state-abc'));
    expect(url.hostname).toBe('www.linkedin.com');
    expect(url.searchParams.get('client_id')).toBe('client123');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/cb');
    expect(url.searchParams.get('state')).toBe('state-abc');
    expect(url.searchParams.get('response_type')).toBe('code');
    const scope = url.searchParams.get('scope')!;
    for (const s of SCOPES) expect(scope).toContain(s);
  });
});

describe('isTokenExpired', () => {
  it('retorna true para token já expirado', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isTokenExpired(past)).toBe(true);
  });
  it('retorna true para token que expira dentro da margem', () => {
    const soon = new Date(Date.now() + 4 * 60_000).toISOString(); // 4 min
    expect(isTokenExpired(soon)).toBe(true);
  });
  it('retorna false para token válido com folga', () => {
    const future = new Date(Date.now() + 30 * 60_000).toISOString();
    expect(isTokenExpired(future)).toBe(false);
  });
});

describe('exchangeCodeForTokens', () => {
  it('parseia resposta válida do LinkedIn', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200,
      json: async () => ({
        access_token: 'tok_abc',
        expires_in: 5183944,
        refresh_token: 'ref_xyz',
        refresh_token_expires_in: 31536000,
        scope: 'openid profile email w_member_social',
      }),
    } as Response);

    const result = await exchangeCodeForTokens('code123', {
      clientId: 'cid', clientSecret: 'csec', redirectUri: 'http://localhost/cb',
      fetch: mockFetch,
    });

    expect(result.accessToken).toBe('tok_abc');
    expect(result.refreshToken).toBe('ref_xyz');
    expect(result.authorizedScopes).toContain('w_member_social');
    expect(new Date(result.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('lança erro em resposta HTTP não-ok', async () => {
    const mockFetch = async () => ({ ok: false, status: 400 } as Response);
    await expect(exchangeCodeForTokens('code', {
      clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost/cb',
      fetch: mockFetch,
    })).rejects.toThrow('LINKEDIN_TOKEN_HTTP_400');
  });

  it('lança erro em resposta sem access_token', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ error: 'invalid_grant' }),
    } as Response);
    await expect(exchangeCodeForTokens('code', {
      clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost/cb',
      fetch: mockFetch,
    })).rejects.toThrow('LINKEDIN_TOKEN_INVALID_RESPONSE');
  });
});

describe('getMemberUrn', () => {
  it('retorna URN a partir do sub do userinfo', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ sub: 'abc123', name: 'Test' }),
    } as Response);
    const urn = await getMemberUrn('token', mockFetch);
    expect(urn).toBe('urn:li:person:abc123');
  });

  it('lança erro sem campo sub', async () => {
    const mockFetch = async () => ({
      ok: true, status: 200,
      json: async () => ({ name: 'Test' }),
    } as Response);
    await expect(getMemberUrn('token', mockFetch)).rejects.toThrow('LINKEDIN_USERINFO_NO_SUB');
  });
});
