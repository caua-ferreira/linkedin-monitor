import { loadEnv } from '../config/env.js';
import { openDatabase } from '../storage/database.js';
import { PublicationRepository } from '../storage/publicationRepository.js';
import { AnalyticsRepository } from '../storage/analyticsRepository.js';
import { TokenRepository } from '../storage/tokenRepository.js';

type Classification = 'SAFE_FIX' | 'MANUAL_REVIEW';

interface Finding {
  classification: Classification;
  check: string;
  postId?: string;
  detail: string;
}

const CHECKPOINTS = ['1h', '24h', '72h'] as const;
const CHECKPOINT_MIN = { '1h': 60, '24h': 1440, '72h': 4320 } as const;
const STUCK_PUBLISHING_MIN = 15;
const AUTH_WARN_DAYS = 7;

function minutesAgo(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 60_000;
}

function main() {
  const env = loadEnv(process.env, false);
  const db = openDatabase(env.DATABASE_PATH);
  const pubRepo = new PublicationRepository(db);
  const analyticsRepo = new AnalyticsRepository(db);
  const tokenRepo = new TokenRepository(db);

  const findings: Finding[] = [];
  const flag = (classification: Classification, check: string, detail: string, postId?: string) =>
    findings.push({ classification, check, postId, detail });

  // 1. Auth token
  const token = tokenRepo.get();
  if (!token) {
    flag('MANUAL_REVIEW', 'auth_missing', 'Nenhum token LinkedIn salvo. Execute npm run auth:start.');
  } else {
    const expiresIn = (new Date(token.access_token_expires_at).getTime() - Date.now()) / 86_400_000;
    if (expiresIn <= 0) {
      flag('MANUAL_REVIEW', 'auth_expired', `Token expirado em ${token.access_token_expires_at}. Execute npm run auth:start.`);
    } else if (expiresIn <= AUTH_WARN_DAYS) {
      flag('MANUAL_REVIEW', 'auth_expiring_soon', `Token expira em ${expiresIn.toFixed(1)} dias (${token.access_token_expires_at}).`);
    }
  }

  const publications = pubRepo.findAll();

  for (const pub of publications) {
    // 2. Stale queued
    if (pub.operational_state === 'queued' && pub.scheduled_at) {
      const age = minutesAgo(pub.scheduled_at);
      if (age > 10) {
        flag('MANUAL_REVIEW', 'stale_queued',
          `Post enfileirado há ${age.toFixed(0)} min além do horário agendado. Scheduler rodou? Execute npm run scheduler.`,
          pub.notion_page_id);
      }
    }

    // 3. Stuck publishing
    if (pub.operational_state === 'publishing') {
      const age = minutesAgo(pub.updated_at);
      if (age > STUCK_PUBLISHING_MIN) {
        flag('MANUAL_REVIEW', 'stuck_publishing',
          `Estado 'publishing' há ${age.toFixed(0)} min. Pode ter publicado sem confirmar — verificar no LinkedIn antes de qualquer ação.`,
          pub.notion_page_id);
      }
    }

    // 4. Failed publications
    if (pub.operational_state === 'failed') {
      flag('MANUAL_REVIEW', 'publication_failed',
        `Publicação falhou com código ${pub.error_code ?? 'desconhecido'}. Revisar e reprocessar manualmente se necessário.`,
        pub.notion_page_id);
    }

    // 5. Published without Post URL
    if (pub.operational_state === 'published' && pub.linkedin_post_urn && !pub.linkedin_post_url) {
      flag('SAFE_FIX', 'missing_post_url',
        `URN ${pub.linkedin_post_urn} salvo mas Post URL vazio no Notion. Atualize Notion manualmente ou via reconciliação futura.`,
        pub.notion_page_id);
    }

    // 6. Analytics checkpoints overdue
    if (pub.operational_state === 'published' && pub.published_at) {
      const ageMin = minutesAgo(pub.published_at);
      const existingCheckpoints = analyticsRepo.checkpointsFor(pub.notion_page_id);
      for (const cp of CHECKPOINTS) {
        if (ageMin >= CHECKPOINT_MIN[cp] && !existingCheckpoints.includes(cp)) {
          flag('SAFE_FIX', 'analytics_overdue',
            `Checkpoint ${cp} devido (post publicado há ${ageMin.toFixed(0)} min) mas sem snapshot. Execute npm run analytics:import.`,
            pub.notion_page_id);
        }
      }
    }
  }

  // 7. reconciliation_required
  const needsReconcile = publications.filter(p => p.operational_state === 'reconciliation_required');
  for (const pub of needsReconcile) {
    flag('MANUAL_REVIEW', 'reconciliation_required',
      `Estado reconciliation_required — resultado da publicação ambíguo. Verificar no LinkedIn se o post existe antes de republicar.`,
      pub.notion_page_id);
  }

  db.close();

  // Report
  if (findings.length === 0) {
    console.log('\n✓ Nenhuma inconsistência encontrada.\n');
    return;
  }

  const safe = findings.filter(f => f.classification === 'SAFE_FIX');
  const manual = findings.filter(f => f.classification === 'MANUAL_REVIEW');

  console.log(`\nReconciliação — ${findings.length} ocorrência(s): ${safe.length} SAFE_FIX · ${manual.length} MANUAL_REVIEW\n`);

  for (const f of findings) {
    const tag = f.classification === 'SAFE_FIX' ? '[SAFE_FIX]     ' : '[MANUAL_REVIEW]';
    console.log(`${tag} ${f.check}`);
    if (f.postId) console.log(`               notion_page_id: ${f.postId}`);
    console.log(`               ${f.detail}`);
    console.log();
  }

  process.exitCode = findings.some(f => f.classification === 'MANUAL_REVIEW') ? 1 : 0;
}

try { main(); } catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
