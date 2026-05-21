// Microsoft Clarity userId-stitching helper. Mirrors src/lib/clarity.ts
// in the kundenportal (Vite) so the kostenrechner → portal handoff
// surfaces as one identified user in Clarity. Lead token is the shared
// identifier (already used for the magic-link portal handoff + the
// /api/lead-event bridge).
//
// The Clarity tag loads inside GTM-59V6N7RC asynchronously. The global
// may not exist yet on first call — we retry on a small interval up to
// ~5s. After that we give up silently (no console noise — non-fatal).
//
// Idempotent — calling twice with the same token is a no-op.

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
  if (leadToken === lastIdentifiedToken) return;
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
    if (Date.now() - start > RETRY_MAX_MS) return;
    setTimeout(attempt, RETRY_INTERVAL_MS);
  };

  attempt();
}

export function _resetClarityIdentifyState() {
  lastIdentifiedToken = null;
}
