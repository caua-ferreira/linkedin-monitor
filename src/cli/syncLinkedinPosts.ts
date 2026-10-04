/**
 * Usa o XLSX exportado do LinkedIn Analytics para vincular posts às páginas do Notion.
 * Preenche "Post URL" e registra o URN no SQLite.
 *
 * Uso:
 *   npm run linkedin:sync -- <arquivo.xlsx> [--yes]
 *
 * Fluxo recomendado:
 *   1. npm run linkedin:sync -- report.xlsx   ← preenche Post URL no Notion
 *   2. npm run analytics:import -- report.xlsx ← importa as métricas (auto-match por URL)
 */
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';
import { parseLinkedInXlsx } from '../analytics/providers/linkedinXlsxProvider.js';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} [s/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 's';
}

/** Extrai URN de uma LinkedIn post URL. Retorna null se não reconhecer o formato. */
function urnFromUrl(url: string): string | null {
  const m = url.match(/feed\/update\/(urn[^/?#]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]!); } catch { return null; }
}

/** Converte data YYYY-MM-DD para timestamp ISO assumindo meio-dia SP (evita problema de fuso). */
function midnightSpIso(date: string): string {
  return new Date(`${date}T12:00:00-03:00`).toISOString();
}

async function main() {
  const args = process.argv.slice(2);
  const xlsxPath = args.find(a => !a.startsWith('--'));
  const yes = args.includes('--yes');

  if (!xlsxPath) {
    console.error(`
Uso: npm run linkedin:sync -- <arquivo.xlsx> [--yes]

  Exportar o XLSX em LinkedIn > Analytics > Post Analytics > Export.
  O arquivo deve conter colunas "Post URL" e "Post Published Date".

Exemplo:
  npm run linkedin:sync -- ./data/linkedin-analytics.xlsx
`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(xlsxPath)) {
    console.error(`Arquivo não encontrado: ${xlsxPath}`);
    process.exitCode = 1;
    return;
  }

  const env = loadEnv(process.env);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  const db = openDatabase(env.DATABASE_PATH);
  const pubRepo = new PublicationRepository(db);
  const notionClient = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });

  const buffer = readFileSync(xlsxPath);
  let parsed;
  try {
    parsed = parseLinkedInXlsx(buffer);
  } catch (e) {
    console.error(`Erro ao ler XLSX: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    db.close();
    return;
  }

  // Filtra linhas que têm Post URL e data de publicação
  const rows = parsed.rows.filter(r => r.postUrl && r.publishedAt);
  console.log(`\n${parsed.rows.length} linha(s) no XLSX — ${rows.length} com Post URL + data.\n`);

  if (rows.length === 0) {
    console.error('Nenhuma linha com "Post URL" e data encontrada. Verifique o formato do XLSX.');
    db.close();
    return;
  }

  type MatchResult = {
    postUrl: string;
    urn: string | null;
    publishedAt: string;
    notionPageId: string;
    title: string;
    alreadyLinked: boolean;
  };

  const matches: MatchResult[] = [];
  const skipped: string[] = [];

  for (const row of rows) {
    const postUrl = row.postUrl!;
    const publishedAt = row.publishedAt!;

    // Busca páginas do Notion com a mesma data
    const pages = await notionClient.queryWithFilter({ property: 'Data', date: { equals: publishedAt } });
    const notionPosts = pages.flatMap(p => { try { return [mapPage(p)]; } catch { return []; } });

    if (notionPosts.length === 0) {
      skipped.push(`${publishedAt} — ${postUrl.slice(0, 60)} (sem página no Notion)`);
      continue;
    }

    // Prefere já vinculado com o mesmo URL, depois Publicado, depois o primeiro
    const exact = notionPosts.find(p => p.postUrl === postUrl);
    const byStatus = notionPosts.filter(p => p.status === 'Publicado');

    if (notionPosts.length > 1 && !exact && byStatus.length !== 1) {
      skipped.push(`${publishedAt} — ${notionPosts.length} página(s) no Notion sem match único (verifique manualmente)`);
      continue;
    }

    const candidate = exact ?? (byStatus.length === 1 ? byStatus[0]! : notionPosts[0]!);
    matches.push({
      postUrl, urn: urnFromUrl(postUrl), publishedAt,
      notionPageId: candidate.id, title: candidate.title,
      alreadyLinked: Boolean(candidate.postUrl),
    });
  }

  if (matches.length > 0) {
    console.log('Matches:\n');
    for (const m of matches) {
      const tag = m.alreadyLinked ? '[já vinculado]' : '[novo]      ';
      console.log(`  ${tag} ${m.publishedAt} — ${m.title}`);
      if (!m.alreadyLinked) console.log(`             URL: ${m.postUrl}`);
      console.log();
    }
  }

  if (skipped.length > 0) {
    console.log(`Ignorados (${skipped.length}):`);
    for (const s of skipped) console.log(`  • ${s}`);
    console.log();
  }

  const newMatches = matches.filter(m => !m.alreadyLinked);
  if (newMatches.length === 0) {
    console.log('Todos os posts já estão vinculados. Nada a fazer.');
    db.close();
    return;
  }

  if (dryRun) {
    console.log(`DRY_RUN=true — ${newMatches.length} vínculo(s) prontos. Defina DRY_RUN=false para aplicar.`);
    db.close();
    return;
  }

  if (!yes) {
    const ok = await confirm(`Vincular ${newMatches.length} post(s): preencher Post URL no Notion + registrar no SQLite?`);
    if (!ok) { console.log('Cancelado.'); db.close(); return; }
  }

  let linked = 0;
  for (const m of newMatches) {
    try {
      await notionClient.updateProperties(m.notionPageId, { 'Post URL': { url: m.postUrl } });
    } catch (e) {
      console.error(`Erro ao atualizar Notion (${m.title}): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!pubRepo.findByNotionPageId(m.notionPageId)) {
      const publishedAt = midnightSpIso(m.publishedAt);
      pubRepo.insert({
        id: randomUUID(), notion_page_id: m.notionPageId,
        idempotency_key: `${m.notionPageId}:linkedin_sync`,
        operational_state: 'published', scheduled_at: publishedAt,
        linkedin_post_urn: m.urn, linkedin_post_url: m.postUrl,
        published_at: publishedAt, error_code: null,
      });
    }

    linked++;
    logger.info({ action: 'linkedin_sync', notion_page_id: m.notionPageId, url: m.postUrl });
  }

  console.log(`\n✓ ${linked} post(s) vinculado(s).`);
  console.log('  Próximo passo: importe as métricas do mesmo arquivo:');
  console.log(`  npm run analytics:import -- ${xlsxPath}`);
  db.close();
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
