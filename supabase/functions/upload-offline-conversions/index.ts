// Supabase Edge Function: upload-offline-conversions
// Täglich von pg_cron getriggert (Migration
// 20260814121000_setup_upload_offline_conversions_cron.sql). Lädt ZWEI
// Offline-Conversion-Arten in Google Ads hoch (beide secondary; beeinflussen
// Smart Bidding erst, wenn Martin sie primär schaltet):
//   1. „Qualifizierter Lead" — erstes patient_data_saved je Lead
//      (Aktion 7720728390, Status: offline_conversion_uploads)
//   2. „Kunde gebucht" — ERSTE lead_application_acceptances-Zeile je Lead,
//      fixer Wert 250 € (Aktion 7728914324, Status:
//      offline_booking_uploads; seit 21.08.2026 — Ziel: wertbasiertes
//      Bidding auf Bucher statt Profil-Ausfüller)
// Lead trägt gclid/wbraid/gbraid aus PR #444. Doku: docs/google-ads-tracking.md.
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
  buildDmEvent,
  isOldEnough,
  pickClickId,
  type QualifiedLeadCandidate,
} from "./conversions.ts";
import {
  BOOKING_ACTION_ID,
  BOOKING_DESTINATION,
  DESTINATION_REFERENCE,
  fetchAccessToken,
  ingestEvents,
  QUALIFIED_LEAD_ACTION_ID,
  readSecrets,
} from "./googleAds.ts";

const LOOKBACK_DAYS = 90; // Klick-Fenster der Conversion-Aktionen
const MIN_AGE_HOURS = 6; // Klick muss bei Google verarbeitet sein
// Conversion-Werte sind FESTE Stufenwerte, keine Preise (Martins Staffelung,
// 22.08. + 03.09.): Patientenprofil 90 €, Buchung 250 €. Bis zum 03.09. ging
// beim Profil der volle Monats-Bruttopreis mit (~2.800 €/Profil, 74.000 € auf
// 26 Uploads) — heute folgenlos, weil "Maximize Conversions" den Wert nicht
// liest, aber ein grober Fehler, sobald jemand auf wertbasierte Gebote
// umstellt. Beide Werte per Env überschreibbar, damit eine Anpassung kein
// Deploy braucht.
const QUALIFIED_LEAD_VALUE_EUR = Number(Deno.env.get("GOOGLE_ADS_QUALIFIED_LEAD_VALUE_EUR") ?? "90");
const BOOKING_VALUE_EUR = Number(Deno.env.get("GOOGLE_ADS_BOOKING_VALUE_EUR") ?? "250");

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

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const secrets = await readSecrets(supabase);
  if (!secrets) {
    console.log("upload-offline-conversions: Google-Secrets fehlen (Env+Vault) — skip (Staging?)");
    return json(200, { skipped: "google secrets not configured" });
  }
  if (!secrets.dmRefreshToken) {
    console.log("upload-offline-conversions: Data-Manager-Token fehlt (Vault google_oauth_refresh_token_dm) — skip");
    return json(200, { skipped: "datamanager token not configured" });
  }
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

  // 2) Bereits verarbeitete Leads (uploaded ODER permanent_failure) raus.
  // KEIN Frühausstieg bei leer — die Buchungs-Phase (3b) läuft unabhängig.
  const { data: done, error: doneErr } = await supabase
    .from("offline_conversion_uploads")
    .select("lead_id");
  if (doneErr) return json(500, { error: `uploads query: ${doneErr.message}` });
  for (const d of done ?? []) firstSaved.delete(d.lead_id);

  // 3) Klick-IDs + Wert der verbleibenden Leads (chunked .in())
  const ids = [...firstSaved.keys()];
  const leads: Array<Record<string, any>> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data: chunk, error: leadErr } = await supabase
      .from("leads")
      .select("id, gclid, wbraid, gbraid")
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
      value: QUALIFIED_LEAD_VALUE_EUR,
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

  // 3b) BUCHUNGEN: erste Zeile in lead_application_acceptances je Lead =
  // „Kunde gebucht" (Neukunden-Signal; Folge-Einsätze desselben Leads sind
  // keine neuen Werbe-Conversions). Eigene Statustabelle offline_booking_uploads.
  const { data: accRows, error: accErr } = await supabase
    .from("lead_application_acceptances")
    .select("lead_id, accepted_at")
    .gte("accepted_at", sinceIso)
    .order("accepted_at", { ascending: true });
  if (accErr) return json(500, { error: `acceptances query: ${accErr.message}` });
  const firstBooked = new Map<string, string>();
  for (const a of accRows ?? []) {
    if (!firstBooked.has(a.lead_id)) firstBooked.set(a.lead_id, a.accepted_at);
  }
  const { data: bookingDone, error: bookingDoneErr } = await supabase
    .from("offline_booking_uploads")
    .select("lead_id");
  if (bookingDoneErr) return json(500, { error: `booking uploads query: ${bookingDoneErr.message}` });
  for (const d of bookingDone ?? []) firstBooked.delete(d.lead_id);

  const bookingIds = [...firstBooked.keys()];
  const bookingLeads: Array<Record<string, any>> = [];
  for (let i = 0; i < bookingIds.length; i += 100) {
    const { data: chunk, error: leadErr } = await supabase
      .from("leads")
      .select("id, gclid, wbraid, gbraid")
      .in("id", bookingIds.slice(i, i + 100));
    if (leadErr) return json(500, { error: `booking leads query: ${leadErr.message}` });
    bookingLeads.push(...(chunk ?? []));
  }
  const bookingCandidates: QualifiedLeadCandidate[] = [];
  let bookingNoClickId = 0;
  let bookingTooFresh = 0;
  for (const l of bookingLeads) {
    const cand: QualifiedLeadCandidate = {
      leadId: l.id,
      conversionAt: firstBooked.get(l.id)!,
      gclid: l.gclid ?? null,
      wbraid: l.wbraid ?? null,
      gbraid: l.gbraid ?? null,
      value: BOOKING_VALUE_EUR,
    };
    if (!pickClickId(cand)) {
      bookingNoClickId++; // Lead ohne Klick-ID (Organik oder vor gclid-Erfassung 14.08.)
      continue;
    }
    if (!isOldEnough(cand.conversionAt, now, MIN_AGE_HOURS)) {
      bookingTooFresh++; // nächster Lauf nimmt ihn mit
      continue;
    }
    bookingCandidates.push(cand);
  }

  if (dryRun || (candidates.length === 0 && bookingCandidates.length === 0)) {
    return json(200, {
      dryRun,
      candidates: candidates.length,
      uploaded: 0,
      withoutClickId: noClickId,
      deferredTooFresh: tooFresh,
      bookingCandidates: bookingCandidates.length,
      bookingUploaded: 0,
      bookingWithoutClickId: bookingNoClickId,
      bookingDeferredTooFresh: bookingTooFresh,
    });
  }

  // 4) Upload via Data Manager API (events:ingest, seit 19.08. — der alte
  // uploadClickConversions ist für neue Integrationen gesperrt). Fast-fail:
  // erst der ganze Batch; wirft ein Datenproblem HTTP 400, isolieren wir
  // per Einzel-Ingest, damit EIN kaputter Datensatz nicht alle blockiert.
  const conversionAction = `customers/9240286999/conversionActions/${QUALIFIED_LEAD_ACTION_ID}`;
  const dmEvents = candidates.map((c) => buildDmEvent(c, DESTINATION_REFERENCE)!);
  const accessToken = await fetchAccessToken(secrets);

  const rows: Array<Record<string, unknown>> = [];
  let uploaded = 0;
  let permanent = 0;
  let retriable = 0;

  const markUploaded = (c: QualifiedLeadCandidate, requestId?: string) => {
    uploaded++;
    const click = pickClickId(c)!;
    rows.push({
      lead_id: c.leadId,
      conversion_action: conversionAction,
      click_id: click.id,
      click_id_type: click.type,
      conversion_at: c.conversionAt,
      status: "uploaded",
      detail: requestId ? `dm requestId ${requestId}` : null,
    });
  };
  const markPermanent = (c: QualifiedLeadCandidate, detail: string) => {
    permanent++;
    const click = pickClickId(c)!;
    rows.push({
      lead_id: c.leadId,
      conversion_action: conversionAction,
      click_id: click.id,
      click_id_type: click.type,
      conversion_at: c.conversionAt,
      status: "permanent_failure",
      detail: detail.slice(0, 500),
    });
  };

  if (candidates.length > 0) {
    let batch;
    try {
      batch = await ingestEvents(accessToken, dmEvents);
    } catch (e) {
      console.error("upload-offline-conversions ingest:", e instanceof Error ? e.message : String(e));
      return json(502, { error: "ingest failed, will retry next run" });
    }

    if (batch.ok) {
      candidates.forEach((c) => markUploaded(c, batch.requestId));
    } else if (batch.status === 400) {
      // Datenproblem im Batch → Einzel-Isolierung (Volumen ist klein).
      console.warn("Batch-Ingest 400 — isoliere per Einzel-Event:", batch.body.slice(0, 300));
      for (let i = 0; i < candidates.length; i++) {
        try {
          const single = await ingestEvents(accessToken, [dmEvents[i]]);
          if (single.ok) markUploaded(candidates[i], single.requestId);
          else if (single.status === 400) markPermanent(candidates[i], `HTTP 400: ${single.body}`);
          else {
            retriable++;
            console.warn(`retriable lead=${candidates[i].leadId}: HTTP ${single.status}`);
          }
        } catch (e) {
          retriable++;
          console.warn(`retriable lead=${candidates[i].leadId}:`, e instanceof Error ? e.message : String(e));
        }
      }
    } else {
      // Auth/Quota/5xx — kompletter Lauf retriable, nichts markieren.
      console.error(`Batch-Ingest HTTP ${batch.status}: ${batch.body.slice(0, 300)}`);
      return json(502, { error: `ingest HTTP ${batch.status}, will retry next run` });
    }
  }

  // 5) Buchungs-Upload — eigene Destination, eigene Statustabelle. Transiente
  // Fehler geben hier KEIN 502 zurück (der Qualified-Status oben muss noch
  // persistiert werden); unmarkierte Buchungen nimmt der nächste Lauf mit.
  const bookingConversionAction = `customers/9240286999/conversionActions/${BOOKING_ACTION_ID}`;
  const bookingRows: Array<Record<string, unknown>> = [];
  let bookingUploaded = 0;
  let bookingPermanent = 0;
  let bookingRetriable = 0;
  if (bookingCandidates.length > 0) {
    const bookingEvents = bookingCandidates.map((c) =>
      buildDmEvent(c, BOOKING_DESTINATION.reference, `booking-${c.leadId}`)!
    );
    const markBooking = (
      c: QualifiedLeadCandidate,
      status: "uploaded" | "permanent_failure",
      detail: string | null,
    ) => {
      const click = pickClickId(c)!;
      bookingRows.push({
        lead_id: c.leadId,
        conversion_action: bookingConversionAction,
        click_id: click.id,
        click_id_type: click.type,
        conversion_at: c.conversionAt,
        status,
        detail,
      });
      if (status === "uploaded") bookingUploaded++;
      else bookingPermanent++;
    };
    try {
      const bBatch = await ingestEvents(accessToken, bookingEvents, false, BOOKING_DESTINATION);
      if (bBatch.ok) {
        bookingCandidates.forEach((c) =>
          markBooking(c, "uploaded", bBatch.requestId ? `dm requestId ${bBatch.requestId}` : null)
        );
      } else if (bBatch.status === 400) {
        console.warn("Buchungs-Batch 400 — isoliere per Einzel-Event:", bBatch.body.slice(0, 300));
        for (let i = 0; i < bookingCandidates.length; i++) {
          try {
            const single = await ingestEvents(accessToken, [bookingEvents[i]], false, BOOKING_DESTINATION);
            if (single.ok) {
              markBooking(bookingCandidates[i], "uploaded", single.requestId ? `dm requestId ${single.requestId}` : null);
            } else if (single.status === 400) {
              markBooking(bookingCandidates[i], "permanent_failure", `HTTP 400: ${single.body}`.slice(0, 500));
            } else {
              bookingRetriable++;
              console.warn(`booking retriable lead=${bookingCandidates[i].leadId}: HTTP ${single.status}`);
            }
          } catch (e) {
            bookingRetriable++;
            console.warn(`booking retriable lead=${bookingCandidates[i].leadId}:`, e instanceof Error ? e.message : String(e));
          }
        }
      } else {
        bookingRetriable += bookingCandidates.length;
        console.error(`Buchungs-Ingest HTTP ${bBatch.status}: ${bBatch.body.slice(0, 300)}`);
      }
    } catch (e) {
      bookingRetriable += bookingCandidates.length;
      console.error("Buchungs-Ingest:", e instanceof Error ? e.message : String(e));
    }
  }

  let persisted = 0;
  let persistError: string | null = null;
  if (rows.length > 0) {
    const { error: insErr } = await supabase
      .from("offline_conversion_uploads")
      .upsert(rows, { onConflict: "lead_id" });
    if (insErr) {
      // Upload war ggf. erfolgreich, nur das Festschreiben scheiterte —
      // nächster Lauf lädt erneut, Google dedupliziert über transactionId.
      // LAUT machen (steht auch im Response-Summary, nicht nur im Log).
      persistError = insErr.message;
      console.error("upload-offline-conversions: Statusschreiben fehlgeschlagen:", insErr.message);
    } else {
      persisted = rows.length;
    }
  }

  let bookingPersisted = 0;
  let bookingPersistError: string | null = null;
  if (bookingRows.length > 0) {
    const { error: insErr } = await supabase
      .from("offline_booking_uploads")
      .upsert(bookingRows, { onConflict: "lead_id" });
    if (insErr) {
      bookingPersistError = insErr.message;
      console.error("upload-offline-conversions: Buchungs-Statusschreiben fehlgeschlagen:", insErr.message);
    } else {
      bookingPersisted = bookingRows.length;
    }
  }

  const summary = {
    persisted,
    persistError,
    candidates: candidates.length,
    uploaded,
    permanentFailures: permanent,
    retriableFailures: retriable,
    withoutClickId: noClickId,
    deferredTooFresh: tooFresh,
    bookings: {
      candidates: bookingCandidates.length,
      uploaded: bookingUploaded,
      permanentFailures: bookingPermanent,
      retriableFailures: bookingRetriable,
      withoutClickId: bookingNoClickId,
      deferredTooFresh: bookingTooFresh,
      persisted: bookingPersisted,
      persistError: bookingPersistError,
    },
  };
  console.log("upload-offline-conversions:", JSON.stringify(summary));
  return json(200, summary);
});
