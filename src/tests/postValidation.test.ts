import { describe, expect, it } from 'vitest';
import { validatePostForPublishing } from '../services/postValidation.js';
import { isReadyPost } from '../notion/notionRepository.js';
import type { EditorialPost } from '../notion/types.js';
import { post } from './helpers.js';

describe('publication validation', () => {
  it('accepts a complete approved text post', () => {
    expect(validatePostForPublishing(post())).toEqual({ valid: true, errors: [], scheduledAt: '2026-10-02T15:20:00.000Z' });
  });
  it.each<[Partial<EditorialPost>, string]>([
    [{ title: ' ' }, 'TITLE_MISSING'], [{ text: '' }, 'TEXT_MISSING'],
    [{ date: '2026-02-30' }, 'INVALID_OR_AMBIGUOUS_SCHEDULE'],
    [{ time: '24:00' }, 'INVALID_OR_AMBIGUOUS_SCHEDULE'], [{ format: '' }, 'FORMAT_UNSUPPORTED'],
    [{ format: 'Imagem vertical' }, 'MEDIA_REQUIRED'], [{ format: 'Vídeo/GIF' }, 'MEDIA_REQUIRED'],
    [{ format: 'Documento' }, 'MEDIA_REQUIRED'],
    [{ status: 'Ideia' }, 'STATUS_NOT_APPROVED'], [{ ready: false }, 'NOT_READY'],
    [{ schedulerId: 'urn:li:share:123' }, 'ALREADY_PUBLISHED_OR_REGISTERED'],
    [{ postUrl: 'https://linkedin.com/feed/update/123' }, 'ALREADY_PUBLISHED_OR_REGISTERED'],
    [{ publishedAt: '2026-10-01T10:00:00Z' }, 'ALREADY_PUBLISHED_OR_REGISTERED'],
    [{ automationError: 'Erro anterior' }, 'BLOCKING_AUTOMATION_ERROR'],
    [{ utmUrl: 'javascript:alert(1)' }, 'UTM_URL_INVALID'],
    [{ mediaUrl: 'https://user:password@example.org' }, 'MEDIA_URL_INVALID'],
    [{ dateEnd: '2026-10-03' }, 'DATE_RANGE_AMBIGUOUS'],
    [{ date: '2026-10-02T12:20:00-03:00' }, 'INVALID_OR_AMBIGUOUS_SCHEDULE'],
    [{ archived: true }, 'PAGE_ARCHIVED'], [{ art: 'Em produção' }, 'ART_NOT_READY'],
    [{ contentErrors: ['FINAL_TEXT_SECTION_AMBIGUOUS'] }, 'FINAL_TEXT_SECTION_AMBIGUOUS'],
  ])('blocks unsafe input %j', (change, code) => {
    const result = validatePostForPublishing({ ...post(), ...change });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(code);
  });
  it.each(['Texto + imagem', 'Imagem vertical', 'Vídeo/GIF', 'Documento'])('accepts %s metadata with https media', format => {
    expect(validatePostForPublishing({ ...post(), format, mediaUrl: 'https://example.org/media' }).valid).toBe(true);
  });
  it.each<Partial<EditorialPost>>([{ status: 'Ideia' }, { status: 'Publicado' }, { date: '' }, { time: '' }, { art: 'Pendente' }, { ready: false }, { schedulerId: 'urn:x' }, { archived: true }])('filters not-ready posts %j', change => {
    expect(isReadyPost({ ...post(), ...change })).toBe(false);
  });
  it('accepts each allowed art state', () => {
    expect(isReadyPost(post())).toBe(true);
    expect(isReadyPost({ ...post(), art: 'Pronta' })).toBe(true);
  });
});
