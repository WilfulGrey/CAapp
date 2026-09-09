/**
 * OpenAI-Ads-Pixel (Werbung in ChatGPT) — reine Logik, im Browser aufgerufen.
 *
 * Der Lader steht in `app/layout.tsx` und laeuft AUSSCHLIESSLICH nach
 * Marketing-Einwilligung. Ohne Einwilligung existiert `window.oaiq` gar nicht.
 * Deshalb ist die Funktionspruefung hier gleichzeitig das Consent-Gate: es gibt
 * genau EINE Stelle, an der die Einwilligung ausgewertet wird (den Lader), und
 * keine zweite Bedingung, die davon abdriften koennte.
 *
 * Die erlaubten Ereignisnamen und Felder sind KEINE Annahme — sie stammen aus
 * dem ausgelieferten SDK (https://bzrcdn.openai.com/sdk/oaiq.min.js, geprueft
 * am 02.09.2026). Dort steht die Zuordnung Name -> Typ fest verdrahtet:
 *
 *   appointment_scheduled  -> customer_action
 *   checkout_started       -> contents
 *   contents_viewed        -> contents
 *   custom                 -> custom
 *   items_added            -> contents
 *   lead_created           -> customer_action
 *   order_created          -> contents
 *   page_viewed            -> contents
 *   registration_completed -> customer_action
 *   subscription_created   -> plan_enrollment
 *   trial_started          -> plan_enrollment
 *
 * Ein Typ `customer_action` nimmt NUR `type`, `amount` und `currency` an;
 * alles andere verwirft das SDK still. Der vierte Parameter (eventOptions)
 * kennt `event_id`, `custom_event_name` und `opt_out`.
 */

/** Pixel aus dem Ads Manager, Konto „Primundus Deutschland". */
export const OAIQ_PIXEL_ID = '6BMzErvmnYg7ibnpXriwfU';

/**
 * Wert einer Anfrage fuer die Gebotsoptimierung — Martins feste Staffelung
 * (Anfrage 20, Profil 90, Buchung 250).
 *
 * Bewusst NICHT der Eigenanteil aus der Kalkulation, obwohl der hier greifbar
 * waere und die eigene Analytik ihn auch mitschreibt: der liegt je nach Fall
 * bei 2.000-3.000 € und wuerde dem Gebotssystem erzaehlen, ein teurer
 * Pflegefall sei uns mehr wert als ein guenstiger. Fuer uns ist jede Anfrage
 * gleich viel wert — die Marge entsteht spaeter, nicht am Formular.
 */
export const WERT_ANFRAGE_EUR = 20;

/** Signatur des globalen `oaiq`, so wie das SDK sie bereitstellt. */
export type OaiqFn = (
  befehl: string,
  name?: string,
  details?: Record<string, unknown>,
  optionen?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    oaiq?: OaiqFn;
  }
}

/**
 * Meldet eine abgeschickte Angebotsanfrage an OpenAI Ads.
 *
 * `leadId` wandert als `event_id` mit. Das ist heute reine Vorsorge — es kostet
 * nichts und macht ein spaeteres serverseitiges Nachmelden moeglich, ohne die
 * Anfrage doppelt zu zaehlen.
 *
 * Gibt zurueck, ob tatsaechlich gemeldet wurde. `false` heisst im Normalfall
 * schlicht „keine Marketing-Einwilligung" und ist kein Fehler.
 */
export function meldeAnfrage(oaiq: unknown, leadId?: string): boolean {
  if (typeof oaiq !== 'function') return false;

  (oaiq as OaiqFn)(
    'measure',
    'lead_created',
    { type: 'customer_action', amount: WERT_ANFRAGE_EUR, currency: 'EUR' },
    leadId ? { event_id: leadId } : undefined,
  );

  return true;
}
