export class SafeError extends Error {
  constructor(public readonly code: string, public readonly status?: number, public readonly retryAfterMs?: number) {
    super(code);
    this.name = 'SafeError';
  }
}

export function errorCode(error: unknown): string {
  return error instanceof SafeError ? error.code : 'UNEXPECTED_ERROR';
}
