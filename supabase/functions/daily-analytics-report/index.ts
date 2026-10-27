// Supabase Edge Function: daily-analytics-report
// Wird täglich von pg_cron getriggert (siehe Migration
// 20260520070000_setup_daily_analytics_report_cron.sql). Holt die
// Tageskennzahlen für „gestern" + „vorgestern" aus
// analytics_sessions / analytics_events / leads / lead_events, baut eine
// HTML-Mail im Primundus-Look und schickt sie an die in der Env-Var
// DAILY_REPORT_RECIPIENTS hinterlegten Adressen (Komma-getrennt).
//
// Manuell triggerbar:
//   curl -X POST \
//     -H "Authorization: Bearer <service_role_key>" \
//     https://<project>.supabase.co/functions/v1/daily-analytics-report
//
// Optionaler Body { "daysAgo": 2 } um einen älteren Tag zu reporten.
//
// Nur Kosten je Kampagne nachtragen (Registry #142), ohne Bericht und ohne Mail:
//   Body { "nurKampagnenKosten": { "von": "2026-09-01", "bis": "2026-10-27" } }
//   (+ "dryRun": true ⇒ nur zählen, nichts schreiben). Nur mit service_role-Bearer.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.10";
import { Buffer } from "node:buffer";
import {
  berlinDayRange,
  fetchAgentNotes,
  fetchBookedCustomers,
  fetchDailyStats,
  fetchLeadCohorts,
  fetchBesucherKohorten,
  fetchAdsSpend,
  fetchAdsKostenKampagne,
  KAMPAGNEN_FENSTER_TAGE,
  pruefeNachtrag,
  fetchPeriodStats,
  fetchTotalLeads, fetchMailHealth, fetchBuchungHealth, fetchUploadHealth } from "./queries.ts";
import { buildReportEmail } from "./template.ts";
import { isServiceRoleBearer } from "../_shared/serviceRoleAuth.ts";

// Vergleichs-Periode für den Daily Report. 7 Tage liefert einen stabilen
// Schnitt, der Wochenend-Effekt rausgemittelt + die Top-Tag-Spalte zeigt
// das aktuelle Plateau. Falls eines Tages eine andere Periode getestet
// werden soll, ist das die zentrale Stelle.
const PERIOD_DAYS_BACK = 7;

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
  siteUrl: string;
}

async function getSmtpConfig(supabase: any): Promise<SmtpConfig> {
  const { data, error } = await supabase.rpc("get_smtp_config");
  if (error) throw new Error(`get_smtp_config: ${error.message}`);
  return {
    host: data?.host || "smtp.ionos.de",
    port: parseInt(data?.port || "587"),
    user: data?.user || "",
    pass: data?.pass || "",
    from: data?.from || "",
    fromName: data?.fromName || "Primundus Analytics",
    siteUrl: data?.siteUrl || "https://kostenrechner.primundus.de",
  };
}

async function sendEmailSmtp(
  smtp: SmtpConfig,
  to: string[],
  subject: string,
  html: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: false,
      auth: { user: smtp.user, pass: smtp.pass },
    });

    const mailOptions: any = {
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: to.join(", "),
      subject,
      text,
      html,
    };

    await new Promise<void>((resolve, reject) => {
      transport.sendMail(mailOptions, (err: any) => {
        if (err) return reject(err);
        resolve();
      });
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseRecipients(raw: string | undefined): string[] {
  const fallback = ["martin@mamamia.app", "info@primundus.de"];
  if (!raw) return fallback;
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

Deno.serve(async (req: Request) => {
  // Optionaler daysAgo-Param im Body, sonst Default 1 (= gestern).
  let daysAgo = 1;
  // dryRun: baut die Mail, sendet aber NICHT — für Vorschau/Verifikation
  // nach Deploys, ohne die Empfänger mit Test-Mails zu fluten.
  let dryRun = false;
  // nurKampagnenKosten: { von, bis } — nur Google-Kosten je Kampagne nachtragen.
  let nachtrag: { von?: unknown; bis?: unknown } | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.nurKampagnenKosten && typeof body.nurKampagnenKosten === "object") nachtrag = body.nurKampagnenKosten;
      if (typeof body?.daysAgo === "number" && body.daysAgo > 0) {
        daysAgo = Math.floor(body.daysAgo);
      }
      if (body?.dryRun === true) dryRun = true;
    }
  } catch {
    // Body parse fail ignorieren — daysAgo bleibt 1.
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  /* Nachtragen der Kosten je Kampagne: eine GAQL-Abfrage über den Zeitraum, ein Upsert.
     Kein Bericht, keine Mail, kein ads_kosten_tag. Nur server-zu-server (service_role). */
  if (nachtrag) {
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (!isServiceRoleBearer(req.headers.get("authorization"), serviceKey)) return json(401, { error: "unauthorized" });
    const zeitraum = pruefeNachtrag(nachtrag.von, nachtrag.bis, berlinDayRange(0).iso);
    if (!zeitraum.ok) return json(400, { error: zeitraum.fehler });
    const zeilen = await fetchAdsKostenKampagne(supabase, zeitraum.von, zeitraum.bis, 60_000);
    if (!zeilen) return json(502, { error: "Google-Kosten je Kampagne nicht abrufbar (Log: fetchAdsKostenKampagne)" });
    const zusammenfassung = {
      von: zeitraum.von, bis: zeitraum.bis, zeilen: zeilen.length,
      tage: new Set(zeilen.map((z) => z.tag)).size,
      summe: Math.round(zeilen.reduce((s, z) => s + z.kosten_netto, 0) * 100) / 100,
    };
    if (dryRun) return json(200, { ok: true, dryRun: true, ...zusammenfassung });
    if (zeilen.length > 0) {
      const jetzt = new Date().toISOString();
      const { error } = await supabase
        .from("ads_kosten_kampagne_tag")
        .upsert(zeilen.map((z) => ({ ...z, aktualisiert_at: jetzt })), { onConflict: "tag,kampagne_id" });
      if (error) return json(500, { error: `ads_kosten_kampagne_tag: ${error.message}` });
    }
    return json(200, { ok: true, ...zusammenfassung });
  }

  try {
    const yesterday = berlinDayRange(daysAgo);

    const CHART_DAYS_BACK = 14;
    const [yesterdayStats, periodStats, prevPeriodStats, totalLeads, booked, mailHealth, agentNotes, adsSpend, leadKohorten, besucherKohorten, buchungHealth, uploadHealth, kampagnenKosten] = await Promise.all([
      fetchDailyStats(supabase, yesterday.start, yesterday.end),
      fetchPeriodStats(supabase, PERIOD_DAYS_BACK),
      // Die 7 Tage VOR der Vergleichsperiode — Basis für den Trend-Pfeil.
      fetchPeriodStats(supabase, PERIOD_DAYS_BACK, PERIOD_DAYS_BACK),
      fetchTotalLeads(supabase),
      fetchBookedCustomers(supabase),
      fetchMailHealth(supabase),
      fetchAgentNotes(supabase, yesterday.start),
      // Ads-Kosten (fail-soft: null → Block entfällt, Mail geht trotzdem raus)
      fetchAdsSpend(supabase, PERIOD_DAYS_BACK, daysAgo),
      /* Kohorten fürs gestapelte Balkendiagramm. Fail-soft: der Report darf
         nicht ausfallen, weil ein Diagramm keine Daten bekommt. */
      fetchLeadCohorts(supabase, CHART_DAYS_BACK).catch((e) => {
        console.error("Lead-Kohorten nicht lesbar:", e instanceof Error ? e.message : String(e));
        return [];
      }),
      /* Besucher je Tag inkl. Ads-Anteil — gleiche Fail-soft-Regel. */
      fetchBesucherKohorten(supabase, CHART_DAYS_BACK).catch((e) => {
        console.error("Besucher-Kohorten nicht lesbar:", e instanceof Error ? e.message : String(e));
        return [];
      }),
      /* Buchungs-Check (Registry #82). `.catch` ist Pflicht: eine werfende
         Sektion darf den ganzen Morgenreport nicht kippen — pg_cron meldet
         trotzdem "succeeded" und niemand merkt es (Registry #36). */
      fetchBuchungHealth(supabase).catch((e) => ({
        offen: 0,
        rows: [],
        error: e instanceof Error ? e.message : String(e),
      })),
      /* Google-Upload-Check (Registry #129). Fängt Fehler selbst ab und
         meldet sie sichtbar; `.catch` nur als zweites Netz wie oben. */
      fetchUploadHealth(supabase).catch((e) => ({
        wartendeProfile: 0,
        wartendeBuchungen: 0,
        aeltesteStunden: 0,
        letzterUpload: null,
        error: e instanceof Error ? e.message : String(e),
      })),
      /* Kosten je Kampagne für die Admin-Seite „Trichter“ (Registry #142): gestern und die
         zwei Tage davor (fehlt ein Lauf, holt der nächste nach; Google korrigiert spät).
         Fängt Fehler selbst ab (null, mit Timeout); `.catch` nur als zweites Netz. */
      fetchAdsKostenKampagne(supabase, berlinDayRange(daysAgo + KAMPAGNEN_FENSTER_TAGE - 1).iso, yesterday.iso)
        .catch(() => null),
    ]);

    const smtp = await getSmtpConfig(supabase);
    const recipients = parseRecipients(Deno.env.get("DAILY_REPORT_RECIPIENTS"));

    const { subject, html, text } = buildReportEmail({
      leadKohorten,
      besucherKohorten,
      yesterday: yesterdayStats,
      period: periodStats,
      yesterdayLabel: yesterday.label,
      periodLabel: `letzte ${PERIOD_DAYS_BACK} Tage`,
      totalLeads,
      bookedCustomers: booked.uniqueCustomers,
      totalBookings: booked.totalBookings,
      siteUrl: smtp.siteUrl,
      mailHealth,
      buchungHealth,
      uploadHealth,
      prevPeriod: prevPeriodStats,
      agentNotes,
      adsSpend,
    });

    /* Werbeausgaben des Vortags mitschreiben (Martin, 06.09.2026): der Bericht
       holt die Zahl ohnehin bei Google. Gespeichert steht sie jeder Auswertung
       mit freiem Zeitraum sofort zur Verfuegung, ohne erneuten API-Umweg.
       Fehlschlaege bleiben still — ein Bericht darf daran nicht scheitern. */
    if (adsSpend && Number.isFinite(adsSpend.yesterday)) {
      const { error } = await supabase
        .from("ads_kosten_tag")
        .upsert({ tag: yesterday.iso, kosten_netto: adsSpend.yesterday, aktualisiert_at: new Date().toISOString() }, { onConflict: "tag" });
      if (error) console.log("ads_kosten_tag konnte nicht geschrieben werden:", error.message);
    }
    /* Dazu je Kampagne (Registry #142) — gleiche Regel: auch im dryRun, Fehler nur ins Log. */
    if (kampagnenKosten && kampagnenKosten.length > 0) {
      try {
        const jetzt = new Date().toISOString();
        const { error } = await supabase
          .from("ads_kosten_kampagne_tag")
          .upsert(kampagnenKosten.map((z) => ({ ...z, aktualisiert_at: jetzt })), { onConflict: "tag,kampagne_id" });
        if (error) console.log("ads_kosten_kampagne_tag konnte nicht geschrieben werden:", error.message);
      } catch (e) {
        console.log("ads_kosten_kampagne_tag konnte nicht geschrieben werden:", e instanceof Error ? e.message : String(e));
      }
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ ok: true, dryRun: true, date: yesterday.iso, subject, html }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const result = await sendEmailSmtp(smtp, recipients, subject, html, text);
    if (!result.success) {
      console.error("daily-analytics-report mail send failed:", result.error);
      return new Response(JSON.stringify({ ok: false, error: result.error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: yesterday.iso,
        recipients,
        stats: yesterdayStats,
        totalLeads,
        bookedCustomers: booked.uniqueCustomers,
        totalBookings: booked.totalBookings,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("daily-analytics-report error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
