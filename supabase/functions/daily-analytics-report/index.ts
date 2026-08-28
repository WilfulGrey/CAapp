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

import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.10";
import { Buffer } from "node:buffer";
import {
  berlinDayRange,
  fetchAgentNotes,
  fetchBookedCustomers,
  fetchDailyStats,
  fetchLeadCohorts,
  fetchAdsSpend,
  fetchPeriodStats,
  fetchTotalLeads, fetchMailHealth } from "./queries.ts";
import { buildReportEmail } from "./template.ts";

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
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
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

  try {
    const yesterday = berlinDayRange(daysAgo);

    const CHART_DAYS_BACK = 14;
    const [yesterdayStats, periodStats, prevPeriodStats, totalLeads, booked, mailHealth, agentNotes, adsSpend, leadKohorten] = await Promise.all([
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
    ]);

    const smtp = await getSmtpConfig(supabase);
    const recipients = parseRecipients(Deno.env.get("DAILY_REPORT_RECIPIENTS"));

    const { subject, html, text } = buildReportEmail({
      leadKohorten,
      yesterday: yesterdayStats,
      period: periodStats,
      yesterdayLabel: yesterday.label,
      periodLabel: `letzte ${PERIOD_DAYS_BACK} Tage`,
      totalLeads,
      bookedCustomers: booked.uniqueCustomers,
      totalBookings: booked.totalBookings,
      siteUrl: smtp.siteUrl,
      mailHealth,
      prevPeriod: prevPeriodStats,
      agentNotes,
      adsSpend,
    });

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
