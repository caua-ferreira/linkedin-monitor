import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../storage/database.js';
import type { Client } from '@libsql/client';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { PostScheduler } from '../scheduling/postScheduler.js';
import { silentLogger, post, json } from './helpers.js';
import type { NotionRepository } from '../notion/notionRepository.js';
import type { NotionClient } from '../notion/notionClient.js';

async function insertQueued(pubRepo: PublicationRepository, notionPageId: string, scheduledAt: string): Promise<string> {
  const id = randomUUID();
  await pubRepo.insert({
    id, notion_page_id: notionPageId,
    idempotency_key: `${notionPageId}:${scheduledAt}`,
    operational_state: 'queued', scheduled_at: scheduledAt,
    linkedin_post_urn: null, linkedin_post_url: null, published_at: null, error_code: null,
  });
  return id;
}

async function makeTokenRepo(db: Client): Promise<TokenRepository> {
  const repo = new TokenRepository(db);
  await repo.save({
    member_urn: 'urn:li:person:test',
    access_token: 'valid-token',
    access_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    refresh_token: null,
    refresh_token_expires_at: null,
    authorized_scopes: 'w_member_social',
  });
  return repo;
}

const oauthConfig = { clientId: 'c', clientSecret: 's', redirectUri: 'http://localhost/cb' };

describe('PostScheduler', () => {
  it('publica post com scheduled_at no passado', async () => {
    const db = await openDatabase(':memory:');
    const pubRepo = new PublicationRepository(db);
    const p = post();
    const scheduledAt = new Date(Date.now() - 60_000).toISOString();
    await insertQueued(pubRepo, p.id, scheduledAt);

    const notionMock: NotionClient = {
      getPage: vi.fn().mockResolvedValue({
        object: 'page', id: p.id, archived: false,
        properties: { 'Scheduler ID': { type: 'rich_text', rich_text: [] } },
      }),
      updateProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotionClient;

    const repoMock: NotionRepository = {
      getPostById: vi.fn().mockResolvedValue(p),
    } as unknown as NotionRepository;

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      json({ }, 201, { 'x-restli-id': 'urn:li:share:12345' }),
    );

    const scheduler = new PostScheduler(
      repoMock, pubRepo, await makeTokenRepo(db), notionMock, oauthConfig, '202501', silentLogger, mockFetch,
    );

    const result = await scheduler.publishDuePosts();

    expect(result.published).toBe(1);
    expect(result.errors).toBe(0);
    const pubs = await pubRepo.findPublished();
    expect(pubs).toHaveLength(1);
    expect(pubs[0]!.linkedin_post_urn).toBe('urn:li:share:12345');
    db.close();
  });

  it('não publica post com scheduled_at no futuro', async () => {
    const db = await openDatabase(':memory:');
    const pubRepo = new PublicationRepository(db);
    const p = post();
    const futureAt = new Date(Date.now() + 3_600_000).toISOString();
    await insertQueued(pubRepo, p.id, futureAt);

    const scheduler = new PostScheduler(
      { getPostById: vi.fn() } as unknown as NotionRepository,
      pubRepo, await makeTokenRepo(db),
      {} as NotionClient, oauthConfig, '202501', silentLogger,
    );

    const result = await scheduler.publishDuePosts();

    expect(result.published).toBe(0);
    expect(result.skipped).toBe(0);
    db.close();
  });

  it('marca failed e continua se LinkedIn retornar erro não-ambíguo', async () => {
    const db = await openDatabase(':memory:');
    const pubRepo = new PublicationRepository(db);
    const p = post();
    const scheduledAt = new Date(Date.now() - 60_000).toISOString();
    await insertQueued(pubRepo, p.id, scheduledAt);

    const notionMock: NotionClient = {
      getPage: vi.fn().mockResolvedValue({
        object: 'page', id: p.id, archived: false,
        properties: { 'Scheduler ID': { type: 'rich_text', rich_text: [] } },
      }),
      updateProperties: vi.fn().mockResolvedValue(undefined),
    } as unknown as NotionClient;

    const repoMock: NotionRepository = {
      getPostById: vi.fn().mockResolvedValue(p),
    } as unknown as NotionRepository;

    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(json({}, 400));

    const scheduler = new PostScheduler(
      repoMock, pubRepo, await makeTokenRepo(db), notionMock, oauthConfig, '202501', silentLogger, mockFetch,
    );

    const result = await scheduler.publishDuePosts();

    expect(result.errors).toBe(1);
    expect(result.published).toBe(0);
    const all = await pubRepo.findAll();
    expect(all[0]!.operational_state).toBe('failed');
    db.close();
  });
});
