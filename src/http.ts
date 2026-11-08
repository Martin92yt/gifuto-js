import { GifutoError, NetworkError, RateLimitError, fromResponse } from './errors';

export interface HttpOptions {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  /** Extra attempts after the first one (idempotent requests only; 429 and 5xx and network errors). */
  maxRetries: number;
  /** Longest wait we accept for a retry, in ms (a longer Retry-After is thrown instead). */
  maxRetryWaitMs: number;
  fetch: typeof fetch;
  userAgent?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type Query = Record<string, string | number | boolean | string[] | undefined>;

export function buildUrl(base: string, path: string, query?: Query): string {
  const url = new URL(base.replace(/\/+$/, '') + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) url.searchParams.set(k, v.join(','));
    } else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export async function request<T>(
  o: HttpOptions,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  init: { query?: Query; body?: unknown } = {},
): Promise<T> {
  const url = buildUrl(o.baseUrl, path, init.query);
  // GET, PUT and DELETE are idempotent: safe to repeat. POST/PATCH are never retried.
  const retriable = method === 'GET' || method === 'PUT' || method === 'DELETE';
  const attempts = (retriable ? o.maxRetries : 0) + 1;
  let lastError: GifutoError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await o.fetch(url, {
        method,
        headers: {
          'X-API-Key': o.apiKey,
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(o.userAgent ? { 'User-Agent': o.userAgent } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(o.timeoutMs),
      });

      if (res.status === 204) return undefined as T;
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) return body as T;

      const err = fromResponse(res.status, body, res.headers);
      if (!(retriable && (res.status === 429 || res.status >= 500)) || attempt === attempts) throw err;
      lastError = err;
      if (err instanceof RateLimitError && err.retryAfter !== null) {
        // The server told us how long to wait: if that is too long for us, give up instead of blocking.
        if (err.retryAfter * 1000 > o.maxRetryWaitMs) throw err;
        await sleep(err.retryAfter * 1000);
      } else {
        // Our own exponential back-off is simply capped.
        await sleep(Math.min(500 * 2 ** (attempt - 1), o.maxRetryWaitMs));
      }
    } catch (e) {
      if (e instanceof GifutoError) throw e;
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      lastError = new NetworkError(timedOut ? `Request timed out after ${o.timeoutMs} ms.` : 'Could not reach the Gifuto API.', {
        code: timedOut ? 'timeout' : 'network_error',
        cause: e,
      });
      if (attempt === attempts) throw lastError;
      await sleep(Math.min(500 * 2 ** (attempt - 1), o.maxRetryWaitMs));
    }
  }
  throw lastError ?? new NetworkError('Unknown error.', { code: 'network_error' });
}