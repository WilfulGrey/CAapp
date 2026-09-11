/**
 * PostHog im Kostenrechner — nur die Verkabelung. Was an PostHog geht und
 * wie, entscheidet `posthog-regeln.ts` (gemeinsam mit dem Kundenportal).
 *
 * Einwilligung: unser Cookie-Banner (`cookie-consent.ts`) bleibt die EINE
 * Quelle der Wahrheit. PostHog läuft vor und ohne Zustimmung cookielos und
 * wird hier bei jeder Entscheidung nachgezogen:
 *   Zustimmung zu Analyse  → opt_in_capturing()   → voll, mit Aufzeichnung
 *   Ablehnung / Widerruf   → opt_out_capturing()  → zurück auf cookielos
 *   noch keine Entscheidung → Merker löschen      → cookielos
 */
import posthog from 'posthog-js';
import { cookieConsent, type ConsentState } from './cookie-consent';
import {
  POSTHOG_SCHLUESSEL,
  PROXY_PFAD,
  TEST_SCHALTER,
  erlaubteEigenschaften,
  postHogKonfig,
  superEigenschaften,
  umgebungFuer,
} from './posthog-regeln';

let gestartet = false;
// Super-Eigenschaften (app, umgebung). PostHog verwirft sie beim Umschalten
// cookielos ↔ voll — im Test vom 11.09. fehlten sie nach „Alle akzeptieren"
// an jedem Ereignis. Deshalb nach jedem Wechsel erneut registrieren.
let superEig: ReturnType<typeof superEigenschaften> | null = null;

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

function einwilligungAbgleichen(stand: ConsentState | null): void {
  if (!gestartet) return;
  const bisher = posthog.get_explicit_consent_status();
  if (stand?.analytics) {
    // captureEventName: false — sonst zählt PostHog bei JEDEM Seitenaufruf
    // eines Zustimmers ein weiteres `$opt_in`.
    if (bisher !== 'granted') posthog.opt_in_capturing({ captureEventName: false });
  } else if (stand) {
    if (bisher !== 'denied') posthog.opt_out_capturing();
  } else if (bisher !== 'pending') {
    posthog.clear_opt_in_out_capturing();
  }
  if (superEig) posthog.register(superEig);
}

export function postHogStarten(): void {
  if (gestartet || typeof window === 'undefined') return;
  const umgebung = umgebungFuer(window.location.hostname, testlaufAn());
  if (!umgebung) return;
  if (!POSTHOG_SCHLUESSEL) {
    console.info('[PostHog] aus — kein Projekt-Schlüssel hinterlegt');
    return;
  }
  posthog.init(
    POSTHOG_SCHLUESSEL,
    postHogKonfig({ app: 'kostenrechner', apiHost: PROXY_PFAD, testlauf: umgebung === 'test' }),
  );
  superEig = superEigenschaften('kostenrechner', umgebung);
  posthog.register(superEig);
  // Nur im Testlauf (?posthog=1) von außen erreichbar — zum Prüfen von
  // Einwilligungs-Stand und Ereignissen in der Browser-Konsole. Auf Prod
  // gibt es kein globales Objekt.
  if (umgebung === 'test') (window as unknown as { __posthog?: typeof posthog }).__posthog = posthog;
  gestartet = true;
  einwilligungAbgleichen(cookieConsent.getConsent());
  cookieConsent.subscribe(einwilligungAbgleichen);
}

/**
 * Eigenes Ereignis an PostHog. Eigenschaften laufen durch die Positivliste —
 * Antworten (Pflegegrad, Mobilität) kommen nie an.
 * `sofort`: für Ereignisse direkt vor dem Redirect ins Portal.
 */
export function postHogErfassen(
  name: string,
  eigenschaften?: Record<string, unknown>,
  sofort = false,
): void {
  if (!gestartet) return;
  try {
    posthog.capture(
      name,
      erlaubteEigenschaften(eigenschaften),
      sofort ? { send_instantly: true, transport: 'sendBeacon' } : undefined,
    );
  } catch {
    // Messung darf den Rechner nie stören.
  }
}

/**
 * Verknüpft den Besucher mit seinem Lead — NUR nach Zustimmung (cookielos
 * gibt es keine dauerhafte Kennung). Die Lead-ID ist eine UUID; Name,
 * E-Mail und Telefon gehen nie an PostHog, der Portal-Token schon gar nicht.
 */
export function postHogIdentifizieren(leadId: string | null | undefined): void {
  if (!gestartet || !leadId) return;
  if (posthog.get_explicit_consent_status() !== 'granted') return;
  try {
    posthog.identify(leadId);
  } catch {
    // s. o.
  }
}
