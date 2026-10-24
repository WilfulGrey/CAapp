// Zugangsschlüssel aus Mail-Links (Abmelden, Rückmeldung, Feedback) ohne ihn
// in der Adresse zu lassen (Registry #134).
//
// GTM meldet die volle Seitenadresse an Google Analytics und Clarity, und der
// Schlüssel dieser Links öffnet auch das Kundenportal. `middleware.ts` nimmt
// ihn deshalb schon auf dem Server aus der Adresse: Cookie nur für diese
// Seite, eine Stunde gültig, dann Weiterleitung auf dieselbe Adresse ohne
// `token`. Die Seite liest ihn hier.
//
// Pure (kein Next-Import): die Middleware nutzt die Konstanten, root-vitest
// testet die Funktionen.

export const LINK_TOKEN_COOKIE = 'pm_link_token';
export const LINK_TOKEN_MAX_AGE_S = 60 * 60;
export const SEITEN_MIT_LINK_TOKEN = ['/abmelden', '/feedback', '/rueckmeldung'] as const;

export function istSeiteMitLinkToken(pfad: string): boolean {
  return (SEITEN_MIT_LINK_TOKEN as readonly string[]).includes(pfad);
}

/** Adresse zuerst (alter Link ohne Weiterleitung, Tests), sonst das Cookie. */
export function linkToken(search: string, cookie: string): string | null {
  const ausAdresse = new URLSearchParams(search).get('token');
  if (ausAdresse) return ausAdresse;
  for (const teil of cookie.split(';')) {
    const [name, ...rest] = teil.trim().split('=');
    if (name === LINK_TOKEN_COOKIE) {
      const wert = rest.join('=');
      if (!wert) return null;
      try {
        return decodeURIComponent(wert);
      } catch {
        return wert;
      }
    }
  }
  return null;
}
