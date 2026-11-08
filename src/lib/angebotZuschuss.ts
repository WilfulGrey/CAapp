// Angebotskarte im Minimal-Einstieg (Registry #147, Fassung „CGA-Stil“ 08.11.2026): grüne Zeile „Nach Zuschüssen ca. … €
// im Monat“ und die Chips „Eine Person“ / „Pflegegrad N“ wie im Kasten „IHR ANGEBOT“ der kurzen Angebotsmail (Registry
// #148). Martin 08.11.: „da finde ich das in der mail schön gelöst auch mit den kosten nach anrechnung von zuschüssen“.
//
// Spiegel von `eigenanteilAus`, `angebotChips` und `EHEPAAR_SATZ` in
// project 3/supabase/functions/send-scheduled-emails/kundenMails.ts (Zweig feat/angebotsmail-minimal). Die Edge Function
// kann nichts aus src/ importieren; beide Stellen müssen dieselbe Zahl zeigen, sonst sieht der Kunde in Mail und Portal
// zwei Eigenanteile. Bei Änderungen beide Dateien anpassen.
import type { LeadKalkulation } from './supabase';

const ZUSCHUSS_POSTEN = new Set(['pflegegeld', 'entlastungsbudget_neu', 'steuervorteil']);

/** Unter „Nach Zuschüssen …“ bei zwei Personen (Wortlaut der Mail seit #117). */
export const EHEPAAR_SATZ = 'Gerechnet ist mit den Zuschüssen für eine Person.';

export type Eigenanteil = { eigen: number; ehepaarSatz: boolean };

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
  return { eigen, ehepaarSatz: kalk.formularDaten?.betreuung_fuer === 'ehepaar' && drin.some((z) => z.name === 'pflegegeld') };
}

/** Chips unter dem Preis: „Eine Person“ / „Zwei Personen“ und „Pflegegrad N“ (nur 1–5). Fehlt eine Angabe, fehlt der Chip. */
export function angebotChips(fd: Record<string, unknown> | null | undefined): string[] {
  const chips: string[] = [];
  if (fd?.betreuung_fuer === '1-person') chips.push('Eine Person');
  else if (fd?.betreuung_fuer === 'ehepaar') chips.push('Zwei Personen');
  const pg = fd?.pflegegrad;
  if ((typeof pg === 'number' || (typeof pg === 'string' && /^\d$/.test(pg))) && Number(pg) >= 1 && Number(pg) <= 5) {
    chips.push(`Pflegegrad ${Number(pg)}`);
  }
  return chips;
}
