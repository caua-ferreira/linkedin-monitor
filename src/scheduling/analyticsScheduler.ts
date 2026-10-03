import type { Logger } from 'pino';
import type { PublicationRepository } from '../storage/publicationRepository.js';

// Janelas alvo de coleta em minutos.
const WINDOWS = [
  { checkpoint: '1h', minMinutes: 60, maxMinutes: 90 },
  { checkpoint: '24h', minMinutes: 1440, maxMinutes: 1500 },
  { checkpoint: '72h', minMinutes: 4320, maxMinutes: 4440 },
] as const;

export class AnalyticsScheduler {
  constructor(
    private readonly publicationRepo: PublicationRepository,
    private readonly logger: Logger,
  ) {}

  checkDueAnalytics(): void {
    const published = this.publicationRepo.findPublished();
    const now = Date.now();

    for (const pub of published) {
      if (!pub.published_at) continue;
      const ageMinutes = (now - new Date(pub.published_at).getTime()) / 60_000;

      for (const window of WINDOWS) {
        if (ageMinutes >= window.minMinutes && ageMinutes <= window.maxMinutes) {
          this.logger.info({
            action: 'analytics_window_due',
            checkpoint: window.checkpoint,
            postUrn: pub.linkedin_post_urn,
            notionPageId: pub.notion_page_id,
            ageMinutes: Math.round(ageMinutes),
          });
        }
      }
    }
  }
}
