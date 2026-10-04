import { DatabaseSync } from 'node:sqlite';
import type { AnalyticsSnapshot } from '../analytics/analyticsModels.js';

export class AnalyticsRepository {
  constructor(private readonly db: DatabaseSync) {}

  checkpointsFor(notionPageId: string): string[] {
    return (this.db.prepare(
      'SELECT DISTINCT checkpoint FROM analytics_snapshots WHERE notion_page_id = $id AND checkpoint IS NOT NULL',
    ).all({ $id: notionPageId }) as { checkpoint: string }[]).map(r => r.checkpoint);
  }

  insert(snapshot: AnalyticsSnapshot): void {
    this.db.prepare(`
      INSERT INTO analytics_snapshots
        (id, notion_page_id, linkedin_post_urn, checkpoint, captured_at, post_age_minutes,
         impressions, reach, reactions, comments, shares, saves, sends,
         profile_views, followers_gained, link_clicks, premium_cta_clicks,
         source, raw_payload, created_at)
      VALUES
        ($id, $notion_page_id, $linkedin_post_urn, $checkpoint, $captured_at, $post_age_minutes,
         $impressions, $reach, $reactions, $comments, $shares, $saves, $sends,
         $profile_views, $followers_gained, $link_clicks, $premium_cta_clicks,
         $source, $raw_payload, $created_at)
    `).run({
      $id: snapshot.id,
      $notion_page_id: snapshot.notion_page_id,
      $linkedin_post_urn: snapshot.linkedin_post_urn ?? null,
      $checkpoint: snapshot.checkpoint ?? null,
      $captured_at: snapshot.captured_at,
      $post_age_minutes: snapshot.post_age_minutes ?? null,
      $impressions: snapshot.impressions ?? null,
      $reach: snapshot.reach ?? null,
      $reactions: snapshot.reactions ?? null,
      $comments: snapshot.comments ?? null,
      $shares: snapshot.shares ?? null,
      $saves: snapshot.saves ?? null,
      $sends: snapshot.sends ?? null,
      $profile_views: snapshot.profile_views ?? null,
      $followers_gained: snapshot.followers_gained ?? null,
      $link_clicks: snapshot.link_clicks ?? null,
      $premium_cta_clicks: snapshot.premium_cta_clicks ?? null,
      $source: snapshot.source,
      $raw_payload: snapshot.raw_payload,
      $created_at: snapshot.created_at,
    });
  }

  findByNotionPageId(notionPageId: string): AnalyticsSnapshot[] {
    return this.db.prepare(
      'SELECT * FROM analytics_snapshots WHERE notion_page_id = $id ORDER BY captured_at DESC',
    ).all({ $id: notionPageId }) as unknown as AnalyticsSnapshot[];
  }

  findAll(): AnalyticsSnapshot[] {
    return this.db.prepare(
      'SELECT * FROM analytics_snapshots ORDER BY created_at DESC',
    ).all() as unknown as AnalyticsSnapshot[];
  }

  existsById(id: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM analytics_snapshots WHERE id = $id',
    ).get({ $id: id });
    return row !== undefined;
  }
}
