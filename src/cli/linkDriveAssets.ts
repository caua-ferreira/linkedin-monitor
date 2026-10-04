import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { NotionClient } from '../notion/notionClient.js';
import { NotionRepository } from '../notion/notionRepository.js';
import { GoogleDriveClient } from '../integrations/googleDriveClient.js';
import { toSlug, slugSimilarity } from '../utils/slug.js';

const SIMILARITY_THRESHOLD = 0.3;
const FILENAME_RE = /^(\d{4}-\d{2}-\d{2})_([^.]+)\.\w+$/u;

function parseAssetFilename(filename: string): { date: string; slug: string } | null {
  const m = FILENAME_RE.exec(filename);
  if (!m) return null;
  return { date: m[1]!, slug: m[2]! };
}

async function main() {
  const env = loadEnv(process.env, true);
  const logger = createLogger(env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  if (!env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
    console.error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH não configurado.');
    process.exit(1);
  }
  if (!env.GOOGLE_DRIVE_FOLDER_ID) {
    console.error('GOOGLE_DRIVE_FOLDER_ID não configurado.');
    process.exit(1);
  }

  const drive = new GoogleDriveClient(env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
  const notion = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });
  const repo = new NotionRepository(notion);

  console.log(`\nBuscando arquivos em Drive folder ${env.GOOGLE_DRIVE_FOLDER_ID}...`);
  const files = await drive.listFilesInFolder(env.GOOGLE_DRIVE_FOLDER_ID);
  console.log(`${files.length} arquivo(s) encontrado(s).\n`);

  let linked = 0, skipped = 0, unmatched = 0;

  for (const file of files) {
    const parsed = parseAssetFilename(file.name);
    if (!parsed) {
      console.log(`  IGNORADO  ${file.name}  (não segue o padrão YYYY-MM-DD_slug.ext)`);
      skipped++;
      continue;
    }

    const posts = await repo.getPostsByDateWithoutMedia(parsed.date);
    if (!posts.length) {
      console.log(`  SEM POST  ${file.name}  (nenhum post em ${parsed.date} sem Mídia URL)`);
      unmatched++;
      continue;
    }

    // Find best match by slug similarity
    let bestPost = posts[0]!;
    let bestScore = 0;
    for (const post of posts) {
      const score = slugSimilarity(parsed.slug, toSlug(post.title));
      if (score > bestScore) { bestScore = score; bestPost = post; }
    }

    if (bestScore < SIMILARITY_THRESHOLD && posts.length > 1) {
      console.log(`  AMBÍGUO   ${file.name}  (múltiplos posts em ${parsed.date}, score=${bestScore.toFixed(2)})`);
      unmatched++;
      continue;
    }

    const driveUrl = GoogleDriveClient.fileViewUrl(file.id);
    console.log(`  ${dryRun ? 'DRY-RUN' : 'VINCULADO'}  ${file.name}  →  "${bestPost.title}" (score=${bestScore.toFixed(2)})`);
    console.log(`             URL: ${driveUrl}`);

    if (!dryRun) {
      await notion.updateProperties(bestPost.id, { 'Mídia URL': { url: driveUrl } });
    }
    linked++;
  }

  console.log(`\nResumo: ${linked} vinculado(s), ${skipped} ignorado(s), ${unmatched} sem match.`);
  if (dryRun) console.log('Modo DRY_RUN — nenhum dado foi gravado no Notion. Defina DRY_RUN=false para aplicar.');
}

main().catch(err => { console.error(err); process.exit(1); });
