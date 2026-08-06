// Renderer PDF umowy (Betreuungsvertrag) — pdfkit, zero Chromium.
// Zastępuje puppeteer + @sparticuz/chromium (OOM >512MB na Render; Registry #27).
//
// Wejście: model blokowy z lib/vertrag-content.ts (buildVertragDocument) —
// ten sam, z którego fasada składa HTML-fallback. Treści TUTAJ NIE MA.
//
// Wszystkie wymiary/kolory/kroje pochodzą z POMIARU produkcyjnych kanonów
// (2026-08-06, 9 plików, sonda pdfjs — patrz plan refactoru):
//   - marginesy: L/P 22 mm, góra 18 mm, dolna granica treści 18 mm,
//   - stopka: baseline ~17 pt od dołu („PRIMUNDUS | www.primundus.de" /
//     „Seite X von Y", 9 pt),
//   - fonty: Liberation Sans (Regular/Bold/Italic) dla treści — Chromium
//     używał systemowych fontów kontenera Render (metryki Arial);
//     podpisy 24 pt = Liberation SERIF (fontconfig-fallback stacka
//     „Snell Roundhand…cursive"); symbole ✓ ▸ = DejaVu Sans,
//   - kolumny podpisów: x≈62.4 / 313, szpalta 2×220 pt + 30 pt przerwy,
//   - numeracja punktów §§: Bold (CSS font-weight:600 → chromium Bold).
// Pliki fontów: assets/fonts/ (Liberation 2.1.5 official release, DejaVu
// 2.37 z npm dejavu-fonts-ttf — te same wersje co w kontenerze Rendera).
import PDFDocument from 'pdfkit';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { T, type Run, type VertragBlock } from './vertrag-content';

// ─── Geometria strony (pomiar M) ─────────────────────────────────────────
const MM = 72 / 25.4;
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 22 * MM; // 62.36
const MARGIN_TOP = 18 * MM; // 51.02
const MARGIN_BOTTOM = 18 * MM; // 51.02 — strefa stopki
const CONTENT_W = PAGE_W - 2 * MARGIN_X; // 470.56
const BOTTOM_LIMIT = PAGE_H - MARGIN_BOTTOM;
const FOOTER_BASELINE_FROM_BOTTOM = 17; // pomiar: 16.9

const COL_GAP = 30; // 40px
const COL_W = (CONTENT_W - COL_GAP) / 2;
const KV_LABEL_W = 97.5; // 130px
const KV_GAP = 10.5; // 14px
const LI_INDENT = 21; // 28px
const LI_NUM_W = 16.5; // 22px
const SUB_INDENT = 13.5; // 18px
const CHECK_INDENT = 16.5; // 22px

// ─── Fonty ───────────────────────────────────────────────────────────────
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONTS = {
  Body: 'LiberationSans-Regular.ttf',
  BodyBold: 'LiberationSans-Bold.ttf',
  BodyItalic: 'LiberationSans-Italic.ttf',
  Sig: 'LiberationSerif-Regular.ttf',
  Sym: 'DejaVuSans.ttf',
} as const;
type FontKey = keyof typeof FONTS;

function fontPath(key: FontKey): string {
  const p = path.join(FONT_DIR, FONTS[key]);
  if (!existsSync(p)) {
    // Brak fontu = twardy błąd TERAZ (czytelny w logu) → fasada łapie i
    // wysyła HTML-fallback zamiast maila bez umowy. Żadnego cichego AFM.
    throw new Error(`[vertrag-pdf] brak pliku fontu: ${p}`);
  }
  return p;
}

// ─── Kolory (1:1 z CSS szablonu) ─────────────────────────────────────────
const C = {
  text: '#1f2937',
  gray500: '#6b7280',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  sub: '#374151',
  brown: '#6B5444',
  gold: '#B5A184',
  goldBorder: '#C9B89A',
  boxBg: '#FAF8F4',
  headBorder: '#E5E7EB',
  sigInk: '#1f3a8a',
  bannerBorder: '#BBF7D0',
  bannerBg: '#F0FDF4',
  bannerHead: '#166534',
  bannerText: '#15803d',
} as const;

// CSS line-height L przy foncie S → dodatkowy lineGap pdfkit (przybliżenie:
// currentLineHeight ≈ wysokość fontu; kalibrowane do pomiaru M).
function lineGapFor(doc: PDFKit.PDFDocument, size: number, l: number): number {
  const base = doc.currentLineHeight();
  return Math.max(0, size * l - base);
}

type Style = { font: FontKey; size: number; color: string; lh: number; charSpace?: number };
const S = {
  headRight: { font: 'Body', size: 10, color: C.gray500, lh: 1.2 } as Style,
  title: { font: 'BodyBold', size: 22, color: C.text, lh: 1.15, charSpace: 0.375 } as Style,
  intro: { font: 'Body', size: 11, color: C.gray500, lh: 1.4 } as Style,
  tag: { font: 'BodyItalic', size: 9.5, color: C.gray400, lh: 1.2, charSpace: 1.425 } as Style,
  firma: { font: 'BodyBold', size: 13, color: C.text, lh: 1.3 } as Style,
  firmaSub: { font: 'Body', size: 10.5, color: C.gray600, lh: 1.35 } as Style,
  kvLabel: { font: 'Body', size: 10, color: C.gray400, lh: 1.3 } as Style,
  kvValue: { font: 'Body', size: 10.5, color: C.text, lh: 1.3 } as Style,
  kvValueItalic: { font: 'BodyItalic', size: 10.5, color: C.gray400, lh: 1.3 } as Style,
  between: { font: 'Body', size: 10, color: C.gray500, lh: 1.35 } as Style,
  betweenBold: { font: 'BodyBold', size: 10, color: C.text, lh: 1.35 } as Style,
  und: { font: 'BodyBold', size: 11, color: C.brown, lh: 1.3, charSpace: 1.65 } as Style,
  h2: { font: 'BodyBold', size: 13.5, color: C.brown, lh: 1.3 } as Style,
  liNum: { font: 'BodyBold', size: 11, color: C.gray400, lh: 1.6 } as Style,
  li: { font: 'Body', size: 11, color: C.text, lh: 1.6 } as Style,
  subLi: { font: 'Body', size: 10.5, color: C.sub, lh: 1.55 } as Style,
  bullet: { font: 'Sym', size: 10.5, color: C.gold, lh: 1.55 } as Style,
  footnote: { font: 'Body', size: 10, color: C.gray500, lh: 1.5 } as Style,
  signsTitle: { font: 'BodyBold', size: 12, color: C.brown, lh: 1.3, charSpace: 1.2 } as Style,
  odLbl: { font: 'Body', size: 9.5, color: C.gray400, lh: 1.3 } as Style,
  odVal: { font: 'Body', size: 11, color: C.text, lh: 1.3 } as Style,
  sigName: { font: 'Sig', size: 24, color: C.sigInk, lh: 1.0 } as Style,
  cap: { font: 'Body', size: 9.5, color: C.gray500, lh: 1.45 } as Style,
  capSub: { font: 'Body', size: 9, color: C.gray400, lh: 1.4 } as Style,
  bannerHead: { font: 'BodyBold', size: 10.5, color: C.bannerHead, lh: 1.35 } as Style,
  bannerCheck: { font: 'Sym', size: 10.5, color: C.bannerHead, lh: 1.35 } as Style,
  bannerText: { font: 'Body', size: 10, color: C.bannerText, lh: 1.55 } as Style,
  bannerTextBold: { font: 'BodyBold', size: 10, color: C.bannerText, lh: 1.55 } as Style,
  bannerSub: { font: 'Body', size: 9, color: C.bannerText, lh: 1.4 } as Style,
  anlageH: { font: 'BodyBold', size: 17, color: C.text, lh: 1.25 } as Style,
  anlageSub: { font: 'BodyBold', size: 13, color: C.brown, lh: 1.3 } as Style,
  anlageP: { font: 'Body', size: 11, color: C.text, lh: 1.7 } as Style,
  anlagePBold: { font: 'BodyBold', size: 11, color: C.text, lh: 1.7 } as Style,
  anlageFootnote: { font: 'BodyItalic', size: 10, color: C.gray500, lh: 1.5 } as Style,
  leadHead: { font: 'BodyBold', size: 12, color: C.text, lh: 1.35 } as Style,
  leadNote: { font: 'Body', size: 10.5, color: C.gray500, lh: 1.35 } as Style,
  checkLi: { font: 'Body', size: 10.5, color: C.text, lh: 1.6 } as Style,
  checkBullet: { font: 'Sym', size: 11, color: C.gold, lh: 1.6 } as Style,
  footer: { font: 'Body', size: 9, color: C.gray400, lh: 1.2 } as Style,
  footerBrand: { font: 'BodyBold', size: 9, color: C.brown, lh: 1.2 } as Style,
} as const;

function setStyle(doc: PDFKit.PDFDocument, st: Style) {
  doc.font(fontPath(st.font)).fontSize(st.size).fillColor(st.color, 1);
}

function textOpts(doc: PDFKit.PDFDocument, st: Style, extra: PDFKit.Mixins.TextOptions = {}): PDFKit.Mixins.TextOptions {
  return { lineGap: lineGapFor(doc, st.size, st.lh), characterSpacing: st.charSpace ?? 0, ...extra };
}

function measure(doc: PDFKit.PDFDocument, st: Style, text: string, width: number): number {
  setStyle(doc, st);
  return doc.heightOfString(text, textOpts(doc, st, { width }));
}

// ─── Rich-runs: ręczny greedy-wrap dla linii mieszających style ──────────
// (pdfkit continued+justify/center jest złamane — patrz plan, ryzyko 3).
type Token = { text: string; st: Style };

function runsToTokens(runs: Run[], normal: Style, bold: Style): Token[] {
  const tokens: Token[] = [];
  for (const r of runs) {
    const st = r.bold ? bold : normal;
    // Split na słowa z zachowaniem pojedynczych spacji jako separatorów.
    const words = r.text.split(/(\s+)/).filter((w) => w.length > 0);
    for (const w of words) tokens.push({ text: w, st });
  }
  return tokens;
}

function tokenWidth(doc: PDFKit.PDFDocument, t: Token): number {
  setStyle(doc, t.st);
  return doc.widthOfString(t.text, { characterSpacing: t.st.charSpace ?? 0 });
}

function layoutRuns(doc: PDFKit.PDFDocument, tokens: Token[], maxWidth: number): Token[][] {
  const lines: Token[][] = [];
  let line: Token[] = [];
  let w = 0;
  for (const t of tokens) {
    const tw = tokenWidth(doc, t);
    const isSpace = /^\s+$/.test(t.text);
    if (w + tw > maxWidth && line.length > 0 && !isSpace) {
      // zdejmij trailing spacje z końca linii
      while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
      lines.push(line);
      line = [];
      w = 0;
    }
    if (line.length === 0 && isSpace) continue; // bez wiodących spacji
    line.push(t);
    w += tw;
  }
  while (line.length && /^\s+$/.test(line[line.length - 1].text)) line.pop();
  if (line.length) lines.push(line);
  return lines;
}

function runsHeight(doc: PDFKit.PDFDocument, runs: Run[], normal: Style, bold: Style, maxWidth: number): number {
  const lines = layoutRuns(doc, runsToTokens(runs, normal, bold), maxWidth);
  const lineH = normal.size * normal.lh;
  return lines.length * lineH;
}

function drawRuns(
  doc: PDFKit.PDFDocument,
  runs: Run[],
  normal: Style,
  bold: Style,
  x: number,
  y: number,
  maxWidth: number,
  align: 'left' | 'center' | 'justify',
): number {
  const lines = layoutRuns(doc, runsToTokens(runs, normal, bold), maxWidth);
  const lineH = normal.size * normal.lh;
  let cy = y;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const widths = line.map((t) => tokenWidth(doc, t));
    const total = widths.reduce((a, b) => a + b, 0);
    let cx = x;
    let extraPerGap = 0;
    if (align === 'center') cx = x + (maxWidth - total) / 2;
    if (align === 'justify' && i < lines.length - 1) {
      const gaps = line.filter((t) => /^\s+$/.test(t.text)).length;
      if (gaps > 0) extraPerGap = (maxWidth - total) / gaps;
    }
    for (let j = 0; j < line.length; j++) {
      const t = line[j];
      setStyle(doc, t.st);
      doc.text(t.text, cx, cy, { lineBreak: false, characterSpacing: t.st.charSpace ?? 0 });
      cx += widths[j] + (/^\s+$/.test(t.text) ? extraPerGap : 0);
    }
    cy += lineH;
  }
  return cy - y;
}

// ─── Prymitywy pomiaru/rysowania per typ bloku ───────────────────────────
// Każdy blok: measureX(doc, b) → wysokość ŁĄCZNIE z marginesem górnym/dolnym
// zdefiniowanym dla bloku, drawX(doc, b, y) → rysuje i zwraca nowe y.
// Pomiar i rysowanie używają TYCH SAMYCH stylów (ryzyko „pomiar innym
// fontem" — plan, pułapka 10).

const X = MARGIN_X;

function kvRows(doc: PDFKit.PDFDocument, rows: { label: string; value: string; italicPlaceholder?: boolean }[]): { h: number; rowHs: number[] } {
  const rowHs = rows.map((r) => {
    const valSt = r.italicPlaceholder ? S.kvValueItalic : S.kvValue;
    const labelH = r.label ? measure(doc, S.kvLabel, r.label, KV_LABEL_W) : 0;
    const valueW = r.label ? CONTENT_W - 2 * 13.5 - KV_LABEL_W - KV_GAP : CONTENT_W - 2 * 13.5;
    const valueH = measure(doc, valSt, r.value, valueW);
    const pad = r.italicPlaceholder ? 6 : 2.25; // .pz 3px / .le-empty 8px
    return Math.max(labelH, valueH) + 2 * pad;
  });
  return { h: rowHs.reduce((a, b) => a + b, 0), rowHs };
}

function measurePartyBox(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'partyBox' }>): number {
  const padV = 10.5; // 14px
  const tagH = measure(doc, S.tag, b.tag.toUpperCase(), CONTENT_W - 27) + 6; // margin-bottom 8px
  let inner = tagH;
  if (b.rows) inner += kvRows(doc, b.rows).h;
  if (b.firma) {
    inner += measure(doc, S.firma, b.firma.name, CONTENT_W - 27);
    for (const s of b.firma.subs) inner += 3 + measure(doc, S.firmaSub, s, CONTENT_W - 27);
  }
  return 6 + inner + 2 * padV + 6; // margin 8px górny/dolny boxu
}

function drawPartyBox(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'partyBox' }>, y: number): number {
  const padV = 10.5;
  const padH = 13.5; // 18px
  const boxTop = y + 6;
  const innerW = CONTENT_W - 2 * padH;
  const totalH = measurePartyBox(doc, b) - 12; // bez zewn. marginesów
  doc.roundedRect(X, boxTop, CONTENT_W, totalH, 6).lineWidth(0.75).stroke(C.goldBorder);
  let cy = boxTop + padV;
  setStyle(doc, S.tag);
  doc.text(b.tag.toUpperCase(), X + padH, cy, textOpts(doc, S.tag, { width: innerW }));
  cy += measure(doc, S.tag, b.tag.toUpperCase(), innerW) + 6;
  if (b.rows) {
    const { rowHs } = kvRows(doc, b.rows);
    b.rows.forEach((r, i) => {
      const valSt = r.italicPlaceholder ? S.kvValueItalic : S.kvValue;
      const pad = r.italicPlaceholder ? 6 : 2.25;
      const rowTop = cy;
      if (r.label) {
        setStyle(doc, S.kvLabel);
        doc.text(r.label, X + padH, rowTop + pad, textOpts(doc, S.kvLabel, { width: KV_LABEL_W }));
        setStyle(doc, valSt);
        doc.text(r.value, X + padH + KV_LABEL_W + KV_GAP, rowTop + pad, textOpts(doc, valSt, { width: innerW - KV_LABEL_W - KV_GAP }));
      } else {
        setStyle(doc, valSt);
        doc.text(r.value, X + padH, rowTop + pad, textOpts(doc, valSt, { width: innerW }));
      }
      cy += rowHs[i];
      if (i < b.rows!.length - 1) {
        doc.moveTo(X + padH, cy).lineTo(X + padH + innerW, cy).lineWidth(0.75).dash(0.75, { space: 2 }).stroke(C.headBorder).undash();
      }
    });
  }
  if (b.firma) {
    setStyle(doc, S.firma);
    doc.text(b.firma.name, X + padH, cy, textOpts(doc, S.firma, { width: innerW }));
    cy += measure(doc, S.firma, b.firma.name, innerW);
    for (const s of b.firma.subs) {
      cy += 3;
      setStyle(doc, S.firmaSub);
      doc.text(s, X + padH, cy, textOpts(doc, S.firmaSub, { width: innerW }));
      cy += measure(doc, S.firmaSub, s, innerW);
    }
  }
  return boxTop + totalH + 6;
}

function measureCenterNote(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'centerNote' }>): number {
  if (b.variant === 'und') return 10.5 + measure(doc, S.und, b.runs.map((r) => r.text).join(''), CONTENT_W) + 10.5;
  if (b.variant === 'intro') return measure(doc, S.intro, b.runs.map((r) => r.text).join(''), CONTENT_W) + 13.5;
  return 4.5 + runsHeight(doc, b.runs, S.between, S.betweenBold, CONTENT_W) + 10.5;
}

function drawCenterNote(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'centerNote' }>, y: number): number {
  if (b.variant === 'und') {
    const st = S.und;
    setStyle(doc, st);
    doc.text(b.runs.map((r) => r.text).join(''), X, y + 10.5, textOpts(doc, st, { width: CONTENT_W, align: 'center' }));
    return y + measureCenterNote(doc, b);
  }
  if (b.variant === 'intro') {
    setStyle(doc, S.intro);
    doc.text(b.runs.map((r) => r.text).join(''), X, y, textOpts(doc, S.intro, { width: CONTENT_W, align: 'center' }));
    return y + measureCenterNote(doc, b);
  }
  drawRuns(doc, b.runs, S.between, S.betweenBold, X, y + 4.5, CONTENT_W, 'center');
  return y + measureCenterNote(doc, b);
}

function measureNumberedItem(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'numberedItem' }>): number {
  let h = measure(doc, S.li, b.text, CONTENT_W - LI_INDENT);
  if (b.sub?.length) {
    h += 4.5;
    for (const s of b.sub) h += measure(doc, S.subLi, s, CONTENT_W - LI_INDENT - SUB_INDENT) + 2.25;
  }
  return h + 4.5; // margin-bottom 6px
}

function drawNumberedItem(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'numberedItem' }>, y: number): number {
  setStyle(doc, S.liNum);
  doc.text(`${b.n}.`, X, y, { ...textOpts(doc, S.liNum, { width: LI_NUM_W, align: 'right' }), lineBreak: false });
  setStyle(doc, S.li);
  doc.text(b.text, X + LI_INDENT, y, textOpts(doc, S.li, { width: CONTENT_W - LI_INDENT, align: 'justify' }));
  let cy = y + measure(doc, S.li, b.text, CONTENT_W - LI_INDENT);
  if (b.sub?.length) {
    cy += 4.5;
    for (const s of b.sub) {
      setStyle(doc, S.bullet);
      doc.text('▸', X + LI_INDENT, cy, { lineBreak: false, characterSpacing: 0 });
      setStyle(doc, S.subLi);
      doc.text(s, X + LI_INDENT + SUB_INDENT, cy, textOpts(doc, S.subLi, { width: CONTENT_W - LI_INDENT - SUB_INDENT }));
      cy += measure(doc, S.subLi, s, CONTENT_W - LI_INDENT - SUB_INDENT) + 2.25;
    }
  }
  return cy + 4.5;
}

function measureFootnoteBox(doc: PDFKit.PDFDocument, text: string): number {
  return 7.5 + measure(doc, S.footnote, text, CONTENT_W - 2 * 9) + 12;
}

function drawFootnoteBox(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const top = y + 7.5;
  const innerH = measure(doc, S.footnote, text, CONTENT_W - 2 * 9);
  const boxH = innerH + 12; // padding 8px pion
  doc.rect(X, top, CONTENT_W, boxH).fill(C.boxBg);
  doc.rect(X, top, 2.25, boxH).fill(C.gold);
  setStyle(doc, S.footnote);
  doc.text(text, X + 9, top + 6, textOpts(doc, S.footnote, { width: CONTENT_W - 2 * 9 }));
  return top + boxH;
}

function measureSectionHeading(doc: PDFKit.PDFDocument, text: string): number {
  return 10.5 + measure(doc, S.h2, text, CONTENT_W) + 4.5 + 0.75 + 7.5;
}

function drawSectionHeading(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const top = y + 10.5; // .para margin-top 14px
  setStyle(doc, S.h2);
  doc.text(text, X, top, textOpts(doc, S.h2, { width: CONTENT_W }));
  const hH = measure(doc, S.h2, text, CONTENT_W);
  const lineY = top + hH + 4.5;
  doc.moveTo(X, lineY).lineTo(X + CONTENT_W, lineY).lineWidth(0.75).stroke(C.goldBorder);
  return lineY + 0.75 + 7.5; // padding-bottom + margin 10px
}

function measureOrtDatum(doc: PDFKit.PDFDocument): number {
  // lbl 9.5 + val (11) z paddingiem 4px/3px + linia
  return S.odLbl.size * S.odLbl.lh + 3 + S.odVal.size * S.odVal.lh + 2.25 + 0.75 + 4.5;
}

function drawOrtDatum(doc: PDFKit.PDFDocument, ort: string, datum: string, y: number): number {
  const cols: Array<{ x: number; lbl: string; val: string }> = [
    { x: X, lbl: T.lblOrt, val: ort },
    { x: X + COL_W + COL_GAP, lbl: T.lblDatum, val: datum },
  ];
  let bottom = y;
  for (const c of cols) {
    setStyle(doc, S.odLbl);
    doc.text(c.lbl, c.x, y, textOpts(doc, S.odLbl, { width: COL_W }));
    const vy = y + S.odLbl.size * S.odLbl.lh + 3;
    if (c.val) {
      setStyle(doc, S.odVal);
      doc.text(c.val, c.x, vy, { ...textOpts(doc, S.odVal), width: COL_W, height: S.odVal.size * S.odVal.lh, ellipsis: false });
    }
    const lineY = vy + S.odVal.size * S.odVal.lh + 2.25;
    // Linia MUSI być narysowana także przy pustej wartości (pułapka 15 —
    // „&nbsp;-puste ort/datum": inaczej linie podpisu znikają).
    doc.moveTo(c.x, lineY).lineTo(c.x + COL_W, lineY).lineWidth(0.75).stroke(C.goldBorder);
    bottom = lineY + 0.75;
  }
  return bottom + 4.5;
}

function sigColHeight(doc: PDFKit.PDFDocument, col: { name: string; caption: string; capSub: string }): number {
  const nameLine = 37.5; // 50px — dolna krawędź = baseline nazwiska
  const capH = measure(doc, S.cap, col.caption, COL_W);
  const capSubH = measure(doc, S.capSub, col.capSub, COL_W);
  return nameLine + 3 + 0.75 + 3.75 + capH + 1.5 + capSubH;
}

function drawSigCol(doc: PDFKit.PDFDocument, col: { name: string; caption: string; capSub: string }, x: number, y: number): number {
  const nameLine = 37.5;
  if (col.name) {
    setStyle(doc, S.sigName);
    const nameW = doc.widthOfString(col.name);
    const size = nameW > COL_W ? Math.max(14, 24 * (COL_W / nameW)) : 24; // długie nazwisko: skaluj zamiast łamać (kanon: jedna linia)
    doc.fontSize(size);
    doc.text(col.name, x, y + nameLine - size, { lineBreak: false });
  }
  const lineY = y + nameLine + 3;
  doc.moveTo(x, lineY).lineTo(x + COL_W, lineY).lineWidth(0.75).stroke(C.gray500);
  let cy = lineY + 0.75 + 3.75;
  setStyle(doc, S.cap);
  doc.text(col.caption, x, cy, textOpts(doc, S.cap, { width: COL_W }));
  cy += measure(doc, S.cap, col.caption, COL_W) + 1.5;
  setStyle(doc, S.capSub);
  doc.text(col.capSub, x, cy, textOpts(doc, S.capSub, { width: COL_W }));
  return cy + measure(doc, S.capSub, col.capSub, COL_W);
}

function measureSignatureBlock(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'signatureBlock' }>): number {
  let h = 0;
  if (b.variant === 'main') h += 19.5 + measure(doc, S.signsTitle, T.signsTitle, CONTENT_W) + 7.5;
  if (b.variant !== 'main') h += 27; // .anlage-sign margin-top 36px
  h += measureOrtDatum(doc);
  h += 13.5; // .sign-block margin-top 18px
  const left = sigColHeight(doc, b.left);
  const right = b.right ? sigColHeight(doc, b.right) : 0;
  h += Math.max(left, right);
  return h;
}

function drawSignatureBlock(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'signatureBlock' }>, y: number): number {
  let cy = y;
  if (b.variant === 'main') {
    cy += 19.5;
    setStyle(doc, S.signsTitle);
    doc.text(T.signsTitle, X, cy, textOpts(doc, S.signsTitle, { width: CONTENT_W, align: 'center' }));
    cy += measure(doc, S.signsTitle, T.signsTitle, CONTENT_W) + 7.5;
  } else {
    cy += 27;
  }
  cy = drawOrtDatum(doc, b.ort, b.datum, cy);
  cy += 13.5;
  const leftH = drawSigCol(doc, b.left, X, cy) - cy;
  let rightH = 0;
  if (b.right) rightH = drawSigCol(doc, b.right, X + COL_W + COL_GAP, cy) - cy;
  return cy + Math.max(leftH, rightH);
}

function measureAuditBanner(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'auditBanner' }>): number {
  const innerW = CONTENT_W - 2 * 10.5;
  const headH = measure(doc, S.bannerHead, b.heading, innerW);
  const lineH = runsHeight(doc, b.line, S.bannerText, S.bannerTextBold, innerW);
  const subH = measure(doc, S.bannerSub, b.sub, innerW);
  return 15 + 7.5 + headH + 2.25 + lineH + 3 + subH + 7.5;
}

function drawAuditBanner(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'auditBanner' }>, y: number): number {
  const top = y + 15;
  const innerW = CONTENT_W - 2 * 10.5;
  const boxH = measureAuditBanner(doc, b) - 15;
  doc.roundedRect(X, top, CONTENT_W, boxH, 4.5).lineWidth(0.75).fillAndStroke(C.bannerBg, C.bannerBorder);
  let cy = top + 7.5;
  // „✓ " z DejaVu + reszta nagłówka Boldem — kanon składa je dwoma fontami.
  const check = b.heading.startsWith('✓') ? '✓' : '';
  const headRest = check ? b.heading.slice(1).replace(/^\s+/, ' ') : b.heading;
  let hx = X + 10.5;
  if (check) {
    setStyle(doc, S.bannerCheck);
    doc.text(check, hx, cy, { lineBreak: false });
    hx += doc.widthOfString(check);
  }
  setStyle(doc, S.bannerHead);
  doc.text(headRest, hx, cy, textOpts(doc, S.bannerHead, { width: innerW - (hx - X - 10.5) }));
  cy += measure(doc, S.bannerHead, b.heading, innerW) + 2.25;
  cy += drawRuns(doc, b.line, S.bannerText, S.bannerTextBold, X + 10.5, cy, innerW, 'left') + 3;
  doc.fillOpacity(0.8);
  setStyle(doc, S.bannerSub);
  doc.text(b.sub, X + 10.5, cy, textOpts(doc, S.bannerSub, { width: innerW }));
  doc.fillOpacity(1);
  return top + boxH;
}

function measureAnlageHeading(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'anlageHeading' }>): number {
  return measure(doc, S.anlageH, b.title, CONTENT_W) + 4.5 + measure(doc, S.anlageSub, b.sub, CONTENT_W) + 13.5 + 0.75 + 13.5;
}

function drawAnlageHeading(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'anlageHeading' }>, y: number): number {
  setStyle(doc, S.anlageH);
  doc.text(b.title, X, y, textOpts(doc, S.anlageH, { width: CONTENT_W }));
  let cy = y + measure(doc, S.anlageH, b.title, CONTENT_W) + 4.5;
  setStyle(doc, S.anlageSub);
  doc.text(b.sub, X, cy, textOpts(doc, S.anlageSub, { width: CONTENT_W }));
  cy += measure(doc, S.anlageSub, b.sub, CONTENT_W) + 13.5;
  doc.moveTo(X, cy).lineTo(X + CONTENT_W, cy).lineWidth(0.75).stroke(C.goldBorder);
  return cy + 0.75 + 13.5;
}

function measureParagraphBlock(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'paragraph' }>): number {
  if (b.variant === 'anlageFootnote') return 7.5 + measure(doc, S.anlageFootnote, b.runs.map((r) => r.text).join(''), CONTENT_W);
  return runsHeight(doc, b.runs, S.anlageP, S.anlagePBold, CONTENT_W) + 9;
}

function drawParagraphBlock(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'paragraph' }>, y: number): number {
  if (b.variant === 'anlageFootnote') {
    setStyle(doc, S.anlageFootnote);
    doc.text(b.runs.map((r) => r.text).join(''), X, y + 7.5, textOpts(doc, S.anlageFootnote, { width: CONTENT_W }));
    return y + measureParagraphBlock(doc, b);
  }
  const h = drawRuns(doc, b.runs, S.anlageP, S.anlagePBold, X, y, CONTENT_W, 'justify');
  return y + h + 9;
}

function measureEinwilligung(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'einwilligung' }>): number {
  const innerW = CONTENT_W - 10.5 - 9;
  return 12 + 9 + measure(doc, S.anlagePBold, b.head, innerW) + measure(doc, S.anlageP, b.text, innerW) + 9 + 12;
}

function drawEinwilligung(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'einwilligung' }>, y: number): number {
  const top = y + 12;
  const innerW = CONTENT_W - 10.5 - 9;
  const boxH = measureEinwilligung(doc, b) - 24;
  doc.rect(X, top, CONTENT_W, boxH).fill(C.boxBg);
  doc.rect(X, top, 2.25, boxH).fill(C.gold);
  let cy = top + 9;
  setStyle(doc, S.anlagePBold);
  doc.text(b.head, X + 10.5, cy, textOpts(doc, S.anlagePBold, { width: innerW }));
  cy += measure(doc, S.anlagePBold, b.head, innerW);
  setStyle(doc, S.anlageP);
  doc.text(b.text, X + 10.5, cy, textOpts(doc, S.anlageP, { width: innerW }));
  return top + boxH + 12;
}

function measureLeadHead(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'leadHead' }>): number {
  return 13.5 + S.leadHead.size * S.leadHead.lh + 6;
}

function drawLeadHead(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'leadHead' }>, y: number): number {
  const cy = y + 13.5;
  setStyle(doc, S.leadHead);
  doc.text(b.text, X, cy, { lineBreak: false });
  const w = doc.widthOfString(b.text);
  setStyle(doc, S.leadNote);
  doc.text(` ${b.note}`, X + w, cy + (S.leadHead.size - S.leadNote.size), { lineBreak: false });
  return cy + S.leadHead.size * S.leadHead.lh + 6;
}

function measureCheckItem(doc: PDFKit.PDFDocument, text: string): number {
  return measure(doc, S.checkLi, text, CONTENT_W - CHECK_INDENT) + 2.25;
}

function drawCheckItem(doc: PDFKit.PDFDocument, text: string, y: number): number {
  setStyle(doc, S.checkBullet);
  doc.text('▸', X + 3, y, { lineBreak: false });
  setStyle(doc, S.checkLi);
  doc.text(text, X + CHECK_INDENT, y, textOpts(doc, S.checkLi, { width: CONTENT_W - CHECK_INDENT }));
  return y + measureCheckItem(doc, text);
}

// ─── Header (logo + Ort/Datum) i tytuł ──────────────────────────────────
let logoCache: Buffer | null = null;
function logoBuffer(): Buffer {
  if (!logoCache) {
    logoCache = readFileSync(path.join(process.cwd(), 'public', 'images', 'Primundus-Logo_V6.png'));
  }
  return logoCache;
}

const LOGO_H = 22.5; // 30px
const LOGO_W = LOGO_H * (1502 / 266);

function measureLogoHeader(doc: PDFKit.PDFDocument): number {
  return LOGO_H + 7.5 + 0.75 + 13.5;
}

function drawLogoHeader(doc: PDFKit.PDFDocument, b: Extract<VertragBlock, { type: 'logoHeader' }>, y: number): number {
  doc.image(logoBuffer(), X, y, { height: LOGO_H });
  setStyle(doc, S.headRight);
  const tw = doc.widthOfString(b.rightText);
  doc.text(b.rightText, X + CONTENT_W - tw, y + LOGO_H - S.headRight.size, { lineBreak: false });
  const lineY = y + LOGO_H + 7.5;
  doc.moveTo(X, lineY).lineTo(X + CONTENT_W, lineY).lineWidth(0.75).stroke(C.headBorder);
  return lineY + 0.75 + 13.5;
}

function measureDocTitle(doc: PDFKit.PDFDocument, text: string): number {
  return 13.5 + measure(doc, S.title, text, CONTENT_W) + 7.5 + 1.5 + 18;
}

function drawDocTitle(doc: PDFKit.PDFDocument, text: string, y: number): number {
  const top = y + 13.5; // h1 margin-top 18px
  setStyle(doc, S.title);
  doc.text(text, X, top, textOpts(doc, S.title, { width: CONTENT_W, align: 'center' }));
  const hH = measure(doc, S.title, text, CONTENT_W);
  const ruleY = top + hH + 7.5;
  doc.rect(X + (CONTENT_W - 45) / 2, ruleY, 45, 1.5).fill(C.gold);
  return ruleY + 1.5 + 18; // .rule margin-bottom 24px
}

// ─── Dispatcher ─────────────────────────────────────────────────────────
function measureBlock(doc: PDFKit.PDFDocument, b: VertragBlock): number {
  switch (b.type) {
    case 'logoHeader': return measureLogoHeader(doc);
    case 'docTitle': return measureDocTitle(doc, b.text);
    case 'centerNote': return measureCenterNote(doc, b);
    case 'partyBox': return measurePartyBox(doc, b);
    case 'sectionHeading': return measureSectionHeading(doc, b.text);
    case 'numberedItem': return measureNumberedItem(doc, b);
    case 'footnoteBox': return measureFootnoteBox(doc, b.text);
    case 'paragraph': return measureParagraphBlock(doc, b);
    case 'einwilligung': return measureEinwilligung(doc, b);
    case 'signatureBlock': return measureSignatureBlock(doc, b);
    case 'auditBanner': return measureAuditBanner(doc, b);
    case 'anlageHeading': return measureAnlageHeading(doc, b);
    case 'leadHead': return measureLeadHead(doc, b);
    case 'checkItem': return measureCheckItem(doc, b.text);
    case 'pageBreak': return 0;
  }
}

function drawBlock(doc: PDFKit.PDFDocument, b: VertragBlock, y: number): number {
  switch (b.type) {
    case 'logoHeader': return drawLogoHeader(doc, b, y);
    case 'docTitle': return drawDocTitle(doc, b.text, y);
    case 'centerNote': return drawCenterNote(doc, b, y);
    case 'partyBox': return drawPartyBox(doc, b, y);
    case 'sectionHeading': return drawSectionHeading(doc, b.text, y);
    case 'numberedItem': return drawNumberedItem(doc, b, y);
    case 'footnoteBox': return drawFootnoteBox(doc, b.text, y);
    case 'paragraph': return drawParagraphBlock(doc, b, y);
    case 'einwilligung': return drawEinwilligung(doc, b, y);
    case 'signatureBlock': return drawSignatureBlock(doc, b, y);
    case 'auditBanner': return drawAuditBanner(doc, b, y);
    case 'anlageHeading': return drawAnlageHeading(doc, b, y);
    case 'leadHead': return drawLeadHead(doc, b, y);
    case 'checkItem': return drawCheckItem(doc, b.text, y);
    case 'pageBreak': return y;
  }
}

// Bloki „klejone" z następnym (break-after: avoid / atomiczność z bannerem).
const GLUE_TYPES = new Set(['sectionHeading', 'anlageHeading', 'leadHead']);

export async function renderVertragPdf(blocks: VertragBlock[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN_TOP, bottom: MARGIN_BOTTOM, left: MARGIN_X, right: MARGIN_X },
    bufferPages: true,
    font: fontPath('Body'),
    info: { Title: 'Dienstleistungsvertrag – Primundus' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  let y = MARGIN_TOP;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === 'pageBreak') {
      doc.addPage();
      y = MARGIN_TOP;
      continue;
    }
    let need = measureBlock(doc, b);
    // Glue: nagłówek nie może zostać sam na dole strony; signatureBlock(main)
    // trzyma się razem ze swoim auditBannerem (HTML: jeden .sign-block).
    const next = blocks[i + 1];
    if (next && (GLUE_TYPES.has(b.type) || (b.type === 'signatureBlock' && b.variant === 'main' && next.type === 'auditBanner'))) {
      need += measureBlock(doc, next);
    }
    if (y + need > BOTTOM_LIMIT && y > MARGIN_TOP + 1) {
      doc.addPage();
      y = MARGIN_TOP;
    }
    y = drawBlock(doc, b, y);
  }

  // Stopka na każdej stronie — po treści, z guardem na auto-addPage.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = PAGE_H - FOOTER_BASELINE_FROM_BOTTOM - S.footer.size;
    setStyle(doc, S.footerBrand);
    doc.text(T.footerBrand, X, fy, { lineBreak: false });
    const bw = doc.widthOfString(T.footerBrand);
    setStyle(doc, S.footer);
    doc.text(` ${T.footerRest.trim()}`, X + bw, fy, { lineBreak: false });
    const right = `Seite ${i - range.start + 1} von ${range.count}`;
    const rw = doc.widthOfString(right);
    doc.text(right, X + CONTENT_W - rw, fy, { lineBreak: false });
    doc.page.margins.bottom = saved;
  }

  doc.end();
  return done;
}
