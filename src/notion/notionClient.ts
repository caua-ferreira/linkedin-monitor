import { z } from 'zod';
import type { Logger } from 'pino';
import { SafeError, errorCode } from '../utils/errors.js';
import { retry, sleep, type Sleeper } from '../utils/retry.js';
import { blockSchema, pageSchema, propertySchema, type Block, type NotionPage, type Property } from './types.js';

const listSchema = z.object({
  results: z.array(z.unknown()), has_more: z.boolean(), next_cursor: z.string().nullable(),
  request_status: z.object({ type: z.string() }).optional(),
});

interface Options {
  token: string;
  dataSourceId: string;
  version: string;
  dryRun: boolean;
  logger: Logger;
  fetch?: typeof fetch;
  wait?: Sleeper;
}

export class NotionClient {
  private readonly fetcher: typeof fetch;
  private readonly wait: Sleeper;
  constructor(private readonly options: Options) {
    this.fetcher = options.fetch ?? fetch;
    this.wait = options.wait ?? sleep;
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    return retry(async () => {
      // Execução sequencial: abaixo do limite médio de 3 requests/s.
      await this.wait(350);
      let response: Response;
      try {
        response = await this.fetcher(`https://api.notion.com/v1/${path}`, {
          method, redirect: 'error', signal: AbortSignal.timeout(20_000),
          headers: { Authorization: `Bearer ${this.options.token}`, 'Notion-Version': this.options.version, 'Content-Type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) throw new SafeError('NOTION_TIMEOUT');
        throw new SafeError('NOTION_NETWORK_ERROR');
      }
      if (!response.ok) {
        const header = response.headers.get('retry-after');
        const delay = header ? Number(header) * 1000 : 0;
        throw new SafeError(`NOTION_HTTP_${response.status}`, response.status, Number.isFinite(delay) ? Math.max(0, delay) : 0);
      }
      try { return await response.json(); } catch { throw new SafeError('NOTION_INVALID_JSON'); }
    }, this.wait);
  }

  private async list(method: string, path: string, body?: Record<string, unknown>): Promise<unknown[]> {
    const results: unknown[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const raw = await this.request(method, method === 'GET' ? `${path}?${query}` : path,
        method === 'GET' ? undefined : { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
      const parsed = listSchema.safeParse(raw);
      if (!parsed.success) throw new SafeError('NOTION_INVALID_LIST');
      const page = parsed.data;
      if (page.request_status?.type === 'incomplete') throw new SafeError('NOTION_QUERY_INCOMPLETE');
      results.push(...page.results);
      if (!page.has_more) return results;
      if (!page.next_cursor || cursors.has(page.next_cursor)) throw new SafeError('NOTION_INVALID_CURSOR');
      cursor = page.next_cursor;
      cursors.add(cursor);
    }
  }

  async getSchema() {
    const raw = await this.request('GET', `databases/${encodeURIComponent(this.options.dataSourceId)}`);
    const top = z.object({ properties: z.record(z.string(), z.unknown()) }).safeParse(raw);
    if (top.success) {
      const properties: Record<string, Property> = {};
      for (const [key, val] of Object.entries(top.data.properties)) {
        const p = propertySchema.safeParse(val);
        if (p.success) properties[key] = p.data;
      }
      return properties;
    }
    // Connected database: sem `properties` no GET — infere a partir de uma página
    const pages = await this.list('POST', `databases/${encodeURIComponent(this.options.dataSourceId)}/query`, { page_size: 1 });
    if (!pages.length) return {} as Record<string, Property>;
    const pageParsed = pageSchema.safeParse(pages[0]);
    if (!pageParsed.success) throw new SafeError('NOTION_INVALID_SCHEMA');
    return pageParsed.data.properties;
  }

  async queryByStatus(status: string, type: 'status' | 'select' = 'status'): Promise<NotionPage[]> {
    const results = await this.list('POST', `databases/${encodeURIComponent(this.options.dataSourceId)}/query`, {
      filter: { property: 'Status', [type]: { equals: status } },
    });
    const parsed = z.array(pageSchema).safeParse(results);
    if (!parsed.success) throw new SafeError('NOTION_INVALID_PAGES');
    return parsed.data;
  }

  async queryWithFilter(filter: unknown): Promise<NotionPage[]> {
    const results = await this.list('POST', `databases/${encodeURIComponent(this.options.dataSourceId)}/query`, { filter });
    const parsed = z.array(pageSchema).safeParse(results);
    if (!parsed.success) throw new SafeError('NOTION_INVALID_PAGES');
    return parsed.data;
  }

  async getPage(pageId: string): Promise<NotionPage> {
    const parsed = pageSchema.safeParse(await this.request('GET', `pages/${encodeURIComponent(pageId)}`));
    if (!parsed.success) throw new SafeError('NOTION_INVALID_PAGE');
    return parsed.data;
  }

  async getPageContent(pageId: string): Promise<Block[]> {
    const visited = new Set<string>();
    let total = 0;
    const visit = async (id: string, depth: number): Promise<Block[]> => {
      if (depth > 30 || visited.has(id)) throw new SafeError('NOTION_CONTENT_RECURSION_LIMIT');
      visited.add(id);
      const parsed = z.array(blockSchema).safeParse(await this.list('GET', `blocks/${encodeURIComponent(id)}/children`));
      if (!parsed.success) throw new SafeError('NOTION_INVALID_BLOCKS');
      total += parsed.data.length;
      if (total > 10_000) throw new SafeError('NOTION_CONTENT_SIZE_LIMIT');
      const blocks: Block[] = parsed.data;
      for (const block of blocks) if (block.has_children) block.children = await visit(block.id, depth + 1);
      return blocks;
    };
    return visit(pageId, 0);
  }

  async updateProperties(pageId: string, properties: Record<string, unknown>): Promise<void> {
    if (this.options.dryRun) throw new SafeError('DRY_RUN_WRITE_BLOCKED');
    await this.request('PATCH', `pages/${encodeURIComponent(pageId)}`, { properties });
    this.log(pageId, '', 'notion_update', 'success');
  }

  log(postId: string, title: string, action: string, result: string) {
    this.options.logger.info({ postId, title, action, result });
  }

  async recordError(pageId: string, title: string, error: unknown): Promise<void> {
    const code = errorCode(error);
    this.options.logger.error({ postId: pageId, title, action: 'notion_error', result: code });
    if (!this.options.dryRun) await this.updateProperties(pageId, {
      'Erro automação': { rich_text: [{ type: 'text', text: { content: code } }] },
    });
  }
}
