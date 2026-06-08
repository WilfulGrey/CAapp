// HTML/Text-Template für den Daily-Analytics-Report.
// Stil: kompakte Tabelle mit "Gestern · 7-Tage-Ø · Top-Tag" Spalten,
// plus separate Conversion-Rate-Tabelle und Funnel-Liste, im gewohnten
// Primundus-Mail-Look (Logo-Header, Footer).
//
// Begründung 7-Tage-Ø statt Vorgestern (PR #168):
// Tag-zu-Tag-Vergleiche schwanken stark (Wochenend-Effekt, Kampagnen-
// Spitzen). Ø über 7 Tage gibt einen stabilen Vergleichspunkt, "Top-Tag"
// zeigt das aktuelle Plateau. Conversion-% als Tabelle, weil absolute
// Zahlen wenig aussagen wenn Traffic schwankt.

import type { DailyStats, PeriodStats } from "./queries.ts";

// Spiegelt MultiStepForm.getStepId() — 9 Schritte (Betreuungsbeginn /
// care_start_timing wurde aus dem Funnel entfernt, Kontaktformular ist
// jetzt Schritt 9 statt 10).
const TOTAL_STEPS = 9;
const STEP_NAMES: Record<number, string> = {
  1: "Anzahl Patienten",
  2: "Weitere Person im Haushalt",
  3: "Pflegegrad",
  4: "Mobilität",
  5: "Nachteinsätze",
  6: "Deutschkenntnisse",
  7: "Führerschein",
  8: "Geschlecht",
  9: "Kontaktformular",
};

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("de-DE");
}

function fmtAvg(n: number): string {
  // Avg darf Nachkommastelle haben damit "1.3" nicht als "1" verschwindet.
  return n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(p: number): string {
  return `${p.toFixed(1)}%`;
}

function pctRaw(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function buildReportEmail(opts: {
  yesterday: DailyStats;
  period: PeriodStats;     // 7-Tage-Aggregat (avg + top + conv-rates)
  yesterdayLabel: string;
  periodLabel: string;     // z.B. "letzte 7 Tage"
  totalLeads: number;
  bookedCustomers: number;   // distinct lead_ids mit ≥1 Buchung (lifetime)
  totalBookings: number;     // Buchungs-Vorgänge insgesamt (lifetime)
  siteUrl: string;
}): { subject: string; html: string; text: string } {
  const { yesterday, period, yesterdayLabel, periodLabel, totalLeads, bookedCustomers, totalBookings, siteUrl } = opts;

  const subject = `📊 Primundus Daily — ${yesterdayLabel} · ${yesterday.wizardCompleted} neue Leads`;

  // Absolutwerte-Tabelle: Gestern · 7-T-Ø · Top (Datum)
  const rows: Array<{ label: string; today: number; avg: number; top: number; topDate: string }> = [
    { label: "Besucher (unique Sessions)",                     today: yesterday.visitors,            avg: period.visitors.avg,            top: period.visitors.top,            topDate: period.visitors.topDate },
    { label: "Wizard gestartet",                               today: yesterday.wizardStarted,       avg: period.wizardStarted.avg,       top: period.wizardStarted.top,       topDate: period.wizardStarted.topDate },
    { label: "Wizard abgeschlossen (echte Leads, ohne Tests)", today: yesterday.wizardCompleted,     avg: period.wizardCompleted.avg,     top: period.wizardCompleted.top,     topDate: period.wizardCompleted.topDate },
    { label: "Patientenprofil ausgefüllt",                     today: yesterday.patientDataSaved,    avg: period.patientDataSaved.avg,    top: period.patientDataSaved.top,    topDate: period.patientDataSaved.topDate },
    { label: "Pflegekräfte eingeladen",                        today: yesterday.caregiverInvited,    avg: period.caregiverInvited.avg,    top: period.caregiverInvited.top,    topDate: period.caregiverInvited.topDate },
    { label: "Pflegekräfte mit Interesse",                     today: yesterday.interestShown,       avg: period.interestShown.avg,       top: period.interestShown.top,       topDate: period.interestShown.topDate },
    { label: "Bewerbungen erhalten",                           today: yesterday.applicationReceived, avg: period.applicationReceived.avg, top: period.applicationReceived.top, topDate: period.applicationReceived.topDate },
    { label: "Buchungen",                                      today: yesterday.bookings,            avg: period.bookings.avg,            top: period.bookings.top,            topDate: period.bookings.topDate },
  ];

  const rowsHtml = rows.map((r, i) => {
    const isLast = i === rows.length - 1;
    const border = isLast ? "" : "border-bottom:1px solid #f0ebe4;";
    // Gestern-vs-Avg Indikator: ↑ über dem Ø, ↓ darunter, → ähnlich (±10%).
    let arrow = "";
    if (r.avg > 0) {
      const ratio = r.today / r.avg;
      if (ratio >= 1.1) arrow = `<span style="font-size:11px;color:#2D6A4F;margin-left:6px;">↑</span>`;
      else if (ratio <= 0.9) arrow = `<span style="font-size:11px;color:#B71C1C;margin-left:6px;">↓</span>`;
      else arrow = `<span style="font-size:11px;color:#9CA3AF;margin-left:6px;">→</span>`;
    }
    return `<tr>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:13px;width:48%;">${r.label}</td>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:14px;font-weight:700;text-align:right;width:18%;">${fmtInt(r.today)}${arrow}</td>
      <td style="padding:10px 12px;${border}color:#666;font-size:13px;text-align:right;width:14%;">${fmtAvg(r.avg)}</td>
      <td style="padding:10px 12px;${border}color:#666;font-size:13px;text-align:right;width:20%;"><strong style="color:#3D2B1F;">${fmtInt(r.top)}</strong> <span style="color:#9CA3AF;font-size:11px;">${r.topDate.slice(0, 5)}</span></td>
    </tr>`;
  }).join("");

  // Conversion-Raten-Tabelle: Gestern (Tages-Rate) vs 7-T-Ø (Periode-Rate)
  const convRows: Array<{ label: string; today: string; avg: number }> = [
    { label: "Lead-Conv  (Wizard abgeschl. / Besucher)",         today: pctRaw(yesterday.wizardCompleted, yesterday.visitors),               avg: period.convLeadVisitor },
    { label: "Profil-Conv  (Profil / Lead)",                     today: pctRaw(yesterday.patientDataSaved, yesterday.wizardCompleted),       avg: period.convProfilLead },
    { label: "Invite-Conv  (Eingeladen / Profil)",               today: pctRaw(yesterday.caregiverInvited, yesterday.patientDataSaved),      avg: period.convInviteProfil },
    { label: "Bewerbungs-Conv  (Bewerbung / Eingeladen)",        today: pctRaw(yesterday.applicationReceived, yesterday.caregiverInvited),   avg: period.convAppInvite },
    { label: "Buchungs-Conv  (Buchung / Bewerbung)",             today: pctRaw(yesterday.bookings, yesterday.applicationReceived),           avg: period.convBookingApp },
  ];

  const convRowsHtml = convRows.map((r, i) => {
    const isLast = i === convRows.length - 1;
    const border = isLast ? "" : "border-bottom:1px solid #f0ebe4;";
    return `<tr>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:13px;width:62%;">${r.label}</td>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:14px;font-weight:700;text-align:right;width:18%;">${r.today}</td>
      <td style="padding:10px 12px;${border}color:#666;font-size:13px;text-align:right;width:20%;">${fmtPct(r.avg)}</td>
    </tr>`;
  }).join("");

  // Funnel: Anzahl Sessions, die jeden Step gesehen haben + Drop %. Beim
  // letzten Step (Kontaktformular = TOTAL_STEPS) berechnen wir den Drop
  // gegen die ECHTEN Leads in der DB (wizardCompleted), nicht gegen einen
  // nicht existierenden Step+1 — das ist genau der Übergang, der vorher
  // unsichtbar war ("15 Kontaktformular-Views → 2 echte Leads" sah aus
  // wie ein Bug, ist aber der entscheidende letzte Drop im Funnel).
  const funnelHtml = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => {
    const viewed = yesterday.funnelStepViewed[step] ?? 0;
    const isLastStep = step === TOTAL_STEPS;
    const next = isLastStep
      ? yesterday.wizardCompletedIncludingTests
      : (yesterday.funnelStepViewed[step + 1] ?? 0);
    const dropTo = Math.max(0, viewed - next);
    const dropPct = viewed > 0 ? ((dropTo / viewed) * 100).toFixed(0) : null;
    const dropCell = viewed > 0
      ? `<span style="color:${dropPct && parseFloat(dropPct) >= 50 ? "#B71C1C" : "#9CA3AF"};font-size:12px;">drop ${dropPct}% (${dropTo})</span>`
      : `<span style="color:#9CA3AF;font-size:12px;">—</span>`;
    return `<tr>
      <td style="padding:6px 12px;color:#888;font-size:12px;width:8%;">${step}.</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;width:42%;">${STEP_NAMES[step]}</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;font-weight:700;text-align:right;width:25%;">${viewed}</td>
      <td style="padding:6px 12px;text-align:right;width:25%;">${dropCell}</td>
    </tr>`;
  }).join("");

  // Brückenzeile NACH Step 9: Lead tatsächlich in der DB gelandet. Vorher
  // endete der Funnel bei "Kontaktformular: 15 — drop —" und die Übersicht
  // oben zeigte "Wizard abgeschlossen: 2" — kein sichtbarer Bezug.
  // Wir rendern hier 2 Zeilen damit der Test-Split offen liegt:
  //   • alle Leads gestern (inkl. Tests)
  //   • davon echte (= wizardCompleted, fließt in alle Conv-Raten)
  const testLeadsHidden = Math.max(
    0,
    yesterday.wizardCompletedIncludingTests - yesterday.wizardCompleted,
  );
  const completionBridgeHtml = `
    <tr style="background:#fafafa;">
      <td style="padding:6px 12px;color:#888;font-size:12px;width:8%;border-top:1px solid #f0ebe4;">→</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;width:42%;border-top:1px solid #f0ebe4;">Lead in DB gespeichert (alle, inkl. Tests)</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;font-weight:700;text-align:right;width:25%;border-top:1px solid #f0ebe4;">${yesterday.wizardCompletedIncludingTests}</td>
      <td style="padding:6px 12px;text-align:right;width:25%;border-top:1px solid #f0ebe4;"><span style="color:#9CA3AF;font-size:12px;">—</span></td>
    </tr>
    <tr style="background:#fafafa;">
      <td style="padding:6px 12px;color:#888;font-size:12px;width:8%;">→</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;width:42%;"><strong style="color:#2D6A4F;">Echte Leads (ohne Tests)</strong>${testLeadsHidden > 0 ? ` <span style="color:#9CA3AF;">· ${testLeadsHidden} Test ausgefiltert</span>` : ""}</td>
      <td style="padding:6px 12px;color:#2D6A4F;font-size:12px;font-weight:700;text-align:right;width:25%;">${yesterday.wizardCompleted}</td>
      <td style="padding:6px 12px;text-align:right;width:25%;"><span style="color:#9CA3AF;font-size:12px;">—</span></td>
    </tr>`;

  // Geräte + Quellen
  const devTotal = yesterday.deviceMobile + yesterday.deviceDesktop + yesterday.deviceTablet || 1;
  const srcTotal = yesterday.sourceDirect + yesterday.sourceReferral || 1;

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Primundus Daily Report — ${yesterdayLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#333;">
  <div style="background:#f4f4f4;padding:24px 0;">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <div style="background:#fff;padding:24px 32px;border-bottom:1px solid #f0ebe4;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td style="vertical-align:middle;">
            <img src="${siteUrl}/images/Primundus-Logo_V6.png" alt="Primundus" style="max-width:140px;height:auto;display:block;" />
          </td>
          <td style="vertical-align:middle;text-align:right;">
            <p style="margin:0;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8a73;">Daily Report</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:700;color:#3D2B1F;">${yesterdayLabel}</p>
          </td>
        </tr></table>
      </div>

      <div style="padding:24px 32px;">
        <p style="margin:0 0 4px;font-size:15px;color:#555;">📊 Übersicht für <strong style="color:#2D1F0F;">${yesterdayLabel}</strong></p>
        <p style="margin:0 0 18px;font-size:12px;color:#9a8a73;">Vergleich: ${periodLabel} (Ø + Top-Tag)</p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <thead><tr>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Metrik</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Gestern</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">7-T-Ø</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Top (Tag)</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Conversion-Raten</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <thead><tr>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Stufe</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Gestern</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">7-T-Ø</th>
          </tr></thead>
          <tbody>${convRowsHtml}</tbody>
        </table>

        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Wizard-Funnel (Sessions pro Step, Gestern)</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <tbody>${funnelHtml}${completionBridgeHtml}</tbody>
        </table>
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Steps 1–9 zählen <em>unique Sessions</em>, die den Step gesehen haben (Quelle: <code>analytics_events.step_view</code>, inkl. Tests).
          Die letzten zwei Zeilen zählen tatsächlich gespeicherte Leads in der DB (Quelle: <code>leads.created_at</code>).
          Der Sprung &bdquo;Step 9 → echte Leads&ldquo; ist der eigentliche letzte Drop — wer das Kontaktformular sieht, aber nicht abschickt, fällt hier raus.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px;">
          <tr>
            <td style="width:50%;padding-right:8px;vertical-align:top;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3D2B1F;">Geräte (Gestern)</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.8;">
                📱 Mobile: <strong>${yesterday.deviceMobile}</strong> (${Math.round(yesterday.deviceMobile/devTotal*100)}%)<br>
                🖥️ Desktop: <strong>${yesterday.deviceDesktop}</strong> (${Math.round(yesterday.deviceDesktop/devTotal*100)}%)<br>
                📱 Tablet: <strong>${yesterday.deviceTablet}</strong> (${Math.round(yesterday.deviceTablet/devTotal*100)}%)
              </p>
            </td>
            <td style="width:50%;padding-left:8px;vertical-align:top;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3D2B1F;">Quellen (Gestern)</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.8;">
                ↪️ Direct: <strong>${yesterday.sourceDirect}</strong> (${Math.round(yesterday.sourceDirect/srcTotal*100)}%)<br>
                🔗 Referral/Suche: <strong>${yesterday.sourceReferral}</strong> (${Math.round(yesterday.sourceReferral/srcTotal*100)}%)
              </p>
            </td>
          </tr>
        </table>

        <div style="margin-top:24px;padding:14px 16px;background:#FAF7F0;border-left:3px solid #B5A184;border-radius:0 6px 6px 0;font-size:13px;color:#5C4A32;line-height:1.8;">
          <strong>📊 Echte Leads im System (lifetime, ohne Tests):</strong> ${totalLeads}<br>
          <strong>🎉 Gebuchte Kunden (lifetime, distinct):</strong> ${bookedCustomers} <span style="color:#9a8a73;font-weight:400;">(${totalBookings} Buchungs-Vorgänge total)</span>
        </div>
      </div>

      <div style="background:#f8f9fa;padding:18px 32px;border-top:1px solid #e0e0e0;text-align:center;">
        <p style="margin:0;font-size:11px;color:#9a8a73;">
          Automatischer Tagesreport · <a href="${siteUrl}/api/analytics/stats" style="color:#8B7355;text-decoration:none;">Live-Stats</a><br>
          Berlin-Tagesgrenzen (00:00 – 23:59) · gesendet jeden Morgen
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;

  const text = `Primundus Daily Report — ${yesterdayLabel}
(Vergleich: ${periodLabel} Ø + Top-Tag)

${rows.map((r) => `${r.label.padEnd(50)} ${String(fmtInt(r.today)).padStart(6)}   Ø ${fmtAvg(r.avg).padStart(5)}   Top ${fmtInt(r.top).padStart(4)} (${r.topDate.slice(0, 5)})`).join("\n")}

CONVERSION-RATEN
${convRows.map((r) => `  ${r.label.padEnd(50)} ${r.today.padStart(6)}   Ø ${fmtPct(r.avg).padStart(6)}`).join("\n")}

WIZARD-FUNNEL (Gestern)
${Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => {
  const v = yesterday.funnelStepViewed[s] ?? 0;
  const next = s === TOTAL_STEPS
    ? yesterday.wizardCompletedIncludingTests
    : (yesterday.funnelStepViewed[s + 1] ?? 0);
  const drop = v > 0 ? ` (drop ${((Math.max(0, v - next) / v) * 100).toFixed(0)}%)` : "";
  return `  ${s}. ${STEP_NAMES[s].padEnd(34)} ${String(v).padStart(4)}${drop}`;
}).join("\n")}
  → Lead in DB (alle, inkl. Tests)        ${String(yesterday.wizardCompletedIncludingTests).padStart(4)}
  → Echte Leads (ohne Tests)              ${String(yesterday.wizardCompleted).padStart(4)}

GERÄTE (Gestern)
  Mobile:  ${yesterday.deviceMobile}
  Desktop: ${yesterday.deviceDesktop}
  Tablet:  ${yesterday.deviceTablet}

QUELLEN (Gestern)
  Direct:           ${yesterday.sourceDirect}
  Referral/Suche:   ${yesterday.sourceReferral}

Gesamt Leads im System:    ${totalLeads}
Gebuchte Kunden (lifetime): ${bookedCustomers} (${totalBookings} Buchungs-Vorgänge)
`;

  return { subject, html, text };
}
