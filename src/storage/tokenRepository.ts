import { DatabaseSync } from 'node:sqlite';

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
  constructor(private readonly db: DatabaseSync) {}

  save(token: Omit<LinkedInToken, 'id' | 'created_at' | 'updated_at'> & { created_at?: string }): void {
    const now = new Date().toISOString();
    const existing = this.get();
    if (existing) {
      this.db.prepare(`
        UPDATE linkedin_tokens SET
          member_urn = $member_urn,
          access_token = $access_token,
          access_token_expires_at = $access_token_expires_at,
          refresh_token = $refresh_token,
          refresh_token_expires_at = $refresh_token_expires_at,
          authorized_scopes = $authorized_scopes,
          updated_at = $updated_at
        WHERE id = 1
      `).run({
        $member_urn: token.member_urn ?? null,
        $access_token: token.access_token,
        $access_token_expires_at: token.access_token_expires_at,
        $refresh_token: token.refresh_token ?? null,
        $refresh_token_expires_at: token.refresh_token_expires_at ?? null,
        $authorized_scopes: token.authorized_scopes,
        $updated_at: now,
      });
    } else {
      this.db.prepare(`
        INSERT INTO linkedin_tokens
          (id, member_urn, access_token, access_token_expires_at,
           refresh_token, refresh_token_expires_at, authorized_scopes, created_at, updated_at)
        VALUES (1, $member_urn, $access_token, $access_token_expires_at,
                $refresh_token, $refresh_token_expires_at, $authorized_scopes, $created_at, $updated_at)
      `).run({
        $member_urn: token.member_urn ?? null,
        $access_token: token.access_token,
        $access_token_expires_at: token.access_token_expires_at,
        $refresh_token: token.refresh_token ?? null,
        $refresh_token_expires_at: token.refresh_token_expires_at ?? null,
        $authorized_scopes: token.authorized_scopes,
        $created_at: token.created_at ?? now,
        $updated_at: now,
      });
    }
  }

  get(): LinkedInToken | null {
    return (this.db.prepare('SELECT * FROM linkedin_tokens WHERE id = 1').get() as LinkedInToken | undefined) ?? null;
  }

  updateMemberUrn(urn: string): void {
    this.db.prepare('UPDATE linkedin_tokens SET member_urn = $urn, updated_at = $now WHERE id = 1')
      .run({ $urn: urn, $now: new Date().toISOString() });
  }

  clear(): void {
    this.db.prepare('DELETE FROM linkedin_tokens WHERE id = 1').run();
  }
}
