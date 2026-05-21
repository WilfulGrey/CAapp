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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import nodemailer from "npm:nodemailer@6.9.10";
import { Buffer } from "node:buffer";
import {
  berlinDayRange,
  fetchDailyStats,
  fetchTotalLeads,
} from "./queries.ts";
import { buildReportEmail } from "./template.ts";

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
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (typeof body?.daysAgo === "number" && body.daysAgo > 0) {
        daysAgo = Math.floor(body.daysAgo);
      }
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
    const dayBefore = berlinDayRange(daysAgo + 1);

    const [yesterdayStats, dayBeforeStats, totalLeads] = await Promise.all([
      fetchDailyStats(supabase, yesterday.start, yesterday.end),
      fetchDailyStats(supabase, dayBefore.start, dayBefore.end),
      fetchTotalLeads(supabase),
    ]);

    const smtp = await getSmtpConfig(supabase);
    const recipients = parseRecipients(Deno.env.get("DAILY_REPORT_RECIPIENTS"));

    const { subject, html, text } = buildReportEmail({
      yesterday: yesterdayStats,
      dayBefore: dayBeforeStats,
      yesterdayLabel: yesterday.label,
      dayBeforeLabel: dayBefore.label,
      totalLeads,
      siteUrl: smtp.siteUrl,
    });

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
