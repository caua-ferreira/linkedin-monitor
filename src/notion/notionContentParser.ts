import { z } from 'zod';
import { richTextSchema, type Block } from './types.js';

const payloadSchema = z.object({ rich_text: z.array(richTextSchema) });
function content(block: Block): string | undefined {
  const parsed = payloadSchema.safeParse(block[block.type]);
  if (!parsed.success) return undefined;
  if (parsed.data.rich_text.some(t => t.type && t.type !== 'text')) return undefined;
  // URLs mascaradas por rich text não sobrevivem ao formato de texto do LinkedIn.
  if (parsed.data.rich_text.some(t => t.href && t.href !== t.plain_text)) return undefined;
  return parsed.data.rich_text.map(t => t.plain_text).join('');
}

export function extractFinalText(blocks: Block[]): { text: string; errors: string[] } {
  const targets: Block[] = [];
  function discover(nodes: Block[]) {
    for (const b of nodes) {
      if (/^heading_[123]$/.test(b.type) && ['Texto final', 'Texto publicado'].includes(content(b)?.trim() ?? '')) targets.push(b);
      discover(b.children ?? []);
    }
  }
  discover(blocks);
  if (targets.length === 0) return { text: '', errors: ['FINAL_TEXT_SECTION_MISSING'] };
  if (targets.length !== 1) return { text: '', errors: ['FINAL_TEXT_SECTION_AMBIGUOUS'] };
  const target = targets[0]!;
  const start = blocks.indexOf(target);
  if (start === -1 || target.type !== 'heading_2' || target.has_children) {
    return { text: '', errors: ['FINAL_TEXT_SECTION_MUST_BE_TOP_LEVEL_H2'] };
  }
  const lines: string[] = [];
  const errors: string[] = [];
  for (const b of blocks.slice(start + 1)) {
    if (b.type === 'heading_1' || b.type === 'heading_2') break;
    const text = content(b);
    if (!['paragraph', 'bulleted_list_item', 'numbered_list_item'].includes(b.type) || b.has_children || text === undefined) {
      errors.push('FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT');
      continue;
    }
    const prefix = b.type === 'bulleted_list_item' ? '• ' : b.type === 'numbered_list_item' ? `${lines.filter(l => /^\d+\. /.test(l)).length + 1}. ` : '';
    lines.push(prefix + text);
  }
  const text = lines.join('\n\n').trim();
  if (!text) errors.push('FINAL_TEXT_EMPTY');
  return { text, errors: [...new Set(errors)] };
}
