import type { Logger } from 'pino';
import type { EditorialPost } from '../notion/types.js';
import { validatePostForPublishing } from './postValidation.js';
import { TIMEZONE } from '../utils/time.js';

export function buildDryRunPlan(posts: EditorialPost[], now: Date, logger: Logger) {
  return posts.map(post => {
    const validation = validatePostForPublishing(post);
    const action = !validation.valid ? 'blocked' : new Date(validation.scheduledAt!).getTime() <= now.getTime() ? 'would_publish' : 'would_wait';
    const item = {
      dryRun: true as const, postId: post.id, title: post.title, action,
      checkedAt: now.toISOString(), timezone: TIMEZONE,
      scheduledAt: validation.scheduledAt ?? null,
      // Apenas prévia da chave. Lock e ledger durável serão entregues na fase C.
      idempotencyKey: validation.scheduledAt ? `${post.id}:${validation.scheduledAt}` : null,
      text: post.text, format: post.format, mediaUrl: post.mediaUrl || null,
      utmUrl: post.utmUrl || null, errors: validation.errors,
    };
    logger.info({ postId: post.id, title: post.title, action: 'dry_run', result: action, errors: item.errors });
    return item;
  });
}
