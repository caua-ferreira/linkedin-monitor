import { randomBytes } from 'node:crypto';
import type { Router } from 'express';
import type { Logger } from 'pino';
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getMemberUrn,
  type OAuthConfig,
} from '../../linkedin/linkedinAuth.js';
import type { TokenRepository } from '../../storage/tokenRepository.js';

// Estado CSRF mantido em memória — único usuário, processo local.
// ponytail: in-memory state, suficiente para uso pessoal de um usuário.
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60_000; // 10 min

function cleanupStates(): void {
  const now = Date.now();
  for (const [s, ts] of pendingStates) {
    if (now - ts > STATE_TTL_MS) pendingStates.delete(s);
  }
}

export function registerLinkedInAuthRoutes(
  router: Router,
  config: OAuthConfig,
  tokenRepo: TokenRepository,
  logger: Logger,
): void {
  // Inicia o fluxo OAuth — redireciona para o LinkedIn
  router.get('/auth/linkedin', (_req, res) => {
    cleanupStates();
    const state = randomBytes(16).toString('hex');
    pendingStates.set(state, Date.now());
    const url = buildAuthorizationUrl(config.clientId, config.redirectUri, state);
    logger.info({ action: 'oauth_start' });
    res.redirect(url);
  });

  // Callback do LinkedIn após autorização
  router.get('/auth/linkedin/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string>;

    if (error) {
      logger.warn({ action: 'oauth_callback_error', error });
      res.status(400).send(`LinkedIn recusou a autorização: ${error_description ?? error}`);
      return;
    }

    if (!state || !pendingStates.has(state)) {
      res.status(400).send('Estado OAuth inválido ou expirado. Tente novamente em /auth/linkedin');
      return;
    }
    pendingStates.delete(state);

    if (!code) {
      res.status(400).send('Código de autorização ausente.');
      return;
    }

    try {
      const tokens = await exchangeCodeForTokens(code, config);
      const memberUrn = await getMemberUrn(tokens.accessToken, config.fetch);
      tokenRepo.save({
        member_urn: memberUrn,
        access_token: tokens.accessToken,
        access_token_expires_at: tokens.accessTokenExpiresAt,
        refresh_token: tokens.refreshToken,
        refresh_token_expires_at: tokens.refreshTokenExpiresAt,
        authorized_scopes: tokens.authorizedScopes,
      });
      logger.info({ action: 'oauth_success', member_urn: memberUrn });
      res.send(`
        <html><body style="font-family:sans-serif;padding:2rem">
          <h1>✓ Autenticado com LinkedIn</h1>
          <p>Membro: <code>${memberUrn}</code></p>
          <p>Escopos: <code>${tokens.authorizedScopes}</code></p>
          <p>Token expira em: <code>${tokens.accessTokenExpiresAt}</code></p>
          <p>Refresh token: <code>${tokens.refreshToken ? 'sim' : 'não disponível'}</code></p>
          <p>Você pode fechar esta janela.</p>
        </body></html>
      `);
    } catch (error) {
      const code_err = error instanceof Error ? error.message : String(error);
      logger.error({ action: 'oauth_callback_failed', code: code_err });
      res.status(500).send(`Erro ao trocar o código: ${code_err}. Tente novamente.`);
    }
  });
}
