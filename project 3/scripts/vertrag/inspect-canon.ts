// Pomiar M (plan pdfkit-refactoru): inspekcja REALNYCH kanonów z produ —
// fonty (D1), styl podpisu 24pt (D2), marginesy/y-stopki (D3), paginacja,
// glify ✓▸ń. Wejście: PDF-y w <scratchpad>/goldens/*.pdf (pobrane osobno,
// PII — nigdy w repo). Uruchomienie:
//   cd "project 3" && npx tsx scripts/vertrag/inspect-canon.ts <dir-goldenów>
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

type TextItem = { str: string; transform: number[]; fontName: string; width: number; height: number };

async function inspectPdf(path: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(readFileSync(path));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: false, disableFontFace: true }).promise;

  const fontNames = new Map<string, string>(); // internal id -> BaseFont-ish name
  const pages: Array<{
    n: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    first: string;
    last: string;
    footer: string[];
    sizes: Record<string, number>;
  }> = [];
  const bigItems: Array<{ page: number; str: string; size: number; font: string; x: number; y: number }> = [];
  const glyphHits: Record<string, string[]> = { '✓': [], '▸': [], 'ń': [], '�': [] };

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    // Font-Namen aus den Page-Commons (pdfjs lädt sie lazy — nach getTextContent verfügbar)
    for (const [id, font] of (page as any).commonObjs?._objs?.entries?.() ?? []) {
      const name = (font as any)?.data?.name;
      if (typeof name === 'string') fontNames.set(id, name);
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let first = '', last = '';
    const footer: string[] = [];
    const sizes: Record<string, number> = {};
    for (const raw of tc.items as TextItem[]) {
      const s = raw.str;
      if (!s || !s.trim()) continue;
      const x = raw.transform[4];
      const y = raw.transform[5]; // PDF: y od dołu
      const size = Math.hypot(raw.transform[2], raw.transform[3]); // uwzględnia skalę
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + raw.width);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + size);
      if (!first) first = s;
      last = s;
      const sizeKey = size.toFixed(1);
      sizes[sizeKey] = (sizes[sizeKey] ?? 0) + s.length;
      if (y < 45) footer.push(s); // dolne ~16mm strony
      if (size > 20) bigItems.push({ page: p, str: s, size: +size.toFixed(1), font: raw.fontName, x: +x.toFixed(1), y: +y.toFixed(1) });
      for (const g of Object.keys(glyphHits)) {
        if (s.includes(g)) glyphHits[g].push(`p${p}:"${s.slice(0, 40)}"`);
      }
    }
    pages.push({
      n: p,
      minX: +minX.toFixed(1),
      maxX: +maxX.toFixed(1),
      minY: +minY.toFixed(1),
      maxY: +maxY.toFixed(1),
      first: first.slice(0, 60),
      last: last.slice(0, 60),
      footer,
      sizes,
    });
    void viewport;
  }

  // Style→font mapping z getTextContent (styles ma fontFamily per fontName id)
  const styleFonts = new Set<string>();
  for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const st of Object.values((tc as any).styles ?? {})) {
      const ff = (st as any)?.fontFamily;
      if (ff) styleFonts.add(String(ff));
    }
  }

  return { file: path.split(/[\\/]/).pop(), numPages: doc.numPages, pages, bigItems, glyphHits, styleFonts: [...styleFonts], fontNames: [...new Set(fontNames.values())] };
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: inspect-canon.ts <dir-with-pdfs>');
  const files = readdirSync(dir).filter((f) => f.endsWith('.pdf'));
  const out: unknown[] = [];
  for (const f of files) {
    try {
      out.push(await inspectPdf(join(dir, f)));
      console.log(`ok: ${f}`);
    } catch (e) {
      console.error(`FAIL ${f}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const outPath = join(dir, 'canon-analysis.json');
  writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf8');
  console.log(`written: ${outPath}`);
}

main();
