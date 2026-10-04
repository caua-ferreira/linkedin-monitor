import type { Client } from '@libsql/client';

export interface LinkedInToken {
  id: 1;
  member_urn: string | null;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string | null;
  refresh_token_expires_at: string | null;
  authorized_scopes: string;
  created_at: string;
  updated_at: string;
}

export class TokenRepository {
  constructor(private readonly db: Client) {}

  async save(token: Omit<LinkedInToken, 'id' | 'created_at' | 'updated_at'> & { created_at?: string }): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.get();
    if (existing) {
      await this.db.execute({
        sql: `UPDATE linkedin_tokens SET
          member_urn = ?, access_token = ?, access_token_expires_at = ?,
          refresh_token = ?, refresh_token_expires_at = ?,
          authorized_scopes = ?, updated_at = ?
        WHERE id = 1`,
        args: [
          token.member_urn ?? null, token.access_token, token.access_token_expires_at,
          token.refresh_token ?? null, token.refresh_token_expires_at ?? null,
          token.authorized_scopes, now,
        ],
      });
    } else {
      await this.db.execute({
        sql: `INSERT INTO linkedin_tokens
          (id, member_urn, access_token, access_token_expires_at,
           refresh_token, refresh_token_expires_at, authorized_scopes, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          token.member_urn ?? null, token.access_token, token.access_token_expires_at,
          token.refresh_token ?? null, token.refresh_token_expires_at ?? null,
          token.authorized_scopes, token.created_at ?? now, now,
        ],
      });
    }
  }

  async get(): Promise<LinkedInToken | null> {
    const result = await this.db.execute('SELECT * FROM linkedin_tokens WHERE id = 1');
    if (!result.rows.length) return null;
    const r = result.rows[0] as unknown as Record<string, unknown>;
    return {
      id: 1,
      member_urn: (r.member_urn as string | null) ?? null,
      access_token: r.access_token as string,
      access_token_expires_at: r.access_token_expires_at as string,
      refresh_token: (r.refresh_token as string | null) ?? null,
      refresh_token_expires_at: (r.refresh_token_expires_at as string | null) ?? null,
      authorized_scopes: r.authorized_scopes as string,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };
  }

  async updateMemberUrn(urn: string): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE linkedin_tokens SET member_urn = ?, updated_at = ? WHERE id = 1',
      args: [urn, new Date().toISOString()],
    });
  }

  async clear(): Promise<void> {
    await this.db.execute('DELETE FROM linkedin_tokens WHERE id = 1');
  }
}
