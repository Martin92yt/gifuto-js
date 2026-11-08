export interface ApiErrorBody {
  code: string;
  message: string;
  details?: { field?: string; message?: string }[];
  requestId?: string;
}

/** Base class: every error thrown by the client extends it. */
export class GifutoError extends Error {
  override name = 'GifutoError';
  /** Stable machine-readable code (`invalid_api_key`, `rate_limited_key`, `network_error`…). */
  readonly code: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly details: ApiErrorBody['details'];

  constructor(message: string, opts: { code: string; status?: number | null; requestId?: string | null; details?: ApiErrorBody['details']; cause?: unknown }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.code = opts.code;
    this.status = opts.status ?? null;
    this.requestId = opts.requestId ?? null;
    this.details = opts.details;
  }
}

/** 401 / 403: missing, invalid or revoked key, or suspended account. */
export class AuthError extends GifutoError {
  override name = 'AuthError';
}

/** 404. */
export class NotFoundError extends GifutoError {
  override name = 'NotFoundError';
}

/** 422: `details` lists each invalid field. */
export class ValidationError extends GifutoError {
  override name = 'ValidationError';
}

/** 429: `retryAfter` is in seconds (null if the header is missing). */
export class RateLimitError extends GifutoError {
  override name = 'RateLimitError';
  readonly retryAfter: number | null;
  constructor(message: string, opts: ConstructorParameters<typeof GifutoError>[1] & { retryAfter: number | null }) {
    super(message, opts);
    this.retryAfter = opts.retryAfter;
  }
}

/** Any other 4xx/5xx answer. */
export class ApiError extends GifutoError {
  override name = 'ApiError';
}

/** The request never got an answer (offline, DNS, timeout). */
export class NetworkError extends GifutoError {
  override name = 'NetworkError';
}

export function fromResponse(status: number, body: unknown, headers: Headers): GifutoError {
  const e = (body as { error?: Partial<ApiErrorBody> } | null)?.error;
  const message = e?.message ?? `Request failed with status ${status}.`;
  const opts = {
    code: e?.code ?? `http_${status}`,
    status,
    requestId: e?.requestId ?? headers.get('x-request-id'),
    details: e?.details,
  };
  if (status === 401 || status === 403) return new AuthError(message, opts);
  if (status === 404) return new NotFoundError(message, opts);
  if (status === 422) return new ValidationError(message, opts);
  if (status === 429) {
    const raw = Number(headers.get('retry-after'));
    return new RateLimitError(message, { ...opts, retryAfter: Number.isFinite(raw) && raw >= 0 ? raw : null });
  }
  return new ApiError(message, opts);
}
