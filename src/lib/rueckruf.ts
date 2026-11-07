// „Rückruf vereinbaren“ im Minimal-Einstieg (Registry #147): die Bitte geht über dieselbe Route wie der Rückruf-Knopf der
// Rückmeldeseite (Abschiedsmail, Registry #72) — `POST {KOSTENRECHNER_URL}/api/rueckmeldung` mit
// `{ token, aktion: 'rueckruf', quelle: 'portal_einstieg' }`. Die Route schickt die Team-Mail „Rückruf erbeten
// (Kundenportal)“ an info@, schreibt das Ereignis `rueckruf_erbeten_mail` und sperrt 24 h gegen Wiederholung.
//
// Anders als `reportLeadEvent` (Fire-and-forget) WARTET der Aufruf auf die Antwort: Das Portal sagt „Danke, Marta ruft Sie
// an.“ nur, wenn die Route mit 2xx bestätigt hat (Heilige Regel 1). Wirft nie: jeder Fehler (Netz, 4xx, 5xx) ist `false`.
// Vorschau (Token „preview-token“): kein Netz.
import { KOSTENRECHNER_URL } from './leadEvents';

export const RUECKRUF_QUELLE = 'portal_einstieg';

export async function rueckrufAnfordern(token: string | null | undefined): Promise<boolean> {
  if (!token || token === 'preview-token') return false;
  try {
    const r = await fetch(`${KOSTENRECHNER_URL}/api/rueckmeldung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, aktion: 'rueckruf', quelle: RUECKRUF_QUELLE }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
