import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { SafeError } from '../utils/errors.js';
import { validatePostForPublishing } from '../services/postValidation.js';
import type { EditorialPost } from '../notion/types.js';
import type { NotionClient } from '../notion/notionClient.js';
import type { TokenRepository } from '../storage/tokenRepository.js';
import type { PublicationRepository } from '../storage/publicationRepository.js';
import { LinkedInClient } from '../linkedin/linkedinClient.js';
import { createTextPost, createMediaPost } from '../linkedin/linkedinPosts.js';
import { isTokenExpired, refreshAccessToken, getMemberUrn, type OAuthConfig } from '../linkedin/linkedinAuth.js';
import { uploadMediaAsset, notionFormatToMediaType } from '../linkedin/linkedinMedia.js';

export interface PublishResult {
  postUrn: string;
  postUrl: string | null;
  publishedAt: string;
  dryRun: false;
}

export interface DryRunPublishResult {
  dryRun: true;
  scheduledAt: string | null;
  idempotencyKey: string | null;
  previewText: string;
  mediaType: string | null;
}

export type PublishOutcome = PublishResult | DryRunPublishResult;

export async function publishPost(
  post: EditorialPost,
  opts: {
    dryRun: boolean;
    tokenRepo: TokenRepository;
    publicationRepo: PublicationRepository;
    notion: NotionClient;
    oauthConfig: OAuthConfig;
    apiVersion: string;
    logger: Logger;
    /** Passa ID de um registro 'queued' existente para atualizar no lugar de inserir. */
    existingPubId?: string;
    fetch?: typeof fetch;
  },
): Promise<PublishOutcome> {
  const { dryRun, tokenRepo, publicationRepo, notion, oauthConfig, apiVersion, logger } = opts;

  // 1. Validação local
  const validation = validatePostForPublishing(post);
  if (!validation.valid) throw new SafeError(`PUBLISH_BLOCKED:${validation.errors.join(',')}`);

  const scheduledAt = validation.scheduledAt!;
  const idempotencyKey = `${post.id}:${scheduledAt}`;
  const mediaType = notionFormatToMediaType(post.format);

  // 2. DRY RUN — retorna prévia sem chamar LinkedIn
  if (dryRun) {
    return { dryRun: true, scheduledAt, idempotencyKey, previewText: post.text, mediaType: post.format };
  }

  // 3. Idempotência — bloqueia apenas estados definitivos
  if (!opts.existingPubId && await publicationRepo.existsByIdempotencyKey(idempotencyKey)) {
    throw new SafeError('PUBLISH_ALREADY_ATTEMPTED');
  }

  // 4. Verifica estado fresco no Notion antes de publicar
  const freshPage = await notion.getPage(post.id);
  const freshSchedulerId = freshPage.properties['Scheduler ID'];
  const schedulerIdValue = freshSchedulerId?.type === 'rich_text'
    ? (freshSchedulerId.rich_text as Array<{ plain_text: string }>).map(t => t.plain_text).join('')
    : '';
  if (schedulerIdValue) throw new SafeError('PUBLISH_ALREADY_REGISTERED_IN_NOTION');

  // 5. Obtém token e renova se necessário
  const tokenRecord = await tokenRepo.get();
  if (!tokenRecord) throw new SafeError('LINKEDIN_NOT_AUTHENTICATED');

  let accessToken = tokenRecord.access_token;
  if (isTokenExpired(tokenRecord.access_token_expires_at)) {
    if (!tokenRecord.refresh_token) throw new SafeError('LINKEDIN_TOKEN_EXPIRED_NO_REFRESH');
    logger.info({ action: 'token_refresh', member_urn: tokenRecord.member_urn ?? 'unknown' });
    const refreshed = await refreshAccessToken(tokenRecord.refresh_token, oauthConfig);
    await tokenRepo.save({
      member_urn: tokenRecord.member_urn,
      access_token: refreshed.accessToken,
      access_token_expires_at: refreshed.accessTokenExpiresAt,
      refresh_token: refreshed.refreshToken,
      refresh_token_expires_at: refreshed.refreshTokenExpiresAt,
      authorized_scopes: refreshed.authorizedScopes,
    });
    accessToken = refreshed.accessToken;
  }

  // 6. Garante que temos o URN do membro
  let memberUrn = tokenRecord.member_urn;
  if (!memberUrn) {
    memberUrn = await getMemberUrn(accessToken, opts.fetch);
    await tokenRepo.updateMemberUrn(memberUrn);
  }

  // 7. Cria ou atualiza o registro de publicação para estado 'publishing'
  const pubId = opts.existingPubId ?? randomUUID();
  if (opts.existingPubId) {
    await publicationRepo.updateState(pubId, 'publishing');
  } else {
    await publicationRepo.insert({
      id: pubId,
      notion_page_id: post.id,
      idempotency_key: idempotencyKey,
      operational_state: 'publishing',
      scheduled_at: scheduledAt,
      linkedin_post_urn: null,
      linkedin_post_url: null,
      published_at: null,
      error_code: null,
    });
  }

  // 8. Upload de mídia (se necessário) + publicação no LinkedIn
  const client = new LinkedInClient({ accessToken, apiVersion, fetch: opts.fetch });
  let postResult;
  try {
    if (mediaType && post.mediaUrl) {
      const assetUrn = await uploadMediaAsset(post.mediaUrl, mediaType, memberUrn, client, opts.fetch ?? fetch);
      logger.info({ action: 'media_uploaded', postId: post.id, mediaType, assetUrn });
      postResult = await createMediaPost({ memberUrn, text: post.text, assetUrn }, client);
    } else {
      postResult = await createTextPost({ memberUrn, text: post.text }, client);
    }
  } catch (error) {
    // Resultado desconhecido — não é seguro tentar novamente
    const isAmbiguous = error instanceof SafeError &&
      ['LINKEDIN_TIMEOUT', 'LINKEDIN_NETWORK_ERROR', 'LINKEDIN_POST_NO_URN'].includes(error.code);
    const state = isAmbiguous ? 'reconciliation_required' : 'failed';
    const code = error instanceof SafeError ? error.code : 'UNKNOWN';
    await publicationRepo.updateState(pubId, state, { error_code: code });
    logger.error({ action: 'publish_failed', postId: post.id, state, code });
    throw error;
  }

  // 9. Persiste URN IMEDIATAMENTE antes de atualizar o Notion
  const publishedAt = new Date().toISOString();
  await publicationRepo.updateState(pubId, 'published', {
    linkedin_post_urn: postResult.postUrn,
    linkedin_post_url: postResult.postUrl,
    published_at: publishedAt,
  });
  logger.info({ action: 'published', postId: post.id, urn: postResult.postUrn });

  // 10. Atualiza Notion (falha tolerável — URN já está salvo localmente)
  try {
    await notion.updateProperties(post.id, {
      'Scheduler ID': { rich_text: [{ type: 'text', text: { content: postResult.postUrn } }] },
      ...(postResult.postUrl ? { 'Post URL': { url: postResult.postUrl } } : {}),
      Status: { select: { name: 'Publicado' } },
      'Publicado em': { date: { start: publishedAt } },
    });
  } catch {
    logger.warn({ action: 'notion_update_failed_after_publish', postId: post.id, urn: postResult.postUrn });
    // Não lança — URN já está seguro no SQLite
  }

  return { postUrn: postResult.postUrn, postUrl: postResult.postUrl, publishedAt, dryRun: false };
}
