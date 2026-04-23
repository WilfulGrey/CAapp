// In-memory rate limiting — per Edge Function instance.
// Prostsze niż distributed, wystarczające dla anti-spam na poziomie onboarding.

const WINDOW_MS = 60 * 1000;
const MAX_REQ = 5; // onboard = rare, 5/min per IP wystarczy

const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(ip: string, nowMs: number = Date.now()): boolean {
  const bucket = buckets.get(ip);
  if (!bucket || nowMs > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: nowMs + WINDOW_MS });
    return false;
  }
  bucket.count++;
  return bucket.count > MAX_REQ;
}

export function _resetRateLimit() {
  buckets.clear();
}
