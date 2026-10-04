import type { Property } from './types.js';

export const requiredProperties: Record<string, readonly string[]> = {
  Post: ['title'], Status: ['status', 'select'], Data: ['date'], 'Horário': ['rich_text'],
  Formato: ['select', 'rich_text'], Arte: ['select', 'status', 'rich_text'], 'Pronto para publicar': ['checkbox', 'formula'],
  'Scheduler ID': ['rich_text'], 'Publicado em': ['date', 'rich_text'], 'Mídia URL': ['url', 'rich_text'],
  'Post URL': ['url', 'rich_text'], 'UTM URL': ['url', 'rich_text'], 'Erro automação': ['rich_text'],
};

export function schemaProblems(properties: Record<string, Property>): string[] {
  return Object.entries(requiredProperties).flatMap(([name, types]) => {
    const actual = properties[name]?.type;
    return actual && types.includes(actual) ? [] : [`${name}: esperado ${types.join('|')}, encontrado ${actual ?? 'ausente'}`];
  });
}
