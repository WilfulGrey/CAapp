// CI-smoke renderera pdfkit (job vertrag-render-smoke): renderuje 3
// SYNTETYCZNE fixture'y i twardo asertuje:
//   - magic %PDF- i 8 stron,
//   - KAŻDY string modelu (documentPlainText) obecny w ekstrakcie pdfjs,
//   - wartości wejściowe (nazwisko/tagessatz/daty) obecne,
//   - polskie „ń" w „Poznańska" (×2) przetrwało (font Latin-Ext),
//   - 18 bulletów ▸ (4 sub §1p8 + 10 + 4 checklisty) i ✓ bannera,
//   - stopki „Seite i von 8" na każdej stronie.
// Zero danych produkcyjnych — nadaje się do publicznego CI.
//   cd "project 3" && npx tsx scripts/vertrag/render-smoke.ts
import { buildVertragDocument, documentPlainText, type VertragHtmlOptions, type VertragInput } from '../../lib/vertrag-content';
import { renderVertragPdf } from '../../lib/vertrag-pdf';

type Extracted = { pages: string[][]; all: string };

async function extract(buf: Buffer): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false, disableFontFace: true }).promise;
  const pages: string[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push((tc.items as Array<{ str: string }>).map((i) => i.str).filter((s) => s.trim()));
  }
  return { pages, all: pages.flat().join(' ') };
}

// Case-insensitive: tagi boxów (`Auftraggeber (AG)` itd.) są w PDF-ie
// WERSALIKAMI (jak text-transform:uppercase w kanonie) — model trzyma
// oryginalną pisownię.
const squash = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const CASES: Array<{ name: string; daten: VertragInput; opts: VertragHtmlOptions; mustContain: string[] }> = [
  {
    name: 'voll (LE gesetzt, polskie znaki)',
    daten: {
      datum: '05.08.2026',
      ag: { name: 'Maximilian Müller-Lüdenscheidt', strasse: 'Königsallee 42a', plz: '40212', ort: 'Düsseldorf', email: 'max@example.de', telefon: '+49 211 1234567' },
      le: { name: 'Grzegorz Brzęczyszczykiewicz', strasse: 'Szoße 1', plz: '01108', ort: 'Dresden' },
      vertragsbeginn: '24.08.2026',
      voraussAbreise: '13.10.2026',
      tagessatz: 'EUR 123,00',
    },
    opts: { signaturName: 'Grzegorz Brzęczyszczykiewicz', signedAt: '05.08.2026 um 14:30 Uhr', auditNote: 'Vertragsversion v1.0' },
    mustContain: ['Grzegorz Brzęczyszczykiewicz', 'EUR 123,00', '24.08.2026', '13.10.2026', 'Königsallee 42a', '05.08.2026 um 14:30 Uhr'],
  },
  {
    name: 'le=null + legacy signedAt',
    daten: { datum: '21.07.2026', ag: { name: 'Zenobia Test', ort: 'Kassel' }, le: null, tagessatz: 'EUR 101,00' },
    opts: { signaturName: 'Zenobia Test', signedAt: '21.07.2026, 17:15' },
    mustContain: ['identisch mit Auftraggeber', 'EUR 101,00', '21.07.2026, 17:15'],
  },
  {
    name: 'wszystko puste',
    daten: {},
    opts: { signaturName: '' },
    mustContain: ['—'],
  },
];

async function main() {
  let failures = 0;
  for (const c of CASES) {
    const blocks = buildVertragDocument(c.daten, c.opts);
    const buf = await renderVertragPdf(blocks);
    const problems: string[] = [];

    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') problems.push('brak magic %PDF-');
    const ex = await extract(buf);
    if (ex.pages.length !== 8) problems.push(`stron: ${ex.pages.length} (oczekiwane 8)`);

    const allSquashed = squash(ex.all);
    // Każdy string modelu musi być w PDF (parytet model→render).
    const model = documentPlainText(blocks).split('\n').filter((s) => s.trim());
    for (const line of model) {
      if (!allSquashed.includes(squash(line))) problems.push(`brak stringu modelu: „${line.slice(0, 60)}…"`);
    }
    for (const s of c.mustContain) {
      if (!allSquashed.includes(squash(s))) problems.push(`brak wartości wejściowej: „${s}"`);
    }
    const nCount = (ex.all.match(/Poznańska/g) ?? []).length;
    if (nCount !== 2) problems.push(`„Poznańska" z ń: ${nCount} (oczekiwane 2)`);
    const bullets = (ex.all.match(/▸/g) ?? []).length;
    if (bullets !== 18) problems.push(`bullety ▸: ${bullets} (oczekiwane 18)`);
    if (!ex.all.includes('✓')) problems.push('brak ✓ w bannerze');
    for (let p = 0; p < ex.pages.length; p++) {
      const foot = ex.pages[p].join(' ');
      if (!foot.includes(`Seite ${p + 1} von ${ex.pages.length}`)) problems.push(`brak stopki na stronie ${p + 1}`);
    }

    if (problems.length) {
      failures++;
      console.error(`FAIL ${c.name}:\n  - ${problems.join('\n  - ')}`);
    } else {
      console.log(`PASS ${c.name} (${buf.length} B, ${ex.pages.length} stron)`);
    }
  }
  process.exit(failures ? 1 : 0);
}

main();
