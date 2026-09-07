import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { berechnePreis, type FormularDaten, type Kalkulation } from '@/lib/calculation';
import { diffAngaben, mamamiaFelder, type Aenderung } from '@/lib/angaben-diff';
import { angabenLabel, FELD_NAMEN } from '@/lib/angaben-labels';

/**
 * Admin-Korrektur der Kundenangaben (Registry #55, Fall Rapp).
 *
 * Body A `{ angaben, neuBerechnen, kundenMail }`:
 *   1. Diff gegen kalkulation.formularDaten (care_start_timing gegen die SPALTE),
 *      Validierung NUR der geänderten Keys (lib/angaben-diff.ts).
 *   2. Optional Neuberechnung (berechnePreis) — der Admin entscheidet.
 *   3. Erster leads-Update (kalkulation, care_start_timing) — Supabase ist die
 *      Kundenwahrheit und darf nicht an einem Mamamia-Timeout hängen.
 *   4. Mamamia-Sync über onboard-to-mamamia { lead_id, resync } (service_role),
 *      diff-driven; jedes non-2xx ⇒ kalkulation.mamamia_sync_pending (nie
 *      verloren, Retry per Body B), 2xx löscht es.
 *   5. Event `offer_updated` über den Bridge-Loopback (/api/lead-event) —
 *      Kundenmail nur bei Neuberechnung + Preisänderung + Häkchen.
 *
 * Body B `{ resync: true }`: nur den ausstehenden Mamamia-Sync wiederholen.
 *
 * Bewusst server-seitig mit dem Service-Key (wie ../test/route.ts) — der
 * Anon-Key im Browser hat hier nichts zu schreiben.
 */

type LeadRow = {
  id: string;
  token: string | null;
  care_start_timing: string | null;
  kalkulation: (Kalkulation & { formularDaten?: Record<string, unknown> }) | null;
  mamamia_customer_id: number | null;
};

type MamamiaStatus = {
  status: 'ok' | 'skipped' | 'error';
  http?: number;
  message: string;
  patients_before?: number;
  patients_after?: number;
  removed_ids?: number[];
  patient_ids?: number[];
};

type Pending = NonNullable<Kalkulation['mamamia_sync_pending']>;

const RESYNC_TIMEOUT_MS = 25_000;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const cookie = request.cookies.get('admin_auth')?.value ?? '';
  const erwartet = process.env.ADMIN_PASSWORD || 'primundus2026';
  if (cookie !== erwartet) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON-Body erwartet' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Serverschlüssel fehlt' }, { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, token, care_start_timing, kalkulation, mamamia_customer_id')
    .eq('id', params.id)
    .maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
  const row = lead as LeadRow;

  // ── Body B: nur den ausstehenden Mamamia-Sync wiederholen ──────────────
  if (body.resync === true) {
    const pending = row.kalkulation?.mamamia_sync_pending;
    if (!row.mamamia_customer_id) {
      // Ewiger Retry-Knopf wäre sinnlos: Key räumen.
      if (pending && row.kalkulation) {
        await supabase.from('leads').update({ kalkulation: ohnePending(row.kalkulation) }).eq('id', row.id);
      }
      return NextResponse.json({ error: 'Lead ist nicht mit Mamamia verknüpft' }, { status: 400 });
    }
    if (!pending || !row.kalkulation) {
      return NextResponse.json({ error: 'nichts ausstehend' }, { status: 400 });
    }
    const { mamamia, kalkulation } = await syncMamamia(supabase, row, row.kalkulation, pending.felder, pending.budget, url, key);
    return NextResponse.json({ ok: mamamia.status === 'ok', kalkulation, mamamia });
  }

  // ── Body A ─────────────────────────────────────────────────────────────
  const angaben = body.angaben;
  if (!angaben || typeof angaben !== 'object' || Array.isArray(angaben)) {
    return NextResponse.json({ error: '`angaben` (Objekt) erwartet' }, { status: 400 });
  }
  const alt = row.kalkulation;
  const fd = alt?.formularDaten;
  if (!alt || !fd) {
    return NextResponse.json({ error: 'Legacy-Lead ohne formularDaten — nicht bearbeitbar' }, { status: 400 });
  }
  const neuBerechnen = body.neuBerechnen === true;
  const kundenMail = body.kundenMail !== false;

  const { changed, fehler } = diffAngaben(fd, row.care_start_timing, angaben as Record<string, unknown>);
  if (fehler.length) {
    return NextResponse.json({ error: 'Unzulässige Werte', fehler }, { status: 400 });
  }
  if (!changed.length && !neuBerechnen) {
    return NextResponse.json({ ok: true, unveraendert: true });
  }

  // Neue formularDaten: alte + nur die geänderten fd-Keys ('' inklusive —
  // Rechner-Konvention; Portal-Extras wie plz/portal_details bleiben).
  const fdNeu: Record<string, unknown> = { ...fd };
  for (const c of changed) if (c.key !== 'care_start_timing') fdNeu[c.key] = c.neu;
  const timing = changed.find((c) => c.key === 'care_start_timing');

  let kalk: Kalkulation;
  if (neuBerechnen) {
    // berechnePreis liefert ein frisches Objekt — Zusatz-Keys der alten
    // kalkulation (angenommene_felder, mamamia_sync_pending) danach setzen.
    const neu = await berechnePreis(fdNeu as unknown as FormularDaten);
    kalk = { ...neu, formularDaten: fdNeu as unknown as FormularDaten };
  } else {
    kalk = { ...alt, formularDaten: fdNeu as unknown as FormularDaten };
  }
  // Admin-Save = „mit dem Kunden geprüft": die Portal-Annahmen gelten nicht
  // mehr — sonst überschreibt die nächste Portal-Mail derselben Adresse die
  // Korrektur (echteAntworten in /api/portal-lead prüft auf leere Liste).
  kalk.angenommene_felder = [];
  const pending = alt.mamamia_sync_pending;
  if (pending) kalk.mamamia_sync_pending = pending;

  const oldB = Number(alt.bruttopreis);
  const newB = Number(kalk.bruttopreis);
  const preisGeaendert = neuBerechnen && Math.round(oldB) !== Math.round(newB);

  // 1. leads-Update VOR Mamamia (25-s-Timeout darf die Kundenwahrheit nicht blockieren)
  const patch: Record<string, unknown> = { kalkulation: kalk, updated_at: new Date().toISOString() };
  if (timing) patch.care_start_timing = timing.neu === '' ? null : timing.neu;
  const { error: updErr } = await supabase.from('leads').update(patch).eq('id', row.id);
  if (updErr) return NextResponse.json({ error: `Speichern fehlgeschlagen: ${updErr.message}` }, { status: 500 });

  // 2. Mamamia — Union mit einem früher gescheiterten Sync (nie verloren)
  const felder = Array.from(new Set([...(pending?.felder ?? []), ...mamamiaFelder(changed)]));
  const budget = neuBerechnen ? newB : pending?.budget;
  const synced = await syncMamamia(supabase, row, kalk, felder, budget, url, key);

  // 3. Event (+ Kundenmail nur bei Neuberechnung mit Preisänderung + Häkchen)
  const changedLabeled = changed.map((c) => ({
    name: FELD_NAMEN[c.key] ?? c.key,
    alt: angabenLabel(c.key, c.alt),
    neu: angabenLabel(c.key, c.neu),
  }));
  const mail = await postOfferUpdated(supabase, row, {
    notify: neuBerechnen && preisGeaendert && kundenMail,
    metadata: {
      source: 'admin',
      old_bruttopreis: oldB,
      new_bruttopreis: newB,
      new_eigenanteil: kalk.eigenanteil ?? null,
      changed: changedLabeled,
      neu_berechnet: neuBerechnen,
      mamamia: {
        status: synced.mamamia.status,
        message: synced.mamamia.message,
        patients_before: synced.mamamia.patients_before ?? null,
        patients_after: synced.mamamia.patients_after ?? null,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    kalkulation: synced.kalkulation,
    changed: changedLabeled,
    mail,
    mamamia: synced.mamamia,
  });
}

function ohnePending(k: Kalkulation): Kalkulation {
  const { mamamia_sync_pending: _drop, ...rest } = k;
  return rest as Kalkulation;
}

async function syncMamamia(
  supabase: SupabaseClient,
  row: LeadRow,
  kalk: Kalkulation,
  felder: string[],
  budget: number | undefined,
  supabaseUrl: string,
  serviceKey: string,
): Promise<{ mamamia: MamamiaStatus; kalkulation: Kalkulation }> {
  if (!row.mamamia_customer_id) {
    return { mamamia: { status: 'skipped', message: 'Lead ist nicht mit Mamamia verknüpft' }, kalkulation: kalk };
  }
  if (!felder.length && budget === undefined) {
    return { mamamia: { status: 'skipped', message: 'Keine Mamamia-relevanten Änderungen' }, kalkulation: kalk };
  }

  let mamamia: MamamiaStatus;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/onboard-to-mamamia`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ lead_id: row.id, resync: { felder, ...(budget !== undefined ? { budget } : {}) } }),
      signal: AbortSignal.timeout(RESYNC_TIMEOUT_MS),
    });
    let payload: Record<string, unknown> = {};
    try { payload = await res.json(); } catch { /* kein JSON */ }
    if (res.ok) {
      const r = (payload.resync ?? {}) as Record<string, unknown>;
      const before = Number(r.patients_before);
      const after = Number(r.patients_after);
      mamamia = {
        status: 'ok',
        http: res.status,
        message: Number.isFinite(before) && Number.isFinite(after)
          ? `${before} → ${after} Patient${after === 1 ? '' : 'en'}${budget !== undefined ? `, Budget ${budget} €` : ''}`
          : 'synchronisiert',
        patients_before: before,
        patients_after: after,
        removed_ids: Array.isArray(r.removed_ids) ? (r.removed_ids as number[]) : [],
      };
    } else {
      mamamia = {
        status: 'error',
        http: res.status,
        message: `Mamamia-Sync fehlgeschlagen (HTTP ${res.status}): ${String(payload.error ?? res.statusText)}`,
        ...(Array.isArray(payload.patient_ids) ? { patient_ids: payload.patient_ids as number[] } : {}),
      };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    mamamia = {
      status: 'error',
      message: /abort|timeout/i.test(msg) ? `Mamamia-Sync: Zeitüberschreitung (${RESYNC_TIMEOUT_MS / 1000} s)` : `Mamamia-Sync: Netzfehler — ${msg}`,
    };
  }

  // 2. leads-Update: pending setzen (jedes non-2xx — letzte nicht angekommene
  // Absicht, nie verloren) oder räumen (nur 2xx).
  let kalkulation: Kalkulation;
  if (mamamia.status === 'ok') {
    kalkulation = ohnePending(kalk);
  } else {
    const pending: Pending = {
      felder,
      ...(budget !== undefined ? { budget } : {}),
      error: mamamia.message,
      ...(mamamia.http !== undefined ? { http: mamamia.http } : {}),
      at: new Date().toISOString(),
    };
    kalkulation = { ...kalk, mamamia_sync_pending: pending };
  }
  const { error } = await supabase.from('leads').update({ kalkulation }).eq('id', row.id);
  if (error) {
    console.error(`[admin-angaben] lead=${row.id} kalkulation nach Mamamia-Sync nicht gespeichert: ${error.message}`);
    mamamia = { ...mamamia, message: `${mamamia.message} (Status nicht gespeichert: ${error.message})` };
  }
  console.log(`[admin-angaben] lead=${row.id} mamamia=${mamamia.status} felder=${felder.join(',') || '-'} budget=${budget ?? '-'} ${mamamia.message}`);
  return { mamamia, kalkulation };
}

async function postOfferUpdated(
  supabase: SupabaseClient,
  row: LeadRow,
  args: { notify: boolean; metadata: Record<string, unknown> },
): Promise<'angestossen' | 'skipped' | 'error'> {
  // Ohne Token kann die Bridge den Lead nicht laden ⇒ Event direkt schreiben.
  if (!row.token) {
    await supabase.from('lead_events').insert({ lead_id: row.id, event_type: 'offer_updated', metadata: args.metadata });
    return 'skipped';
  }
  // Loopback auf den eigenen Server (Muster portal-abholen): Route und
  // /api/lead-event leben im selben Prozess.
  const basis = process.env.PORTAL_LEAD_URL || `http://127.0.0.1:${process.env.PORT || '3000'}`;
  try {
    const res = await fetch(`${basis}/api/lead-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: row.token, event: 'offer_updated', notify: args.notify, metadata: args.metadata }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[admin-angaben] lead=${row.id} lead-event offer_updated HTTP ${res.status}`);
      return 'error';
    }
    // lead-event antwortet 200 VOR dem Versand (fire-and-forget) ⇒ „angestoßen".
    return args.notify ? 'angestossen' : 'skipped';
  } catch (e) {
    console.error(`[admin-angaben] lead=${row.id} lead-event offer_updated: ${e instanceof Error ? e.message : String(e)}`);
    return 'error';
  }
}
