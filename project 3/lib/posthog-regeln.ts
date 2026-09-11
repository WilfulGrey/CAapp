/**
 * PostHog — die REINEN Regeln, gemeinsam für Kostenrechner und Kundenportal.
 *
 * Bewusst ein Modul ohne Browser-, React- oder PostHog-Import: beide Apps
 * importieren es (das Portal per relativem Pfad), und der Root-Vitest prüft
 * es direkt (src/__tests__/posthogRegeln.test.ts). Alles, was entscheidet,
 * WAS an PostHog geht, steht hier — die Einbauten in den Apps sind nur Kabel.
 *
 * Martins Entscheidungen (11.09.2026):
 *  - Region EU, Proxy über die eigene Domain (`/ingest` auf dem Rechner).
 *    Direkt an eu.i.posthog.com schreiben scheitert bei Werbeblockern und
 *    Safari lautlos — derselbe Fehler, der uns im August alle iPhone-
 *    Besucher gekostet hat (Erinnerung „analytics-nie-direkt-aus-dem-browser").
 *  - Cookielos VOR der Zustimmung, voll NACH der Zustimmung.
 *  - Sitzungsaufzeichnung an (nur im vollen Modus möglich).
 */

/**
 * Projekt-Schlüssel (phc_…). ÖFFENTLICH von Natur aus — er steht in jedem
 * ausgelieferten Seitenquelltext, PostHog behandelt ihn wie eine Adresse,
 * nicht wie ein Passwort. Deshalb im Code und nicht als NEXT_PUBLIC_/VITE_-
 * Variable: die fielen lautlos auf '' und müssten in vier Render-Diensten
 * einzeln gesetzt werden (Erinnerung „keine-pflichtadresse-in-env").
 * Leer = PostHog bleibt aus (kein Ersatz, kein Stub).
 * Projekt 271682 (EU), angelegt 11.09.2026.
 */
export const POSTHOG_SCHLUESSEL = 'phc_naQwh6D7DVnwK5JPb7L83Ja87KdMgFot2incVJqhZScB';

/** PostHog-App-Adresse (EU). Nur für Links aus der Symbolleiste. */
export const POSTHOG_UI_HOST = 'https://eu.posthog.com';

/** Konfigurations-Stand von PostHog, siehe posthog.com/docs „defaults". */
export const POSTHOG_DEFAULTS = '2026-05-30' as const;

/** Pfad des Proxys auf dem Kostenrechner (next.config.js → rewrites). */
export const PROXY_PFAD = '/ingest';

/**
 * Nur auf diesen Hosts läuft PostHog ohne Weiteres. Staging und localhost
 * bleiben stumm, sonst landen unsere eigenen Testläufe in denselben Zahlen —
 * genau das hat die Analyse vom 03.09. verfälscht (9 von 14 Anfragen waren
 * Tests). Zum Prüfen auf Staging: einmal `?posthog=1` an die Adresse hängen.
 */
export const PROD_HOSTS = ['kostenrechner.primundus.de', 'kundenportal.primundus.de'] as const;

/** Name des URL-Schalters UND des sessionStorage-Merkers für Testläufe. */
export const TEST_SCHALTER = 'posthog';

export type PostHogApp = 'kostenrechner' | 'kundenportal';
export type Umgebung = 'prod' | 'test';

/**
 * Soll PostHog auf diesem Host starten? `null` = nein.
 * `testAn` ist wahr, wenn in dieser Browser-Sitzung einmal `?posthog=1` stand.
 */
export function umgebungFuer(hostname: string, testAn: boolean): Umgebung | null {
  if ((PROD_HOSTS as readonly string[]).includes(hostname)) return 'prod';
  return testAn ? 'test' : null;
}

// ─── Magic-Link-Token ──────────────────────────────────────────────────────
//
// Die Portal-Adresse trägt `?token=…` — das ist der ZUGANG zum Kundenkonto,
// kein Merkmal. Er darf nie an PostHog: nicht in `$current_url`, nicht im
// Referrer, nicht in Link-Attributen der Aufzeichnung (BookedScreen verlinkt
// das Vertrags-PDF mit Token, die Einsatz-Übersicht verlinkt `?token=…&job=`).

// Bereits maskierte Werte (`***` von uns, `<masked>` von PostHogs eigenem
// Filter für custom_personal_data_properties) nicht noch einmal anfassen —
// sonst stand im Test `token=***<masked>`.
const TOKEN_MUSTER = /([?&#]token=|token%3D)(?!\*\*\*|<masked>|%3Cmasked%3E)[^&#"'\s<>]*/gi;
const TOKEN_ERSATZ = '$1***';

/** Ersetzt den Wert jedes `token=`-Parameters in einem Text durch `***`. */
export function tokenAusText(text: string): string {
  if (!/token(=|%3D)/i.test(text)) return text;
  return text.replace(TOKEN_MUSTER, TOKEN_ERSATZ);
}

/**
 * Säubert eine beliebig verschachtelte Struktur IN PLACE — für Ereignisse
 * und Aufzeichnungs-Schnipsel (rrweb-Knotenbäume). In place, weil ein
 * volles Aufzeichnungsbild mehrere tausend Knoten hat; eine Kopie je
 * Ereignis wäre auf alten Handys spürbar. Nur Texte, die überhaupt „token"
 * enthalten, werden angefasst.
 */
export function tokenUeberall<T>(wert: T, tiefe = 0): T {
  if (tiefe > 200 || wert === null || typeof wert !== 'object') return wert;
  if (Array.isArray(wert)) {
    for (let i = 0; i < wert.length; i++) {
      const v = wert[i];
      if (typeof v === 'string') wert[i] = tokenAusText(v);
      else if (v && typeof v === 'object') tokenUeberall(v, tiefe + 1);
    }
    return wert;
  }
  const obj = wert as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === 'string') obj[k] = tokenAusText(v);
    else if (v && typeof v === 'object') tokenUeberall(v, tiefe + 1);
  }
  return wert;
}

// ─── Eigenschaften eigener Ereignisse ──────────────────────────────────────
//
// POSITIVLISTE, keine Sperrliste: an PostHog gehen nur Felder, die hier
// stehen. Die Rechner-Ereignisse tragen in `answer` die Antworten
// (Pflegegrad, Mobilität) — Gesundheitsdaten nach Art. 9 DSGVO. Die
// Portal-Ereignisse tragen je nach Art Telefonnummer, PLZ und Ort. Nichts
// davon gehört zu PostHog; eine Sperrliste würde beim nächsten neuen Feld
// still undicht.

const ERLAUBTE_EIGENSCHAFTEN = new Set([
  'step',
  'step_name',
  'time_on_step_seconds',
  'source',
  'depth',
  'mail_source',
  'location_unresolved',
]);

export function erlaubteEigenschaften(
  props: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  const aus: Record<string, string | number | boolean> = {};
  if (!props) return aus;
  for (const [k, v] of Object.entries(props)) {
    if (!ERLAUBTE_EIGENSCHAFTEN.has(k)) continue;
    if (typeof v === 'number' || typeof v === 'boolean') aus[k] = v;
    else if (typeof v === 'string') aus[k] = tokenAusText(v).slice(0, 200);
  }
  return aus;
}

// ─── Die PostHog-Konfiguration ─────────────────────────────────────────────

export interface PostHogKonfigEingabe {
  app: PostHogApp;
  /** Voller Proxy-Pfad, z. B. `/ingest` (Rechner) oder `https://kostenrechner.primundus.de/ingest` (Portal). */
  apiHost: string;
  /**
   * Testlauf (`?posthog=1` auf Staging/localhost): Anfragen unkomprimiert,
   * damit sich im Netzwerk-Tab prüfen lässt, dass kein Token mitgeht. Die
   * Filterregeln sind in beiden Fällen dieselben.
   */
  testlauf?: boolean;
}

/**
 * Die Optionen für `posthog.init`. Zurück kommt ein schlichtes Objekt, damit
 * der Test jede Entscheidung einzeln festnageln kann.
 *
 * Einwilligung (geprüft im posthog-js-Quelltext 1.430, nicht in der Doku —
 * die lässt es offen):
 *   `cookieless_mode: 'on_reject'` + `opt_out_capturing_by_default: true`
 *   → wer den Banner IGNORIERT gilt als „abgelehnt" (`isRejected()` ist bei
 *     offenem Stand und opt_out_capturing_by_default wahr) und wird cookielos
 *     gezählt; wer ablehnt ebenso; `opt_in_capturing()` schaltet auf den
 *     vollen Modus mit Speicher und Aufzeichnung um. Ohne das zweite Flag
 *     würde PostHog Unentschiedene GAR NICHT zählen — und das sind bei uns
 *     die meisten.
 *   `cookieless_mode: 'always'` scheidet aus: dort ignoriert PostHog
 *   `opt_in_capturing()` ausdrücklich.
 *
 * Übergabe Rechner → Portal: der Einwilligungs-Merker liegt als Cookie auf
 * `.primundus.de` (`opt_out_capturing_persistence_type: 'cookie'` +
 * `cross_subdomain_cookie`). Das Portal hat keinen eigenen Banner und erbt
 * so die Entscheidung aus dem Rechner — ohne Änderung am Consent-Manager.
 */
export function postHogKonfig(e: PostHogKonfigEingabe) {
  const portal = e.app === 'kundenportal';
  return {
    api_host: e.apiHost,
    ui_host: POSTHOG_UI_HOST,
    defaults: POSTHOG_DEFAULTS,

    cookieless_mode: 'on_reject' as const,
    opt_out_capturing_by_default: true,
    opt_out_capturing_persistence_type: 'cookie' as const,
    cross_subdomain_cookie: true,
    secure_cookie: true,

    // Anonyme Besucher bekommen kein Personenprofil; erst die Lead-ID nach
    // Einwilligung macht eins daraus.
    person_profiles: 'identified_only' as const,

    // Autocapture ohne Texte und Attribute: im Portal stehen Namen, Adressen
    // und Pflegeangaben, im Rechner die Antworten. Die Trichter kommen aus
    // unseren eigenen Ereignissen (siehe erlaubteEigenschaften).
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['token'],

    // Adresse an der Quelle maskieren — posthog-js reicht hier
    // `window.location.href` durch, im Kern UND im Recorder.
    get_current_url: (adresse: string) => tokenAusText(adresse),

    session_recording: {
      maskAllInputs: true,
      // Portal: ALLE Texte maskieren — dort stehen Name, Adresse, Pflegegrad,
      // Demenz, Inkontinenz. Klickwege, Scrollen und Layout bleiben sichtbar.
      // Rechner: Marketingtext darf lesbar bleiben, Eingaben sind maskiert.
      ...(portal ? { maskTextSelector: '*' } : {}),
    },

    // Letzte Sicherung vor dem Versand: Token aus jedem Text, auch aus
    // Aufzeichnungs-Schnipseln (Link-Attribute im DOM).
    before_send: <T>(ereignis: T): T => tokenUeberall(ereignis),

    disable_compression: e.testlauf === true,
  };
}

/** Super-Eigenschaften, die an jedem Ereignis hängen. */
export function superEigenschaften(app: PostHogApp, umgebung: Umgebung) {
  return { app, umgebung };
}
