// Gwarancje treści umowy (Betreuungsvertrag) — PR1 refactoru puppeteer→pdfkit
// (Registry #27). Trzy warstwy:
//   1. baseline-lock: buildVertragHtml(FIXED_INPUT) === commitowany fixture
//      wygenerowany z kodu SPRZED ekstrakcji treści → dowód, że przeniesienie
//      stringów do vertrag-content.ts niczego nie zmieniło (bajt w bajt).
//   2. parytet model↔HTML: documentPlainText(buildVertragDocument(...)) ==
//      tekst wyekstrahowany z buildVertragHtml(...) — trwała gwarancja, że
//      renderer PDF (konsumujący model) widzi KAŻDY napis, który widzi HTML,
//      w tej samej kolejności. To jest strażnik „żaden napis nie zginie".
//   3. inwarianty: liczności punktów §§, reguła signDatum, formatSignedAtBerlin,
//      whitelista znaków treści statycznej (alfabet zweryfikowany pod fonty).
// Import WYŁĄCZNIE pure-modułów (precedens cross-importu: portalUrl.test.ts) —
// pdfkit/puppeteer nigdy nie są dotykane (dynamic import w fasadzie).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildVertragDocument,
  documentPlainText,
  formatSignedAtBerlin,
  resolveVertragFelder,
  HW_CHECKLIST,
  GP_CHECKLIST,
  T,
  type VertragHtmlOptions,
  type VertragInput,
} from '../../project 3/lib/vertrag-content';
import { buildVertragHtml } from '../../project 3/lib/vertrag';
import { BASELINE_INPUT, BASELINE_OPTS } from './fixtures/vertragBaselineInput';

// ─── Normalizacja: HTML → płaski tekst treści ────────────────────────────
// Odwrotność esc() + zdjęcie markupu. Porównanie jest whitespace-insensitive
// (sekwencja znaków bez białych), bo łamania/wcięcia to prezentacja.
function htmlToPlainText(html: string): string {
  const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

const squash = (s: string) => s.replace(/\s+/g, '');

const VARIANTS: Array<{ name: string; daten: VertragInput; opts: VertragHtmlOptions }> = [
  { name: 'baseline (LE gesetzt, polskie znaki)', daten: BASELINE_INPUT, opts: BASELINE_OPTS },
  {
    name: 'le=null → identisch mit Auftraggeber',
    daten: { ...BASELINE_INPUT, le: null },
    opts: BASELINE_OPTS,
  },
  {
    name: 'wszystko puste → fallbacki „—" i puste linie',
    daten: {},
    opts: { signaturName: '' },
  },
  {
    name: 'legacy signedAt bez „ um " (reguła signDatum: cały string)',
    daten: { ...BASELINE_INPUT },
    opts: { signaturName: 'Anna Test', signedAt: '21.07.2026, 17:15', auditNote: undefined },
  },
  {
    name: 'dl nadpisany (niedomyślny podpisujący DL)',
    daten: { ...BASELINE_INPUT, dl: { name: 'Jan Kowalski', rolle: 'Testrolle' } },
    opts: BASELINE_OPTS,
  },
];

describe('vertrag-content: baseline-lock (bajtowa niezmienność HTML po ekstrakcji)', () => {
  it('buildVertragHtml(BASELINE) === fixture wygenerowany z kodu sprzed refactoru', () => {
    const fixture = readFileSync(join(__dirname, 'fixtures', 'vertrag-baseline.html'), 'utf8');
    const actual = buildVertragHtml(BASELINE_INPUT, BASELINE_OPTS);
    expect(actual.length).toBe(fixture.length);
    expect(actual).toBe(fixture);
  });
});

describe('vertrag-content: parytet model ↔ HTML (żaden napis nie ginie)', () => {
  for (const v of VARIANTS) {
    it(v.name, () => {
      const blocks = buildVertragDocument(v.daten, v.opts);
      const model = squash(documentPlainText(blocks));
      const html = squash(htmlToPlainText(buildVertragHtml(v.daten, v.opts)));
      // Identyczna SEKWENCJA znaków (kolejność treści zachowana) — nie tylko
      // zbiory stringów. Rozjazd = zgubiony/przestawiony fragment dokumentu.
      expect(model).toBe(html);
    });
  }
});

describe('vertrag-content: inwarianty treści', () => {
  const f = resolveVertragFelder(BASELINE_INPUT, BASELINE_OPTS);

  it('liczności punktów §§ 1-10 zgodne z Mustervertrag', () => {
    expect(f.paragraphs.map((p) => p.punkte.length)).toEqual([10, 3, 7, 12, 4, 4, 2, 3, 3, 7]);
  });

  it('§ 1 punkt 8 ma dokładnie 4 sub-bullety; tylko on ma subListę', () => {
    const subs = f.paragraphs.flatMap((p) => p.punkte.filter((x) => x.subList));
    expect(subs).toHaveLength(1);
    expect(subs[0].subList).toHaveLength(4);
    expect(f.paragraphs[0].punkte[7].subList).toHaveLength(4);
  });

  it('checklisty Anlage 2: 10 + 4 pozycje', () => {
    expect(HW_CHECKLIST).toHaveLength(10);
    expect(GP_CHECKLIST).toHaveLength(4);
  });

  it('tylko § 3 ma footnote (zakres rotacji z datami z inputu)', () => {
    const withFootnote = f.paragraphs.filter((p) => p.footnote);
    expect(withFootnote).toHaveLength(1);
    expect(withFootnote[0].titel).toBe('§ 3 Vertragsdauer / Vertragskündigung');
    expect(withFootnote[0].footnote).toContain('24.08.2026');
    expect(withFootnote[0].footnote).toContain('13.10.2026');
  });

  it('dynamiczne pola lądują w § 3 pkt 1 i § 4 pkt 1', () => {
    expect(f.paragraphs[2].punkte[0].text).toContain('24.08.2026');
    expect(f.paragraphs[3].punkte[0].text).toContain('EUR 123,00');
  });

  it('reguła signDatum: kanoniczny label → część przed „ um "; legacy → całość; brak → datum', () => {
    expect(resolveVertragFelder({}, { signaturName: 'X', signedAt: '05.08.2026 um 14:30 Uhr' }).signDatum).toBe('05.08.2026');
    expect(resolveVertragFelder({}, { signaturName: 'X', signedAt: '21.07.2026, 17:15' }).signDatum).toBe('21.07.2026, 17:15');
    expect(resolveVertragFelder({ datum: '01.02.2026' }, { signaturName: 'X' }).signDatum).toBe('01.02.2026');
  });

  it('defaulty DL: Kamila Bilska-Wabik / Vitanas Group', () => {
    expect(resolveVertragFelder({}, { signaturName: 'X' }).dlName).toBe('Kamila Bilska-Wabik');
    expect(resolveVertragFelder({}, { signaturName: 'X' }).dlRolle).toBe('Vitanas Group');
  });
});

describe('vertrag-content: formatSignedAtBerlin (Bug #20 — jedna strefa, jeden zegar)', () => {
  it('lato (CEST, UTC+2)', () => {
    expect(formatSignedAtBerlin('2026-08-05T12:30:00.000Z')).toBe('05.08.2026 um 14:30 Uhr');
  });
  it('zima (CET, UTC+1)', () => {
    expect(formatSignedAtBerlin('2026-01-05T12:30:00.000Z')).toBe('05.01.2026 um 13:30 Uhr');
  });
  it('przełom dnia w Berlinie', () => {
    expect(formatSignedAtBerlin('2026-08-05T22:30:00.000Z')).toBe('06.08.2026 um 00:30 Uhr');
  });
  it('nieparsowalne → undefined', () => {
    expect(formatSignedAtBerlin('garbage')).toBeUndefined();
  });
});

describe('vertrag-content: whitelista znaków treści statycznej (alfabet pod fonty PDF)', () => {
  it('każdy znak statycznej treści jest w zweryfikowanym alfabecie', () => {
    // Pusty input → cała treść to statyczne stringi + fallbacki „—".
    const staticText = documentPlainText(buildVertragDocument({}, { signaturName: '' }));
    // ASCII drukowalne + niemieckie + ń (ul. Poznańska) + typografia używana
    // w Mustervertrag: – (en-dash) — (em-dash) · § „ " € ✓ (audit-banner).
    // KAŻDE rozszerzenie tej listy = świadoma decyzja (font PDF musi mieć glif).
    const allowed = /^[\x20-\x7EäöüÄÖÜßń–—·§„"€✓]*$/;
    const offenders = [...new Set([...staticText].filter((ch) => ch !== '\n' && !allowed.test(ch)))];
    expect(offenders, `znaki spoza alfabetu: ${offenders.map((c) => `"${c}" U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(', ')}`).toEqual([]);
  });
});
