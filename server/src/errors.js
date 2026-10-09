/** Operational error with an HTTP status and a stable machine-readable code. */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status; this.code = code; this.details = details;
  }
}
export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const notFound = (msg) => new AppError(404, 'NOT_FOUND', msg);

/** Thrown by providers when the upstream API fails after retries. */
export class UpstreamError extends AppError {
  constructor(message, { status = 502, upstreamStatus, retryAfter } = {}) {
    super(status, upstreamStatus === 429 ? 'UPSTREAM_RATE_LIMITED' : 'UPSTREAM_ERROR', message);
    this.upstreamStatus = upstreamStatus; this.retryAfter = retryAfter;
  }
}
