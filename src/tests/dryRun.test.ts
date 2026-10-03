import { expect, it, vi } from 'vitest';
import { buildDryRunPlan } from '../services/dryRunService.js';
import { post, silentLogger } from './helpers.js';
import { loadEnv } from '../config/env.js';

it('waits before schedule and would publish at the precise instant', () => {
  expect(buildDryRunPlan([post()], new Date('2026-10-02T15:19:59Z'), silentLogger)[0]!.action).toBe('would_wait');
  expect(buildDryRunPlan([post()], new Date('2026-10-02T15:20:00Z'), silentLogger)[0]!.action).toBe('would_publish');
});
it('blocks already published posts even if still approved', () => {
  expect(buildDryRunPlan([{ ...post(), schedulerId: 'urn:li:share:1' }], new Date('2026-10-03T00:00:00Z'), silentLogger)[0]!.action).toBe('blocked');
});
it('produces a deterministic key and never invokes external APIs', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  try {
    const now = new Date('2026-10-03T00:00:00Z');
    const first = buildDryRunPlan([post()], now, silentLogger);
    expect(first).toEqual(buildDryRunPlan([post()], now, silentLogger));
    expect(first[0]!.idempotencyKey).toBe(`${post().id}:2026-10-02T15:20:00.000Z`);
    expect(fetcher).not.toHaveBeenCalled();
    expect(post().status).toBe('Aprovado');
  } finally { vi.unstubAllGlobals(); }
});
it('defaults to dry-run and requires credentials for real reads', () => {
  expect(loadEnv({}, false).DRY_RUN).toBe('true');
  expect(() => loadEnv({})).toThrow('NOTION_TOKEN_REQUIRED');
});
it('aceita DRY_RUN=false e rejeita valores inválidos', () => {
  expect(loadEnv({ DRY_RUN: 'false' }, false).DRY_RUN).toBe('false');
  expect(() => loadEnv({ DRY_RUN: 'yes' }, false)).toThrow('ENV_INVALID');
});
