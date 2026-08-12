// Backfill kanonicznych PDF-ów umów (Registry #27, krok po cutoverze na
// pdfkit; decyzja Michała 2026-08-06 „ok, rób backfill").
//
// Problem: 9 wierszy lead_application_acceptances na prodzie nie ma pliku
// w buckecie contracts/ — 6 legacy sprzed refactoru kanonu (#404,
// pdf_sha256 IS NULL) + 3 z NIEPRAWDZIWYM stemplem pdf_sha256 (sync
// stemplował hash efemerycznego renderu, obiekt nigdy nie wgrany).
// Skutek: każde otwarcie „Vertrag" renderuje dokument od nowa (łamie
// zasadę „JEDEN kanoniczny plik"), a tamper-evidence tych 3 wierszy kłamie.
//
// Działanie per wiersz z contract_snapshot:
//   1. bucket-check contracts/<lead>/<app>.pdf:
//      - jest + %PDF-  → jeśli pdf_sha256 puste: stempel sha z ISTNIEJĄCYCH
//        bajtów; jeśli sha ≠ bajty: log NIEZGODNOŚCI (bez zmian — do ręcznej
//        decyzji); zgodne → skip.
//      - brak → render pdfkit (mapowanie 1:1 z contract-pdf/route.ts) →
//        upload upsert:false → stempel sha nowych bajtów.
//   2. NIC nie nadpisuje istniejących obiektów (upsert:false wszędzie).
//
// Uruchomienie (manualne, service-key przez env):
//   cd "project 3"
//   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."
//   npx tsx scripts/vertrag/backfill-contract-canon.ts [--apply]
// Bez --apply = DRY RUN (tylko raport, zero zapisów).
import { createHash } from 'crypto';
import { buildVertragDocument, formatSignedAtBerlin, type VertragInput } from '../../lib/vertrag-content';
import { renderVertragPdf } from '../../lib/vertrag-pdf';

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY wymagane');
const APPLY = process.argv.includes('--apply');

const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function rest<T>(path: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`REST ${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

async function download(leadId: string, appId: number): Promise<Buffer | null> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/contracts/${leadId}/${appId}.pdf`, { headers: HEADERS });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.subarray(0, 5).toString('latin1') === '%PDF-' ? buf : null;
}

async function upload(leadId: string, appId: number, bytes: Buffer): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/contracts/${leadId}/${appId}.pdf`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/pdf', 'x-upsert': 'false' },
    body: new Uint8Array(bytes),
  });
  if (!r.ok) throw new Error(`upload ${appId}: ${r.status} ${await r.text()}`);
}

async function stampSha(leadId: string, appId: number, sha: string): Promise<void> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/lead_application_acceptances?lead_id=eq.${leadId}&application_id=eq.${appId}`,
    { method: 'PATCH', headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ pdf_sha256: sha }) },
  );
  if (!r.ok) throw new Error(`stamp ${appId}: ${r.status} ${await r.text()}`);
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

type Row = {
  lead_id: string;
  application_id: number;
  contract_snapshot: Record<string, any> | null;
  signatur: string | null;
  signed_at: string | null;
  pdf_sha256: string | null;
};

async function main() {
  console.log(`=== backfill kanonów (${APPLY ? 'APPLY' : 'DRY RUN'}) na ${SUPABASE_URL} ===`);
  const rows = await rest<Row[]>(
    'lead_application_acceptances?select=lead_id,application_id,contract_snapshot,signatur,signed_at,pdf_sha256&contract_snapshot=not.is.null&order=accepted_at.asc',
  );
  let healthy = 0, stamped = 0, rendered = 0, mismatched = 0, skippedNoData = 0;
  for (const r of rows) {
    const existing = await download(r.lead_id, r.application_id);
    if (existing) {
      const sha = sha256(existing);
      if (!r.pdf_sha256) {
        console.log(`app=${r.application_id}: obiekt jest, sha PUSTE → stempel ${sha.slice(0, 12)}…`);
        if (APPLY) await stampSha(r.lead_id, r.application_id, sha);
        stamped++;
      } else if (r.pdf_sha256 !== sha) {
        console.warn(`app=${r.application_id}: NIEZGODNOŚĆ sha (DB ${r.pdf_sha256.slice(0, 12)}… ≠ bucket ${sha.slice(0, 12)}…) — bez zmian, do ręcznej decyzji`);
        mismatched++;
      } else {
        healthy++;
      }
      continue;
    }
    // Brak obiektu → render + upload + stempel.
    const snap = r.contract_snapshot ?? {};
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
    if (!r.signed_at && !r.signatur) {
      console.warn(`app=${r.application_id}: brak signatur/signed_at — pomijam (nie fabrykujemy podpisu)`);
      skippedNoData++;
      continue;
    }
    const blocks = buildVertragDocument(daten, {
      signaturName: String(signaturName),
      signedAt: r.signed_at ? formatSignedAtBerlin(r.signed_at) : undefined,
      auditNote: 'Vertragsversion v1.1',
    });
    const pdf = await renderVertragPdf(blocks);
    const sha = sha256(pdf);
    const oldSha = r.pdf_sha256 ? ` (stary FAŁSZYWY stempel ${r.pdf_sha256.slice(0, 12)}… → nowy)` : '';
    console.log(`app=${r.application_id}: brak obiektu → render ${pdf.length} B, sha ${sha.slice(0, 12)}…${oldSha}`);
    if (APPLY) {
      await upload(r.lead_id, r.application_id, pdf);
      await stampSha(r.lead_id, r.application_id, sha);
    }
    rendered++;
  }
  console.log(`\n=== wynik: zdrowe=${healthy}, dostemplowane=${stamped}, wyrenderowane=${rendered}, niezgodne=${mismatched}, pominięte=${skippedNoData} (wierszy: ${rows.length}) ===`);
}

main();
