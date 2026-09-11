/**
 * PostHog im Kundenportal — nur die Verkabelung. Die Regeln (was geht an
 * PostHog, Token-Filter, Maskierung) stehen in
 * `project 3/lib/posthog-regeln.ts` und gelten für Rechner und Portal gleich.
 *
 * Das Portal hat KEINEN eigenen Cookie-Banner. Die Entscheidung aus dem
 * Rechner kommt über PostHogs Einwilligungs-Cookie auf `.primundus.de` an
 * (siehe postHogKonfig). Wer im Rechner zugestimmt hat, wird hier voll
 * erfasst; alle anderen cookielos — auch, wer direkt aus einer Mail kommt.
 * Deshalb wird hier NIE opt_in/opt_out gerufen: das ist allein Sache des
 * Banners im Rechner.
 */
import posthog from 'posthog-js';
import {
  POSTHOG_SCHLUESSEL,
  TEST_SCHALTER,
  erlaubteEigenschaften,
  postHogKonfig,
  superEigenschaften,
  umgebungFuer,
} from '../../project 3/lib/posthog-regeln';

let gestartet = false;

function testlaufAn(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get(TEST_SCHALTER) === '1') {
      sessionStorage.setItem(TEST_SCHALTER, '1');
    }
    return sessionStorage.getItem(TEST_SCHALTER) === '1';
  } catch {
    return false;
  }
}

/** @param proxy volle Proxy-Adresse, z. B. `https://kostenrechner.primundus.de/ingest` */
export function postHogStarten(proxy: string): void {
  if (gestartet || typeof window === 'undefined') return;
  const umgebung = umgebungFuer(window.location.hostname, testlaufAn());
  if (!umgebung || !POSTHOG_SCHLUESSEL) return;
  posthog.init(
    POSTHOG_SCHLUESSEL,
    postHogKonfig({ app: 'kundenportal', apiHost: proxy, testlauf: umgebung === 'test' }),
  );
  posthog.register(superEigenschaften('kundenportal', umgebung));
  // Nur im Testlauf (?posthog=1) von außen erreichbar — zum Prüfen von
  // Einwilligungs-Stand und Ereignissen in der Browser-Konsole. Auf Prod
  // gibt es kein globales Objekt.
  if (umgebung === 'test') (window as unknown as { __posthog?: typeof posthog }).__posthog = posthog;
  gestartet = true;
}

/** Eigenes Ereignis — Eigenschaften nur über die Positivliste. */
export function postHogErfassen(name: string, eigenschaften?: Record<string, unknown>): void {
  if (!gestartet) return;
  try {
    posthog.capture(name, erlaubteEigenschaften(eigenschaften));
  } catch {
    // Messung darf das Portal nie stören.
  }
}

/** Lead-ID (UUID) — nur mit Zustimmung, nie Token, Name oder E-Mail. */
export function postHogIdentifizieren(leadId: string | null | undefined): void {
  if (!gestartet || !leadId) return;
  if (posthog.get_explicit_consent_status() !== 'granted') return;
  try {
    posthog.identify(leadId);
  } catch {
    // s. o.
  }
}
