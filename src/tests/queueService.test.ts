import { describe, it, expect, vi } from 'vitest';
import { openDatabase } from '../storage/database.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { QueueService } from '../scheduling/queueService.js';
import { silentLogger, post } from './helpers.js';
import type { NotionRepository } from '../notion/notionRepository.js';
import type { NotionClient } from '../notion/notionClient.js';

function makeNotion(getSchemaType: 'select' | 'status' = 'select'): NotionClient {
  return {
    getSchema: vi.fn().mockResolvedValue({ Status: { type: getSchemaType } }),
    updateProperties: vi.fn().mockResolvedValue(undefined),
  } as unknown as NotionClient;
}

function makeRepo(posts: ReturnType<typeof post>[]): NotionRepository {
  return {
    getReadyPosts: vi.fn().mockResolvedValue(posts),
  } as unknown as NotionRepository;
}

describe('QueueService', () => {
  it('enfileira post elegível e atualiza Notion para Agendado', async () => {
    const db = await openDatabase(':memory:');
    const pubRepo = new PublicationRepository(db);
    const notion = makeNotion();
    const svc = new QueueService(makeRepo([post()]), pubRepo, notion, silentLogger);

    const result = await svc.enqueueEligiblePosts();

    expect(result.queued).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(notion.updateProperties).toHaveBeenCalledWith(
      expect.any(String),
      { Status: { select: { name: 'Agendado' } } },
    );
    const all = await pubRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.operational_state).toBe('queued');
    db.close();
  });

  it('usa o tipo correto para status-type databases', async () => {
    const db = await openDatabase(':memory:');
    const notion = makeNotion('status');
    const svc = new QueueService(makeRepo([post()]), new PublicationRepository(db), notion, silentLogger);

    await svc.enqueueEligiblePosts();

    expect(notion.updateProperties).toHaveBeenCalledWith(
      expect.any(String),
      { Status: { status: { name: 'Agendado' } } },
    );
    db.close();
  });

  it('pula post já enfileirado (idempotência)', async () => {
    const db = await openDatabase(':memory:');
    const pubRepo = new PublicationRepository(db);
    const notion = makeNotion();
    const svc = new QueueService(makeRepo([post()]), pubRepo, notion, silentLogger);

    // Primeira rodada — enfileira
    await svc.enqueueEligiblePosts();
    // Segunda rodada — deve pular
    const result = await svc.enqueueEligiblePosts();

    expect(result.queued).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await pubRepo.findAll()).toHaveLength(1);
    db.close();
  });

  it('falha de getReadyPosts retorna errors=1 sem lançar', async () => {
    const db = await openDatabase(':memory:');
    const failingRepo = { getReadyPosts: vi.fn().mockRejectedValue(new Error('NOTION_NETWORK_ERROR')) } as unknown as NotionRepository;
    const svc = new QueueService(failingRepo, new PublicationRepository(db), makeNotion(), silentLogger);

    const result = await svc.enqueueEligiblePosts();

    expect(result.errors).toBe(1);
    expect(result.queued).toBe(0);
    db.close();
  });

  it('falha de updateProperties não aborta o enfileiramento', async () => {
    const db = await openDatabase(':memory:');
    const notion = {
      getSchema: vi.fn().mockResolvedValue({ Status: { type: 'select' } }),
      updateProperties: vi.fn().mockRejectedValue(new Error('NOTION_TIMEOUT')),
    } as unknown as NotionClient;
    const svc = new QueueService(makeRepo([post()]), new PublicationRepository(db), notion, silentLogger);

    const result = await svc.enqueueEligiblePosts();

    expect(result.queued).toBe(1);
    expect(await new PublicationRepository(db).findAll()).toHaveLength(1);
    db.close();
  });
});
