import { z } from 'zod';
import { SafeError } from '../utils/errors.js';
import type { LinkedInClient } from './linkedinClient.js';

export interface TextPostInput {
  memberUrn: string;
  text: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

export interface PostResult {
  postUrn: string;
  postUrl: string | null;
}

const createPostResponseSchema = z.object({
  headers: z.record(z.string(), z.string()),
}).passthrough();

/**
 * Cria um post de texto no LinkedIn.
 * Retorna o URN do post (do header X-RestLi-Id).
 *
 * Referência: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export async function createTextPost(
  input: TextPostInput,
  client: LinkedInClient,
): Promise<PostResult> {
  const payload = {
    author: input.memberUrn,
    commentary: input.text,
    visibility: input.visibility ?? 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  // POST /rest/posts retorna 201 com X-RestLi-Id contendo o URN do post.
  const response = await client.request<{ headers: Record<string, string> }>(
    'POST',
    '/rest/posts',
    payload,
  );

  const parsed = createPostResponseSchema.safeParse(response);
  if (!parsed.success) throw new SafeError('LINKEDIN_POST_INVALID_RESPONSE');

  // LinkedIn retorna o URN no header X-RestLi-Id ou X-Restli-Id (case varia)
  const headers = parsed.data.headers;
  const urnRaw =
    headers['x-restli-id'] ??
    headers['X-RestLi-Id'] ??
    headers['x-linkedin-id'] ??
    null;

  if (!urnRaw) throw new SafeError('LINKEDIN_POST_NO_URN');

  const postUrn = urnRaw.trim();
  const postUrl = buildPostUrl(postUrn);

  return { postUrn, postUrl };
}

export interface MediaPostInput {
  memberUrn: string;
  text: string;
  assetUrn: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

/**
 * Cria um post com mídia (imagem, vídeo ou documento) no LinkedIn.
 * O assetUrn deve já ter sido obtido via uploadMediaAsset().
 *
 * Referência: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
 */
export async function createMediaPost(
  input: MediaPostInput,
  client: LinkedInClient,
): Promise<PostResult> {
  const payload = {
    author: input.memberUrn,
    commentary: input.text,
    visibility: input.visibility ?? 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
    content: { media: { id: input.assetUrn } },
  };

  const response = await client.request<{ headers: Record<string, string> }>(
    'POST',
    '/rest/posts',
    payload,
  );

  const parsed = createPostResponseSchema.safeParse(response);
  if (!parsed.success) throw new SafeError('LINKEDIN_POST_INVALID_RESPONSE');

  const headers = parsed.data.headers;
  const urnRaw =
    headers['x-restli-id'] ??
    headers['X-RestLi-Id'] ??
    headers['x-linkedin-id'] ??
    null;
  if (!urnRaw) throw new SafeError('LINKEDIN_POST_NO_URN');

  const postUrn = urnRaw.trim();
  return { postUrn, postUrl: buildPostUrl(postUrn) };
}

/** Constrói a URL pública do post a partir do URN (melhor esforço). */
function buildPostUrl(urn: string): string | null {
  // URN formato: urn:li:share:NNNN ou urn:li:ugcPost:NNNN
  const match = /urn:li:(?:share|ugcPost):(\d+)/.exec(urn);
  if (!match) return null;
  return `https://www.linkedin.com/feed/update/${urn}/`;
}
