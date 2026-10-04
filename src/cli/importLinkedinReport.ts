#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import { parseLinkedInXlsx } from '../analytics/providers/linkedinXlsxProvider.js';
import { suggestCheckpoint } from '../analytics/analyticsModels.js';
import { saveSnapshot } from '../analytics/analyticsService.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';

function usage(): void {
  console.error(`
Uso: npm run analytics:import -- <arquivo.xlsx> [opções]

Opções:
  --notion-page-id <id>   ID da página Notion (obrigatório se não houver Post URL no XLSX)
  --published-at <data>   Data de publicação ISO (ex: 2026-09-28T14:00:00-03:00)
  --captured-at <data>    Data da coleta ISO (padrão: agora)
  --yes                   Pular confirmação interativa

Exemplo:
  npm run analytics:import -- ./data/report.xlsx --notion-page-id abc-123 --yes
`);
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} [s/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 's';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const xlsxPath = args.find(a => !a.startsWith('--'));
  const yes = args.includes('--yes');

  const notionPageIdArg = (() => {
    const i = args.indexOf('--notion-page-id');
    return i !== -1 ? args[i + 1] : undefined;
  })();
  const publishedAtArg = (() => {
    const i = args.indexOf('--published-at');
    return i !== -1 ? args[i + 1] : undefined;
  })();
  const capturedAtArg = (() => {
    const i = args.indexOf('--captured-at');
    return i !== -1 ? args[i + 1] : undefined;
  })();

  if (!xlsxPath) { usage(); process.exit(1); }
  if (!existsSync(xlsxPath)) { console.error(`Arquivo não encontrado: ${xlsxPath}`); process.exit(1); }

  const env = loadEnv(process.env, false);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const db = openDatabase(env.DATABASE_PATH);
  const repo = new AnalyticsRepository(db);

  // Cria cliente Notion somente se o token estiver disponível (para auto-match por Post URL)
  const notionClient = env.NOTION_TOKEN.trim()
    ? new NotionClient({ token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID, version: env.NOTION_API_VERSION, dryRun: true, logger })
    : null;

  const buffer = readFileSync(xlsxPath);
  let result;
  try {
    result = parseLinkedInXlsx(buffer);
  } catch (e) {
    console.error(`Erro ao ler XLSX: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  if (result.unmappedColumns.length) {
    console.warn(`\nAVISO — colunas não mapeadas (serão preservadas em raw_payload):`);
    result.unmappedColumns.forEach(c => console.warn(`  • ${c}`));
  }

  const capturedAt = capturedAtArg ?? new Date().toISOString();
  const capturedDate = new Date(capturedAt);

  console.log(`\n${result.rows.length} linha(s) encontrada(s) no XLSX.\n`);

  // Auto-match: tenta casar cada linha pelo Post URL do XLSX com a página do Notion
  const urlToNotionId = new Map<string, string>();
  if (notionClient && !notionPageIdArg) {
    const uniqueUrls = [...new Set(result.rows.map(r => r.postUrl).filter(Boolean) as string[])];
    if (uniqueUrls.length > 0) {
      process.stdout.write(`Auto-matching ${uniqueUrls.length} Post URL(s) no Notion...\n`);
      for (const url of uniqueUrls) {
        try {
          const pages = await notionClient.queryWithFilter({ property: 'Post URL', url: { equals: url } });
          if (pages.length === 1) {
            const post = mapPage(pages[0]!);
            urlToNotionId.set(url, post.id);
          }
        } catch { /* ignora falhas de match individual */ }
      }
      process.stdout.write(`${urlToNotionId.size} match(es) encontrado(s).\n\n`);
    }
  }

  // Monta prévia
  const previews = result.rows.map((row, i) => {
    const notionPageId = notionPageIdArg ?? (row.postUrl ? urlToNotionId.get(row.postUrl) ?? null : null);
    const publishedAt = publishedAtArg ?? row.publishedAt ?? null;

    let postAgeMinutes: number | null = null;
    if (publishedAt) {
      const pubDate = new Date(publishedAt);
      if (!Number.isNaN(pubDate.getTime())) {
        postAgeMinutes = Math.round((capturedDate.getTime() - pubDate.getTime()) / 60_000);
      }
    }

    const checkpoint = postAgeMinutes !== null ? suggestCheckpoint(postAgeMinutes) : null;
    const warnings = row.warnings;

    return { i, row, notionPageId, publishedAt, postAgeMinutes, checkpoint, warnings };
  });

  // Mostra prévia
  for (const p of previews) {
    console.log(`--- Post ${p.i + 1} ---`);
    if (p.row.title) console.log(`  Título:       ${p.row.title.slice(0, 60)}`);
    if (p.row.postUrl) console.log(`  Post URL:     ${p.row.postUrl}`);
    console.log(`  Publicado:    ${p.publishedAt ?? 'desconhecido'}`);
    console.log(`  Coletado:     ${capturedAt}`);
    console.log(`  Idade (min):  ${p.postAgeMinutes ?? 'N/A'}`);
    console.log(`  Checkpoint:   ${p.checkpoint ?? 'fora das janelas'}`);
    console.log(`  Notion ID:    ${p.notionPageId ?? 'NÃO DEFINIDO — use --notion-page-id'}`);
    console.log(`  Impressões:   ${p.row.impressions ?? 'N/A'}`);
    console.log(`  Alcance:      ${p.row.reach ?? 'N/A'}`);
    console.log(`  Reações:      ${p.row.reactions ?? 'N/A'}`);
    console.log(`  Comentários:  ${p.row.comments ?? 'N/A'}`);
    if (p.warnings.length) {
      console.warn(`  AVISOS:       ${p.warnings.join(', ')}`);
    }
    console.log();
  }

  // Filtra linhas sem notion_page_id
  const valid = previews.filter(p => {
    if (!p.notionPageId) {
      console.warn(`Linha ${p.i + 1} ignorada: sem --notion-page-id. Use a opção para importar.`);
      return false;
    }
    return true;
  });

  if (valid.length === 0) {
    console.error('Nenhuma linha válida para importar.');
    process.exit(1);
  }

  if (!yes) {
    const ok = await confirm(`Importar ${valid.length} snapshot(s) para o SQLite?`);
    if (!ok) { console.log('Cancelado.'); process.exit(0); }
  }

  let saved = 0;
  for (const p of valid) {
    await saveSnapshot(
      {
        notionPageId: p.notionPageId!,
        linkedinPostUrn: null,
        checkpoint: p.checkpoint,
        capturedAt,
        postAgeMinutes: p.postAgeMinutes,
        impressions: p.row.impressions,
        reach: p.row.reach,
        reactions: p.row.reactions,
        comments: p.row.comments,
        shares: p.row.shares,
        saves: p.row.saves,
        sends: p.row.sends,
        profileViews: p.row.profileViews,
        followersGained: p.row.followersGained,
        linkClicks: p.row.linkClicks,
        premiumCtaClicks: p.row.premiumCtaClicks,
        rawPayload: JSON.stringify(p.row.rawRow),
        source: 'linkedin_xlsx',
      },
      repo,
      null, // Notion update via CLI separado por enquanto
      env.DRY_RUN === 'true',
      logger,
    );
    saved++;
  }

  console.log(`\n✓ ${saved} snapshot(s) salvo(s) em ${env.DATABASE_PATH}`);
  if (env.DRY_RUN === 'true') {
    console.log('  (DRY_RUN=true — atualização do Notion ignorada)');
  }
}

main().catch(e => {
  console.error('Erro fatal:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
