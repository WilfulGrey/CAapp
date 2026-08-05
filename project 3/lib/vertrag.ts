// Server-seitiger Generator für den unterschriebenen Dienstleistungsvertrag.
// Wird beim Buchen (application_accepted_internal) erzeugt und per
// `buildVertragAttachmentPdf` zu PDF gerendert → an Kunde + Team gemailt.
//
// TREŚĆ dokumentu (Wortlaut 1:1 z dist/primundus-mustervertrag.pdf) żyje w
// lib/vertrag-content.ts — ten plik jest fasadą: składa HTML z tych samych
// danych, z których renderer PDF buduje dokument. Zmiany treści robić TAM.
//
// Historischer Hinweis: bis 11.06.2026 wurde HTML 1:1 als Mail-Anhang
// versendet. Outlook/Gmail flaggen HTML-Anhänge als verdächtig und der
// Vertrag war nicht gerichtsfest archivierbar. Daher rendern wir jetzt
// via puppeteer + @sparticuz/chromium zu echtem PDF (siehe unten).

import {
  type Paragraph,
  type VertragHtmlOptions,
  type VertragInput,
  resolveVertragFelder,
  T,
  HW_CHECKLIST,
  GP_CHECKLIST,
} from './vertrag-content';

export {
  formatSignedAtBerlin,
  buildVertragDocument,
  documentPlainText,
  type VertragBlock,
  type VertragHtmlOptions,
  type VertragInput,
  type VertragPartei,
} from './vertrag-content';


// ─── Helfer ──────────────────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderParagraph(p: Paragraph): string {
  const items = p.punkte
    .map((punkt) => {
      const sub = punkt.subList
        ? `<ul class="sub">${punkt.subList.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
        : '';
      return `<li><span class="num"></span><span class="txt">${esc(punkt.text)}${sub}</span></li>`;
    })
    .join('');
  const footnote = p.footnote ? `<p class="footnote">${esc(p.footnote)}</p>` : '';
  return `
    <section class="para">
      <h2>${esc(p.titel)}</h2>
      <ol>${items}</ol>
      ${footnote}
    </section>`;
}

// ─── Bildung des HTML-Dokuments ──────────────────────────────────────────
// (VertragHtmlOptions + formatSignedAtBerlin żyją w vertrag-content.ts —
// tu tylko składanie HTML z tych samych pól/reguł co renderer PDF.)

export function buildVertragHtml(daten: VertragInput, opts: VertragHtmlOptions): string {
  // Wspólna derywacja pól (defaulty, reguła signDatum) — RAW z
  // resolveVertragFelder, escaping wyłącznie tutaj, na krawędzi HTML.
  const f = resolveVertragFelder(daten, opts);
  const datum = esc(f.datum);
  const ag = f.ag;
  const le = f.le;
  const dlName = esc(f.dlName);
  const dlRolle = esc(f.dlRolle);
  const ort = esc(f.ort);
  const signaturName = esc(f.signaturName);
  const signedAt = esc(f.signedAt);
  const signDatum = esc(f.signDatum);

  const parteiZeile = (label: string, value?: string) =>
    `<div class="pz"><span class="pl">${esc(label)}</span><span class="pv">${esc(value || '—')}</span></div>`;

  const leBlock = le
    ? `${parteiZeile(T.leLabels.name, le.name)}${parteiZeile(T.leLabels.strasse, le.strasse)}${parteiZeile(T.leLabels.plzOrt, [le.plz, le.ort].filter(Boolean).join(' '))}`
    : `<div class="pz le-empty"><span class="pv italic">${T.leIdentisch}</span></div>`;

  // Layout 1:1 dem Mustervertrag (dist/primundus-mustervertrag.pdf, 8 Seiten):
  //  Seite 1: Header + Datum + "Dienstleistungsvertrag" + Vertragsparteien
  //  Seite 2: § 1 (10 Punkte) + § 2 Anfang
  //  Seite 3: § 2 Rest + § 3 (7 Punkte)
  //  Seite 4: § 4 (12 Punkte)
  //  Seite 5: § 5 + § 6 + § 7
  //  Seite 6: § 8 + § 9 + § 10 + Unterschriften
  //  Seite 7: Anlage 1 (DSGVO)
  //  Seite 8: Anlage 2 (Leistungsumfang)
  //
  // Footer "PRIMUNDUS | www.primundus.de | Seite X von 8" wird per Puppeteer
  // footerTemplate gerendert (echte Seitenzähler) — siehe
  // buildVertragAttachmentPdf weiter unten.
  return `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dienstleistungsvertrag – Primundus</title>
<style>
  @page { size: A4; margin: 18mm 22mm 24mm 22mm; }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body {
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1f2937;
    font-size: 11.5pt;
    line-height: 1.65;
    margin: 0;
  }

  /* ─── Header (nur auf Seite 1) ─────────────────────────────────────── */
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px; margin-bottom: 18px; }
  .head img.brand { height: 30px; }
  .head .datum { font-size: 10pt; color: #6b7280; }

  /* ─── Titel ───────────────────────────────────────────────────────── */
  h1 { text-align: center; font-size: 22pt; margin: 18px 0 0; font-weight: 700; color: #1f2937; letter-spacing: .5px; }
  .rule { width: 60px; height: 2px; background: #B5A184; margin: 10px auto 24px; }
  .intro-center { text-align: center; color: #6b7280; font-size: 11pt; margin: 0 0 18px; }

  /* ─── Parteien-Boxen ──────────────────────────────────────────────── */
  .parteien { break-inside: avoid; }
  .box {
    border: 1px solid #C9B89A;
    border-radius: 8px;
    padding: 14px 18px;
    margin: 8px 0;
    background: #fff;
    break-inside: avoid;
  }
  .box .tag {
    font-size: 9.5pt;
    font-style: italic;
    letter-spacing: .15em;
    color: #9ca3af;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  .box .firma { font-size: 13pt; font-weight: 700; color: #1f2937; }
  .box .firma-sub { font-size: 10.5pt; color: #4b5563; margin-top: 4px; }
  .pz { display: flex; gap: 14px; padding: 3px 0; font-size: 10.5pt; align-items: baseline; border-bottom: 1px dotted #E5E7EB; }
  .pz:last-child { border-bottom: 0; }
  .pz .pl { width: 130px; flex-shrink: 0; color: #9ca3af; font-size: 10pt; }
  .pz .pv { color: #1f2937; flex: 1; }
  .pz .pv.italic { font-style: italic; color: #9ca3af; }
  .pz.le-empty { padding: 8px 0; }

  /* "im Folgenden ... genannt" — Zwischenzeilen */
  .between {
    text-align: center;
    color: #6b7280;
    font-size: 10pt;
    margin: 6px 0 14px;
    break-inside: avoid;
  }
  .between strong { color: #1f2937; font-weight: 600; }
  .between.und {
    font-weight: 700;
    color: #6B5444;
    font-size: 11pt;
    margin: 14px 0;
    letter-spacing: .15em;
  }

  /* Wrapper: Box + ihre "im Folgenden..."-Zeile bleiben zusammen */
  .partei-block { break-inside: avoid; margin-bottom: 4px; }

  /* ─── §§-Paragraphen ──────────────────────────────────────────────── */
  /* KEIN break-inside:avoid — sonst springt jeder § auf eine neue Seite.
     Stattdessen Header (h2) per break-after:avoid bei seinem ersten <li>
     halten und einzelne <li> per break-inside:avoid intakt rendern. */
  .para { margin: 14px 0 12px; }
  .para h2 {
    font-size: 13.5pt;
    color: #6B5444;
    border-bottom: 1px solid #C9B89A;
    padding-bottom: 6px;
    margin: 0 0 10px;
    font-weight: 700;
    break-after: avoid-page;
  }
  .para ol {
    margin: 0;
    padding-left: 0;
    list-style: none;
    counter-reset: punkt;
  }
  .para ol > li {
    counter-increment: punkt;
    font-size: 11pt;
    line-height: 1.6;
    margin-bottom: 6px;
    padding-left: 28px;
    position: relative;
    text-align: justify;
    color: #1f2937;
    break-inside: avoid;
  }
  .para ol > li::before {
    content: counter(punkt) ".";
    position: absolute;
    left: 0;
    top: 0;
    color: #9ca3af;
    font-weight: 600;
    width: 22px;
    text-align: right;
  }
  .para ol > li .num { display: none; }
  .para ol > li .txt { display: block; }

  /* Sub-Liste für § 1 Punkt 8 (vier ▸-Bullets) */
  .para .sub {
    list-style: none;
    padding-left: 0;
    margin: 6px 0 0 0;
  }
  .para .sub li {
    padding-left: 18px;
    position: relative;
    font-size: 10.5pt;
    line-height: 1.55;
    margin-bottom: 3px;
    color: #374151;
    text-align: left;
  }
  .para .sub li::before {
    content: "▸";
    position: absolute;
    left: 0;
    top: 0;
    color: #B5A184;
  }

  .para .footnote {
    font-size: 10pt;
    color: #6b7280;
    margin: 10px 0 0;
    padding: 8px 12px;
    background: #FAF8F4;
    border-left: 3px solid #B5A184;
    border-radius: 0 4px 4px 0;
  }

  /* ─── Unterschriften ──────────────────────────────────────────────── */
  .signs-title {
    text-align: center;
    color: #6B5444;
    font-size: 12pt;
    font-weight: 700;
    margin: 26px 0 10px;
    letter-spacing: .1em;
  }
  .ort-datum {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    margin: 0 0 6px;
    break-inside: avoid;
  }
  .ort-datum .col { flex: 1; }
  .ort-datum .col .lbl { font-size: 9.5pt; color: #9ca3af; }
  .ort-datum .col .val { font-size: 11pt; color: #1f2937; border-bottom: 1px solid #C9B89A; padding: 4px 0 3px; }

  .sign-block { break-inside: avoid; margin-top: 18px; }
  .sign-grid {
    display: flex;
    gap: 40px;
  }
  .sign-grid .col { flex: 1; }
  .sign-grid .name-line {
    height: 50px;
    display: flex;
    align-items: flex-end;
    margin-bottom: 4px;
  }
  .sign-grid .name {
    font-family: "Snell Roundhand", "Lucida Handwriting", "Brush Script MT", cursive;
    font-size: 24pt;
    color: #1f3a8a;
    line-height: 1;
  }
  .sign-grid .cap {
    border-top: 1px solid #6b7280;
    padding-top: 5px;
    font-size: 9.5pt;
    color: #6b7280;
    line-height: 1.45;
  }
  .sign-grid .cap-sub {
    font-size: 9pt;
    color: #9ca3af;
    margin-top: 2px;
  }

  .audit-banner {
    margin-top: 20px;
    padding: 10px 14px;
    border: 1px solid #BBF7D0;
    background: #F0FDF4;
    border-radius: 6px;
    break-inside: avoid;
  }
  .audit-banner .h { font-weight: 700; color: #166534; font-size: 10.5pt; margin-bottom: 3px; }
  .audit-banner .t { font-size: 10pt; color: #15803d; line-height: 1.55; }
  .audit-banner .a { font-size: 9pt; color: #15803d; opacity: .8; margin-top: 4px; }

  /* ─── Anlagen ────────────────────────────────────────────────────── */
  .anlage {
    page-break-before: always;
    break-before: page;
  }
  .anlage h1.anlage-h {
    font-size: 17pt;
    color: #1f2937;
    text-align: left;
    margin: 0 0 6px;
    font-weight: 700;
  }
  .anlage .anlage-sub {
    font-size: 13pt;
    color: #6B5444;
    margin: 0 0 18px;
    font-weight: 600;
  }
  .anlage-rule { height: 1px; background: #C9B89A; margin: 0 0 18px; }
  .anlage p { font-size: 11pt; line-height: 1.7; color: #1f2937; margin: 0 0 12px; text-align: justify; }
  .anlage .lead-head {
    font-size: 12pt;
    font-weight: 700;
    color: #1f2937;
    margin: 18px 0 8px;
  }
  .anlage ul.checklist {
    list-style: none;
    padding-left: 0;
    margin: 4px 0 0;
  }
  .anlage ul.checklist li {
    padding-left: 22px;
    position: relative;
    font-size: 10.5pt;
    line-height: 1.6;
    margin-bottom: 4px;
    color: #1f2937;
  }
  .anlage ul.checklist li::before {
    content: "▸";
    position: absolute;
    left: 4px;
    top: 0;
    color: #B5A184;
    font-size: 11pt;
  }
  .anlage .einwilligung {
    margin: 16px 0;
    padding: 12px 14px;
    background: #FAF8F4;
    border-left: 3px solid #B5A184;
    border-radius: 0 4px 4px 0;
  }
  .anlage .footnote-anlage {
    margin-top: 10px;
    font-size: 10pt;
    color: #6b7280;
    font-style: italic;
  }
  .anlage .anlage-sign {
    margin-top: 36px;
    break-inside: avoid;
  }
</style></head>
<body>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 1: Header + Titel + Vertragsparteien
       ═══════════════════════════════════════════════════════════════ -->
  <div class="head">
    <img class="brand" src="https://kostenrechner.primundus.de/images/Primundus-Logo_V6.png" alt="Primundus">
    <span class="datum">${T.ortDatumPrefix}${ort}${ort ? ', ' : ''}${datum}</span>
  </div>

  <h1>${T.titel}</h1>
  <div class="rule"></div>

  <p class="intro-center">${T.intro}</p>

  <div class="parteien">
    <div class="partei-block">
      <div class="box">
        <div class="tag">${T.agTag}</div>
        ${parteiZeile(T.agLabels.name, ag.name)}
        ${parteiZeile(T.agLabels.strasse, ag.strasse)}
        ${parteiZeile(T.agLabels.plzOrt, [ag.plz, ag.ort].filter(Boolean).join(' '))}
        ${parteiZeile(T.agLabels.email, ag.email)}
        ${parteiZeile(T.agLabels.telefon, ag.telefon)}
      </div>
      <p class="between">${T.betweenPrefix}<strong>${T.agBetweenBold}</strong>${T.betweenSuffix}</p>
    </div>

    <div class="partei-block">
      <div class="box">
        <div class="tag">${T.leTag}</div>
        ${leBlock}
      </div>
      <p class="between">${T.betweenPrefix}<strong>${T.leBetweenBold}</strong>${T.betweenSuffix}</p>
    </div>

    <p class="between und">${T.und}</p>

    <div class="partei-block">
      <div class="box">
        <div class="tag">${T.dlTag}</div>
        <div class="firma">${T.dlFirma}</div>
        <div class="firma-sub">${T.dlFirmaSub1}</div>
        <div class="firma-sub">${T.dlFirmaSub2}</div>
      </div>
      <p class="between">${T.betweenPrefix}<strong>${T.dlBetweenBold}</strong>${T.dlBetweenSuffix}</p>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITEN 2-6: §§ 1 - 10
       ═══════════════════════════════════════════════════════════════ -->
  ${f.paragraphs.map(renderParagraph).join('\n  ')}

  <!-- Unterschriften (Ende Seite 6) -->
  <div class="sign-block">
    <div class="signs-title">${T.signsTitle}</div>
    <div class="ort-datum">
      <div class="col"><div class="lbl">${T.lblOrt}</div><div class="val">${ort || '&nbsp;'}</div></div>
      <div class="col"><div class="lbl">${T.lblDatum}</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
    </div>
    <div class="sign-grid">
      <div class="col">
        <div class="name-line"><span class="name">${signaturName}</span></div>
        <div class="cap">
          ${T.capAg}
          <div class="cap-sub">${T.capAgSub}</div>
        </div>
      </div>
      <div class="col">
        <div class="name-line"><span class="name">${dlName}</span></div>
        <div class="cap">
          ${T.capDl}
          <div class="cap-sub">i. A. ${dlName}, ${dlRolle} · Warszawa, ${datum}</div>
        </div>
      </div>
    </div>

    <div class="audit-banner">
      <div class="h">${T.auditHead}</div>
      <div class="t">${T.auditSigniertVon}<strong>${signaturName}</strong>${signedAt ? `${T.auditAm}<strong>${signedAt}</strong>` : ''}.</div>
      <div class="a">${T.auditSub}${opts.auditNote ? ` · ${esc(opts.auditNote)}` : ''}</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 7: Anlage 1 — Datenschutz
       ═══════════════════════════════════════════════════════════════ -->
  <section class="anlage">
    <h1 class="anlage-h">${T.anlage1H}</h1>
    <div class="anlage-sub">${T.anlage1Sub}</div>
    <div class="anlage-rule"></div>

    <p>${T.anlage1P1Prefix}<strong>${T.anlage1P1Email}</strong></p>

    <p>${T.anlage1P2}</p>

    <p>${T.anlage1P3}</p>

    <div class="einwilligung">
      <strong>${T.einwilligungHead}</strong><br>
      ${T.einwilligungText}
    </div>

    <div class="anlage-sign">
      <div class="ort-datum">
        <div class="col"><div class="lbl">${T.lblOrt}</div><div class="val">${ort || '&nbsp;'}</div></div>
        <div class="col"><div class="lbl">${T.lblDatum}</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
      </div>
      <div class="sign-grid">
        <div class="col">
          <div class="name-line"><span class="name">${signaturName}</span></div>
          <div class="cap">
            ${T.capAg}
            <div class="cap-sub">${T.capAgSub}</div>
          </div>
        </div>
        <div class="col"><!-- DL signiert hier nicht --></div>
      </div>
    </div>
  </section>

  <!-- ═══════════════════════════════════════════════════════════════════
       SEITE 8: Anlage 2 — Leistungsumfang
       ═══════════════════════════════════════════════════════════════ -->
  <section class="anlage">
    <h1 class="anlage-h">${T.anlage2H}</h1>
    <div class="anlage-sub">${T.anlage2Sub}</div>
    <div class="anlage-rule"></div>

    <p>${T.anlage2Intro}</p>

    <div class="lead-head">${T.hwHead} <span style="font-weight:400;color:#6b7280;font-size:10.5pt;">${T.hwNote}</span></div>
    <ul class="checklist">
      ${HW_CHECKLIST.map((s) => `<li>${esc(s)}</li>`).join('\n      ')}
    </ul>

    <div class="lead-head">${T.gpHead} <span style="font-weight:400;color:#6b7280;font-size:10.5pt;">${T.gpNote}</span></div>
    <ul class="checklist">
      ${GP_CHECKLIST.map((s) => `<li>${esc(s)}</li>`).join('\n      ')}
    </ul>

    <p class="footnote-anlage">${T.anlage2Footnote}</p>

    <div class="anlage-sign">
      <div class="ort-datum">
        <div class="col"><div class="lbl">${T.lblOrt}</div><div class="val">${ort || '&nbsp;'}</div></div>
        <div class="col"><div class="lbl">${T.lblDatum}</div><div class="val">${signDatum || datum || '&nbsp;'}</div></div>
      </div>
      <div class="sign-grid">
        <div class="col">
          <div class="name-line"><span class="name">${signaturName}</span></div>
          <div class="cap">
            ${T.capAg}
            <div class="cap-sub">${T.capAgSub}</div>
          </div>
        </div>
        <div class="col">
          <div class="name-line"><span class="name">${dlName}</span></div>
          <div class="cap">
            ${T.capDl}
            <div class="cap-sub">i. A. ${dlName}, ${dlRolle} · Warszawa, ${datum}</div>
          </div>
        </div>
      </div>
    </div>
  </section>

</body></html>`;
}

// ─── Footer-Template für Puppeteer (Seitenzähler) ────────────────────────
// Puppeteer's displayHeaderFooter + footerTemplate rendert pro Seite einen
// kleinen HTML-Block in den unteren Margin. <span class="pageNumber"> +
// <span class="totalPages"> sind Puppeteer-spezifische Platzhalter, die
// zur Render-Zeit ersetzt werden. ACHTUNG: Schrift-Größe muss explizit
// gesetzt sein, sonst rendert Chrome sie winzig (Default ist ~10px nur
// im Template-Kontext).

const PUPPETEER_FOOTER_TEMPLATE = `
<div style="
  font-size: 9pt;
  width: 100%;
  padding: 0 22mm;
  color: #9ca3af;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  display: flex;
  justify-content: space-between;
  align-items: center;
">
  <span><strong style="color:#6B5444;">PRIMUNDUS</strong> | www.primundus.de</span>
  <span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>
</div>`;

// Puppeteer braucht IRGENDEINEN headerTemplate, sonst rendert es einen
// Default-Header mit URL/Datum (ja, wirklich). Leerer Block = unsichtbar.
const PUPPETEER_HEADER_TEMPLATE = `<div></div>`;

// ─── PDF-Rendering (Mail-Anhang) ─────────────────────────────────────────
// Async, weil puppeteer.launch + page.pdf ~1-3s dauert. Aufrufer (Bridge-
// POST in app/api/lead-event/route.ts) ist eh in einem async-Kontext.
//
// @sparticuz/chromium in Production (Render serverless), lokales chromium
// in Dev. Bei Render-Fehler: HTML-Fallback, damit die Mail nicht ohne
// Anhang rausgeht.
export async function buildVertragAttachmentPdf(
  daten: VertragInput,
  opts: VertragHtmlOptions,
): Promise<{ filename: string; content: Buffer | string; contentType: string }> {
  const html = buildVertragHtml(daten, opts);
  let browser: import('puppeteer-core').Browser | null = null;
  try {
    const puppeteer = (await import('puppeteer-core')).default;
    const isProduction = process.env.NODE_ENV === 'production';
    const launchOptions = isProduction
      ? await (async () => {
          const chromium = (await import('@sparticuz/chromium')).default;
          return {
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true as const,
          };
        })()
      : {
          headless: true as const,
          executablePath: '/usr/bin/chromium',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        };

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    // Logo wird von extern geladen → `load` wartet bis window.onload feuert
    // (inkl. aller <img>-Loads). Type-Def in puppeteer-core 22.x kennt nur
    // load/domcontentloaded; networkidle wäre robuster, ist aber nicht
    // im TS-Typ enthalten.
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const pdfBuf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: PUPPETEER_HEADER_TEMPLATE,
      footerTemplate: PUPPETEER_FOOTER_TEMPLATE,
      // Margin.bottom muss Platz für den Footer lassen (~15-18mm)
      margin: { top: '12mm', right: '0', bottom: '18mm', left: '0' },
    });
    return {
      filename: 'Betreuungsvertrag_Primundus.pdf',
      content: Buffer.from(pdfBuf),
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.error(
      '[buildVertragAttachmentPdf] PDF-Render fehlgeschlagen, falle auf HTML-Anhang zurück:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      filename: 'Betreuungsvertrag_Primundus.html',
      content: html,
      contentType: 'text/html; charset=utf-8',
    };
  } finally {
    if (browser) {
      // Den OS-Prozess VOR close() greifen — nach close() liefert
      // browser.process() ggf. null.
      const proc = browser.process();
      try {
        // close() kann auf @sparticuz/chromium in einem langlebigen (Nicht-
        // Lambda) Render-Prozess hängen → mit Timeout rennen, damit der
        // Request nicht blockiert.
        await Promise.race([
          browser.close(),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch {
        // ignore — Force-Kill unten räumt auf.
      }
      // Force-Kill: wenn close() den Chromium-Prozess nicht reaped hat, sammeln
      // sich Zombie-Chromiums über die Buchungen an → tägliches 512Mi-OOM auf
      // Render (genau das Symptom). SIGKILL stellt sicher, dass der Prozess
      // wirklich stirbt. No-op wenn der Prozess bereits tot ist.
      try {
        proc?.kill('SIGKILL');
      } catch {
        // bereits beendet / kein eigener Prozess (ws-Connection) — ignorieren.
      }
    }
  }
}

/** @deprecated Verwende `buildVertragAttachmentPdf` (async, echtes PDF).
 *  Diese Synchron-Variante liefert HTML — Mail-Clients flaggen das als
 *  verdächtig und der Anhang ist nicht gerichtsfest archivierbar.
 *  Behalten für Tests / Notfall-Rollback. */
export function buildVertragAttachment(daten: VertragInput, opts: VertragHtmlOptions) {
  return {
    filename: 'Betreuungsvertrag_Primundus.html',
    content: buildVertragHtml(daten, opts),
    contentType: 'text/html; charset=utf-8',
  };
}
