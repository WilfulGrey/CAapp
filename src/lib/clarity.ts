// Tags the current Microsoft Clarity session with the lead's magic-link
// token. Used on both sides of the kostenrechner → kundenportal handoff
// so Clarity can stitch the visitor's path as one identified user.
//
// The Clarity tag loads inside GTM-59V6N7RC asynchronously. On first
// portal render the global may not exist yet — we retry on a small
// interval up to ~5s. After that we give up silently (no console
// noise — non-fatal).
//
// Idempotent — calling twice with the same token is a no-op for Clarity.

const RETRY_MAX_MS = 5000;
const RETRY_INTERVAL_MS = 200;

type ClarityFn = (cmd: 'set', key: 'userId', value: string) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

let lastIdentifiedToken: string | null = null;

export function identifyClarity(leadToken: string | null | undefined): void {
  if (!leadToken) return;
  if (leadToken === lastIdentifiedToken) return; // dedupe across re-renders
  const start = Date.now();

  const attempt = () => {
    if (typeof window === 'undefined') return;
    if (typeof window.clarity === 'function') {
      try {
        window.clarity('set', 'userId', leadToken);
        lastIdentifiedToken = leadToken;
      } catch {
        // never throw from analytics — tag may have its own quirks
      }
      return;
    }
    if (Date.now() - start > RETRY_MAX_MS) return; // give up
    setTimeout(attempt, RETRY_INTERVAL_MS);
  };

  attempt();
}

// Exposed for tests — reset module state between cases.
export function _resetClarityIdentifyState() {
  lastIdentifiedToken = null;
}
