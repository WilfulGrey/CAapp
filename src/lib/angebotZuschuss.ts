// Angebotskarte im Minimal-Einstieg (Registry #147, Fassung „CGA-Stil“ 08.11.2026): „Nach Zuschüssen ca. … €“ mit derselben
// Zahl wie im Kasten „IHR ANGEBOT“ der kurzen Angebotsmail (Registry #148). Martin 08.11.: „da finde ich das in der mail schön
// gelöst auch mit den kosten nach anrechnung von zuschüssen“.
//
// Spiegel von `eigenanteilAus` in
// project 3/supabase/functions/send-scheduled-emails/kundenMails.ts (Zweig feat/angebotsmail-minimal). Die Edge Function
// kann nichts aus src/ importieren; beide Stellen müssen dieselbe Zahl zeigen, sonst sieht der Kunde in Mail und Portal
// zwei Eigenanteile. Bei Änderungen beide Dateien anpassen.
import type { LeadKalkulation } from './supabase';

const ZUSCHUSS_POSTEN = new Set(['pflegegeld', 'entlastungsbudget_neu', 'steuervorteil']);

export type Eigenanteil = { eigen: number };

/** Eigenanteil wie in der Mail: Preis minus die GERUNDETEN Posten mit `in_kalkulation`. Unbekannter Posten, keine Posten,
 *  Abweichung über 2 € von `kalkulation.eigenanteil` → `null` (dann keine Zeile; lieber nichts als eine falsche Zahl). */
export function eigenanteilAus(kalk: LeadKalkulation | null | undefined): Eigenanteil | null {
  const brutto = typeof kalk?.bruttopreis === 'number' ? kalk.bruttopreis : 0;
  const items = kalk?.['zuschüsse']?.items;
  if (!brutto || !Array.isArray(items) || typeof kalk?.eigenanteil !== 'number') return null;
  const drin = items.filter((z) => z?.in_kalkulation && Number(z.betrag_monatlich) > 0);
  if (!drin.length || drin.some((z) => !ZUSCHUSS_POSTEN.has(z.name))) return null;
  const eigen = brutto - drin.reduce((s, z) => s + Math.round(Number(z.betrag_monatlich)), 0);
  if (eigen <= 0 || eigen >= brutto || Math.abs(eigen - kalk.eigenanteil) > 2) return null;
  return { eigen };
}
