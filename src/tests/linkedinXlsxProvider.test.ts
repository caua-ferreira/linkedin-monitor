import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseLinkedInXlsx } from '../analytics/providers/linkedinXlsxProvider.js';

/** Cria um XLSX em memória com as colunas e linhas fornecidas. */
function makeXlsx(headers: string[], rows: (string | number | null)[][]): Buffer {
  const data = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Content');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('parseLinkedInXlsx', () => {
  it('mapeia colunas conhecidas corretamente', () => {
    const buf = makeXlsx(
      ['Post published date', 'Post title', 'Impressions', 'Members reached', 'Reactions', 'Comments', 'Reposts', 'Post clicks', 'Post URL'],
      [['2026-09-28', 'Meu post sobre Git', 1200, 900, 45, 8, 3, 25, 'https://www.linkedin.com/posts/x']],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0]!;
    expect(r.publishedAt).toBe('2026-09-28');
    expect(r.title).toBe('Meu post sobre Git');
    expect(r.impressions).toBe(1200);
    expect(r.reach).toBe(900);
    expect(r.reactions).toBe(45);
    expect(r.comments).toBe(8);
    expect(r.shares).toBe(3);
    expect(r.linkClicks).toBe(25);
    expect(r.postUrl).toBe('https://www.linkedin.com/posts/x');
    expect(r.warnings).toHaveLength(0);
  });

  it('sinaliza colunas não mapeadas em unmappedColumns', () => {
    const buf = makeXlsx(
      ['Impressions', 'Coluna Estranha'],
      [[500, 'valor desconhecido']],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.unmappedColumns).toContain('Coluna Estranha');
  });

  it('ignora colunas de métricas derivadas silenciosamente', () => {
    const buf = makeXlsx(
      ['Impressions', 'Engagement rate (%)'],
      [[300, '5.2%']],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.unmappedColumns).not.toContain('Engagement rate (%)');
    expect(result.rows[0]!.impressions).toBe(300);
  });

  it('lança erro em planilha vazia', () => {
    const buf = makeXlsx(['Impressions'], []);
    expect(() => parseLinkedInXlsx(buf)).toThrow('XLSX_EMPTY_SHEET');
  });

  it('preserva raw_payload com todos os campos originais', () => {
    const buf = makeXlsx(
      ['Impressions', 'Saves'],
      [[100, 5]],
    );
    const result = parseLinkedInXlsx(buf);
    const raw = result.rows[0]!.rawRow;
    expect(raw['Impressions']).toBe(100);
    expect(raw['Saves']).toBe(5);
  });

  it('mapeia variantes de nomes de colunas (case-insensitive)', () => {
    const buf = makeXlsx(
      ['IMPRESSIONS', 'Members Reached', 'REACTIONS'],
      [[800, 600, 20]],
    );
    const result = parseLinkedInXlsx(buf);
    const r = result.rows[0]!;
    expect(r.impressions).toBe(800);
    expect(r.reach).toBe(600);
    expect(r.reactions).toBe(20);
  });

  it('retorna null para células vazias', () => {
    const buf = makeXlsx(
      ['Impressions', 'Comments'],
      [[500, null]],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.rows[0]!.impressions).toBe(500);
    expect(result.rows[0]!.comments).toBeNull();
  });

  it('sinaliza aviso para número não parseável', () => {
    const buf = makeXlsx(
      ['Impressions'],
      [['não é número']],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.rows[0]!.warnings.some(w => w.startsWith('UNPARSEABLE_NUMBER'))).toBe(true);
    expect(result.rows[0]!.impressions).toBeNull();
  });

  it('source é sempre linkedin_xlsx', () => {
    const buf = makeXlsx(['Impressions'], [[100]]);
    expect(parseLinkedInXlsx(buf).source).toBe('linkedin_xlsx');
  });

  // Formato Single Post Analytics (pivotado — cada linha é uma métrica)
  it('single post analytics: extrai URL do header e mapeia métricas em PT-BR', () => {
    const postUrl = 'https://www.linkedin.com/posts/cauaferreira_teste-share-123';
    const buf = makeXlsx(
      ['URL da publicação', postUrl, ''],
      [
        ['Data da publicação', '02/10/2026', null],
        ['Impressões', '376', null],
        ['Usuários alcançados', '221', null],
        ['Reações', '6', null],
        ['Comentários', '0', null],
        ['Compartilhamentos', '0', null],
        ['Salvamentos', '1', null],
        ['Envios no LinkedIn', '0', null],
        ['Visualizações do perfil a partir desta publicação', '3', null],
        ['Seguidores obtidos com esta publicação', '2', null],
      ],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.rows).toHaveLength(1);
    const r = result.rows[0]!;
    expect(r.postUrl).toBe(postUrl);
    expect(r.publishedAt).toBe('2026-10-02');
    expect(r.impressions).toBe(376);
    expect(r.reach).toBe(221);
    expect(r.reactions).toBe(6);
    expect(r.comments).toBe(0);
    expect(r.shares).toBe(0);
    expect(r.saves).toBe(1);
    expect(r.sends).toBe(0);
    expect(r.profileViews).toBe(3);
    expect(r.followersGained).toBe(2);
  });

  it('single post analytics: decodifica URL percent-encoded do header', () => {
    const encodedUrl = 'https://www.linkedin.com/posts/cauaferreira_teste-%C3%A9-share-123';
    const decodedUrl = 'https://www.linkedin.com/posts/cauaferreira_teste-é-share-123';
    const buf = makeXlsx(
      ['URL da publicação', encodedUrl, ''],
      [['Impressões', '100', null]],
    );
    const result = parseLinkedInXlsx(buf);
    expect(result.rows[0]!.postUrl).toBe(decodedUrl);
  });
});
