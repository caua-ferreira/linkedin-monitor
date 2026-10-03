import * as XLSX from 'xlsx';
import type { AnalyticsSource } from '../analyticsModels.js';

/**
 * Linhas brutas extraídas do XLSX do LinkedIn.
 * Cada linha representa um post. Os campos nulos indicam coluna ausente/ambígua.
 */
export interface XlsxRow {
  postUrl: string | null;
  publishedAt: string | null;
  title: string | null;
  impressions: number | null;
  reach: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  sends: number | null;
  profileViews: number | null;
  followersGained: number | null;
  linkClicks: number | null;
  premiumCtaClicks: number | null;
  rawRow: Record<string, unknown>;
  warnings: string[];
}

export interface XlsxParseResult {
  rows: XlsxRow[];
  /** Colunas do arquivo que não foram mapeadas para nenhum campo conhecido. */
  unmappedColumns: string[];
  source: AnalyticsSource;
}

// Mapeamento coluna LinkedIn → campo interno.
// Chaves em minúsculo para comparação case-insensitive.
const COLUMN_MAP: Record<string, keyof XlsxRow> = {
  // URL do post
  'post url': 'postUrl',
  'url': 'postUrl',
  'link': 'postUrl',
  // Data de publicação
  'post published date': 'publishedAt',
  'published date': 'publishedAt',
  'date published': 'publishedAt',
  'post date': 'publishedAt',
  'date': 'publishedAt',
  // Título / conteúdo
  'post title': 'title',
  'title': 'title',
  'content': 'title',
  'update': 'title',
  // Impressões
  'impressions': 'impressions',
  'post impressions': 'impressions',
  // Alcance
  'members reached': 'reach',
  'unique views': 'reach',
  'reach': 'reach',
  'unique impressions': 'reach',
  // Reações
  'reactions': 'reactions',
  'likes': 'reactions',
  // Comentários
  'comments': 'comments',
  // Compartilhamentos
  'reposts': 'shares',
  'shares': 'shares',
  'reshares': 'shares',
  // Salvamentos
  'saves': 'saves',
  'bookmarks': 'saves',
  // Envios
  'sends': 'sends',
  // Cliques em perfil
  'profile views': 'profileViews',
  'profile views from post': 'profileViews',
  // Novos seguidores
  'followers gained': 'followersGained',
  'new followers': 'followersGained',
  // Cliques
  'post clicks': 'linkClicks',
  'clicks': 'linkClicks',
  'link clicks': 'linkClicks',
  // CTA premium
  'premium cta clicks': 'premiumCtaClicks',
};

// Colunas que devem ser ignoradas silenciosamente (métricas derivadas, metadados)
const IGNORE_COLUMNS = new Set([
  'engagement rate',
  'engagement rate (%)',
  'ctr',
  'click through rate',
]);

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Número serial do Excel
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const [m, d, y] = s.split('/').map(Number);
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return s || null;
}

export function parseLinkedInXlsx(buffer: Buffer): XlsxParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });

  // Procura a primeira aba com dados
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('XLSX_NO_SHEETS');
  const sheet = workbook.Sheets[sheetName]!;

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  if (raw.length === 0) throw new Error('XLSX_EMPTY_SHEET');

  // Normaliza headers para detectar mapeamento
  const headers = Object.keys(raw[0]!);
  const mapped = new Map<string, keyof XlsxRow>();
  const unmappedColumns: string[] = [];

  for (const h of headers) {
    const key = h.trim().toLowerCase();
    if (COLUMN_MAP[key]) {
      mapped.set(h, COLUMN_MAP[key]!);
    } else if (!IGNORE_COLUMNS.has(key)) {
      unmappedColumns.push(h);
    }
  }

  const rows: XlsxRow[] = raw.map(rawRow => {
    const warnings: string[] = [];
    const row: XlsxRow = {
      postUrl: null, publishedAt: null, title: null,
      impressions: null, reach: null, reactions: null, comments: null,
      shares: null, saves: null, sends: null, profileViews: null,
      followersGained: null, linkClicks: null, premiumCtaClicks: null,
      rawRow, warnings,
    };

    for (const [header, field] of mapped) {
      const val = rawRow[header];
      if (field === 'postUrl' || field === 'publishedAt' || field === 'title') {
        (row[field] as string | null) = val !== null ? String(val).trim() || null : null;
        if (field === 'publishedAt') row.publishedAt = parseDate(val);
      } else {
        const n = parseNumber(val);
        if (val !== null && val !== '' && n === null) {
          warnings.push(`UNPARSEABLE_NUMBER:${header}=${String(val)}`);
        }
        (row[field] as number | null) = n;
      }
    }

    return row;
  });

  return { rows, unmappedColumns, source: 'linkedin_xlsx' };
}
