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
  buildVertragHtml,
  type VertragHtmlOptions,
  type VertragInput,
} from './vertrag-content';

export {
  buildVertragHtml,
  formatSignedAtBerlin,
  buildVertragDocument,
  documentPlainText,
  type VertragBlock,
  type VertragHtmlOptions,
  type VertragInput,
  type VertragPartei,
} from './vertrag-content';

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
