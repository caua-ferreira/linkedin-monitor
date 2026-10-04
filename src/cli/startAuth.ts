#!/usr/bin/env node
import { loadEnv } from '../config/env.js';
import { createLogger } from '../utils/logger.js';
import { openDatabase } from '../storage/database.js';
import { TokenRepository } from '../storage/tokenRepository.js';
import { createServer, startServer } from '../api/server.js';

async function main(): Promise<void> {
  const env = loadEnv(process.env, false);

  if (!env.LINKEDIN_CLIENT_ID || !env.LINKEDIN_CLIENT_SECRET) {
    console.error('LINKEDIN_CLIENT_ID e LINKEDIN_CLIENT_SECRET são obrigatórios no .env');
    process.exit(1);
  }

  const logger = createLogger(env.DATA_DIR, env.LOG_LEVEL);
  const db = await openDatabase(env.DATABASE_PATH);
  const tokenRepo = new TokenRepository(db);

  const app = createServer(
    {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      redirectUri: env.LINKEDIN_REDIRECT_URI,
    },
    tokenRepo,
    logger,
  );

  startServer(app, env.API_PORT, logger);
  // Processo fica ativo para receber o callback
}

main().catch(e => {
  console.error('Erro:', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
