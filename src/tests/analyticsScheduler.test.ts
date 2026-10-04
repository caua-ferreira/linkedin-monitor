import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { Logger } from 'pino';
import { openDatabase } from '../storage/database.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { AnalyticsScheduler } from '../scheduling/analyticsScheduler.js';

async function insertPublished(pubRepo: PublicationRepository, publishedAt: string): Promise<void> {
  const id = randomUUID();
  await pubRepo.insert({
    id, notion_page_id: randomUUID(),
    idempotency_key: `key:${randomUUID()}`,
    operational_state: 'published', scheduled_at: publishedAt,
    linkedin_post_urn: 'urn:li:share:99999',
    linkedin_post_url: 'https://linkedin.com/feed/update/urn:li:share:99999/',
    published_at: publishedAt, error_code: null,
  });
  const all = await pubRepo.findAll();
  const last = all[0]!;
  await pubRepo.updateState(last.id, 'published', {
    linkedin_post_urn: 'urn:li:share:99999',
    published_at: publishedAt,
  });
}

it('detecta janela 1h como due', async () => {
  const db = await openDatabase(':memory:');
  const pubRepo = new PublicationRepository(db);
  const publishedAt = new Date(Date.now() - 70 * 60_000).toISOString(); // 70 min atrás
  await insertPublished(pubRepo, publishedAt);

  const messages: unknown[] = [];
  const logger = pino({ level: 'info' }, { write: (s: string) => messages.push(JSON.parse(s)) }) as unknown as Logger;

  await new AnalyticsScheduler(pubRepo, logger).checkDueAnalytics();

  const found = (messages as Array<{ action?: string; checkpoint?: string }>)
    .find(m => m.action === 'analytics_window_due' && m.checkpoint === '1h');
  expect(found).toBeDefined();
  db.close();
});

it('não emite evento se post publicado há poucos minutos', async () => {
  const db = await openDatabase(':memory:');
  const pubRepo = new PublicationRepository(db);
  const publishedAt = new Date(Date.now() - 5 * 60_000).toISOString(); // 5 min atrás
  await insertPublished(pubRepo, publishedAt);

  const infoSpy = vi.fn();
  const logger = { info: infoSpy, error: vi.fn(), warn: vi.fn() } as unknown as Logger;

  await new AnalyticsScheduler(pubRepo, logger).checkDueAnalytics();

  expect(infoSpy).not.toHaveBeenCalled();
  db.close();
});
