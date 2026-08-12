// Wspólny, SYNTETYCZNY input baseline'u umowy — jedno źródło dla:
//   - src/__tests__/vertragContent.test.ts (baseline-lock),
//   - project 3/scripts/vertrag/gen-baseline.ts (generator fixture'a).
// Zmiana czegokolwiek tutaj wymaga świadomej regeneracji fixture'a
// vertrag-baseline.html (npx tsx scripts/vertrag/gen-baseline.ts w project 3)
// i przejrzenia diffa — to jest kotwica bajtowej niezmienności renderu HTML.
// Dane celowo dotykają gałęzi: pełny AG, ustawiony LE (nie-null), polskie
// znaki w nazwiskach/podpisie, kanoniczny signedAt, domyślny dl.
import type { VertragInput, VertragHtmlOptions } from '../../../project 3/lib/vertrag-content';

export const BASELINE_INPUT: VertragInput = {
  datum: '05.08.2026',
  ag: {
    name: 'Maximilian Müller-Lüdenscheidt',
    strasse: 'Königsallee 42a',
    plz: '40212',
    ort: 'Düsseldorf',
    email: 'max.mueller@example.de',
    telefon: '+49 211 1234567',
  },
  le: {
    name: 'Grzegorz Brzęczyszczykiewicz',
    strasse: 'Szoße 1',
    plz: '01108',
    ort: 'Dresden',
  },
  vertragsbeginn: '24.08.2026',
  voraussAbreise: '13.10.2026',
  tagessatz: 'EUR 123,00',
  // dl celowo pominięty → defaulty 'Kamila Bilska-Wabik' / 'Vitanas Group'
};

export const BASELINE_OPTS: VertragHtmlOptions = {
  signaturName: 'Grzegorz Brzęczyszczykiewicz',
  signedAt: '05.08.2026 um 14:30 Uhr',
  auditNote: 'Vertragsversion v1.1',
};
