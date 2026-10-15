// Eigenanteil OHNE Entlastungsbudget im Kundenportal — Entscheidung 3 (Martin, 15.10.2026, „alle Empfehlungen
// umsetzen“). Spiegel von `project 3/lib/eigenanteil.ts` (dort die Begründung): Der Posten `entlastungsbudget_neu`
// (294,92 € im Monat) zählt nie zum Eigenanteil, egal was `in_kalkulation` sagt. Anfragen von vor dem 15.10.2026
// tragen ihn noch mit `in_kalkulation: true` — „Was bleibt für Sie übrig“ und der Heimvergleich filtern deshalb mit
// `zaehltZumEigenanteil`, nie mit `in_kalkulation` allein.
// ⚠️ Spiegel: src/__tests__/eigenanteil.test.ts prüft ihn gegen das Original (und die Kopie der Kundenmails).

/** Posten, die nie zum Eigenanteil zählen. */
export const NIE_IM_EIGENANTEIL: readonly string[] = ['entlastungsbudget_neu'];

/** Zählt der Posten zum Eigenanteil? Nur mit `in_kalkulation` und nie, wenn er in `NIE_IM_EIGENANTEIL` steht. */
export function zaehltZumEigenanteil(z: unknown): boolean {
  if (!z || typeof z !== 'object') return false;
  const p = z as { name?: unknown; in_kalkulation?: unknown };
  return Boolean(p.in_kalkulation) && !NIE_IM_EIGENANTEIL.includes(String(p.name));
}
