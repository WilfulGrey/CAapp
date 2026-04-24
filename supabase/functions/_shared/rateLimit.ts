// In-memory rate limiting — per Edge Function instance, per bucket.
// Prostsze niż distributed, wystarczające dla anti-spam.
// Separate buckets per bucketKey pozwalają różnym Edge Functions współistnieć
// z własnymi limitami (onboard 5/min, proxy 60/min).

const DEFAULT_WINDOW_MS = 60 * 1000;

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  /** Scope key, e.g. "onboard" or "proxy" — prevents cross-function interference. */
  bucketKey: string;
  /** Max requests per window. */
  max: number;
  /** Window in ms. Defaults to 60_000. */
  windowMs?: number;
  /** For tests. */
  nowMs?: number;
}

export function isRateLimited(ip: string, opts: RateLimitOptions): boolean {
  const key = `${opts.bucketKey}:${ip}`;
  const now = opts.nowMs ?? Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + (opts.windowMs ?? DEFAULT_WINDOW_MS) });
    return false;
  }
  bucket.count++;
  return bucket.count > opts.max;
}

export function _resetRateLimit() {
  buckets.clear();
}
