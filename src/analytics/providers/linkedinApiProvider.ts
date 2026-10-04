import { SafeError } from '../../utils/errors.js';
import type { LinkedInClient } from '../../linkedin/linkedinClient.js';
import type { AnalyticsSnapshot } from '../analyticsModels.js';
import { suggestCheckpoint } from '../analyticsModels.js';
import { randomUUID } from 'node:crypto';

const REQUIRED_SCOPE = 'r_member_postAnalytics';

export interface PostAnalyticsInput {
  notionPageId: string;
  linkedinPostUrn: string;
  publishedAt: string;
  authorizedScopes: string;
}

/**
 * Coleta analytics via LinkedIn API oficial.
 * Requer escopo r_member_postAnalytics aprovado pelo LinkedIn.
 * Enquanto o escopo não estiver disponível, usa LinkedInXlsxProvider como fallback.
 */
export class LinkedInApiAnalyticsProvider {
  constructor(private readonly client: LinkedInClient) {}

  checkScopeAvailable(authorizedScopes: string): boolean {
    return authorizedScopes.split(',').map(s => s.trim()).includes(REQUIRED_SCOPE);
  }

  async collect(input: PostAnalyticsInput): Promise<AnalyticsSnapshot> {
    if (!this.checkScopeAvailable(input.authorizedScopes)) {
      throw new SafeError('LINKEDIN_ANALYTICS_SCOPE_NOT_APPROVED');
    }

    const encoded = encodeURIComponent(input.linkedinPostUrn);
    // ponteiro: verificar endpoint atual em https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/share-statistics
    const raw = await this.client.request<Record<string, unknown>>(
      'GET',
      `/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encoded}`,
    );

    const now = new Date().toISOString();
    const postAgeMinutes = Math.floor((Date.now() - new Date(input.publishedAt).getTime()) / 60_000);

    return {
      id: randomUUID(),
      notion_page_id: input.notionPageId,
      linkedin_post_urn: input.linkedinPostUrn,
      checkpoint: suggestCheckpoint(postAgeMinutes),
      captured_at: now,
      post_age_minutes: postAgeMinutes,
      impressions: safeInt(raw, 'totalShareStatistics.impressionCount'),
      reach: safeInt(raw, 'totalShareStatistics.uniqueImpressionsCount'),
      reactions: safeInt(raw, 'totalShareStatistics.likeCount'),
      comments: safeInt(raw, 'totalShareStatistics.commentCount'),
      shares: safeInt(raw, 'totalShareStatistics.shareCount'),
      saves: null,
      sends: null,
      profile_views: null,
      followers_gained: null,
      link_clicks: safeInt(raw, 'totalShareStatistics.clickCount'),
      premium_cta_clicks: null,
      source: 'linkedin_api',
      raw_payload: JSON.stringify(raw),
      created_at: now,
    };
  }
}

function safeInt(obj: Record<string, unknown>, dotPath: string): number | null {
  const val = dotPath.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
  return typeof val === 'number' ? val : null;
}
