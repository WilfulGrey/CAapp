/*
 * Eigenanteil OHNE Entlastungsbudget — Entscheidung 3, Martin 15.10.2026 („alle Empfehlungen umsetzen“).
 *
 * Das Entlastungsbudget (Posten `entlastungsbudget_neu`, 3.539 € im Jahr = 294,92 € im Monat) zählt NIE zum
 * Eigenanteil, egal was `subsidies_config.in_kalkulation` sagt (Prod stand am 15.10.2026 auf `true`). Die Pflegekasse
 * erstattet es nur für Ersatzpflege bei Verhinderung einer privaten Pflegeperson oder für Kurzzeitpflege, nicht für
 * laufende 24-Stunden-Betreuung. primundus.de rechnet ab demselben Stand so (Pflegegrad 3: ab ca. 1.218 € statt 923 €).
 *
 * Zwei Wege, eine Regel:
 *  - Neue Berechnung (lib/calculation.ts, lib/calculator-context.tsx): `nachEigenanteilRegel` setzt den Posten auf
 *    `in_kalkulation: false`; `zuschüsse.gesamt` und `eigenanteil` enthalten ihn nicht mehr.
 *  - Gespeicherte Anfragen von vorher tragen ihn noch mit `in_kalkulation: true`, ihr `eigenanteil` ist um 294,92 € zu
 *    niedrig. Wer eine gespeicherte Kalkulation zeigt, nimmt `eigenanteilOhneEntlastungsbudget` /
 *    `zuschuesseOhneEntlastungsbudget` und filtert Posten mit `zaehltZumEigenanteil`, nie mit `in_kalkulation` allein.
 *
 * Rein, ohne Importe. Dieselbe Regel steht in `src/lib/eigenanteil.ts` (Kundenportal) und als Kopie dieser Datei in
 * `supabase/functions/send-scheduled-emails/eigenanteil.ts` (Kundenmails; Edge Functions können nicht aus lib/
 * importieren). `src/__tests__/eigenanteil.test.ts` prüft alle drei gegeneinander — Änderung hier = Änderung dort.
 */

/** Posten, die nie zum Eigenanteil zählen. */
export const NIE_IM_EIGENANTEIL: readonly string[] = ['entlastungsbudget_neu'];

type Posten = { name?: unknown; in_kalkulation?: unknown; betrag_monatlich?: unknown };

const runde = (n: number): number => Math.round(n * 100) / 100;

function zuschuesseVon(kalk: unknown): { gesamt?: unknown; items?: unknown } | null {
  if (!kalk || typeof kalk !== 'object') return null;
  const z = (kalk as Record<string, unknown>)['zuschüsse'];
  return z && typeof z === 'object' ? (z as { gesamt?: unknown; items?: unknown }) : null;
}

/** Zählt der Posten zum Eigenanteil? Nur mit `in_kalkulation` und nie, wenn er in `NIE_IM_EIGENANTEIL` steht. */
export function zaehltZumEigenanteil(z: unknown): boolean {
  if (!z || typeof z !== 'object') return false;
  const p = z as Posten;
  return Boolean(p.in_kalkulation) && !NIE_IM_EIGENANTEIL.includes(String(p.name));
}

/** Neue Berechnung: derselbe Posten, `in_kalkulation` nach der Regel oben. */
export function nachEigenanteilRegel<T extends { name: string; in_kalkulation: boolean }>(z: T): T {
  return { ...z, in_kalkulation: zaehltZumEigenanteil(z) };
}

/** Monatsbetrag, den eine gespeicherte Kalkulation abgezogen hat, obwohl er nie zählt (alte Anfragen 294,92 €, sonst 0). */
export function zuUnrechtAbgezogen(kalk: unknown): number {
  const items = zuschuesseVon(kalk)?.items;
  if (!Array.isArray(items)) return 0;
  return runde(
    items
      .filter((z): z is Posten => !!z && typeof z === 'object')
      .filter((z) => Boolean(z.in_kalkulation) && NIE_IM_EIGENANTEIL.includes(String(z.name)))
      .reduce((summe, z) => summe + (Number(z.betrag_monatlich) || 0), 0),
  );
}

/** Eigenanteil einer gespeicherten Kalkulation ohne Entlastungsbudget; `null`, wenn sie keinen Eigenanteil trägt. */
export function eigenanteilOhneEntlastungsbudget(kalk: unknown): number | null {
  if (!kalk || typeof kalk !== 'object') return null;
  const e = (kalk as { eigenanteil?: unknown }).eigenanteil;
  if (typeof e !== 'number' || !Number.isFinite(e)) return null;
  return runde(e + zuUnrechtAbgezogen(kalk));
}

/** Zuschuss-Summe (`zuschüsse.gesamt`) einer gespeicherten Kalkulation ohne Entlastungsbudget; `null` ohne Summe. */
export function zuschuesseOhneEntlastungsbudget(kalk: unknown): number | null {
  const g = zuschuesseVon(kalk)?.gesamt;
  if (typeof g !== 'number' || !Number.isFinite(g)) return null;
  return runde(Math.max(0, g - zuUnrechtAbgezogen(kalk)));
}
