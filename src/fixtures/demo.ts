import type { Block, NotionPage } from '../notion/types.js';

const text = (type: string, value: string) => ({ type, [type]: [{ type: 'text', plain_text: value }] });
const select = (name: string) => ({ type: 'select', select: { name } });
export const demoPage: NotionPage = {
  object: 'page', id: '11111111-1111-4111-8111-111111111111', archived: false,
  properties: {
    Post: text('title', 'Exemplo fictício — revisão de código'),
    Status: { type: 'status', status: { name: 'Aprovado' } },
    Data: { type: 'date', date: { start: '2026-10-02', end: null } },
    'Horário': text('rich_text', '12:20'), Formato: select('Texto'), Arte: select('Não precisa'),
    'Pronto para publicar': { type: 'checkbox', checkbox: true },
    'Scheduler ID': text('rich_text', ''), 'Publicado em': { type: 'date', date: null },
    'Mídia URL': { type: 'url', url: null }, 'Post URL': { type: 'url', url: null }, 'UTM URL': { type: 'url', url: null },
    'Erro automação': text('rich_text', ''),
  },
};
export const demoBlocks: Block[] = [
  { object: 'block', id: 'heading', type: 'heading_2', has_children: false, heading_2: { rich_text: [{ type: 'text', plain_text: 'Texto final' }] } },
  { object: 'block', id: 'body', type: 'paragraph', has_children: false, paragraph: { rich_text: [{ type: 'text', plain_text: 'Uma boa revisão de código começa com uma pergunta clara.\n\nQual problema esta mudança resolve?' }] } },
];
