// Renderuje pdfkit-owe odpowiedniki kanonów: dla każdego wiersza z
// rows.json (snapshot+signatur+signed_at z prod lead_application_acceptances)
// buduje VertragInput DOKŁADNIE wg mapowania app/api/contract-pdf/[leadId]/
// route.ts:143-176 i zapisuje <app>.new.pdf obok kanonu <app>.pdf.
//   cd "project 3" && npx tsx scripts/vertrag/render-goldens.ts <dir-goldenów>
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildVertragDocument, formatSignedAtBerlin, type VertragInput } from '../../lib/vertrag-content';
import { renderVertragPdf } from '../../lib/vertrag-pdf';

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: render-goldens.ts <dir>');
  // rows.json bywa zapisany przez PowerShell 5.1 (Out-File) = UTF-8 z BOM;
  // top-level to {goldens:[...]} albo [{goldens:[...]}] (ConvertTo-Json).
  const parsed = JSON.parse(readFileSync(join(dir, 'rows.json'), 'utf8').replace(/^﻿/, ''));
  const rows = (Array.isArray(parsed) ? parsed[0]?.goldens : parsed.goldens) as Array<{
    application_id: number;
    contract_snapshot: Record<string, unknown> | null;
    signatur: string | null;
    signed_at: string | null;
  }>;
  for (const r of rows) {
    const snap = (r.contract_snapshot ?? {}) as Record<string, any>;
    // Mapowanie 1:1 z contract-pdf/route.ts (bucket-miss render-fallback):
    const daten: VertragInput = {
      datum: typeof snap.datum === 'string' ? snap.datum : undefined,
      ag: snap.ag && typeof snap.ag === 'object' ? snap.ag : undefined,
      le: snap.le && typeof snap.le === 'object' ? snap.le : null,
      vertragsbeginn: typeof snap.vertragsbeginn === 'string' ? snap.vertragsbeginn : undefined,
      voraussAbreise: typeof snap.voraussAbreise === 'string' ? snap.voraussAbreise : undefined,
      tagessatz: typeof snap.tagessatz === 'string' ? snap.tagessatz : undefined,
      dl: snap.dl && typeof snap.dl === 'object' ? snap.dl : undefined,
    };
    const signaturName = (typeof r.signatur === 'string' && r.signatur.trim())
      || (typeof snap.ag?.name === 'string' && snap.ag.name)
      || 'Auftraggeber';
    const signedAt = r.signed_at ? formatSignedAtBerlin(r.signed_at) : undefined;
    const blocks = buildVertragDocument(daten, {
      signaturName: typeof signaturName === 'string' ? signaturName : String(signaturName),
      signedAt,
      auditNote: 'Vertragsversion v1.0',
    });
    const buf = await renderVertragPdf(blocks);
    const out = join(dir, `${r.application_id}.new.pdf`);
    writeFileSync(out, buf);
    console.log(`ok: ${r.application_id}.new.pdf (${buf.length} B)`);
  }
}

main();
