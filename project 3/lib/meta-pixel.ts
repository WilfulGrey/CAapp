/**
 * Meta-Pixel (Werbung auf Facebook und Instagram) — reine Logik, im Browser
 * aufgerufen. Schwester von `lib/oaiq.ts`, gleiche Bauart.
 *
 * Der Lader steht in `app/layout.tsx` (Script-ID `meta-pixel-consent`) und
 * laeuft AUSSCHLIESSLICH nach Marketing-Einwilligung. Ohne Einwilligung
 * existiert `window.fbq` gar nicht. Deshalb ist die Funktionspruefung hier
 * gleichzeitig das Consent-Gate — es gibt genau EINE Stelle, an der die
 * Einwilligung ausgewertet wird (den Lader).
 *
 * Was an Meta geht, ist bewusst schmal:
 *   - `PageView` beim Laden (macht der Lader, fuer „Landingpage-Aufrufe")
 *   - `Lead` nach abgeschickter Anfrage, mit festem Wert und der leadId als
 *     `eventID` (Vorsorge fuer einen spaeteren Server-Weg ohne Doppelzaehlung)
 *
 * NICHT an Meta: Antworten aus dem Rechner (Pflegegrad, Mobilitaet, Nacht —
 * das sind Gesundheitsangaben), Name, E-Mail, Telefon, Preis. Der Lader schaltet
 * `autoConfig` ab, damit das SDK nicht selbst Knopf-Klicks und Seitendaten
 * einsammelt.
 */
import { WERT_ANFRAGE_EUR } from './oaiq';

/**
 * Datensatz „Primundus Kostenrechner" im Events Manager, Business-Portfolio
 * Primundus (1384211821436967), verbunden mit dem Werbekonto 1357917132982741
 * (Kampagne „Primundus Start 11-2026"). Angelegt 21.11.2026.
 */
export const META_PIXEL_ID = '2358395084910089';

/** Signatur des globalen `fbq`, soweit wir sie benutzen. */
export type FbqFn = (
  befehl: string,
  name?: string,
  details?: Record<string, unknown>,
  optionen?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    fbq?: FbqFn;
  }
}

/**
 * Meldet eine abgeschickte Angebotsanfrage an Meta.
 *
 * Wert = dieselbe feste Staffelung wie beim OpenAI-Pixel (Anfrage 20 €, die
 * Begruendung steht in lib/oaiq.ts). Meta erwartet den Wert in ganzen Euro,
 * nicht in Cent.
 *
 * Gibt zurueck, ob tatsaechlich gemeldet wurde. `false` heisst im Normalfall
 * schlicht „keine Marketing-Einwilligung" und ist kein Fehler.
 */
export function meldeMetaAnfrage(fbq: unknown, leadId?: string): boolean {
  if (typeof fbq !== 'function') return false;

  const details = { value: WERT_ANFRAGE_EUR, currency: 'EUR' };
  if (leadId) {
    (fbq as FbqFn)('track', 'Lead', details, { eventID: leadId });
  } else {
    (fbq as FbqFn)('track', 'Lead', details);
  }

  return true;
}
