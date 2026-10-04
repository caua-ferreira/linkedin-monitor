/**
 * Monitora data/inbox/ e processa automaticamente cada XLSX exportado do LinkedIn.
 *
 * Fluxo de uso:
 *   1. npm run linkedin:sync -- report.xlsx   (uma vez, para vincular Post URLs)
 *   2. npm run watch:inbox                    (deixar rodando em background)
 *   3. Exporte o XLSX do LinkedIn e salve em data/inbox/
 *      → O watcher detecta, importa os analytics e move o arquivo para data/processed/
 */
import { readdirSync, readFileSync, mkdirSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';
import { parseLinkedInXlsx } from '../analytics/providers/linkedinXlsxProvider.js';
import { suggestCheckpoint } from '../analytics/analyticsModels.js';
import { saveSnapshot } from '../analytics/analyticsService.js';

const POLL_MS = 60_000; // 1 minuto

function ensureDir(dir: string) { mkdirSync(dir, { recursive: true }); }

async function processFile(
  filePath: string,
  inboxDir: string,
  processedDir: string,
  failedDir: string,
  analyticsRepo: AnalyticsRepository,
  notionClient: NotionClient,
  dryRun: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  const name = basename(filePath);
  logger.info({ action: 'inbox_processing', file: name });

  let parsed;
  try {
    parsed = parseLinkedInXlsx(readFileSync(filePath));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error({ action: 'inbox_parse_failed', file: name, error: msg });
    ensureDir(failedDir);
    renameSync(filePath, join(failedDir, name));
    writeFileSync(join(failedDir, `${name}.error.txt`), `${new Date().toISOString()} ${msg}\n`);
    return;
  }

  const capturedAt = new Date().toISOString();
  const capturedDate = new Date(capturedAt);
  let saved = 0;
  let skipped = 0;

  for (const row of parsed.rows) {
    if (!row.postUrl) { skipped++; continue; }

    // Resolve notion_page_id via Post URL no Notion
    let notionPageId: string | null = null;
    try {
      const pages = await notionClient.queryWithFilter({ property: 'Post URL', url: { equals: row.postUrl } });
      if (pages.length === 1) notionPageId = mapPage(pages[0]!).id;
    } catch { /* ignora falha de query individual */ }

    if (!notionPageId) {
      logger.warn({ action: 'inbox_no_match', postUrl: row.postUrl.slice(0, 60),
        hint: 'Execute: npm run linkedin:sync -- arquivo.xlsx' });
      skipped++;
      continue;
    }

    const publishedAt = row.publishedAt ?? null;
    let postAgeMinutes: number | null = null;
    if (publishedAt) {
      const pub = new Date(publishedAt);
      if (!Number.isNaN(pub.getTime())) postAgeMinutes = Math.round((capturedDate.getTime() - pub.getTime()) / 60_000);
    }
    const checkpoint = postAgeMinutes !== null ? suggestCheckpoint(postAgeMinutes) : null;

    try {
      await saveSnapshot(
        {
          notionPageId, linkedinPostUrn: null, checkpoint, capturedAt,
          postAgeMinutes, impressions: row.impressions, reach: row.reach,
          reactions: row.reactions, comments: row.comments, shares: row.shares,
          saves: row.saves, sends: row.sends, profileViews: row.profileViews,
          followersGained: row.followersGained, linkClicks: row.linkClicks,
          premiumCtaClicks: row.premiumCtaClicks,
          rawPayload: JSON.stringify(row.rawRow), source: 'linkedin_xlsx',
        },
        analyticsRepo,
        dryRun ? null : notionClient,
        dryRun,
        logger,
      );
      saved++;
    } catch (e) {
      logger.error({ action: 'inbox_snapshot_failed', notionPageId, error: e instanceof Error ? e.message : String(e) });
      skipped++;
    }
  }

  logger.info({ action: 'inbox_done', file: name, saved, skipped, dryRun });

  if (dryRun) {
    // Em dry-run não move — permite re-processar com DRY_RUN=false
    process.stdout.write(`[dry-run] ${name}: ${saved} snapshot(s) calculado(s), ${skipped} ignorado(s).\n`);
    return;
  }

  ensureDir(processedDir);
  renameSync(filePath, join(processedDir, `${Date.now()}_${name}`));
  process.stdout.write(`✓ ${name}: ${saved} snapshot(s) salvo(s). Arquivo movido para processed/.\n`);
}

async function pollOnce(
  inboxDir: string, processedDir: string, failedDir: string,
  analyticsRepo: AnalyticsRepository, notionClient: NotionClient,
  dryRun: boolean, logger: ReturnType<typeof createLogger>,
): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(inboxDir).filter(f => f.toLowerCase().endsWith('.xlsx'));
  } catch { return; } // inbox ainda não existe

  for (const file of files) {
    const filePath = join(inboxDir, file);
    // Ignora arquivos ainda sendo escritos (modificado há menos de 3s)
    try {
      if (Date.now() - statSync(filePath).mtimeMs < 3_000) continue;
    } catch { continue; }

    await processFile(filePath, inboxDir, processedDir, failedDir, analyticsRepo, notionClient, dryRun, logger);
  }
}

async function main() {
  const env = loadEnv(process.env);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  const inboxDir = join(env.DATA_DIR, 'inbox');
  const processedDir = join(env.DATA_DIR, 'processed');
  const failedDir = join(env.DATA_DIR, 'failed');
  ensureDir(inboxDir);

  const db = openDatabase(env.DATABASE_PATH);
  const analyticsRepo = new AnalyticsRepository(db);
  const notionClient = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });

  if (dryRun) {
    process.stdout.write('AVISO: DRY_RUN=true — snapshots calculados mas NÃO salvos. Defina DRY_RUN=false para ativar.\n\n');
  }

  process.stdout.write(`Monitorando ${inboxDir} (intervalo: ${POLL_MS / 1000}s)\n`);
  process.stdout.write('Exporte o XLSX do LinkedIn e salve nessa pasta. Ctrl+C para encerrar.\n\n');

  await pollOnce(inboxDir, processedDir, failedDir, analyticsRepo, notionClient, dryRun, logger);
  setInterval(() => {
    pollOnce(inboxDir, processedDir, failedDir, analyticsRepo, notionClient, dryRun, logger)
      .catch(e => logger.error({ action: 'inbox_poll_failed', error: e instanceof Error ? e.message : String(e) }));
  }, POLL_MS);
}

main().catch(e => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
