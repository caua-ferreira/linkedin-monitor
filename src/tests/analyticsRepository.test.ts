import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from '../storage/schema.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import type { AnalyticsSnapshot } from '../analytics/analyticsModels.js';

function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  return db;
}

function makeSnapshot(overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    id: 'test-id-1',
    notion_page_id: 'notion-abc',
    linkedin_post_urn: 'urn:li:share:123',
    checkpoint: '24h',
    captured_at: '2026-10-03T12:00:00.000Z',
    post_age_minutes: 1450,
    impressions: 500,
    reach: 400,
    reactions: 30,
    comments: 5,
    shares: 2,
    saves: 10,
    sends: null,
    profile_views: 8,
    followers_gained: 1,
    link_clicks: 12,
    premium_cta_clicks: null,
    source: 'linkedin_xlsx',
    raw_payload: '{"test":true}',
    created_at: '2026-10-03T12:00:00.000Z',
    ...overrides,
  };
}

describe('AnalyticsRepository', () => {
  let db: DatabaseSync;
  let repo: AnalyticsRepository;

  beforeEach(() => {
    db = makeDb();
    repo = new AnalyticsRepository(db);
  });
  afterEach(() => db.close());

  it('insere e recupera snapshot por notion_page_id', () => {
    const snap = makeSnapshot();
    repo.insert(snap);
    const found = repo.findByNotionPageId('notion-abc');
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('test-id-1');
    expect(found[0]!.impressions).toBe(500);
    expect(found[0]!.checkpoint).toBe('24h');
  });

  it('existsById retorna true após insert', () => {
    repo.insert(makeSnapshot());
    expect(repo.existsById('test-id-1')).toBe(true);
    expect(repo.existsById('outro-id')).toBe(false);
  });

  it('findAll retorna todos os snapshots', () => {
    repo.insert(makeSnapshot({ id: 'id-1', notion_page_id: 'page-1' }));
    repo.insert(makeSnapshot({ id: 'id-2', notion_page_id: 'page-2' }));
    expect(repo.findAll()).toHaveLength(2);
  });

  it('preserva valores null corretamente', () => {
    const snap = makeSnapshot({ sends: null, premium_cta_clicks: null, linkedin_post_urn: null });
    repo.insert(snap);
    const found = repo.findByNotionPageId('notion-abc')[0]!;
    expect(found.sends).toBeNull();
    expect(found.premium_cta_clicks).toBeNull();
    expect(found.linkedin_post_urn).toBeNull();
  });

  it('lança erro em id duplicado', () => {
    repo.insert(makeSnapshot());
    expect(() => repo.insert(makeSnapshot())).toThrow();
  });
});
