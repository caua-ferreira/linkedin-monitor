import type { Client } from '@libsql/client';

export type OperationalState =
  | 'idle'
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'reconciliation_required';

export interface Publication {
  id: string;
  notion_page_id: string;
  idempotency_key: string;
  operational_state: OperationalState;
  scheduled_at: string | null;
  linkedin_post_urn: string | null;
  linkedin_post_url: string | null;
  published_at: string | null;
  error_code: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

function rowToPub(row: Record<string, unknown>): Publication {
  return {
    id: row.id as string,
    notion_page_id: row.notion_page_id as string,
    idempotency_key: row.idempotency_key as string,
    operational_state: row.operational_state as OperationalState,
    scheduled_at: (row.scheduled_at as string | null) ?? null,
    linkedin_post_urn: (row.linkedin_post_urn as string | null) ?? null,
    linkedin_post_url: (row.linkedin_post_url as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    error_code: (row.error_code as string | null) ?? null,
    attempts: typeof row.attempts === 'bigint' ? Number(row.attempts) : (row.attempts as number),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

export class PublicationRepository {
  constructor(private readonly db: Client) {}

  async claimQueued(id: string, pageId: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: `UPDATE publications SET operational_state = 'publishing', updated_at = ?
        WHERE id = ? AND notion_page_id = ? AND operational_state = 'queued'
        AND NOT EXISTS (SELECT 1 FROM publications other WHERE other.notion_page_id = ?
          AND other.id <> ? AND other.operational_state IN ('publishing','published','reconciliation_required'))`,
      args: [new Date().toISOString(), id, pageId, pageId, id],
    });
    return result.rowsAffected === 1;
  }

  async insert(pub: Omit<Publication, 'attempts' | 'created_at' | 'updated_at'>): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: `INSERT INTO publications
        (id, notion_page_id, idempotency_key, operational_state, scheduled_at,
         linkedin_post_urn, linkedin_post_url, published_at, error_code,
         attempts, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        pub.id, pub.notion_page_id, pub.idempotency_key, pub.operational_state,
        pub.scheduled_at ?? null, pub.linkedin_post_urn ?? null, pub.linkedin_post_url ?? null,
        pub.published_at ?? null, pub.error_code ?? null, now, now,
      ],
    });
  }

  async updateState(
    id: string,
    state: OperationalState,
    extra: Partial<Pick<Publication, 'linkedin_post_urn' | 'linkedin_post_url' | 'published_at' | 'error_code'>> = {},
  ): Promise<void> {
    const now = new Date().toISOString();
    await this.db.execute({
      sql: `UPDATE publications SET
        operational_state = ?,
        linkedin_post_urn = COALESCE(?, linkedin_post_urn),
        linkedin_post_url = COALESCE(?, linkedin_post_url),
        published_at = COALESCE(?, published_at),
        error_code = COALESCE(?, error_code),
        attempts = attempts + 1,
        updated_at = ?
      WHERE id = ?`,
      args: [
        state,
        extra.linkedin_post_urn ?? null, extra.linkedin_post_url ?? null,
        extra.published_at ?? null, extra.error_code ?? null,
        now, id,
      ],
    });
  }

  async findByNotionPageId(notionPageId: string): Promise<Publication | null> {
    const result = await this.db.execute({
      sql: 'SELECT * FROM publications WHERE notion_page_id = ? ORDER BY created_at DESC LIMIT 1',
      args: [notionPageId],
    });
    return result.rows.length ? rowToPub(result.rows[0] as unknown as Record<string, unknown>) : null;
  }

  async existsByIdempotencyKey(key: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: "SELECT 1 FROM publications WHERE idempotency_key = ? AND operational_state IN ('publishing','published','reconciliation_required')",
      args: [key],
    });
    return result.rows.length > 0;
  }

  async isActiveByIdempotencyKey(key: string): Promise<boolean> {
    const result = await this.db.execute({
      sql: "SELECT 1 FROM publications WHERE idempotency_key = ? AND operational_state NOT IN ('failed')",
      args: [key],
    });
    return result.rows.length > 0;
  }

  async findAll(): Promise<Publication[]> {
    const result = await this.db.execute(
      'SELECT * FROM publications ORDER BY created_at DESC',
    );
    return result.rows.map(r => rowToPub(r as unknown as Record<string, unknown>));
  }

  async findDueQueued(nowIso: string): Promise<Publication[]> {
    const result = await this.db.execute({
      sql: "SELECT * FROM publications WHERE operational_state = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at ASC",
      args: [nowIso],
    });
    return result.rows.map(r => rowToPub(r as unknown as Record<string, unknown>));
  }

  async findPublished(): Promise<Publication[]> {
    const result = await this.db.execute(
      "SELECT * FROM publications WHERE operational_state = 'published' ORDER BY published_at ASC",
    );
    return result.rows.map(r => rowToPub(r as unknown as Record<string, unknown>));
  }
}
