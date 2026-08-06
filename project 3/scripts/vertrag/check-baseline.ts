// Szybki lokalny check bajtowej niezmienności buildVertragHtml po ekstrakcji
// treści do vertrag-content.ts (PR1). To samo robi trwale test baseline-lock
// w root-vitest — ten skrypt jest do iterowania w trakcie refactoru:
//   cd "project 3" && npx tsx scripts/vertrag/check-baseline.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildVertragHtml } from '../../lib/vertrag-content';
import { BASELINE_INPUT, BASELINE_OPTS } from './gen-baseline';

const fixturePath = join(__dirname, '..', '..', '..', 'src', '__tests__', 'fixtures', 'vertrag-baseline.html');
const expected = readFileSync(fixturePath, 'utf8');
const actual = buildVertragHtml(BASELINE_INPUT, BASELINE_OPTS);

if (actual === expected) {
  console.log(`IDENTYCZNE ✓ (${actual.length} znaków)`);
  process.exit(0);
}

console.error(`ROZJAZD: expected ${expected.length} znaków, actual ${actual.length}`);
const min = Math.min(expected.length, actual.length);
for (let i = 0; i < min; i++) {
  if (expected[i] !== actual[i]) {
    console.error(`Pierwsza różnica @${i}:`);
    console.error(`  expected: …${JSON.stringify(expected.slice(Math.max(0, i - 60), i + 60))}…`);
    console.error(`  actual:   …${JSON.stringify(actual.slice(Math.max(0, i - 60), i + 60))}…`);
    break;
  }
}
process.exit(1);
