import { describe, it, expect, vi } from 'vitest';
import { LinkedInClient } from '../linkedin/linkedinClient.js';
import { openDatabase } from '../storage/database.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { PostScheduler } from '../scheduling/postScheduler.js';
import { post, silentLogger, json } from './helpers.js';
import type { NotionRepository } from '../notion/notionRepository.js';
import type { NotionClient } from '../notion/notionClient.js';

describe('publishing safety', () => {
  it('never retries post creation after a server error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 500));
    const client = new LinkedInClient({accessToken:'mock',apiVersion:'202609',fetch:fetcher});
    await expect(client.request('POST','/rest/posts',{})).rejects.toThrow('LINKEDIN_HTTP_500');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('claims a queued publication exactly once and defaults scheduler to simulation', async () => {
    const db = await openDatabase(':memory:');
    try {
      const repo = new PublicationRepository(db);
      const p = post();
      await repo.insert({id:'safe',notion_page_id:p.id,idempotency_key:'safe-key',
        operational_state:'queued',scheduled_at:'2020-01-01T00:00:00Z',
        linkedin_post_urn:null,linkedin_post_url:null,published_at:null,error_code:null});
      const fetcher = vi.fn<typeof fetch>();
      const scheduler = new PostScheduler(
        {getPostById:vi.fn().mockResolvedValue(p)} as unknown as NotionRepository,
        repo,new TokenRepository(db),{} as NotionClient,
        {clientId:'',clientSecret:'',redirectUri:''},'202609',silentLogger,fetcher,
      );
      expect(await scheduler.publishDuePosts()).toEqual({published:0,skipped:1,errors:0});
      expect(fetcher).not.toHaveBeenCalled();
      expect((await repo.findByNotionPageId(p.id))?.operational_state).toBe('queued');
      const claims = await Promise.all([repo.claimQueued('safe',p.id),repo.claimQueued('safe',p.id)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
    } finally { db.close(); }
  });
});
