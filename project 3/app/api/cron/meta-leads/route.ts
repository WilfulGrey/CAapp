/* ─── Facebook-/Instagram-Leads abholen (Meta-Sofortformular „Anfrage") ───
 *
 * Getaktet von pg_cron jede Minute (Martin 27.11.: Bestätigung sofort) — Datei
 * supabase/nach-freigabe/20261125120100_setup_meta_leads_cron.sql, wird erst
 * nach Freigabe eingespielt. Auth wie /api/portal-abholen: Bearer =
 * SUPABASE_SERVICE_ROLE_KEY (Vault-Secret `supabase_service_role_key`), kein
 * eigenes Geheimnis.
 *
 * Antworten:
 *   200  Zusammenfassung ({configured:false} ohne META_PAGE_ID/META_PAGE_TOKEN)
 *   401  falscher Bearer
 *   502  Meta hat abgelehnt oder ist nicht erreichbar (Meldung ohne Tokens)
 *   500  anderer Fehler (z. B. Datenbank)
 *   503  SUPABASE_SERVICE_ROLE_KEY fehlt
 * Logik und Umgebung: lib/meta-leads.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { MetaFehler, syncMetaLeads } from '@/lib/meta-leads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Nur ein Lauf zugleich: ein hängender Meta-Aufruf soll keine Läufe stapeln
   (sonst zwei Läufe, die dieselben Leads gleichzeitig einfügen wollen —
   ignore-duplicates hielte die Mails einmalig, aber nicht die Last). */
let laeuft = false;

export async function POST(request: NextRequest) {
  const erwarteterKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!erwarteterKey) {
    // Nicht konfiguriert ⇒ Feature aus. Lieber tot als offen.
    return NextResponse.json({ error: 'nicht konfiguriert' }, { status: 503 });
  }
  const geliefert = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(geliefert);
  const b = Buffer.from(erwarteterKey);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'nicht berechtigt' }, { status: 401 });
  }

  if (laeuft) return NextResponse.json({ uebersprungen: 'voriger Lauf arbeitet noch' });
  laeuft = true;
  try {
    const ergebnis = await syncMetaLeads();
    if (ergebnis.configured && ergebnis.inserted) console.log('[meta-leads]', JSON.stringify(ergebnis));
    return NextResponse.json(ergebnis);
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    if (e instanceof MetaFehler) {
      console.error('[meta-leads] Abruf fehlgeschlagen:', meldung);
      return NextResponse.json({ error: meldung }, { status: 502 });
    }
    console.error('[meta-leads] Lauf fehlgeschlagen:', meldung);
    return NextResponse.json({ error: 'Lauf fehlgeschlagen' }, { status: 500 });
  } finally {
    laeuft = false;
  }
}
