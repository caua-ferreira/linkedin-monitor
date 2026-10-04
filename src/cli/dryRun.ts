import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { errorCode } from '../utils/errors.js';
import { NotionClient } from '../notion/notionClient.js';
import { NotionRepository, mapPage } from '../notion/notionRepository.js';
import { extractFinalText } from '../notion/notionContentParser.js';
import { buildDryRunPlan } from '../services/dryRunService.js';
import { demoPage, demoBlocks } from '../fixtures/demo.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--demo')) throw new Error('ARGUMENT_INVALID');
  const demo = args.includes('--demo');
  const env = loadEnv(process.env, !demo);
  const directory = resolve(env.DATA_DIR);
  const logger = createLogger(directory, env.LOG_LEVEL);
  try {
    const client = new NotionClient({ token: env.NOTION_TOKEN, dataSourceId: env.NOTION_DATA_SOURCE_ID, version: env.NOTION_API_VERSION, dryRun: true, logger });
    const extracted = extractFinalText(demoBlocks);
    const posts = demo
      ? [{ ...mapPage(demoPage), text: extracted.text, contentErrors: extracted.errors }]
      : await new NotionRepository(client).getReadyPosts();
    const plan = buildDryRunPlan(posts, new Date(), logger);
    const output = { mode: demo ? 'demo_fixture' : 'notion_live_read', phase: 'D', publishingImplemented: true, posts: plan };
    await mkdir(directory, { recursive: true });
    const file = join(directory, `dry-run-${Date.now()}-${randomUUID()}.json`);
    await writeFile(file, JSON.stringify(output, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    process.stdout.write(`${JSON.stringify(output, null, 2)}\nPrévia salva: ${file}\n`);
    if (plan.some(p => p.action === 'blocked')) process.exitCode = 2;
  } catch (error) {
    logger.error({ action: 'dry_run', result: errorCode(error) });
    process.exitCode = 1;
  }
}

main().catch(error => {
  // Somente mensagens de configuração próprias; nunca exibir resposta HTTP, stack ou env.
  const code = error instanceof Error && /^(ENV_INVALID: |PHASE_A_|NOTION_TOKEN_REQUIRED|ARGUMENT_INVALID)/.test(error.message) ? error.message : 'STARTUP_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
