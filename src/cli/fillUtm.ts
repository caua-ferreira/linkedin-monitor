import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';
import { generateBrainFrostUtm } from '../utils/utm.js';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(`${question} [s/N] `);
  rl.close();
  return answer.trim().toLowerCase() === 's';
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const env = loadEnv(process.env);
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const dryRun = env.DRY_RUN === 'true';

  const client = new NotionClient({
    token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID,
    version: env.NOTION_API_VERSION, dryRun, logger,
  });

  const pages = await client.queryWithFilter({
    and: [
      { property: 'BrainFrost?', checkbox: { equals: true } },
      { property: 'UTM URL', url: { is_empty: true } },
    ],
  });

  if (pages.length === 0) {
    console.log('Nenhum post BrainFrost sem UTM URL encontrado.');
    return;
  }

  const posts = pages.flatMap(p => { try { return [mapPage(p)]; } catch { return []; } });
  const planned = posts.map(post => ({
    id: post.id,
    title: post.title,
    utm: generateBrainFrostUtm(post.title, env.BRAINFROST_BASE_URL, env.BRAINFROST_UTM_CAMPAIGN),
  }));

  console.log(`\n${planned.length} post(s) BrainFrost sem UTM URL:\n`);
  for (const { title, utm } of planned) {
    console.log(`  ${title}`);
    console.log(`  → ${utm}\n`);
  }

  if (dryRun) {
    console.log('DRY_RUN=true — nenhuma alteração feita no Notion.');
    return;
  }

  if (!yes) {
    const ok = await confirm(`Preencher UTM URL para ${planned.length} post(s) no Notion?`);
    if (!ok) { console.log('Cancelado.'); return; }
  }

  let updated = 0;
  for (const { id, utm } of planned) {
    try {
      await client.updateProperties(id, { 'UTM URL': { url: utm } });
      updated++;
    } catch (e) {
      console.error(`Erro ao atualizar ${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\n✓ ${updated} UTM URL(s) preenchida(s) no Notion.`);
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
