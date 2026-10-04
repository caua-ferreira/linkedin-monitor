import * as XLSX from 'xlsx';
import type { AnalyticsSource } from '../analyticsModels.js';

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
  unmappedColumns: string[];
  source: AnalyticsSource;
}

// Mapeamento "All Posts Analytics" (inglês) coluna → campo interno
const COLUMN_MAP: Record<string, keyof XlsxRow> = {
  'post url': 'postUrl',
  'url': 'postUrl',
  'link': 'postUrl',
  'post published date': 'publishedAt',
  'published date': 'publishedAt',
  'date published': 'publishedAt',
  'post date': 'publishedAt',
  'date': 'publishedAt',
  'post title': 'title',
  'title': 'title',
  'content': 'title',
  'update': 'title',
  'impressions': 'impressions',
  'post impressions': 'impressions',
  'members reached': 'reach',
  'unique views': 'reach',
  'reach': 'reach',
  'unique impressions': 'reach',
  'reactions': 'reactions',
  'likes': 'reactions',
  'comments': 'comments',
  'reposts': 'shares',
  'shares': 'shares',
  'reshares': 'shares',
  'saves': 'saves',
  'bookmarks': 'saves',
  'sends': 'sends',
  'profile views': 'profileViews',
  'profile views from post': 'profileViews',
  'followers gained': 'followersGained',
  'new followers': 'followersGained',
  'post clicks': 'linkClicks',
  'clicks': 'linkClicks',
  'link clicks': 'linkClicks',
  'premium cta clicks': 'premiumCtaClicks',
};

// Mapeamento "Single Post Analytics" (português) nome da métrica → campo interno
const PT_METRIC_MAP: Record<string, keyof XlsxRow> = {
  'impressões': 'impressions',
  'usuários alcançados': 'reach',
  'membros alcançados': 'reach',
  'reações': 'reactions',
  'comentários': 'comments',
  'compartilhamentos': 'shares',
  'republicações': 'shares',
  'salvamentos': 'saves',
  'envios no linkedin': 'sends',
  'envios': 'sends',
  'visualizações do perfil a partir desta publicação': 'profileViews',
  'visualizações do perfil': 'profileViews',
  'seguidores obtidos com esta publicação': 'followersGained',
  'novos seguidores': 'followersGained',
  'cliques no link': 'linkClicks',
  'cliques': 'linkClicks',
  'engajamentos no botão premium personalizado': 'premiumCtaClicks',
};

const IGNORE_COLUMNS = new Set([
  'engagement rate',
  'engagement rate (%)',
  'ctr',
  'click through rate',
]);

const LINKEDIN_URL_RE = /https?:\/\/(www\.)?linkedin\.com\//i;

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseDate(value: unknown, ptBr = false): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${String(d.y).padStart(4, '0')}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const parts = s.split('/').map(Number);
    // PT-BR: DD/MM/YYYY; EN: MM/DD/YYYY
    const [a, b, y] = parts as [number, number, number];
    const [d, m] = ptBr ? [a, b] : [b, a];
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return s || null;
}

/**
 * Formato "Single Post Analytics" do LinkedIn:
 * - Linha 0 (header lido pelo XLSX): ["URL da publicação", "{post_url}", ""]
 * - Cada linha de dado tem: col[0]=nome_da_métrica, col[1]=valor
 * Retorna uma única XlsxRow com todos os campos preenchidos.
 */
function parseSinglePostFormat(raw: Record<string, unknown>[]): XlsxRow {
  const headers = Object.keys(raw[0]!);
  const urlColumn = headers.find(h => LINKEDIN_URL_RE.test(h))!;
  const labelColumn = headers.find(h => !LINKEDIN_URL_RE.test(h) && h !== '__EMPTY')!;

  const postUrl = (() => { try { return decodeURIComponent(urlColumn); } catch { return urlColumn; } })();
  const metrics = new Map<string, unknown>();

  for (const row of raw) {
    const label = String(row[labelColumn] ?? '').trim().toLowerCase();
    const value = row[urlColumn];
    if (label && !metrics.has(label)) metrics.set(label, value); // primeira ocorrência
  }

  const result: XlsxRow = {
    postUrl,
    publishedAt: parseDate(metrics.get('data da publicação') ?? null, true),
    title: null,
    impressions: null, reach: null, reactions: null, comments: null,
    shares: null, saves: null, sends: null, profileViews: null,
    followersGained: null, linkClicks: null, premiumCtaClicks: null,
    rawRow: Object.fromEntries(metrics),
    warnings: [],
  };

  for (const [ptName, field] of Object.entries(PT_METRIC_MAP)) {
    const val = metrics.get(ptName);
    if (val !== undefined) (result[field] as number | null) = parseNumber(val);
  }

  return result;
}

export function parseLinkedInXlsx(buffer: Buffer): XlsxParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('XLSX_NO_SHEETS');
  const sheet = workbook.Sheets[sheetName]!;

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: true,
  });

  if (raw.length === 0) throw new Error('XLSX_EMPTY_SHEET');

  const headers = Object.keys(raw[0]!);

  // Detecta formato Single Post Analytics: header contém uma URL do LinkedIn
  if (headers.some(h => LINKEDIN_URL_RE.test(h))) {
    const row = parseSinglePostFormat(raw);
    return { rows: [row], unmappedColumns: [], source: 'linkedin_xlsx' };
  }

  // Formato All Posts Analytics (uma linha por post)
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
