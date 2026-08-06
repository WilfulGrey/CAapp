// Gate 1 protokołu ×4: automatyczny parytet tekstowy kanon (puppeteer) ↔
// nowy render (pdfkit) na REALNYCH snapshotach. Kryterium: identyczna
// sekwencja znaków body (whitespace-insensitive, po normalizacji), równa
// liczba stron, stopki „Seite i von N" na każdej stronie.
//   cd "project 3" && npx tsx scripts/vertrag/parity-check.ts <dir-goldenów>
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type PageText = { body: string[]; footer: string[] };

async function extract(path: string): Promise<PageText[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;
  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items: Array<{ str: string; x: number; y: number }> = [];
    for (const it of tc.items as Array<{ str: string; transform: number[] }>) {
      if (!it.str?.trim()) continue;
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    // Rekonstrukcja porządku WIZUALNEGO: chromium maluje pozycjonowane
    // elementy (li z ::before-numeracją ma position:relative) PO normal-flow
    // w obrębie strony — surowy strumień to paint-order, nie reading-order.
    // Sort po (linia od góry, x) daje porządek czytelniczy dla OBU silników.
    // Bucket y ±2pt skleja itemy tej samej linii (sub-pt różnice baseline'ów).
    items.sort((a, b) => {
      const dy = b.y - a.y;
      if (Math.abs(dy) > 2) return dy > 0 ? 1 : -1;
      return a.x - b.x;
    });
    const body: string[] = [];
    const footer: string[] = [];
    for (const it of items) (it.y < 45 ? footer : body).push(it.str);
    pages.push({ body, footer });
  }
  return pages;
}

// Normalizacja treści: NFKC, bez znaczników prezentacji (✓ ▸ numery punktów
// osobno pilnowane), bez CAŁYCH białych znaków (artefakty letter-spacingu
// w ekstrakcji: „A U F T R A G G E B E R").
function normalize(parts: string[]): string {
  return parts
    // Samodzielne tokeny numeracji „N." wypadają z sekwencji body: chromium
    // emituje ::before-countery w INNYM miejscu strumienia niż pdfkit rysuje
    // swoje (pozycyjnie identyczne) numery. Ich RÓWNOŚĆ liczby pilnuje
    // osobna asercja countNums — treść porównujemy bez nich.
    .filter((s) => !/^\s*\d{1,2}\.\s*$/.test(s))
    .join(' ')
    .normalize('NFKC')
    .replace(/[✓▸�]/g, '')
    .replace(/\s+/g, '');
}

// Numery punktów „N." — puppeteer emituje je z CSS-counterów jako tekst,
// pdfkit rysuje jawnie. W obu MUSZĄ być: usuwamy je z porównania body
// dopiero PO zliczeniu (asercja równości liczników niżej).
function countNums(parts: string[]): number {
  return parts.filter((s) => /^\s*\d{1,2}\.\s*$/.test(s)).length;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: parity-check.ts <dir>');
  const canons = readdirSync(dir).filter((f) => /^\d+\.pdf$/.test(f));
  const report: string[] = [];
  let failures = 0;
  for (const canonFile of canons) {
    const id = canonFile.replace('.pdf', '');
    const newFile = `${id}.new.pdf`;
    let verdict = 'PASS';
    const problems: string[] = [];
    try {
      const [canon, fresh] = await Promise.all([extract(join(dir, canonFile)), extract(join(dir, newFile))]);
      if (canon.length !== fresh.length) {
        problems.push(`liczba stron: kanon=${canon.length} nowy=${fresh.length}`);
      }
      const canonBodyAll = normalize(canon.flatMap((p) => p.body));
      const freshBodyAll = normalize(fresh.flatMap((p) => p.body));
      if (canonBodyAll !== freshBodyAll) {
        // pierwszy punkt rozjazdu
        let i = 0;
        const n = Math.min(canonBodyAll.length, freshBodyAll.length);
        while (i < n && canonBodyAll[i] === freshBodyAll[i]) i++;
        problems.push(
          `body differs @${i}/${canonBodyAll.length}vs${freshBodyAll.length}: kanon「…${canonBodyAll.slice(Math.max(0, i - 40), i + 40)}…」 nowy「…${freshBodyAll.slice(Math.max(0, i - 40), i + 40)}…」`,
        );
      }
      const canonNums = countNums(canon.flatMap((p) => p.body));
      const freshNums = countNums(fresh.flatMap((p) => p.body));
      if (canonNums !== freshNums) problems.push(`numery punktów: kanon=${canonNums} nowy=${freshNums}`);
      for (let p = 0; p < Math.min(canon.length, fresh.length); p++) {
        const cf = normalize(canon[p].footer);
        const ff = normalize(fresh[p].footer);
        if (cf !== ff) problems.push(`stopka p${p + 1}: kanon「${cf}」 nowy「${ff}」`);
      }
    } catch (e) {
      problems.push(`EXTRACT FAIL: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (problems.length) {
      verdict = 'FAIL';
      failures++;
    }
    report.push(`${verdict} ${id}${problems.length ? '\n  - ' + problems.join('\n  - ') : ''}`);
    console.log(report[report.length - 1]);
  }
  writeFileSync(join(dir, 'parity-report.txt'), report.join('\n'), 'utf8');
  console.log(`\n=== ${canons.length - failures}/${canons.length} PASS ===`);
  process.exit(failures ? 1 : 0);
}

main();
