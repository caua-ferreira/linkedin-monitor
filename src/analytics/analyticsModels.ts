export type Checkpoint = '1h' | '24h' | '72h';
export type AnalyticsSource = 'linkedin_api' | 'linkedin_xlsx' | 'manual';

export interface AnalyticsSnapshot {
  id: string;
  notion_page_id: string;
  linkedin_post_urn: string | null;
  checkpoint: Checkpoint | null;
  captured_at: string;
  post_age_minutes: number | null;
  impressions: number | null;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  sends: number | null;
  profile_views: number | null;
  followers_gained: number | null;
  link_clicks: number | null;
  premium_cta_clicks: number | null;
  source: AnalyticsSource;
  raw_payload: string;
  created_at: string;
}

export function suggestCheckpoint(postAgeMinutes: number): Checkpoint | null {
  if (postAgeMinutes < 60) return null;
  if (postAgeMinutes < 1440) return '1h';
  if (postAgeMinutes < 4320) return '24h';
  return '72h';
}
