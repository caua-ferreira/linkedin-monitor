import { toSlug } from './slug.js';
import type { EditorialPost } from '../notion/types.js';

export function generateBrainFrostUtm(title: string, baseUrl: string, campaign: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source', 'linkedin');
  url.searchParams.set('utm_medium', 'organic_social');
  url.searchParams.set('utm_campaign', campaign);
  url.searchParams.set('utm_content', toSlug(title));
  return url.toString();
}

/** Returns a generated UTM URL if the post is BrainFrost and has no UTM yet. Returns null otherwise. */
export function resolveUtm(post: EditorialPost, baseUrl: string, campaign: string): string | null {
  if (!post.brainfrost) return null;
  if (post.utmUrl.trim()) return null; // never overwrite manual UTM
  return generateBrainFrostUtm(post.title, baseUrl, campaign);
}
