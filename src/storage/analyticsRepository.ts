import type { Client } from '@libsql/client';
import type { AnalyticsSnapshot } from '../analytics/analyticsModels.js';

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  return typeof v === 'number' ? v : null;
}

function rowToSnapshot(row: Record<string, unknown>): AnalyticsSnapshot {
  return {
    id: row.id as string,
    notion_page_id: row.notion_page_id as string,
    linkedin_post_urn: (row.linkedin_post_urn as string | null) ?? null,
    checkpoint: (row.checkpoint as import('../analytics/analyticsModels.js').Checkpoint | null) ?? null,
    captured_at: row.captured_at as string,
    post_age_minutes: toNum(row.post_age_minutes),
    impressions: toNum(row.impressions),
    reach: toNum(row.reach),
    reactions: toNum(row.reactions),
    comments: toNum(row.comments),
    shares: toNum(row.shares),
    saves: toNum(row.saves),
    sends: toNum(row.sends),
    profile_views: toNum(row.profile_views),
    followers_gained: toNum(row.followers_gained),
    link_clicks: toNum(row.link_clicks),
    premium_cta_clicks: toNum(row.premium_cta_clicks),
    source: row.source as AnalyticsSnapshot['source'],
    raw_payload: row.raw_payload as string,
    created_at: row.created_at as string,
  };
}

export class AnalyticsRepository {
  constructor(private readonly db: Client) {}

  async checkpointsFor(notionPageId: string): Promise<string[]> {
    const result = await this.db.execute({
      sql: 'SELECT DISTINCT checkpoint FROM analytics_snapshots WHERE notion_page_id = ? AND checkpoint IS NOT NULL',
      args: [notionPageId],
    });
    return result.rows.map(r => r.checkpoint as string);
  }

  async insert(snapshot: AnalyticsSnapshot): Promise<boolean> {
    const result = await this.db.execute({
      sql: `INSERT OR IGNORE INTO analytics_snapshots
        (id, notion_page_id, linkedin_post_urn, checkpoint, captured_at, post_age_minutes,
         impressions, reach, reactions, comments, shares, saves, sends,
         profile_views, followers_gained, link_clicks, premium_cta_clicks,
         source, raw_payload, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        snapshot.id, snapshot.notion_page_id, snapshot.linkedin_post_urn ?? null,
        snapshot.checkpoint ?? null, snapshot.captured_at, snapshot.post_age_minutes ?? null,
        snapshot.impressions ?? null, snapshot.reach ?? null, snapshot.reactions ?? null,
        snapshot.comments ?? null, snapshot.shares ?? null, snapshot.saves ?? null,
        snapshot.sends ?? null, snapshot.profile_views ?? null, snapshot.followers_gained ?? null,
        snapshot.link_clicks ?? null, snapshot.premium_cta_clicks ?? null,
        snapshot.source, snapshot.raw_payload, snapshot.created_at,
      ],
    });
    return (result.rowsAffected ?? 0) > 0;
  }

  async findByNotionPageId(notionPageId: string): Promise<AnalyticsSnapshot[]> {
    const result = await this.db.execute({
      sql: 'SELECT * FROM analytics_snapshots WHERE notion_page_id = ? ORDER BY captured_at DESC',
      args: [notionPageId],
    });
    return result.rows.map(r => rowToSnapshot(r as unknown as Record<string, unknown>));
  }

  async findAll(): Promise<AnalyticsSnapshot[]> {
    const result = await this.db.execute(
      'SELECT * FROM analytics_snapshots ORDER BY created_at DESC',
    );
    return result.rows.map(r => rowToSnapshot(r as unknown as Record<string, unknown>));
  }

  async existsById(id: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: 'SELECT 1 FROM analytics_snapshots WHERE id = ?',
      args: [id],
    });
    return result.rows.length > 0;
  }
}
