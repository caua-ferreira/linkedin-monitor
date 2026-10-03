import { loadEnv } from '../config/env.js';
import { NotionClient } from '../notion/notionClient.js';
import { schemaProblems } from '../notion/notionSchema.js';
import { createLogger } from '../utils/logger.js';
import { errorCode } from '../utils/errors.js';

async function tryFetch(label: string, url: string, token: string, version: string, body?: unknown) {
  const res = await fetch(url, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': version, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const raw: unknown = await res.text().then(t => { try { return JSON.parse(t); } catch { return t; } });
  const obj = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : null;
  const code = obj?.['code'] ?? '';
  const msg = obj?.['message'] ?? '';
  const results = Array.isArray(obj?.['results']) ? (obj!['results'] as unknown[]).length : null;
  process.stdout.write(`${label}: HTTP ${res.status}${code ? ` [${code}]` : ''}${msg ? ` — ${msg}` : ''}${results !== null ? ` (${results} results)` : ''}\n`);
  return { status: res.status, obj };
}

async function main() {
  const env = loadEnv();
  const { token, version } = { token: env.NOTION_TOKEN, version: env.NOTION_API_VERSION };
  const viewId = env.NOTION_DATA_SOURCE_ID;

  // 1. GET metadata do banco
  const { obj: dbObj } = await tryFetch('GET database', `https://api.notion.com/v1/databases/${viewId}`, token, version);

  // Extrai data_source_id se existir
  const dataSources = Array.isArray(dbObj?.['data_sources']) ? dbObj!['data_sources'] as Array<{id: string; name: string}> : [];
  const sourceId = dataSources[0]?.id;
  if (sourceId) process.stdout.write(`data_source_id: ${sourceId}\n`);

  // 2. Query pela view ID (esperado falhar em connected databases)
  await tryFetch('query viewId', `https://api.notion.com/v1/databases/${viewId}/query`, token, version, { page_size: 1 });

  // 3. Query pelo data_source_id (novo padrão Notion API)
  if (sourceId) {
    await tryFetch('query sourceId', `https://api.notion.com/v1/databases/${sourceId}/query`, token, version, { page_size: 1 });
    await tryFetch('GET sourceId schema', `https://api.notion.com/v1/databases/${sourceId}`, token, version);
  }

  // 4. Se alguma query funcionou, roda o check completo via NotionClient
  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const client = new NotionClient({ token, dataSourceId: viewId, version, dryRun: true, logger });
  const properties = await client.getSchema();
  const problems = schemaProblems(properties);
  const types = Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, v.type]));
  process.stdout.write(`${JSON.stringify({ total: Object.keys(types).length, types, problems }, null, 2)}\n`);
  if (problems.length) {
    process.stderr.write(`Schema tem ${problems.length} problema(s).\n`);
    process.exitCode = 2;
  } else {
    process.stderr.write('Schema OK.\n');
  }
}
main().catch(error => {
  const code = error instanceof Error && /^(ENV_INVALID: |NOTION_TOKEN_REQUIRED)/.test(error.message) ? error.message : errorCode(error);
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
