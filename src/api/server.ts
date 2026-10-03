import express from 'express';
import type { Logger } from 'pino';
import type { OAuthConfig } from '../linkedin/linkedinAuth.js';
import type { TokenRepository } from '../storage/tokenRepository.js';
import { registerLinkedInAuthRoutes } from './routes/linkedinAuth.js';

export function createServer(
  config: OAuthConfig,
  tokenRepo: TokenRepository,
  logger: Logger,
): express.Application {
  const app = express();
  app.disable('x-powered-by');

  const router = express.Router();
  registerLinkedInAuthRoutes(router, config, tokenRepo, logger);

  router.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use(router);
  return app;
}

export function startServer(app: express.Application, port: number, logger: Logger): void {
  app.listen(port, () => {
    logger.info({ action: 'server_started', port });
    console.log(`\nServidor OAuth iniciado em http://localhost:${port}`);
    console.log(`Abra no browser: http://localhost:${port}/auth/linkedin\n`);
  });
}
