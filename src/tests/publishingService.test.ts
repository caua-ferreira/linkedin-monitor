import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../storage/schema.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { publishPost } from '../publishing/publishingService.js';
import { silentLogger, post } from './helpers.js';

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  return db;
}

const oauthConfig = { clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost/cb' };
const apiVersion = '202501';

function tokenRepo(db: DatabaseSync): TokenRepository {
  const repo = new TokenRepository(db);
  repo.save({
    member_urn: 'urn:li:person:test',
    access_token: 'valid-token',
    access_token_expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    refresh_token: null,
    refresh_token_expires_at: null,
    authorized_scopes: 'openid profile email w_member_social',
  });
  return repo;
}

const notionMock = {
  getPage: vi.fn().mockResolvedValue({
    object: 'page', id: 'test-id', archived: false,
    properties: { 'Scheduler ID': { type: 'rich_text', rich_text: [] } },
  }),
  updateProperties: vi.fn().mockResolvedValue(undefined),
} as unknown as import('../notion/notionClient.js').NotionClient;

describe('publishPost — DRY RUN', () => {
  it('retorna prévia sem chamar LinkedIn', async () => {
    const db = makeDb();
    const result = await publishPost(post(), {
      dryRun: true,
      tokenRepo: tokenRepo(db),
      publicationRepo: new PublicationRepository(db),
      notion: notionMock,
      oauthConfig,
      apiVersion,
      logger: silentLogger,
    });
    expect(result.dryRun).toBe(true);
    if (result.dryRun) {
      expect(result.scheduledAt).toContain('2026-10-02');
      expect(result.previewText).toBeTruthy();
    }
    db.close();
  });
});

describe('publishPost — LIVE', () => {
  it('publica, persiste URN e atualiza Notion', async () => {
    const db = makeDb();
    const mockFetch = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v2/userinfo')) {
        return { ok: true, status: 200, json: async () => ({ sub: 'test-sub' }) } as Response;
      }
      if (url.includes('/rest/posts')) {
        return {
          ok: true, status: 201,
          headers: new Headers({ 'x-restli-id': 'urn:li:share:123456' }),
          json: async () => ({}),
        } as Response;
      }
      return { ok: false, status: 500 } as Response;
    };

    const result = await publishPost(post(), {
      dryRun: false,
      tokenRepo: tokenRepo(db),
      publicationRepo: new PublicationRepository(db),
      notion: notionMock,
      oauthConfig,
      apiVersion,
      logger: silentLogger,
      fetch: mockFetch,
    });

    expect(result.dryRun).toBe(false);
    if (!result.dryRun) {
      expect(result.postUrn).toBe('urn:li:share:123456');
      expect(result.publishedAt).toBeTruthy();
    }

    // URN deve estar salvo no SQLite
    const pub = new PublicationRepository(db).findByNotionPageId(post().id);
    expect(pub?.linkedin_post_urn).toBe('urn:li:share:123456');
    expect(pub?.operational_state).toBe('published');
    db.close();
  });

  it('bloqueia sem token armazenado', async () => {
    const db = makeDb();
    await expect(publishPost(post(), {
      dryRun: false,
      tokenRepo: new TokenRepository(db),
      publicationRepo: new PublicationRepository(db),
      notion: notionMock,
      oauthConfig,
      apiVersion,
      logger: silentLogger,
    })).rejects.toThrow('LINKEDIN_NOT_AUTHENTICATED');
    db.close();
  });

  it('bloqueia post já tentado pela mesma chave de idempotência', async () => {
    const db = makeDb();
    const pubRepo = new PublicationRepository(db);
    pubRepo.insert({
      id: 'existing',
      notion_page_id: post().id,
      idempotency_key: `${post().id}:2026-10-02T15:20:00.000Z`,
      operational_state: 'published',
      scheduled_at: '2026-10-02T15:20:00.000Z',
      linkedin_post_urn: 'urn:li:share:already',
      linkedin_post_url: null,
      published_at: '2026-10-02T15:20:01.000Z',
      error_code: null,
    });

    await expect(publishPost(post(), {
      dryRun: false,
      tokenRepo: tokenRepo(db),
      publicationRepo: pubRepo,
      notion: notionMock,
      oauthConfig,
      apiVersion,
      logger: silentLogger,
    })).rejects.toThrow('PUBLISH_ALREADY_ATTEMPTED');
    db.close();
  });
});
