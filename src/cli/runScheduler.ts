import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { NotionClient } from '../notion/notionClient.js';
import { NotionRepository } from '../notion/notionRepository.js';
import { QueueService } from '../scheduling/queueService.js';
import { PostScheduler } from '../scheduling/postScheduler.js';
import { AnalyticsScheduler } from '../scheduling/analyticsScheduler.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import { errorCode } from '../utils/errors.js';
import { GoogleDriveClient } from '../integrations/googleDriveClient.js';

const INTERVAL_MS = 5 * 60 * 1_000; // 5 minutos

async function tick(
  queueService: QueueService,
  postScheduler: PostScheduler,
  analyticsScheduler: AnalyticsScheduler,
  logger: ReturnType<typeof createLogger>,
) {
  try {
    const queueResult = await queueService.enqueueEligiblePosts();
    if (queueResult.queued > 0 || queueResult.errors > 0) {
      logger.info({ action: 'queue_cycle', ...queueResult });
    }
  } catch (error) {
    logger.error({ action: 'queue_cycle_failed', code: errorCode(error) });
  }

  try {
    const publishResult = await postScheduler.publishDuePosts();
    if (publishResult.published > 0 || publishResult.errors > 0) {
      logger.info({ action: 'publish_cycle', ...publishResult });
    }
  } catch (error) {
    logger.error({ action: 'publish_cycle_failed', code: errorCode(error) });
  }

  try {
    await analyticsScheduler.checkDueAnalytics();
  } catch (error) {
    logger.error({ action: 'analytics_cycle_failed', code: errorCode(error) });
  }
}

async function main() {
  const once = process.argv.includes('--once');
  const env = loadEnv();
  if (env.DRY_RUN === 'true') {
    process.argv = process.argv.filter(a => a !== '--once');
    await import('./dryRun.js');
    return;
  }
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dbUrl = env.TURSO_DATABASE_URL || env.DATABASE_PATH;
  const db = await openDatabase(dbUrl, env.TURSO_AUTH_TOKEN || undefined);
  const tokenRepo = new TokenRepository(db);

  // Seed do token a partir de variáveis de ambiente (usado no GitHub Actions).
  // Se LINKEDIN_ACCESS_TOKEN estiver definido e o banco não tiver token válido, semeia.
  if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_MEMBER_URN && process.env.LINKEDIN_ACCESS_TOKEN_EXPIRES) {
    const existing = await tokenRepo.get();
    const isValid = existing && new Date(existing.access_token_expires_at).getTime() > Date.now() + 5 * 60_000;
    if (!isValid) {
      await tokenRepo.save({
        member_urn: process.env.LINKEDIN_MEMBER_URN,
        access_token: process.env.LINKEDIN_ACCESS_TOKEN,
        access_token_expires_at: process.env.LINKEDIN_ACCESS_TOKEN_EXPIRES,
        refresh_token: null,
        refresh_token_expires_at: null,
        authorized_scopes: process.env.LINKEDIN_AUTHORIZED_SCOPES ?? 'email openid profile w_member_social',
      });
      logger.info({ action: 'token_seeded_from_env', member_urn: process.env.LINKEDIN_MEMBER_URN });
    }
  }

  const publicationRepo = new PublicationRepository(db);
  const notion = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun: false, logger,
  });
  const notionRepo = new NotionRepository(notion);
  const oauthConfig = {
    clientId: env.LINKEDIN_CLIENT_ID,
    clientSecret: env.LINKEDIN_CLIENT_SECRET,
    redirectUri: env.LINKEDIN_REDIRECT_URI,
  };

  let driveClient: GoogleDriveClient | undefined;
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    try {
      driveClient = new GoogleDriveClient(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
    } catch {
      logger.warn({ action: 'drive_client_init_failed', keyPath: env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH });
    }
  }

  const queueService = new QueueService(notionRepo, publicationRepo, notion, logger);
  const postScheduler = new PostScheduler(
    notionRepo, publicationRepo, tokenRepo, notion, oauthConfig,
    env.LINKEDIN_API_VERSION, logger, undefined, false, driveClient,
  );
  const analyticsRepo = new AnalyticsRepository(db);
  const analyticsScheduler = new AnalyticsScheduler(publicationRepo, logger, analyticsRepo);

  logger.info({ action: 'scheduler_start', intervalMs: once ? 0 : INTERVAL_MS, once });

  await tick(queueService, postScheduler, analyticsScheduler, logger);

  if (once) {
    db.close();
    return;
  }

  setInterval(() => {
    tick(queueService, postScheduler, analyticsScheduler, logger).catch(error => {
      logger.error({ action: 'tick_uncaught', code: errorCode(error) });
    });
  }, INTERVAL_MS);
}

main().catch(error => {
  const code = error instanceof Error && /^(ENV_INVALID: |NOTION_TOKEN_REQUIRED)/.test(error.message)
    ? error.message : 'SCHEDULER_STARTUP_FAILED';
  process.stderr.write(`${code}\n`);
  process.exit(1);
});
