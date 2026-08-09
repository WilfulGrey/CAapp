// Server-seitiger Generator für den unterschriebenen Dienstleistungsvertrag.
// Wird beim Buchen (application_accepted_internal) erzeugt und per
// `buildVertragAttachmentPdf` zu PDF gerendert → an Kunde + Team gemailt.
//
// TREŚĆ dokumentu (Wortlaut 1:1 z dist/primundus-mustervertrag.pdf) żyje w
// lib/vertrag-content.ts (model blokowy + HTML-fallback), RYSOWANIE w
// lib/vertrag-pdf.ts (pdfkit). Ten plik to cienka fasada o stabilnym API.
//
// Historia rendererów:
//   - do 11.06.2026: HTML jako załącznik (Outlook/Gmail flagowały),
//   - do 08/2026: puppeteer + @sparticuz/chromium — pełny Chromium w
//     procesie Next.js zjadał >300 MB RSS i wywalał kontener Render
//     (512 MB) OOM-em (Registry #27),
//   - teraz: pdfkit (czysty JS, ~20-30 MB/render), fonty z assets/fonts/
//     (te same kroje, którymi Chromium składał dotychczasowe kanony:
//     Liberation Sans/Serif + DejaVu Sans — patrz pomiar w vertrag-pdf.ts).
//
// Fallback: gdy render PDF rzuci (np. brak plików fontów), mail wychodzi
// z załącznikiem HTML — jak dotychczas. Magic-byte gate'y (%PDF-) w
// lead-event/route.ts i acceptanceSync pilnują, że HTML nigdy nie trafi
// do kanonu w Storage ani do Mamamii.

import { buildVertragDocument, buildVertragHtml, type VertragHtmlOptions, type VertragInput } from './vertrag-content';

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

// ─── PDF-Rendering (Mail-Anhang + Kanon) ─────────────────────────────────
// Dynamiczny import vertrag-pdf: pdfkit ładuje się dopiero przy pierwszym
// renderze (i NIGDY w root-vitest, który importuje tylko pure-moduły).
export async function buildVertragAttachmentPdf(
  daten: VertragInput,
  opts: VertragHtmlOptions,
): Promise<{ filename: string; content: Buffer | string; contentType: string }> {
  const blocks = buildVertragDocument(daten, opts);
  try {
    const { renderVertragPdf } = await import('./vertrag-pdf');
    const pdf = await renderVertragPdf(blocks);
    return {
      filename: 'Betreuungsvertrag_Primundus.pdf',
      content: pdf,
      contentType: 'application/pdf',
    };
  } catch (err) {
    console.error(
      '[buildVertragAttachmentPdf] PDF-Render fehlgeschlagen, falle auf HTML-Anhang zurück:',
      err instanceof Error ? err.message : String(err),
    );
    return {
      filename: 'Betreuungsvertrag_Primundus.html',
      content: buildVertragHtml(daten, opts),
      contentType: 'text/html; charset=utf-8',
    };
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
