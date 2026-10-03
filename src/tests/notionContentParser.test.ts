import { describe, expect, it } from 'vitest';
import { extractFinalText } from '../notion/notionContentParser.js';
import { demoBlocks } from '../fixtures/demo.js';
import type { Block } from '../notion/types.js';

const block = (type: string, text: string): Block => ({
  object: 'block', id: `${type}-${text}`, type, has_children: false, [type]: { rich_text: [{ type: 'text', plain_text: text }] },
});

describe('Notion section parser', () => {
  it('extracts paragraphs with accents, emoji and line breaks', () => {
    expect(extractFinalText([block('heading_2', 'Texto final'), block('paragraph', 'Olá 👋\nMundo!'), block('paragraph', 'Fim.')])).toEqual({ text: 'Olá 👋\nMundo!\n\nFim.', errors: [] });
  });
  it('accepts Texto publicado', () => {
    expect(extractFinalText([block('heading_2', 'Texto publicado'), block('paragraph', 'Final')]).errors).toEqual([]);
  });
  it('stops at the next h2 and ignores prior drafts', () => {
    const result = extractFinalText([block('paragraph', 'Rascunho'), ...demoBlocks, block('heading_2', 'Observações'), block('paragraph', 'Privado')]);
    expect(result.text).not.toMatch(/Rascunho|Privado/);
  });
  it('stops at h1', () => {
    expect(extractFinalText([...demoBlocks, block('heading_1', 'Fim'), block('paragraph', 'Privado')]).text).not.toContain('Privado');
  });
  it('rejects absent or paragraph-shaped headings', () => {
    expect(extractFinalText([block('paragraph', '## Texto final')]).errors).toContain('FINAL_TEXT_SECTION_MISSING');
  });
  it('rejects both final and published sections', () => {
    expect(extractFinalText([...demoBlocks, block('heading_2', 'Texto publicado')]).errors).toContain('FINAL_TEXT_SECTION_AMBIGUOUS');
  });
  it('rejects duplicate sections', () => {
    expect(extractFinalText([...demoBlocks, ...demoBlocks]).errors).toContain('FINAL_TEXT_SECTION_AMBIGUOUS');
  });
  it('rejects empty sections', () => {
    expect(extractFinalText([block('heading_2', 'Texto final')]).errors).toContain('FINAL_TEXT_EMPTY');
  });
  it('rejects nested target headings', () => {
    expect(extractFinalText([{ ...block('toggle', 'Texto'), has_children: true, children: demoBlocks }]).errors).toContain('FINAL_TEXT_SECTION_MUST_BE_TOP_LEVEL_H2');
  });
  it('rejects media or unsupported blocks instead of silently omitting them', () => {
    expect(extractFinalText([...demoBlocks, block('image', '')]).errors).toContain('FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT');
  });
  it('rejects nested paragraphs', () => {
    expect(extractFinalText([demoBlocks[0]!, { ...demoBlocks[1]!, has_children: true, children: [] }]).errors).toContain('FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT');
  });
  it('rejects masked links and unresolved mentions', () => {
    const masked = block('paragraph', 'Site');
    masked.paragraph = { rich_text: [{ plain_text: 'Site', href: 'https://example.org', type: 'text' }] };
    expect(extractFinalText([demoBlocks[0]!, masked]).errors).toContain('FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT');
    masked.paragraph = { rich_text: [{ plain_text: '@Alguém', type: 'mention' }] };
    expect(extractFinalText([demoBlocks[0]!, masked]).errors).toContain('FINAL_TEXT_UNSUPPORTED_BLOCK_OR_RICH_TEXT');
  });
  it('renders supported lists explicitly', () => {
    expect(extractFinalText([demoBlocks[0]!, block('bulleted_list_item', 'A'), block('numbered_list_item', 'B')]).text).toBe('• A\n\n1. B');
  });
});
