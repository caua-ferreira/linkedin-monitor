import { describe, it, expect } from 'vitest';
import { LinkedInClient } from '../linkedin/linkedinClient.js';
import { createTextPost } from '../linkedin/linkedinPosts.js';

function mockClient(responseBuilder: () => Response): LinkedInClient {
  return new LinkedInClient({
    accessToken: 'test-token',
    apiVersion: '202501',
    fetch: async () => responseBuilder(),
    wait: async () => {},
  });
}

describe('createTextPost', () => {
  it('retorna URN do header X-RestLi-Id', async () => {
    const client = mockClient(() => ({
      ok: true, status: 201,
      headers: new Headers({ 'x-restli-id': 'urn:li:share:999888777' }),
      json: async () => ({}),
    } as Response));

    const result = await createTextPost(
      { memberUrn: 'urn:li:person:abc', text: 'Olá LinkedIn!' },
      client,
    );
    expect(result.postUrn).toBe('urn:li:share:999888777');
    expect(result.postUrl).toContain('urn:li:share:999888777');
  });

  it('lança LINKEDIN_POST_NO_URN quando header ausente', async () => {
    const client = mockClient(() => ({
      ok: true, status: 201,
      headers: new Headers({}),
      json: async () => ({}),
    } as Response));

    await expect(createTextPost(
      { memberUrn: 'urn:li:person:abc', text: 'Teste' },
      client,
    )).rejects.toThrow('LINKEDIN_POST_NO_URN');
  });

  it('lança erro em resposta HTTP não-ok', async () => {
    const client = mockClient(() => ({
      ok: false, status: 422,
      headers: new Headers({}),
    } as Response));

    await expect(createTextPost(
      { memberUrn: 'urn:li:person:abc', text: 'Teste' },
      client,
    )).rejects.toThrow('LINKEDIN_HTTP_422');
  });
});
