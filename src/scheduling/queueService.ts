import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { SafeError } from '../utils/errors.js';
import { validatePostForPublishing } from '../services/postValidation.js';
import { resolveUtm } from '../utils/utm.js';
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
    private readonly brainfrostBaseUrl = 'https://www.brainfrost.com.br/',
    private readonly brainfrostCampaign = 'brainfrost_beta',
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

    for (const rawPost of posts) {
      try {
        let post = rawPost;
        // Phase G: gera UTM para posts BrainFrost sem UTM antes de validar
        const utmGenerated = resolveUtm(post, this.brainfrostBaseUrl, this.brainfrostCampaign);
        if (utmGenerated) {
          try {
            await this.notion.updateProperties(post.id, { 'UTM URL': { url: utmGenerated } });
            post = { ...post, utmUrl: utmGenerated };
            this.logger.info({ action: 'utm_generated', postId: post.id, utmUrl: utmGenerated });
          } catch {
            this.logger.warn({ action: 'utm_generation_failed', postId: post.id });
          }
        }

        const validation = validatePostForPublishing(post);
        if (!validation.valid) {
          this.logger.info({ action: 'queue_skipped', postId: post.id, reasons: validation.errors });
          result.skipped++;
          continue;
        }

        const scheduledAt = validation.scheduledAt!;
        const idempotencyKey = `${post.id}:${scheduledAt}`;

        if (await this.publicationRepo.isActiveByIdempotencyKey(idempotencyKey)) {
          this.logger.info({ action: 'queue_already_exists', postId: post.id });
          result.skipped++;
          continue;
        }

        const pubId = randomUUID();
        await this.publicationRepo.insert({
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
        this.logger.error({ action: 'queue_post_error', postId: rawPost.id, code: error instanceof SafeError ? error.code : 'UNKNOWN' });
        result.errors++;
      }
    }

    return result;
  }
}
