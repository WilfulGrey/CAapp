// Supabase Edge Function: openai-conversions
// Alle 15 Minuten von pg_cron getriggert (Migration
// 20260911123000_openai_capi_oppref_zaehler_quelle.sql). Meldet Anfragen aus
// dem Kostenrechner (lead_created) an die OpenAI Ads Conversions API —
// serverseitig über die Klick-Kennung `oppref`, die OpenAI an jeden
// Anzeigenklick hängt und die der Rechner am Lead speichert.
//
// Warum: Der Browser-Pixel läuft nur mit Marketing-Einwilligung (~6 % der
// Besucher). Ohne diesen Weg sieht OpenAI nie, welche Klicks Anfragen
// werden — kein Reporting, keine Gebotsoptimierung. Gleiche Mechanik wie
// upload-offline-conversions für Google (gclid), gleiche Grenzen: KEINE
// Personendaten, nur Kennung, Zeitpunkt und fester Wert (20 €).
//
// Verhalten:
//   - Ohne OPENAI_ADS_CAPI_KEY in der Env (Staging): 200 {skipped}.
//   - Bereits gemeldete/permanent gescheiterte Leads stehen in
//     openai_conversion_uploads und werden nie erneut versucht;
//     retriable Fehler (Schlüssel, Limit, 5xx, Netz) bleiben unmarkiert.
//   - Dedup OpenAI-seitig über id = lead_id (gleiche id wie event_id im Pixel).
//
// Manuell triggerbar:
//   curl -X POST -H "Authorization: Bearer <service_role_key>" \
//     https://<project>.supabase.co/functions/v1/openai-conversions
//   Body {"dryRun": true} — nur zählen; {"validateOnly": true} — an die API
//   schicken, aber dort nicht speichern (Vertragstest), nichts markieren.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  baueLeadEvent,
  bewerteAntwort,
  capiUrl,
  inBloecke,
  istImFenster,
  MAX_ALTER_TAGE,
  type LeadKandidat,
} from "./capi.ts";

const PIXEL_ID = Deno.env.get("OAIQ_PIXEL_ID") ?? "8xPJTVXAKBvkNquUUUvoXE";
const INTEGRATION_SOURCE = "primundus-caapp";
const EVENT_TYPE = "lead_created";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer || (!timingSafeEqual(bearer, serviceKey) && jwtRole(bearer) !== "service_role")) {
    return json(401, { error: "unauthorized" });
  }

  let dryRun = false;
  let validateOnly = false;
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
    validateOnly = body?.validateOnly === true;
  } catch {
    // leerer Body ist ok (Cron schickt {})
  }

  const apiKey = Deno.env.get("OPENAI_ADS_CAPI_KEY") ?? "";
  if (!apiKey) {
    console.log("openai-conversions: OPENAI_ADS_CAPI_KEY fehlt — skip (Staging?)");
    return json(200, { skipped: "openai capi key not configured" });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const jetzt = Date.now();
  const sinceIso = new Date(jetzt - MAX_ALTER_TAGE * 86_400_000).toISOString();

  // 1) Leads mit Klick-Kennung im Zeitfenster, keine Tests
  const { data: leads, error: leadErr } = await supabase
    .from("leads")
    .select("id, created_at, oppref, ist_test")
    .not("oppref", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (leadErr) return json(500, { error: `leads query: ${leadErr.message}` });

  // 2) Schon verbucht (uploaded ODER permanent_failure) raus
  const { data: done, error: doneErr } = await supabase
    .from("openai_conversion_uploads")
    .select("lead_id")
    .eq("event_type", EVENT_TYPE);
  if (doneErr) return json(500, { error: `uploads query: ${doneErr.message}` });
  const erledigt = new Set((done ?? []).map((d) => d.lead_id));

  const kandidaten: LeadKandidat[] = [];
  let tests = 0;
  for (const l of leads ?? []) {
    if (l.ist_test === true) { tests++; continue; }
    if (erledigt.has(l.id)) continue;
    if (!l.oppref || !istImFenster(l.created_at, jetzt)) continue;
    kandidaten.push({ leadId: l.id, createdAt: l.created_at, oppref: l.oppref });
  }

  if (dryRun || kandidaten.length === 0) {
    return json(200, { dryRun, candidates: kandidaten.length, testsUebersprungen: tests, uploaded: 0 });
  }

  // 3) In Blöcken melden
  let uploaded = 0;
  let permanent = 0;
  let retry = 0;
  const notizen: string[] = [];
  for (const block of inBloecke(kandidaten)) {
    const events = block.map((k) => baueLeadEvent(k));
    let status = 0;
    let text = "";
    try {
      const res = await fetch(capiUrl(PIXEL_ID), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ integration_source: INTEGRATION_SOURCE, validate_only: validateOnly, events }),
        signal: AbortSignal.timeout(15_000),
      });
      status = res.status;
      text = (await res.text()).slice(0, 400);
    } catch (e) {
      status = 0;
      text = e instanceof Error ? e.message : String(e);
    }
    const urteil = bewerteAntwort(status);
    notizen.push(`${status}: ${text}`);
    if (validateOnly) continue; // Vertragstest: nichts markieren

    if (urteil === "retry") { retry += block.length; console.log(`openai-conversions: retry (${status}) ${text}`); continue; }
    const zeilen = block.map((k) => ({
      lead_id: k.leadId,
      event_type: EVENT_TYPE,
      status: urteil,
      note: urteil === "uploaded" ? null : `${status}: ${text}`,
    }));
    const { error: markErr } = await supabase.from("openai_conversion_uploads").upsert(zeilen, { onConflict: "lead_id,event_type" });
    if (markErr) console.log(`openai-conversions: Markierung fehlgeschlagen: ${markErr.message}`);
    if (urteil === "uploaded") uploaded += block.length; else permanent += block.length;
  }

  return json(200, { validateOnly, candidates: kandidaten.length, testsUebersprungen: tests, uploaded, permanentFailures: permanent, retriable: retry, antworten: notizen });
});
