// Jednorazowy generator baseline-fixture dla refactoru vertrag → pdfkit (PR1).
// Uruchamiany PRZED ekstrakcją treści, na NIEZMIENIONYM kodzie:
//   cd "project 3" && npx tsx scripts/vertrag/gen-baseline.ts
// Wynik commitowany jako src/__tests__/fixtures/vertrag-baseline.html —
// test baseline-lock dowodzi potem bajtowej niezmienności buildVertragHtml
// po przeniesieniu stringów do vertrag-content.ts.
//
// Input jest SYNTETYCZNY (Święta zasada: zero prawdziwych danych klientów)
// i celowo dotyka gałęzi: pełny AG, ustawiony LE (nie-null), polskie znaki
// w podpisie, legacy auditNote, signedAt w formacie kanonicznym.
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildVertragHtml } from '../../lib/vertrag-content';
// Jedno źródło inputu — współdzielone z testem baseline-lock w root-vitest.
export { BASELINE_INPUT, BASELINE_OPTS } from '../../../src/__tests__/fixtures/vertragBaselineInput';
import { BASELINE_INPUT, BASELINE_OPTS } from '../../../src/__tests__/fixtures/vertragBaselineInput';

// Zapis TYLKO przy bezpośrednim uruchomieniu — check-baseline.ts importuje
// stąd BASELINE_INPUT/OPTS i NIE może przy okazji nadpisać fixture'a
// (inaczej porównywalibyśmy zrefaktorowany kod z samym sobą).
if (require.main === module) {
  const html = buildVertragHtml(BASELINE_INPUT, BASELINE_OPTS);
  const outDir = join(__dirname, '..', '..', '..', 'src', '__tests__', 'fixtures');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'vertrag-baseline.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`baseline written: ${outPath} (${html.length} chars)`);
}
