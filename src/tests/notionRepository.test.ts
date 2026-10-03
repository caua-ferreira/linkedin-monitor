import { expect, it } from 'vitest';
import { NotionRepository, mapPage } from '../notion/notionRepository.js';
import { demoBlocks, demoPage } from '../fixtures/demo.js';
import { mockClient, json, list } from './helpers.js';

it('fetches content only for eligible posts', async () => {
  const skipped = structuredClone(demoPage);
  skipped.properties['Pronto para publicar'] = { type: 'checkbox', checkbox: false };
  const { client, fetcher } = mockClient([json({ properties: demoPage.properties }), list([skipped, demoPage]), list(demoBlocks)]);
  const posts = await new NotionRepository(client).getReadyPosts();
  expect(posts).toHaveLength(1);
  expect(posts[0]!.text).toContain('Uma boa revisão');
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('keeps missing-section candidates blocked by validation', async () => {
  const { client } = mockClient([json({ properties: demoPage.properties }), list([demoPage]), list([])]);
  const posts = await new NotionRepository(client).getReadyPosts();
  expect(posts[0]!.contentErrors).toEqual(['FINAL_TEXT_SECTION_MISSING']);
});
it('fails clearly on schema mismatch before querying posts', async () => {
  const { client, fetcher } = mockClient([json({ properties: {} })]);
  await expect(new NotionRepository(client).getReadyPosts()).rejects.toThrow('NOTION_SCHEMA_MISMATCH');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not silently accept truncated properties', () => {
  const page = structuredClone(demoPage);
  delete page.properties['Scheduler ID'];
  expect(() => mapPage(page)).toThrow('NOTION_PAGE_SCHEMA_MISMATCH');
});
it('fails the entire read when page content is inaccessible', async () => {
  const { client } = mockClient([json({ properties: demoPage.properties }), list([demoPage]), json({}, 403)]);
  await expect(new NotionRepository(client).getReadyPosts()).rejects.toThrow('NOTION_HTTP_403');
});
