import { createClient } from '@libsql/client';
const db = createClient({ url: 'file:./data/linkedin-monitor.sqlite' });
const r = await db.execute('SELECT * FROM linkedin_tokens WHERE id = 1');
if (!r.rows.length) { process.stderr.write('Token não encontrado.\n'); process.exit(1); }
const row = r.rows[0];
process.stdout.write(JSON.stringify({
  member_urn: row.member_urn,
  access_token: row.access_token,
  access_token_expires_at: row.access_token_expires_at,
  refresh_token: row.refresh_token ?? '',
  refresh_token_expires_at: row.refresh_token_expires_at ?? '',
  authorized_scopes: row.authorized_scopes,
}));
db.close();
