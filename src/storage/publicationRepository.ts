import { DatabaseSync } from 'node:sqlite';

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

export class PublicationRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(pub: Omit<Publication, 'attempts' | 'created_at' | 'updated_at'>): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO publications
        (id, notion_page_id, idempotency_key, operational_state, scheduled_at,
         linkedin_post_urn, linkedin_post_url, published_at, error_code,
         attempts, created_at, updated_at)
      VALUES
        ($id, $notion_page_id, $idempotency_key, $operational_state, $scheduled_at,
         $linkedin_post_urn, $linkedin_post_url, $published_at, $error_code,
         0, $created_at, $updated_at)
    `).run({
      $id: pub.id, $notion_page_id: pub.notion_page_id, $idempotency_key: pub.idempotency_key,
      $operational_state: pub.operational_state, $scheduled_at: pub.scheduled_at ?? null,
      $linkedin_post_urn: pub.linkedin_post_urn ?? null, $linkedin_post_url: pub.linkedin_post_url ?? null,
      $published_at: pub.published_at ?? null, $error_code: pub.error_code ?? null,
      $created_at: now, $updated_at: now,
    });
  }

  updateState(
    id: string,
    state: OperationalState,
    extra: Partial<Pick<Publication, 'linkedin_post_urn' | 'linkedin_post_url' | 'published_at' | 'error_code'>> = {},
  ): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE publications SET
        operational_state = $state,
        linkedin_post_urn = COALESCE($urn, linkedin_post_urn),
        linkedin_post_url = COALESCE($url, linkedin_post_url),
        published_at = COALESCE($published_at, published_at),
        error_code = COALESCE($error_code, error_code),
        attempts = attempts + 1,
        updated_at = $now
      WHERE id = $id
    `).run({
      $id: id, $state: state,
      $urn: extra.linkedin_post_urn ?? null, $url: extra.linkedin_post_url ?? null,
      $published_at: extra.published_at ?? null, $error_code: extra.error_code ?? null,
      $now: now,
    });
  }

  findByNotionPageId(notionPageId: string): Publication | null {
    return (this.db.prepare(
      'SELECT * FROM publications WHERE notion_page_id = $id ORDER BY created_at DESC LIMIT 1',
    ).get({ $id: notionPageId }) as Publication | undefined) ?? null;
  }

  /** Retorna true se já existe registro em estado que bloqueia nova tentativa de publicação. */
  existsByIdempotencyKey(key: string): boolean {
    return this.db.prepare(
      "SELECT 1 FROM publications WHERE idempotency_key = $key AND operational_state IN ('publishing','published','reconciliation_required')",
    ).get({ $key: key }) !== undefined;
  }

  /** Retorna true se já existe registro ativo (não-falho) — usado pelo QueueService para evitar re-enfileiramento. */
  isActiveByIdempotencyKey(key: string): boolean {
    return this.db.prepare(
      "SELECT 1 FROM publications WHERE idempotency_key = $key AND operational_state NOT IN ('failed')",
    ).get({ $key: key }) !== undefined;
  }

  findAll(): Publication[] {
    return this.db.prepare(
      'SELECT * FROM publications ORDER BY created_at DESC',
    ).all() as unknown as Publication[];
  }

  /** Posts com estado 'queued' cujo scheduled_at já passou. */
  findDueQueued(nowIso: string): Publication[] {
    return this.db.prepare(
      "SELECT * FROM publications WHERE operational_state = 'queued' AND scheduled_at IS NOT NULL AND scheduled_at <= $now ORDER BY scheduled_at ASC",
    ).all({ $now: nowIso }) as unknown as Publication[];
  }

  /** Posts publicados, ordenados por published_at (para analytics). */
  findPublished(): Publication[] {
    return this.db.prepare(
      "SELECT * FROM publications WHERE operational_state = 'published' ORDER BY published_at ASC",
    ).all() as unknown as Publication[];
  }
}
