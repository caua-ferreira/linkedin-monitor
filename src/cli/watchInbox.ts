/**
 * Monitora dois inboxes em paralelo e processa automaticamente cada XLSX exportado do LinkedIn:
 *
 *   LOCAL  → data/inbox/          (salvar arquivo na máquina)
 *   DRIVE  → GOOGLE_DRIVE_ANALYTICS_INBOX_FOLDER_ID (salvar pelo celular)
 *
 * Suporta dois formatos de exportação do LinkedIn:
 *   - All Posts Analytics: uma linha por post (métricas acumuladas)
 *   - Single Post Analytics: várias linhas por post (breakdown diário)
 *     → deduplicado automaticamente, mantém a linha com mais impressões
 *
 * Matching automático:
 *   1. Tenta casar pelo campo "Post URL" no Notion
 *   2. Fallback: casa pela "Data" do post no Notion e preenche Post URL automaticamente
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';
import { parseLinkedInXlsx } from '../analytics/providers/linkedinXlsxProvider.js';
import { suggestCheckpoint } from '../analytics/analyticsModels.js';
import { saveSnapshot } from '../analytics/analyticsService.js';
import { GoogleDriveClient } from '../integrations/googleDriveClient.js';

const POLL_MS = 60_000;

function ensureDir(dir: string) { mkdirSync(dir, { recursive: true }); }

function loadProcessedDriveIds(path: string): Set<string> {
  try { return new Set(JSON.parse(readFileSync(path, 'utf8')) as string[]); } catch { return new Set(); }
}

function saveProcessedDriveIds(path: string, ids: Set<string>) {
  writeFileSync(path, JSON.stringify([...ids], null, 2), 'utf8');
}

async function processBuffer(
  buffer: Buffer,
  label: string,
  analyticsRepo: AnalyticsRepository,
  notionClient: NotionClient,
  dryRun: boolean,
  logger: ReturnType<typeof createLogger>,
): Promise<{ saved: number; skipped: number }> {
  let parsed;
  try {
    parsed = parseLinkedInXlsx(buffer);
  } catch (e) {
    logger.error({ action: 'inbox_parse_failed', file: label, error: e instanceof Error ? e.message : String(e) });
    return { saved: 0, skipped: 0 };
  }

  const capturedAt = new Date().toISOString();
  const capturedDate = new Date(capturedAt);
  let saved = 0;
  let skipped = 0;

  // Deduplica por postUrl: no formato Single Post, cada URL aparece várias vezes (dados diários).
  // Mantém a linha com mais impressões — geralmente a mais recente (maior acumulado).
  const dedupedRows = [...parsed.rows
    .filter(r => r.postUrl)
    .reduce((map, row) => {
      const key = row.postUrl!;
      const existing = map.get(key);
      if (!existing || (row.impressions ?? 0) > (existing.impressions ?? 0)) map.set(key, row);
      return map;
    }, new Map())
    .values(),
  ];
  // Preserva linhas sem URL para contagem de skipped
  skipped += parsed.rows.length - parsed.rows.filter(r => r.postUrl).length;
  // Linhas com URL mas descartadas na dedup
  skipped += parsed.rows.filter(r => r.postUrl).length - dedupedRows.length;

  for (const row of dedupedRows) {
    // 1. Tenta casar pelo campo Post URL no Notion
    let notionPageId: string | null = null;
    try {
      const pages = await notionClient.queryWithFilter({ property: 'Post URL', url: { equals: row.postUrl! } });
      if (pages.length === 1) notionPageId = mapPage(pages[0]!).id;
    } catch { /* ignora falha de query */ }

    // 2. Fallback: casa pela Data do Notion e preenche Post URL automaticamente
    if (!notionPageId && row.publishedAt) {
      try {
        const pages = await notionClient.queryWithFilter({ property: 'Data', date: { equals: row.publishedAt } });
        const candidates = pages.flatMap(p => { try { return [mapPage(p)]; } catch { return []; } });
        const published = candidates.filter(p => p.status === 'Publicado');
        const match = candidates.length === 1 ? candidates[0]! : published.length === 1 ? published[0]! : null;
        if (match) {
          notionPageId = match.id;
          // Preenche Post URL no Notion para próximas execuções
          if (!dryRun) {
            try { await notionClient.updateProperties(match.id, { 'Post URL': { url: row.postUrl! } }); } catch { /* não bloqueia */ }
          }
          logger.info({ action: 'inbox_matched_by_date', date: row.publishedAt, notionPageId });
        }
      } catch { /* ignora */ }
    }

    if (!notionPageId) {
      logger.warn({ action: 'inbox_no_match', postUrl: row.postUrl!.slice(0, 80) });
      skipped++;
      continue;
    }

    const publishedAt = row.publishedAt ?? null;
    let postAgeMinutes: number | null = null;
    if (publishedAt) {
      const pub = new Date(publishedAt);
      if (!Number.isNaN(pub.getTime())) postAgeMinutes = Math.round((capturedDate.getTime() - pub.getTime()) / 60_000);
    }

    try {
      await saveSnapshot(
        {
          notionPageId, linkedinPostUrn: null,
          checkpoint: postAgeMinutes !== null ? suggestCheckpoint(postAgeMinutes) : null,
          capturedAt, postAgeMinutes,
          impressions: row.impressions, reach: row.reach, reactions: row.reactions,
          comments: row.comments, shares: row.shares, saves: row.saves, sends: row.sends,
          profileViews: row.profileViews, followersGained: row.followersGained,
          linkClicks: row.linkClicks, premiumCtaClicks: row.premiumCtaClicks,
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

  return { saved, skipped };
}

async function pollLocal(
  inboxDir: string, processedDir: string, failedDir: string,
  analyticsRepo: AnalyticsRepository, notionClient: NotionClient,
  dryRun: boolean, logger: ReturnType<typeof createLogger>,
): Promise<void> {
  let files: string[];
  try { files = readdirSync(inboxDir).filter(f => f.toLowerCase().endsWith('.xlsx')); }
  catch { return; }

  for (const file of files) {
    const filePath = join(inboxDir, file);
    try { if (Date.now() - statSync(filePath).mtimeMs < 3_000) continue; } catch { continue; }

    const { saved, skipped } = await processBuffer(
      readFileSync(filePath), file, analyticsRepo, notionClient, dryRun, logger,
    );
    logger.info({ action: 'inbox_local_done', file, saved, skipped, dryRun });

    if (!dryRun) {
      ensureDir(processedDir);
      try { renameSync(filePath, join(processedDir, `${Date.now()}_${file}`)); } catch { /* já foi movido */ }
      process.stdout.write(`✓ [local] ${file}: ${saved} snapshot(s) salvo(s).\n`);
    } else {
      process.stdout.write(`[dry-run] [local] ${file}: ${saved} calculado(s), ${skipped} ignorado(s).\n`);
    }

    if (skipped > 0 && saved === 0) {
      ensureDir(failedDir);
      try { renameSync(filePath, join(failedDir, file)); } catch { /* ok */ }
    }
  }
}

async function pollDrive(
  driveClient: GoogleDriveClient, folderId: string,
  processedIdsPath: string, processedIds: Set<string>,
  analyticsRepo: AnalyticsRepository, notionClient: NotionClient,
  dryRun: boolean, logger: ReturnType<typeof createLogger>,
): Promise<void> {
  let files;
  try { files = await driveClient.listFilesInFolder(folderId); }
  catch (e) {
    logger.warn({ action: 'drive_list_failed', error: e instanceof Error ? e.message : String(e) });
    return;
  }

  const xlsxFiles = files.filter(f =>
    f.name.toLowerCase().endsWith('.xlsx') ||
    f.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  for (const file of xlsxFiles) {
    if (processedIds.has(file.id)) continue;

    let buffer: Buffer;
    try {
      const dl = await driveClient.downloadFile(file.id);
      buffer = dl.buffer;
    } catch (e) {
      logger.error({ action: 'drive_download_failed', file: file.name, error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const { saved, skipped } = await processBuffer(
      buffer, `Drive:${file.name}`, analyticsRepo, notionClient, dryRun, logger,
    );
    logger.info({ action: 'inbox_drive_done', file: file.name, driveId: file.id, saved, skipped, dryRun });

    if (!dryRun) {
      processedIds.add(file.id);
      saveProcessedDriveIds(processedIdsPath, processedIds);
      process.stdout.write(`✓ [drive] ${file.name}: ${saved} snapshot(s) salvo(s).\n`);
    } else {
      process.stdout.write(`[dry-run] [drive] ${file.name}: ${saved} calculado(s), ${skipped} ignorado(s).\n`);
    }
  }
}

async function main() {
  const env = loadEnv(process.env);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  const inboxDir = join(env.DATA_DIR, 'inbox');
  const processedDir = join(env.DATA_DIR, 'processed');
  const failedDir = join(env.DATA_DIR, 'failed');
  const processedIdsPath = join(env.DATA_DIR, 'drive-processed.json');
  ensureDir(inboxDir);

  const db = openDatabase(env.DATABASE_PATH);
  const analyticsRepo = new AnalyticsRepository(db);
  const notionClient = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });

  const hasDrive = Boolean(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH && env.GOOGLE_DRIVE_ANALYTICS_INBOX_FOLDER_ID);
  let driveClient: GoogleDriveClient | null = null;
  let processedIds = new Set<string>();

  if (hasDrive) {
    if (!existsSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH)) {
      process.stdout.write(`AVISO: GOOGLE_SERVICE_ACCOUNT_KEY_PATH não encontrado — Drive desativado.\n`);
    } else {
      driveClient = new GoogleDriveClient(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
      processedIds = loadProcessedDriveIds(processedIdsPath);
      process.stdout.write(`Drive inbox: pasta ${env.GOOGLE_DRIVE_ANALYTICS_INBOX_FOLDER_ID}\n`);
    }
  }

  if (dryRun) process.stdout.write('AVISO: DRY_RUN=true — snapshots calculados mas NÃO salvos.\n\n');

  process.stdout.write(`Monitorando ${inboxDir} (intervalo: ${POLL_MS / 1000}s)\n`);
  if (driveClient) process.stdout.write('Drive inbox ativo — salve o XLSX no Drive pelo celular ou computador.\n');
  process.stdout.write('Ctrl+C para encerrar.\n\n');

  const tick = async () => {
    await pollLocal(inboxDir, processedDir, failedDir, analyticsRepo, notionClient, dryRun, logger);
    if (driveClient) {
      await pollDrive(driveClient, env.GOOGLE_DRIVE_ANALYTICS_INBOX_FOLDER_ID,
        processedIdsPath, processedIds, analyticsRepo, notionClient, dryRun, logger);
    }
  };

  await tick();
  setInterval(() => { tick().catch(e => logger.error({ action: 'watch_tick_failed', error: e instanceof Error ? e.message : String(e) })); }, POLL_MS);
}

main().catch(e => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exitCode = 1;
});
