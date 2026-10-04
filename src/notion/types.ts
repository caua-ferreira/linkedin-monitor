import { z } from 'zod';

export const richTextSchema = z.object({
  type: z.string().optional(),
  plain_text: z.string(),
  href: z.string().nullable().optional(),
});
export type RichText = z.infer<typeof richTextSchema>;
export const propertySchema = z.object({ type: z.string() }).catchall(z.unknown());
export type Property = z.infer<typeof propertySchema>;
export const pageSchema = z.object({
  object: z.literal('page'), id: z.string(),
  archived: z.boolean().optional(), is_archived: z.boolean().optional(), in_trash: z.boolean().optional(),
  properties: z.record(z.string(), propertySchema),
});
export type NotionPage = z.infer<typeof pageSchema>;
export const blockSchema = z.object({
  object: z.literal('block'), id: z.string(), type: z.string(), has_children: z.boolean(),
}).catchall(z.unknown());
export type Block = z.infer<typeof blockSchema> & { children?: Block[] };

export interface EditorialPost {
  id: string;
  title: string;
  status: string;
  date: string;
  time: string;
  dateEnd: string | null;
  format: string;
  art: string;
  ready: boolean;
  mediaUrl: string;
  postUrl: string;
  utmUrl: string;
  schedulerId: string;
  publishedAt: string;
  automationError: string;
  archived: boolean;
  brainfrost: boolean;
  text: string;
  contentErrors: string[];
}
