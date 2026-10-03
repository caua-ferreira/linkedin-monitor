import { expect, it, vi } from 'vitest';
import { demoBlocks, demoPage } from '../fixtures/demo.js';
import { SafeError } from '../utils/errors.js';
import { mockClient, json, list } from './helpers.js';

it('queries data source with status filter, version header and all pages', async () => {
  const { client, fetcher } = mockClient([list([demoPage], 'cursor'), list([{ ...demoPage, id: 'second' }])]);
  expect(await client.queryByStatus('Aprovado')).toHaveLength(2);
  expect(fetcher.mock.calls[0]![0]).toBe('https://api.notion.com/v1/databases/source/query');
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).filter).toEqual({ property: 'Status', status: { equals: 'Aprovado' } });
  expect(fetcher.mock.calls[0]![1]!.headers).toMatchObject({ 'Notion-Version': '2022-06-28', Authorization: 'Bearer SECRET_TEST_TOKEN' });
  expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string).start_cursor).toBe('cursor');
});
it('supports databases using a select Status', async () => {
  const { client, fetcher } = mockClient([list([])]);
  await client.queryByStatus('Aprovado', 'select');
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).filter.select).toEqual({ equals: 'Aprovado' });
});
it('reads paginated blocks and descendants', async () => {
  const { client, fetcher } = mockClient([list([{ ...demoBlocks[0]!, has_children: true }], 'next'), list([demoBlocks[1]]), list([demoBlocks[1]])]);
  const content = await client.getPageContent('page');
  expect(content).toHaveLength(2);
  expect(content[0]!.children).toHaveLength(1);
  expect(fetcher.mock.calls[1]![0]).toContain('start_cursor=next');
});
it('blocks writes in dry-run before HTTP', async () => {
  const { client, fetcher } = mockClient([]);
  await expect(client.updateProperties('page', {})).rejects.toThrow('DRY_RUN_WRITE_BLOCKED');
  await client.recordError('page', 'Post', new SafeError('SOME_ERROR'));
  expect(fetcher).not.toHaveBeenCalled();
});
it('updates only explicitly supplied properties', async () => {
  const { client, fetcher } = mockClient([json({})], false);
  await client.updateProperties('page', { 'Erro automação': { rich_text: [] } });
  expect(fetcher.mock.calls[0]![1]!.method).toBe('PATCH');
  expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ properties: { 'Erro automação': { rich_text: [] } } });
});
it('records safe error codes, never upstream messages', async () => {
  const { client, fetcher } = mockClient([json({})], false);
  await client.recordError('page', 'Post', new Error('password=SECRET'));
  expect(fetcher.mock.calls[0]![1]!.body).not.toContain('SECRET');
  expect(fetcher.mock.calls[0]![1]!.body).toContain('UNEXPECTED_ERROR');
});
it.each([400, 401, 403, 404])('does not retry HTTP %s', async status => {
  const { client, fetcher } = mockClient([json({ message: 'SECRET_TEST_TOKEN' }, status)]);
  await expect(client.getSchema()).rejects.toThrow(`NOTION_HTTP_${status}`);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([429, 500, 503])('retries transient HTTP %s', async status => {
  const { client, fetcher, wait } = mockClient([json({}, status, { 'Retry-After': '2' }), json({ properties: demoPage.properties })]);
  await client.getSchema();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(2000);
});
it('retries timeouts with a bounded attempt count', async () => {
  const { client, fetcher } = mockClient([]);
  fetcher.mockRejectedValue(new DOMException('Timeout with SECRET', 'TimeoutError'));
  await expect(client.getSchema()).rejects.toThrow('NOTION_TIMEOUT');
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it('does not leak network exceptions', async () => {
  const { client, fetcher } = mockClient([]);
  fetcher.mockRejectedValue(new Error('SECRET_TOKEN'));
  await expect(client.getSchema()).rejects.toThrow('NOTION_NETWORK_ERROR');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects malformed or truncated results and repeated cursors', async () => {
  await expect(mockClient([json({})]).client.queryByStatus('Aprovado')).rejects.toThrow('NOTION_INVALID_LIST');
  await expect(mockClient([json({ results: [], has_more: false, next_cursor: null, request_status: { type: 'incomplete' } })]).client.queryByStatus('Aprovado')).rejects.toThrow('NOTION_QUERY_INCOMPLETE');
  await expect(mockClient([list([], 'same'), list([], 'same')]).client.queryByStatus('Aprovado')).rejects.toThrow('NOTION_INVALID_CURSOR');
});
it('aborts recursive block cycles', async () => {
  const { client } = mockClient([list([{ ...demoBlocks[0]!, id: 'page', has_children: true }])]);
  await expect(client.getPageContent('page')).rejects.toThrow('NOTION_CONTENT_RECURSION_LIMIT');
});
it('can retrieve a fresh page for later publication rechecks', async () => {
  const { client } = mockClient([json(demoPage)]);
  expect(await client.getPage(demoPage.id)).toEqual(demoPage);
});
it('limits maximum retries', async () => {
  const { client, fetcher } = mockClient(Array.from({ length: 4 }, () => json({}, 500)));
  await expect(client.getSchema()).rejects.toThrow('NOTION_HTTP_500');
  expect(fetcher).toHaveBeenCalledTimes(4);
  vi.restoreAllMocks();
});
