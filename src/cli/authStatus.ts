#!/usr/bin/env node
import { loadEnv } from '../config/env.js';
import { openDatabase } from '../storage/database.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { isTokenExpired } from '../linkedin/linkedinAuth.js';

async function main(): Promise<void> {
  const env = loadEnv(process.env, false);
  const db = await openDatabase(env.DATABASE_PATH);
  const repo = new TokenRepository(db);
  const token = await repo.get();

  console.log('\n=== LinkedIn Auth Status ===\n');

  if (!token) {
    console.log('LinkedIn autenticado: NÃO');
    console.log(`\nPara autenticar: npm run auth:start`);
    console.log(`  → abrirá http://localhost:${env.API_PORT}/auth/linkedin`);
    db.close();
    return;
  }

  const expired = isTokenExpired(token.access_token_expires_at);
  const expiresAt = new Date(token.access_token_expires_at);

  console.log(`LinkedIn autenticado:   SIM`);
  console.log(`Membro URN:             ${token.member_urn ?? 'não resolvido ainda'}`);
  console.log(`Access token expira:    ${expiresAt.toLocaleString('pt-BR')}${expired ? '  ⚠ EXPIRADO' : ''}`);
  console.log(`Refresh token:          ${token.refresh_token ? 'disponível' : 'não disponível'}`);
  if (token.refresh_token_expires_at) {
    const refreshExpired = isTokenExpired(token.refresh_token_expires_at);
    console.log(`Refresh expira:         ${new Date(token.refresh_token_expires_at).toLocaleString('pt-BR')}${refreshExpired ? '  ⚠ EXPIRADO' : ''}`);
  }
  console.log(`Escopos autorizados:`);
  token.authorized_scopes.split(' ').filter(Boolean).forEach(s => console.log(`  - ${s}`));
  console.log(`Última atualização:     ${new Date(token.updated_at).toLocaleString('pt-BR')}`);

  if (expired && !token.refresh_token) {
    console.log('\n⚠ Token expirado e sem refresh token.');
    console.log('  Reautorize em: npm run auth:start');
  } else if (expired) {
    console.log('\n⚠ Token expirado. Será renovado automaticamente na próxima publicação.');
  }

  console.log(`\nDRY_RUN: ${env.DRY_RUN}`);
  db.close();
}

main().catch(e => {
  console.error('Erro:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
