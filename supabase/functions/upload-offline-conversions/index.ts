// Supabase Edge Function: upload-offline-conversions
// Täglich von pg_cron getriggert (Migration
// 20260814121000_setup_upload_offline_conversions_cron.sql). Lädt
// „Qualifizierte Leads" (erstes patient_data_saved je Lead, Lead trägt
// gclid/wbraid/gbraid aus PR #444) als Offline-Conversions in Google Ads
// hoch — Conversion-Aktion „Qualifizierter Lead (Patientendaten)"
// (secondary; beeinflusst Smart Bidding erst, wenn Martin sie primär
// schaltet). Doku: docs/google-ads-tracking.md.
//
// Verhalten:
//   - Ohne Google-Secrets (z. B. Staging): 200 {skipped} — bewusst inert.
//   - Bereits hochgeladene/permanent gescheiterte Leads stehen in
//     offline_conversion_uploads und werden nie erneut versucht;
//     retriable Fehler bleiben unmarkiert → nächster Lauf.
//   - Dedup Google-seitig zusätzlich über orderId = lead_id.
//
// Manuell triggerbar:
//   curl -X POST -H "Authorization: Bearer <service_role_key>" \
//     https://<project>.supabase.co/functions/v1/upload-offline-conversions
//   Optionaler Body {"dryRun": true} — nur zählen, nichts hochladen.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  buildClickConversion,
  classifyFailure,
  extractValue,
  isOldEnough,
  parsePartialFailures,
  pickClickId,
  type QualifiedLeadCandidate,
} from "./conversions.ts";
import {
  fetchAccessToken,
  QUALIFIED_LEAD_ACTION,
  readSecrets,
  uploadClickConversions,
} from "./googleAds.ts";

const LOOKBACK_DAYS = 90; // Klick-Fenster der Conversion-Aktion
const MIN_AGE_HOURS = 6; // Klick muss bei Google verarbeitet sein

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
  try {
    const body = await req.json();
    dryRun = body?.dryRun === true;
  } catch {
    // leerer Body ist ok (Cron schickt {})
  }

  const secrets = readSecrets();
  if (!secrets) {
    console.log("upload-offline-conversions: Google-Secrets fehlen — skip (Staging?)");
    return json(200, { skipped: "google secrets not configured" });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const sinceIso = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  // 1) Erstes patient_data_saved je Lead im Klick-Fenster
  const { data: events, error: evErr } = await supabase
    .from("lead_events")
    .select("lead_id, created_at")
    .eq("event_type", "patient_data_saved")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });
  if (evErr) return json(500, { error: `lead_events query: ${evErr.message}` });

  const firstSaved = new Map<string, string>();
  for (const e of events ?? []) {
    if (!firstSaved.has(e.lead_id)) firstSaved.set(e.lead_id, e.created_at);
  }
  if (firstSaved.size === 0) return json(200, { candidates: 0, uploaded: 0 });

  // 2) Bereits verarbeitete Leads (uploaded ODER permanent_failure) raus
  const { data: done, error: doneErr } = await supabase
    .from("offline_conversion_uploads")
    .select("lead_id");
  if (doneErr) return json(500, { error: `uploads query: ${doneErr.message}` });
  for (const d of done ?? []) firstSaved.delete(d.lead_id);
  if (firstSaved.size === 0) return json(200, { candidates: 0, uploaded: 0 });

  // 3) Klick-IDs + Wert der verbleibenden Leads (chunked .in())
  const ids = [...firstSaved.keys()];
  const leads: Array<Record<string, any>> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: chunk, error: leadErr } = await supabase
      .from("leads")
      .select("id, gclid, wbraid, gbraid, kalkulation")
      .in("id", ids.slice(i, i + 100));
    if (leadErr) return json(500, { error: `leads query: ${leadErr.message}` });
    leads.push(...(chunk ?? []));
  }

  const now = Date.now();
  const candidates: QualifiedLeadCandidate[] = [];
  let noClickId = 0;
  let tooFresh = 0;
  for (const l of leads) {
    const conversionAt = firstSaved.get(l.id)!;
    const cand: QualifiedLeadCandidate = {
      leadId: l.id,
      conversionAt,
      gclid: l.gclid ?? null,
      wbraid: l.wbraid ?? null,
      gbraid: l.gbraid ?? null,
      value: extractValue(l.kalkulation),
    };
    if (!pickClickId(cand)) {
      noClickId++; // Organik/Direkt — kein Upload möglich, zählt nur fürs Log
      continue;
    }
    if (!isOldEnough(conversionAt, now, MIN_AGE_HOURS)) {
      tooFresh++; // nächster Lauf nimmt ihn mit
      continue;
    }
    candidates.push(cand);
  }

  if (dryRun || candidates.length === 0) {
    return json(200, {
      dryRun,
      candidates: candidates.length,
      uploaded: 0,
      withoutClickId: noClickId,
      deferredTooFresh: tooFresh,
    });
  }

  // 4) Upload (eine Batch reicht — Volumen ~Dutzende, Limit 2000)
  const payloads = candidates.map((c) => buildClickConversion(c, QUALIFIED_LEAD_ACTION)!);
  const accessToken = await fetchAccessToken(secrets);
  let resp;
  try {
    resp = await uploadClickConversions(accessToken, secrets, payloads);
  } catch (e) {
    // Request-Level-Fehler: nichts markieren, nächster Lauf versucht erneut.
    console.error("upload-offline-conversions:", e instanceof Error ? e.message : String(e));
    return json(502, { error: "upload failed, will retry next run" });
  }

  const failures = parsePartialFailures(resp.partialFailureError);
  const rows: Array<Record<string, unknown>> = [];
  let uploaded = 0;
  let permanent = 0;
  let retriable = 0;
  candidates.forEach((c, i) => {
    const failure = failures.get(i);
    const click = pickClickId(c)!;
    if (!failure) {
      uploaded++;
      rows.push({
        lead_id: c.leadId,
        conversion_action: QUALIFIED_LEAD_ACTION,
        click_id: click.id,
        click_id_type: click.type,
        conversion_at: c.conversionAt,
        status: "uploaded",
      });
    } else if (classifyFailure(failure.code) === "permanent") {
      permanent++;
      rows.push({
        lead_id: c.leadId,
        conversion_action: QUALIFIED_LEAD_ACTION,
        click_id: click.id,
        click_id_type: click.type,
        conversion_at: c.conversionAt,
        status: "permanent_failure",
        detail: `${failure.code}: ${failure.message}`.slice(0, 500),
      });
    } else {
      retriable++;
      console.warn(`retriable failure lead=${c.leadId}: ${failure.code} ${failure.message}`);
    }
  });

  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("offline_conversion_uploads")
      .upsert(rows, { onConflict: "lead_id" });
    if (insErr) {
      // Upload war erfolgreich, nur das Festschreiben scheiterte — nächster
      // Lauf lädt erneut hoch, Google dedupliziert über orderId. Laut loggen.
      console.error("upload-offline-conversions: Statusschreiben fehlgeschlagen:", insErr.message);
    }
  }

  const summary = {
    candidates: candidates.length,
    uploaded,
    permanentFailures: permanent,
    retriableFailures: retriable,
    withoutClickId: noClickId,
    deferredTooFresh: tooFresh,
  };
  console.log("upload-offline-conversions:", JSON.stringify(summary));
  return json(200, summary);
});
