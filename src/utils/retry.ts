import { SafeError } from './errors.js';

export type Sleeper = (ms: number) => Promise<void>;
export const sleep: Sleeper = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function retry<T>(operation: () => Promise<T>, wait: Sleeper = sleep): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      const recoverable = error instanceof SafeError && (
        error.code === 'NOTION_TIMEOUT' || error.status === 429 || (error.status !== undefined && error.status >= 500 && error.status <= 599)
      );
      if (!recoverable || attempt >= 3) throw error;
      await wait(Math.max(error instanceof SafeError ? error.retryAfterMs ?? 0 : 0, 500 * 2 ** attempt + Math.floor(Math.random() * 200)));
    }
  }
}
