import type { Logger } from 'pino';
import { SafeError } from '../utils/errors.js';
import { publishPost } from '../publishing/publishingService.js';
import type { NotionClient } from '../notion/notionClient.js';
import type { TokenRepository } from '../storage/tokenRepository.js';
import type { PublicationRepository } from '../storage/publicationRepository.js';
import type { NotionRepository } from '../notion/notionRepository.js';
import type { OAuthConfig } from '../linkedin/linkedinAuth.js';

export interface SchedulerResult {
  published: number;
  skipped: number;
  errors: number;
}

export class PostScheduler {
  constructor(
    private readonly notionRepo: NotionRepository,
    private readonly publicationRepo: PublicationRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly notion: NotionClient,
    private readonly oauthConfig: OAuthConfig,
    private readonly apiVersion: string,
    private readonly logger: Logger,
    private readonly fetch?: typeof globalThis.fetch,
  ) {}

  async publishDuePosts(): Promise<SchedulerResult> {
    const result: SchedulerResult = { published: 0, skipped: 0, errors: 0 };
    const now = new Date().toISOString();
    const due = this.publicationRepo.findDueQueued(now);

    if (due.length === 0) return result;
    this.logger.info({ action: 'scheduler_tick', due: due.length });

    for (const pub of due) {
      try {
        const post = await this.notionRepo.getPostById(pub.notion_page_id);
        await publishPost(post, {
          dryRun: false,
          tokenRepo: this.tokenRepo,
          publicationRepo: this.publicationRepo,
          notion: this.notion,
          oauthConfig: this.oauthConfig,
          apiVersion: this.apiVersion,
          logger: this.logger,
          existingPubId: pub.id,
          fetch: this.fetch,
        });
        this.logger.info({ action: 'scheduler_published', postId: post.id, pubId: pub.id });
        result.published++;
      } catch (error) {
        const code = error instanceof SafeError ? error.code : 'UNKNOWN';
        this.logger.error({ action: 'scheduler_publish_failed', pubId: pub.id, notionPageId: pub.notion_page_id, code });
        result.errors++;
        // Continua para o próximo — falha de um post não aborta os demais.
      }
    }

    return result;
  }
}
