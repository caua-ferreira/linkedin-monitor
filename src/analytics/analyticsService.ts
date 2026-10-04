import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import type { AnalyticsRepository } from '../storage/analyticsRepository.js';
import type { NotionClient } from '../notion/notionClient.js';
import type { AnalyticsSnapshot, Checkpoint } from './analyticsModels.js';

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
 * Persiste o snapshot e atualiza o resumo no Notion.
 * Em DRY_RUN, salva no SQLite mas pula a escrita no Notion.
 */
export async function saveSnapshot(
  input: SaveSnapshotInput,
  repo: AnalyticsRepository,
  notion: NotionClient | null,
  dryRun: boolean,
  logger: Logger,
): Promise<AnalyticsSnapshot> {
  const now = new Date().toISOString();
  const snapshot: AnalyticsSnapshot = {
    id: randomUUID(),
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

  if (notion && !dryRun) {
    await updateNotionSummary(snapshot, notion, logger);
  } else if (notion && dryRun) {
    logger.info({ action: 'analytics_notion_skipped', reason: 'DRY_RUN', notion_page_id: snapshot.notion_page_id });
  }

  return snapshot;
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
  if (Object.keys(properties).length === 0) return;

  try {
    await notion.updateProperties(snapshot.notion_page_id, properties);
  } catch (error) {
    logger.warn({ action: 'analytics_notion_update_failed', notion_page_id: snapshot.notion_page_id, error: String(error) });
  }
}

function num(n: number): { number: number } {
  return { number: n };
}
