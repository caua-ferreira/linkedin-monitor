import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { SafeError } from '../utils/errors.js';
import { validatePostForPublishing } from '../services/postValidation.js';
import type { NotionClient } from '../notion/notionClient.js';
import type { PublicationRepository } from '../storage/publicationRepository.js';
import type { NotionRepository } from '../notion/notionRepository.js';

export interface QueueResult {
  queued: number;
  skipped: number;
  errors: number;
}

export class QueueService {
  constructor(
    private readonly notionRepo: NotionRepository,
    private readonly publicationRepo: PublicationRepository,
    private readonly notion: NotionClient,
    private readonly logger: Logger,
  ) {}

  async enqueueEligiblePosts(): Promise<QueueResult> {
    const result: QueueResult = { queued: 0, skipped: 0, errors: 0 };

    let posts;
    try {
      posts = await this.notionRepo.getReadyPosts();
    } catch (error) {
      this.logger.error({ action: 'queue_fetch_failed', code: error instanceof SafeError ? error.code : 'UNKNOWN' });
      result.errors++;
      return result;
    }

    // Lê o tipo do campo Status uma única vez para montar o payload de update.
    let statusType: 'select' | 'status' = 'select';
    try {
      const schema = await this.notion.getSchema();
      statusType = schema.Status?.type === 'status' ? 'status' : 'select';
    } catch {
      // Mantém 'select' como padrão — ambas as bases conhecidas usam select.
    }

    for (const post of posts) {
      try {
        const validation = validatePostForPublishing(post);
        if (!validation.valid) {
          this.logger.info({ action: 'queue_skipped', postId: post.id, reasons: validation.errors });
          result.skipped++;
          continue;
        }

        const scheduledAt = validation.scheduledAt!;
        const idempotencyKey = `${post.id}:${scheduledAt}`;

        if (this.publicationRepo.isActiveByIdempotencyKey(idempotencyKey)) {
          this.logger.info({ action: 'queue_already_exists', postId: post.id });
          result.skipped++;
          continue;
        }

        const pubId = randomUUID();
        this.publicationRepo.insert({
          id: pubId,
          notion_page_id: post.id,
          idempotency_key: idempotencyKey,
          operational_state: 'queued',
          scheduled_at: scheduledAt,
          linkedin_post_urn: null,
          linkedin_post_url: null,
          published_at: null,
          error_code: null,
        });

        try {
          await this.notion.updateProperties(post.id, {
            Status: { [statusType]: { name: 'Agendado' } },
          });
        } catch {
          // Falha tolerável — o registro já está no SQLite.
          this.logger.warn({ action: 'queue_notion_status_update_failed', postId: post.id });
        }

        this.logger.info({ action: 'queued', postId: post.id, scheduledAt });
        result.queued++;
      } catch (error) {
        this.logger.error({ action: 'queue_post_error', postId: post.id, code: error instanceof SafeError ? error.code : 'UNKNOWN' });
        result.errors++;
      }
    }

    return result;
  }
}
