import { SafeError } from '../utils/errors.js';
import { retry, sleep, type Sleeper } from '../utils/retry.js';

export interface LinkedInClientOptions {
  accessToken: string;
  apiVersion: string;
  fetch?: typeof fetch;
  wait?: Sleeper;
}

const BASE = 'https://api.linkedin.com';

export class LinkedInClient {
  private readonly fetcher: typeof fetch;
  private readonly wait: Sleeper;

  constructor(private readonly options: LinkedInClientOptions) {
    this.fetcher = options.fetch ?? fetch;
    this.wait = options.wait ?? sleep;
  }

  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const operation = async (): Promise<T> => {
      let response: Response;
      try {
        response = await this.fetcher(`${BASE}${path}`, {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(20_000),
          headers: {
            Authorization: `Bearer ${this.options.accessToken}`,
            'Linkedin-Version': this.options.apiVersion,
            'X-Restli-Protocol-Version': '2.0.0',
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
          throw new SafeError('LINKEDIN_TIMEOUT');
        }
        throw new SafeError('LINKEDIN_NETWORK_ERROR');
      }

      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? Number(retryAfter) * 1000 : 0;
        throw new SafeError(
          `LINKEDIN_HTTP_${response.status}`,
          response.status,
          Number.isFinite(delay) ? Math.max(0, delay) : 0,
        );
      }

      if (response.status === 201 || response.status === 204) {
        return { headers: Object.fromEntries(response.headers.entries()) } as T;
      }
      try { return (await response.json()) as T; } catch { throw new SafeError('LINKEDIN_INVALID_JSON'); }
    };
    // A failed creation response may follow a successful write: never retry blindly.
    return method === 'POST' && path === '/rest/posts'
      ? operation()
      : retry(operation, this.wait);
  }
}
