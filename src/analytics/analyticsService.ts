import { randomUUID, createHash } from 'node:crypto';
import type { Logger } from 'pino';
import type { AnalyticsRepository } from '../storage/analyticsRepository.js';
import type { NotionClient } from '../notion/notionClient.js';
import type { AnalyticsSnapshot, Checkpoint } from './analyticsModels.js';

// ID estável para (notion_page_id, checkpoint) → permite upsert idempotente no Supabase.
// Posts sem checkpoint (muito novos ou muito antigos) ficam com UUID aleatório.
function snapshotId(notionPageId: string, checkpoint: string | null): string {
  if (!checkpoint) return randomUUID();
  const hex = createHash('sha256').update(`${notionPageId}\0${checkpoint}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export interface SaveSnapshotInput {
  notionPageId: string;
  linkedinPostUrn: string | null;
  checkpoint: Checkpoint | null;
  capturedAt: string;
  postAgeMinutes: number | null;
  impressions: number | null;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  sends: number | null;
  profileViews: number | null;
  followersGained: number | null;
  linkClicks: number | null;
  premiumCtaClicks: number | null;
  rawPayload: string;
  source: AnalyticsSnapshot['source'];
}

/**
 * Persiste o snapshot no SQLite, opcionalmente no Supabase, e atualiza o resumo no Notion.
 * Em DRY_RUN, salva no SQLite mas pula a escrita no Notion e no Supabase.
 */
export async function saveSnapshot(
  input: SaveSnapshotInput,
  repo: AnalyticsRepository,
  notion: NotionClient | null,
  dryRun: boolean,
  logger: Logger,
  supabaseConfig?: { url: string; key: string },
): Promise<AnalyticsSnapshot> {
  const now = new Date().toISOString();
  const snapshot: AnalyticsSnapshot = {
    id: snapshotId(input.notionPageId, input.checkpoint),
    notion_page_id: input.notionPageId,
    linkedin_post_urn: input.linkedinPostUrn,
    checkpoint: input.checkpoint,
    captured_at: input.capturedAt,
    post_age_minutes: input.postAgeMinutes,
    impressions: input.impressions,
    reach: input.reach,
    reactions: input.reactions,
    comments: input.comments,
    shares: input.shares,
    saves: input.saves,
    sends: input.sends,
    profile_views: input.profileViews,
    followers_gained: input.followersGained,
    link_clicks: input.linkClicks,
    premium_cta_clicks: input.premiumCtaClicks,
    source: input.source,
    raw_payload: input.rawPayload,
    created_at: now,
  };

  const inserted = await repo.insert(snapshot);
  if (!inserted) {
    logger.info({ action: 'analytics_duplicate_skipped', notion_page_id: snapshot.notion_page_id, checkpoint: snapshot.checkpoint });
    return snapshot;
  }

  logger.info({
    action: 'analytics_saved',
    notion_page_id: snapshot.notion_page_id,
    checkpoint: snapshot.checkpoint,
    source: snapshot.source,
  });

  if (supabaseConfig && !dryRun) {
    await writeToSupabase(snapshot, supabaseConfig, logger);
  }

  if (notion && !dryRun) {
    await updateNotionSummary(snapshot, notion, logger);
  } else if (notion && dryRun) {
    logger.info({ action: 'analytics_notion_skipped', reason: 'DRY_RUN', notion_page_id: snapshot.notion_page_id });
  }

  return snapshot;
}

async function writeToSupabase(
  snapshot: AnalyticsSnapshot,
  config: { url: string; key: string },
  logger: Logger,
): Promise<void> {
  try {
    const res = await fetch(`${config.url}/rest/v1/analytics_snapshots`, {
      method: 'POST',
      headers: {
        'apikey': config.key,
        'Authorization': `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({
        id: snapshot.id,
        notion_page_id: snapshot.notion_page_id,
        linkedin_post_urn: snapshot.linkedin_post_urn,
        checkpoint: snapshot.checkpoint,
        captured_at: snapshot.captured_at,
        post_age_minutes: snapshot.post_age_minutes,
        impressions: snapshot.impressions,
        reach: snapshot.reach,
        reactions: snapshot.reactions,
        comments: snapshot.comments,
        shares: snapshot.shares,
        saves: snapshot.saves,
        sends: snapshot.sends,
        profile_views: snapshot.profile_views,
        followers_gained: snapshot.followers_gained,
        link_clicks: snapshot.link_clicks,
        premium_cta_clicks: snapshot.premium_cta_clicks,
        source: snapshot.source,
        raw_payload: snapshot.raw_payload,
        created_at: snapshot.created_at,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ action: 'analytics_supabase_write_failed', status: res.status, body: body.slice(0, 200) });
    } else {
      logger.info({ action: 'analytics_supabase_saved', notion_page_id: snapshot.notion_page_id, checkpoint: snapshot.checkpoint });
    }
  } catch (e) {
    logger.warn({ action: 'analytics_supabase_write_failed', error: e instanceof Error ? e.message : String(e) });
  }
}

async function updateNotionSummary(
  snapshot: AnalyticsSnapshot,
  notion: NotionClient,
  logger: Logger,
): Promise<void> {
  const cp = snapshot.checkpoint;

  // Campos cumulativos (sempre atualizados com o snapshot mais recente)
  const cumulative: Record<string, unknown> = {};
  if (snapshot.reactions !== null) cumulative['Reações'] = num(snapshot.reactions);
  if (snapshot.comments !== null) cumulative['Comentários'] = num(snapshot.comments);
  if (snapshot.shares !== null) cumulative['Compartilhamentos'] = num(snapshot.shares);
  if (snapshot.saves !== null) cumulative['Salvamentos'] = num(snapshot.saves);
  if (snapshot.profile_views !== null) cumulative['Visitas ao perfil'] = num(snapshot.profile_views);
  if (snapshot.followers_gained !== null) cumulative['Novos seguidores'] = num(snapshot.followers_gained);
  if (snapshot.link_clicks !== null) cumulative['Cliques'] = num(snapshot.link_clicks);

  // Última coleta — sempre atualiza com a data/hora ISO do snapshot
  cumulative['Última coleta'] = { date: { start: snapshot.captured_at } };

  // Campos por checkpoint
  const perCheckpoint: Record<string, unknown> = {};
  if (cp === '1h') {
    if (snapshot.impressions !== null) perCheckpoint['Impressões 1h'] = num(snapshot.impressions);
    if (snapshot.reach !== null) perCheckpoint['Alcance 1h'] = num(snapshot.reach);
    perCheckpoint['Coleta 1h'] = { checkbox: true };
  } else if (cp === '24h') {
    if (snapshot.impressions !== null) perCheckpoint['Impressões 24h'] = num(snapshot.impressions);
    if (snapshot.reach !== null) perCheckpoint['Alcance 24h'] = num(snapshot.reach);
    perCheckpoint['Coleta 24h'] = { checkbox: true };
  } else if (cp === '72h') {
    if (snapshot.impressions !== null) perCheckpoint['Impressões 72h'] = num(snapshot.impressions);
    if (snapshot.reach !== null) perCheckpoint['Alcance 72h'] = num(snapshot.reach);
    perCheckpoint['Coleta 72h'] = { checkbox: true };
  }

  const properties = { ...cumulative, ...perCheckpoint };

  // Log para diagnosticar quais campos chegam com valor
  const filled = Object.entries(properties).reduce<Record<string, unknown>>((acc, [k, v]) => {
    if (v !== null && v !== undefined) acc[k] = v;
    return acc;
  }, {});
  logger.info({ action: 'analytics_notion_payload', notion_page_id: snapshot.notion_page_id, checkpoint: cp, fields: filled });

  try {
    await notion.updateProperties(snapshot.notion_page_id, properties);
  } catch (error) {
    logger.warn({ action: 'analytics_notion_update_failed', notion_page_id: snapshot.notion_page_id, error: String(error) });
  }
}

function num(n: number): { number: number } {
  return { number: n };
}
