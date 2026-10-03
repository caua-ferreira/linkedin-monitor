import { describe, it, expect } from 'vitest';
import { suggestCheckpoint } from '../analytics/analyticsModels.js';

describe('suggestCheckpoint', () => {
  it('retorna null para menos de 60 minutos', () => {
    expect(suggestCheckpoint(0)).toBeNull();
    expect(suggestCheckpoint(59)).toBeNull();
  });
  it('retorna 1h para 60–1439 minutos', () => {
    expect(suggestCheckpoint(60)).toBe('1h');
    expect(suggestCheckpoint(90)).toBe('1h');
    expect(suggestCheckpoint(1439)).toBe('1h');
  });
  it('retorna 24h para 1440–4319 minutos', () => {
    expect(suggestCheckpoint(1440)).toBe('24h');
    expect(suggestCheckpoint(1500)).toBe('24h');
    expect(suggestCheckpoint(4319)).toBe('24h');
  });
  it('retorna 72h para >= 4320 minutos', () => {
    expect(suggestCheckpoint(4320)).toBe('72h');
    expect(suggestCheckpoint(4423)).toBe('72h');
    expect(suggestCheckpoint(99999)).toBe('72h');
  });
});
