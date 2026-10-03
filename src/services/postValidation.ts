import type { EditorialPost } from '../notion/types.js';
import { scheduledDateTime } from '../utils/time.js';

const formats = ['Texto', 'Texto + imagem', 'Imagem vertical', 'Vídeo/GIF', 'Documento'];

export function isValidUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return ['http:', 'https:'].includes(u.protocol) && Boolean(u.hostname) && !u.username && !u.password && input === input.trim();
  } catch { return false; }
}

export function validatePostForPublishing(post: EditorialPost) {
  const errors: string[] = [...post.contentErrors];
  if (!post.id) errors.push('PAGE_ID_MISSING');
  if (!post.title.trim()) errors.push('TITLE_MISSING');
  if (!post.text.trim()) errors.push('TEXT_MISSING');
  if (post.archived) errors.push('PAGE_ARCHIVED');
  if (!['Aprovado', 'Agendado'].includes(post.status)) errors.push('STATUS_NOT_APPROVED');
  if (!post.ready) errors.push('NOT_READY');
  if (!['Pronta', 'Não precisa'].includes(post.art)) errors.push('ART_NOT_READY');
  if (post.schedulerId || post.postUrl || post.publishedAt || post.status === 'Publicado') errors.push('ALREADY_PUBLISHED_OR_REGISTERED');
  if (post.automationError.trim()) errors.push('BLOCKING_AUTOMATION_ERROR');
  if (!formats.includes(post.format)) errors.push('FORMAT_UNSUPPORTED');
  if (post.format !== 'Texto' && !post.mediaUrl) errors.push('MEDIA_REQUIRED');
  if (post.format === 'Texto' && post.mediaUrl) errors.push('TEXT_WITH_MEDIA_AMBIGUOUS');
  for (const [name, url] of [['MEDIA_URL', post.mediaUrl], ['POST_URL', post.postUrl], ['UTM_URL', post.utmUrl]]) {
    if (url && !isValidUrl(url)) errors.push(`${name}_INVALID`);
  }
  if (post.mediaUrl && !post.mediaUrl.startsWith('https://')) errors.push('MEDIA_REQUIRES_HTTPS');
  if (post.dateEnd) errors.push('DATE_RANGE_AMBIGUOUS');
  let scheduledAt: string | undefined;
  try { scheduledAt = scheduledDateTime(post.date, post.time).toISOString(); } catch { errors.push('INVALID_OR_AMBIGUOUS_SCHEDULE'); }
  return { valid: errors.length === 0, errors: [...new Set(errors)], scheduledAt };
}
