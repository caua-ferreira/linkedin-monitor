/**
 * Insere o token LinkedIn no SQLite a partir de variáveis de ambiente.
 * Usado no GitHub Actions para seed do banco antes do scheduler rodar.
 * Não sobrescreve se o token já existir e não estiver expirado.
 */
import { createClient } from '@libsql/client';
import { mkdirSync } from 'node:fs';

const {
  DATABASE_PATH = './data/linkedin-monitor.sqlite',
  LINKEDIN_ACCESS_TOKEN,
  LINKEDIN_MEMBER_URN,
  LINKEDIN_ACCESS_TOKEN_EXPIRES,
  LINKEDIN_AUTHORIZED_SCOPES,
} = process.env;

if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_MEMBER_URN || !LINKEDIN_ACCESS_TOKEN_EXPIRES) {
  process.stderr.write('LINKEDIN_ACCESS_TOKEN, LINKEDIN_MEMBER_URN e LINKEDIN_ACCESS_TOKEN_EXPIRES são obrigatórios.\n');
  process.exit(1);
}

mkdirSync('./data', { recursive: true });
const db = createClient({ url: `file:${DATABASE_PATH}` });

const existing = await db.execute('SELECT access_token_expires_at FROM linkedin_tokens WHERE id = 1');
if (existing.rows.length) {
  const expiresAt = existing.rows[0].access_token_expires_at;
  if (new Date(expiresAt).getTime() > Date.now() + 5 * 60_000) {
    process.stdout.write(`Token existente válido até ${expiresAt}, sem seed necessário.\n`);
    db.close();
    process.exit(0);
  }
}

const now = new Date().toISOString();
await db.execute({
  sql: `INSERT OR REPLACE INTO linkedin_tokens
    (id, member_urn, access_token, access_token_expires_at,
     refresh_token, refresh_token_expires_at, authorized_scopes, created_at, updated_at)
    VALUES (1, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
  args: [
    LINKEDIN_MEMBER_URN,
    LINKEDIN_ACCESS_TOKEN,
    LINKEDIN_ACCESS_TOKEN_EXPIRES,
    LINKEDIN_AUTHORIZED_SCOPES ?? 'email openid profile w_member_social',
    now, now,
  ],
});

process.stdout.write(`Token semeado para ${LINKEDIN_MEMBER_URN}, expira em ${LINKEDIN_ACCESS_TOKEN_EXPIRES}.\n`);
db.close();
