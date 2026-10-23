// The customer's magic-link token, without keeping it in the address bar.
//
// GTM (GA4, Clarity) reports the full page address; until 23.10.2026 every
// portal visit with consent put `?token=…` into Google Analytics (2,276 page
// views in 28 days) — the key to the customer's portal. The inline script at
// the top of index.html now takes the token out of the URL BEFORE the GTM
// snippet runs: it keeps it on `window.__pmPortalToken` for this page load
// and in localStorage for reloads and bookmarks, then `replaceState`s the
// address without it. Registry #134.
//
// Order here: this load's token → the address (tests, or a browser whose
// storage refused the write, so the script left the URL alone) → storage
// (bare kundenportal URL, reload). A token in a fresh mail link always wins,
// because the script overwrites storage with it.

export const PORTAL_TOKEN_STORAGE_KEY = 'pm_portal_token';

declare global {
  interface Window {
    __pmPortalToken?: string;
  }
}

export function portalToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.__pmPortalToken) return window.__pmPortalToken;
  const ausAdresse = new URLSearchParams(window.location.search).get('token');
  if (ausAdresse) return ausAdresse;
  try {
    return window.localStorage.getItem(PORTAL_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}
