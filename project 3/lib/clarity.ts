// Microsoft Clarity userId-stitching helper. Mirrors src/lib/clarity.ts
// in the kundenportal (Vite) so the kostenrechner → portal handoff
// surfaces as one identified user in Clarity. The lead's ID (UUID,
// `leads.id`) is the shared identifier.
//
// Never the magic-link token: it is the key to the customer account and
// must not reach a third party. Only UUID-shaped values pass — the 32-char
// alphanumeric token (generateToken) can't, even if a caller mixes them up.
//
// The Clarity tag loads inside GTM-59V6N7RC asynchronously. The global
// may not exist yet on first call — we retry on a small interval up to
// ~5s. After that we give up silently (no console noise — non-fatal).
//
// Idempotent — calling twice with the same ID is a no-op.

const RETRY_MAX_MS = 5000;
const RETRY_INTERVAL_MS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClarityFn = (cmd: 'set', key: 'userId', value: string) => void;

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

let lastIdentifiedId: string | null = null;

export function identifyClarity(leadId: string | null | undefined): void {
  if (!leadId || !UUID_RE.test(leadId)) return;
  if (leadId === lastIdentifiedId) return;
  const start = Date.now();

  const attempt = () => {
    if (typeof window === 'undefined') return;
    if (typeof window.clarity === 'function') {
      try {
        window.clarity('set', 'userId', leadId);
        lastIdentifiedId = leadId;
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
  lastIdentifiedId = null;
}
