// Generuje Mustervertrag (niepodpisany wzór umowy) naszym rendererem pdfkit
// i podmienia public/primundus-mustervertrag.pdf w repo root (link portalu
// „Mustervertrag als PDF herunterladen", CustomerPortalPage). Kopię na
// primundus.de (WordPress) wgrywa Michał ręcznie z tego samego pliku.
//   cd "project 3" && npx tsx scripts/vertrag/render-muster.ts
// Muster = pusty input: pola stron „—", linie podpisu narysowane ale puste
// (pułapka 15 z planu pdfkit), „Ort, Datum:" do wypełnienia. Blok auditBanner
// jest ODFILTROWANY — wzór nie jest podpisany, banner „rechtsverbindlich
// unterschrieben" byłby kłamstwem na szablonie.
import { writeFileSync } from 'fs';
import { join } from 'path';
import { buildVertragDocument } from '../../lib/vertrag-content';
import { renderVertragPdf } from '../../lib/vertrag-pdf';

async function main() {
  const blocks = buildVertragDocument({}, { signaturName: '' })
    .filter((b) => b.type !== 'auditBanner')
    // Kosmetyka pustego inputu: capSub DL kończy się „· Kassel, " (datum
    // pusty) — na publicznym szablonie przycinamy wiszący przecinek.
    // Zmiana TYLKO tutaj (skrypt), model współdzielony nietknięty.
    .map((b) =>
      b.type === 'signatureBlock' && b.right
        ? { ...b, right: { ...b.right, capSub: b.right.capSub.replace(/,\s*$/, '') } }
        : b,
    );
  const buf = await renderVertragPdf(blocks);
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('render nie zwrócił PDF');
  const out = join(__dirname, '..', '..', '..', 'public', 'primundus-mustervertrag.pdf');
  writeFileSync(out, buf);
  console.log(`ok: ${out} (${buf.length} B)`);
}

main();
