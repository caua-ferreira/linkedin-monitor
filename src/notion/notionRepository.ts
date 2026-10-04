import { z } from 'zod';
import { SafeError } from '../utils/errors.js';
import { extractFinalText } from './notionContentParser.js';
import { schemaProblems } from './notionSchema.js';
import { richTextSchema, type EditorialPost, type NotionPage, type Property } from './types.js';
import type { NotionClient } from './notionClient.js';

function value(property: Property | undefined): string {
  if (!property) throw new SafeError('NOTION_PROPERTY_MISSING');
  const raw = property[property.type];
  if (property.type === 'title' || property.type === 'rich_text') {
    const parsed = z.array(richTextSchema).safeParse(raw);
    if (!parsed.success) throw new SafeError('NOTION_PROPERTY_INVALID');
    return parsed.data.map(t => t.plain_text).join('').trim();
  }
  if (property.type === 'select' || property.type === 'status') {
    const parsed = z.object({ name: z.string() }).nullable().safeParse(raw);
    if (!parsed.success) throw new SafeError('NOTION_PROPERTY_INVALID');
    return parsed.data?.name ?? '';
  }
  if (property.type === 'date') {
    const parsed = z.object({ start: z.string(), end: z.string().nullable().optional() }).nullable().safeParse(raw);
    if (!parsed.success) throw new SafeError('NOTION_PROPERTY_INVALID');
    return parsed.data?.start ?? '';
  }
  if (property.type === 'url') {
    if (raw !== null && typeof raw !== 'string') throw new SafeError('NOTION_PROPERTY_INVALID');
    return raw ?? '';
  }
  throw new SafeError('NOTION_PROPERTY_UNSUPPORTED');
}

export function mapPage(page: NotionPage): EditorialPost {
  if (schemaProblems(page.properties).length) throw new SafeError('NOTION_PAGE_SCHEMA_MISMATCH');
  const p = page.properties;
  const readyProp = p['Pronto para publicar'];
  const ready = readyProp?.type === 'formula'
    ? Boolean((readyProp as unknown as Record<string, Record<string, unknown>>).formula?.boolean)
    : readyProp?.checkbox;
  if (typeof ready !== 'boolean') throw new SafeError('NOTION_PROPERTY_INVALID');
  const date = z.object({ end: z.string().nullable().optional() }).nullable().safeParse(p.Data?.date);
  if (!date.success) throw new SafeError('NOTION_PROPERTY_INVALID');
  return {
    id: page.id, title: value(p.Post), status: value(p.Status), date: value(p.Data), time: value(p['Horário']),
    dateEnd: date.data?.end ?? null, format: value(p.Formato), art: value(p.Arte), ready,
    mediaUrl: value(p['Mídia URL']), postUrl: value(p['Post URL']), utmUrl: value(p['UTM URL']),
    schedulerId: value(p['Scheduler ID']), publishedAt: value(p['Publicado em']), automationError: value(p['Erro automação']),
    archived: Boolean(page.archived || page.is_archived || page.in_trash),
    brainfrost: p['BrainFrost?']?.type === 'checkbox' ? Boolean(p['BrainFrost?']?.checkbox) : false,
    text: '', contentErrors: [],
  };
}

export function isReadyPost(post: EditorialPost): boolean {
  return !post.archived && post.status === 'Aprovado' && Boolean(post.date && post.time) &&
    ['Pronta', 'Não precisa'].includes(post.art) && post.ready && !post.schedulerId;
}

export class NotionRepository {
  constructor(private readonly client: NotionClient) {}

  async getPostById(pageId: string): Promise<EditorialPost> {
    const page = await this.client.getPage(pageId);
    const post = mapPage(page);
    const result = extractFinalText(await this.client.getPageContent(post.id));
    return { ...post, text: result.text, contentErrors: result.errors };
  }

  async getPostsByDateWithoutMedia(date: string): Promise<EditorialPost[]> {
    const pages = await this.client.queryWithFilter({
      and: [
        { property: 'Data', date: { equals: date } },
        { property: 'Mídia URL', url: { is_empty: true } },
      ],
    });
    return pages.flatMap(p => { try { return [mapPage(p)]; } catch { return []; } });
  }

  async getReadyPosts(): Promise<EditorialPost[]> {
    const properties = await this.client.getSchema();
    if (schemaProblems(properties).length) throw new SafeError('NOTION_SCHEMA_MISMATCH_RUN_NOTION_CHECK');
    const pages = await this.client.queryByStatus('Aprovado', properties.Status!.type as 'status' | 'select');
    const posts: EditorialPost[] = [];
    for (const page of pages) {
      try {
        const post = mapPage(page);
        if (!isReadyPost(post)) {
          this.client.log(post.id, post.title, 'eligibility', 'skipped');
          continue;
        }
        const result = extractFinalText(await this.client.getPageContent(post.id));
        posts.push({ ...post, text: result.text, contentErrors: result.errors });
      } catch (error) {
        await this.client.recordError(page.id, '', error);
        // Falha de leitura invalida o lote; nunca retornar um plano parcial como completo.
        throw error;
      }
    }
    return posts;
  }
}
