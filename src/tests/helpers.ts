import { vi } from 'vitest';
import pino from 'pino';
import { NotionClient } from '../notion/notionClient.js';
import { mapPage } from '../notion/notionRepository.js';
import { demoBlocks, demoPage } from '../fixtures/demo.js';
import { extractFinalText } from '../notion/notionContentParser.js';

export const silentLogger = pino({ level: 'silent' });
export function post() {
  const content = extractFinalText(demoBlocks);
  return { ...mapPage(structuredClone(demoPage)), text: content.text, contentErrors: content.errors };
}
export function mockClient(responses: Response[], dryRun = true) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request');
    return response;
  });
  const wait = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  const client = new NotionClient({ token: 'SECRET_TEST_TOKEN', dataSourceId: 'source', version: '2022-06-28', dryRun, logger: silentLogger, fetch: fetcher, wait });
  return { client, fetcher, wait };
}
export const json = (body: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(body), { status, headers });
export const list = (results: unknown[], next: string | null = null) => json({ results, has_more: Boolean(next), next_cursor: next });
