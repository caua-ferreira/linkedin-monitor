import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { LinkedInClient } from '../linkedin/linkedinClient.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';

interface RawLinkedInPost {
  id: string;
  createdAt: number;
  commentary?: string;
  lifecycleState?: string;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} [s/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 's';
}

/** Constrói a URL pública do post a partir do URN. */
function postUrl(urn: string): string {
  return `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}/`;
}

/** Converte timestamp Unix (ms) para data YYYY-MM-DD no fuso de São Paulo. */
function toSpDate(tsMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(tsMs));
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const countIdx = args.indexOf('--count');
  const count = countIdx !== -1 ? Number(args[countIdx + 1]) : 50;

  const env = loadEnv(process.env);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  const db = openDatabase(env.DATABASE_PATH);
  const tokenRepo = new TokenRepository(db);
  const pubRepo = new PublicationRepository(db);
  const token = tokenRepo.get();

  if (!token) {
    console.error('Sem token LinkedIn. Execute: npm run auth:start');
    process.exitCode = 1;
    db.close();
    return;
  }

  if (!token.member_urn) {
    console.error('member_urn não definido. Re-autentique: npm run auth:start');
    process.exitCode = 1;
    db.close();
    return;
  }

  const liClient = new LinkedInClient({ accessToken: token.access_token, apiVersion: env.LINKEDIN_API_VERSION });
  const notionClient = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });

  const authorsParam = encodeURIComponent(`List(${token.member_urn})`);
  let liPosts: RawLinkedInPost[];
  try {
    const raw = await liClient.request<{ elements?: RawLinkedInPost[] }>(
      'GET',
      `/rest/posts?q=authors&authors=${authorsParam}&count=${count}&sortBy=LAST_MODIFIED`,
    );
    liPosts = (raw.elements ?? []).filter(p => p.id && p.createdAt && p.lifecycleState === 'PUBLISHED');
  } catch (e) {
    console.error(`Erro ao buscar posts do LinkedIn: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
    db.close();
    return;
  }

  console.log(`\n${liPosts.length} post(s) publicado(s) encontrado(s) no LinkedIn.\n`);

  type MatchResult = {
    liPost: RawLinkedInPost;
    notionPageId: string;
    title: string;
    date: string;
    url: string;
    alreadyLinked: boolean;
  };

  const matches: MatchResult[] = [];
  const skipped: string[] = [];

  for (const liPost of liPosts) {
    const date = toSpDate(liPost.createdAt);
    const pages = await notionClient.queryWithFilter({ property: 'Data', date: { equals: date } });
    const notionPosts = pages.flatMap(p => { try { return [mapPage(p)]; } catch { return []; } });

    if (notionPosts.length === 0) {
      skipped.push(`${date} — ${liPost.id} (sem página no Notion)`);
      continue;
    }

    // Prefere posts com Status=Publicado; se empate, pega o primeiro
    const published = notionPosts.filter(p => p.status === 'Publicado');
    const candidate = published.length >= 1 ? published[0]! : notionPosts[0]!;

    if (notionPosts.length > 1 && published.length !== 1) {
      skipped.push(`${date} — ${liPost.id} (${notionPosts.length} páginas no Notion, ambíguo — verifique manualmente)`);
      continue;
    }

    matches.push({
      liPost, notionPageId: candidate.id, title: candidate.title,
      date, url: postUrl(liPost.id), alreadyLinked: Boolean(candidate.postUrl),
    });
  }

  if (matches.length === 0 && skipped.length === 0) {
    console.log('Nenhum match encontrado.');
    db.close();
    return;
  }

  if (matches.length > 0) {
    console.log('Matches:\n');
    for (const m of matches) {
      const tag = m.alreadyLinked ? '[já vinculado]' : '[novo]      ';
      console.log(`  ${tag} ${m.date} — ${m.title}`);
      console.log(`             URN: ${m.liPost.id}`);
      if (!m.alreadyLinked) console.log(`             URL: ${m.url}`);
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
    console.log('Todos os posts já estão vinculados.');
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
      await notionClient.updateProperties(m.notionPageId, { 'Post URL': { url: m.url } });
    } catch (e) {
      console.error(`Erro ao atualizar Notion (${m.title}): ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (!pubRepo.findByNotionPageId(m.notionPageId)) {
      const publishedAt = new Date(m.liPost.createdAt).toISOString();
      pubRepo.insert({
        id: randomUUID(), notion_page_id: m.notionPageId,
        idempotency_key: `${m.notionPageId}:linkedin_sync`,
        operational_state: 'published', scheduled_at: publishedAt,
        linkedin_post_urn: m.liPost.id, linkedin_post_url: m.url,
        published_at: publishedAt, error_code: null,
      });
    }

    linked++;
    logger.info({ action: 'linkedin_sync', notion_page_id: m.notionPageId, urn: m.liPost.id });
  }

  console.log(`\n✓ ${linked} post(s) vinculado(s).`);
  console.log('  Próximo passo: exporte o XLSX do LinkedIn Analytics e rode:');
  console.log('  npm run analytics:import -- arquivo.xlsx');
  db.close();
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
