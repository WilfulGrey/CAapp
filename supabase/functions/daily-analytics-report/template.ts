// HTML/Text-Template für den Daily-Analytics-Report.
// Stil: kompakte Tabelle mit gestern vs vorgestern, plus Funnel-Liste,
// im gewohnten Primundus-Mail-Look (Logo-Header, Footer).

import type { DailyStats } from "./queries.ts";

const STEP_NAMES: Record<number, string> = {
  1: "Anzahl Patienten",
  2: "Weitere Person im Haushalt",
  3: "Pflegegrad",
  4: "Mobilität",
  5: "Nachteinsätze",
  6: "Deutschkenntnisse",
  7: "Führerschein",
  8: "Geschlecht",
  9: "Betreuungsbeginn",
  10: "Kontaktformular",
};

function delta(today: number, yesterday: number): string {
  const diff = today - yesterday;
  if (diff === 0) return "→ 0";
  const sign = diff > 0 ? "↑" : "↓";
  return `${sign} ${Math.abs(diff)}`;
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function buildReportEmail(opts: {
  yesterday: DailyStats;
  dayBefore: DailyStats;
  yesterdayLabel: string;
  dayBeforeLabel: string;
  totalLeads: number;
  bookedCustomers: number;   // distinct lead_ids mit ≥1 Buchung (lifetime)
  totalBookings: number;     // Buchungs-Vorgänge insgesamt (lifetime)
  siteUrl: string;
}): { subject: string; html: string; text: string } {
  const { yesterday, dayBefore, yesterdayLabel, dayBeforeLabel, totalLeads, bookedCustomers, totalBookings, siteUrl } = opts;

  const subject = `📊 Primundus Daily — ${yesterdayLabel} · ${yesterday.wizardCompleted} neue Leads`;

  const rows: Array<{ label: string; today: number | string; yest: number | string; deltaStr?: string }> = [
    { label: "Besucher (unique Sessions)",      today: yesterday.visitors,           yest: dayBefore.visitors,           deltaStr: delta(yesterday.visitors, dayBefore.visitors) },
    { label: "Wizard gestartet",                 today: yesterday.wizardStarted,      yest: dayBefore.wizardStarted,      deltaStr: delta(yesterday.wizardStarted, dayBefore.wizardStarted) },
    { label: "Wizard abgeschlossen (neue Leads)",today: yesterday.wizardCompleted,    yest: dayBefore.wizardCompleted,    deltaStr: delta(yesterday.wizardCompleted, dayBefore.wizardCompleted) },
    { label: "Conversion-Rate (Lead/Besucher)", today: pct(yesterday.wizardCompleted, yesterday.visitors), yest: pct(dayBefore.wizardCompleted, dayBefore.visitors) },
    { label: "Patientenprofil ausgefüllt",       today: yesterday.patientDataSaved,   yest: dayBefore.patientDataSaved,   deltaStr: delta(yesterday.patientDataSaved, dayBefore.patientDataSaved) },
    { label: "Pflegekräfte eingeladen",          today: yesterday.caregiverInvited,   yest: dayBefore.caregiverInvited,   deltaStr: delta(yesterday.caregiverInvited, dayBefore.caregiverInvited) },
    { label: "Pflegekräfte mit Interesse",       today: yesterday.interestShown,      yest: dayBefore.interestShown,      deltaStr: delta(yesterday.interestShown, dayBefore.interestShown) },
    { label: "Bewerbungen erhalten",             today: yesterday.applicationReceived,yest: dayBefore.applicationReceived,deltaStr: delta(yesterday.applicationReceived, dayBefore.applicationReceived) },
    { label: "Buchungen",                        today: yesterday.bookings,           yest: dayBefore.bookings,           deltaStr: delta(yesterday.bookings, dayBefore.bookings) },
  ];

  const rowsHtml = rows.map((r, i) => {
    const isLast = i === rows.length - 1;
    const border = isLast ? "" : "border-bottom:1px solid #f0ebe4;";
    const deltaHtml = r.deltaStr
      ? `<span style="font-size:11px;color:${r.deltaStr.startsWith("↑") ? "#2D6A4F" : r.deltaStr.startsWith("↓") ? "#B71C1C" : "#9CA3AF"};margin-left:8px;">${r.deltaStr}</span>`
      : "";
    return `<tr>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:13px;width:60%;">${r.label}</td>
      <td style="padding:10px 12px;${border}color:#3D3D3D;font-size:14px;font-weight:700;text-align:right;width:25%;">${r.today}${deltaHtml}</td>
      <td style="padding:10px 12px;${border}color:#9CA3AF;font-size:12px;text-align:right;width:15%;">${r.yest}</td>
    </tr>`;
  }).join("");

  // Funnel: Anzahl Sessions, die jeden Step gesehen haben + Drop %.
  const funnelHtml = Array.from({ length: 10 }, (_, i) => i + 1).map((step) => {
    const viewed = yesterday.funnelStepViewed[step] ?? 0;
    const next = yesterday.funnelStepViewed[step + 1] ?? 0;
    const dropTo = step < 10 ? Math.max(0, viewed - next) : 0;
    const dropPct = step < 10 && viewed > 0 ? ((dropTo / viewed) * 100).toFixed(0) : null;
    const dropCell = step < 10 && viewed > 0
      ? `<span style="color:${dropPct && parseFloat(dropPct) >= 50 ? "#B71C1C" : "#9CA3AF"};font-size:12px;">drop ${dropPct}% (${dropTo})</span>`
      : `<span style="color:#9CA3AF;font-size:12px;">—</span>`;
    return `<tr>
      <td style="padding:6px 12px;color:#888;font-size:12px;width:8%;">${step}.</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;width:42%;">${STEP_NAMES[step]}</td>
      <td style="padding:6px 12px;color:#3D3D3D;font-size:12px;font-weight:700;text-align:right;width:25%;">${viewed}</td>
      <td style="padding:6px 12px;text-align:right;width:25%;">${dropCell}</td>
    </tr>`;
  }).join("");

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
        <p style="margin:0 0 18px;font-size:12px;color:#9a8a73;">Vergleich rechts: ${dayBeforeLabel}</p>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <thead><tr>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Metrik</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Gestern</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Vorgestern</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Wizard-Funnel (Sessions pro Step)</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <tbody>${funnelHtml}</tbody>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:24px;">
          <tr>
            <td style="width:50%;padding-right:8px;vertical-align:top;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3D2B1F;">Geräte</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.8;">
                📱 Mobile: <strong>${yesterday.deviceMobile}</strong> (${Math.round(yesterday.deviceMobile/devTotal*100)}%)<br>
                🖥️ Desktop: <strong>${yesterday.deviceDesktop}</strong> (${Math.round(yesterday.deviceDesktop/devTotal*100)}%)<br>
                📱 Tablet: <strong>${yesterday.deviceTablet}</strong> (${Math.round(yesterday.deviceTablet/devTotal*100)}%)
              </p>
            </td>
            <td style="width:50%;padding-left:8px;vertical-align:top;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3D2B1F;">Quellen</p>
              <p style="margin:0;font-size:12px;color:#555;line-height:1.8;">
                ↪️ Direct: <strong>${yesterday.sourceDirect}</strong> (${Math.round(yesterday.sourceDirect/srcTotal*100)}%)<br>
                🔗 Referral/Suche: <strong>${yesterday.sourceReferral}</strong> (${Math.round(yesterday.sourceReferral/srcTotal*100)}%)
              </p>
            </td>
          </tr>
        </table>

        <div style="margin-top:24px;padding:14px 16px;background:#FAF7F0;border-left:3px solid #B5A184;border-radius:0 6px 6px 0;font-size:13px;color:#5C4A32;line-height:1.8;">
          <strong>📊 Gesamtzahl Leads im System (lifetime):</strong> ${totalLeads}<br>
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
(Vergleich: ${dayBeforeLabel})

${rows.map((r) => `${r.label.padEnd(36)} ${String(r.today).padStart(6)}  (${r.yest})${r.deltaStr ? "  " + r.deltaStr : ""}`).join("\n")}

WIZARD-FUNNEL
${Array.from({ length: 10 }, (_, i) => i + 1).map((s) => {
  const v = yesterday.funnelStepViewed[s] ?? 0;
  const next = yesterday.funnelStepViewed[s + 1] ?? 0;
  const drop = s < 10 && v > 0 ? ` (drop ${((Math.max(0, v - next) / v) * 100).toFixed(0)}%)` : "";
  return `  ${s}. ${STEP_NAMES[s].padEnd(34)} ${String(v).padStart(4)}${drop}`;
}).join("\n")}

GERÄTE
  Mobile:  ${yesterday.deviceMobile}
  Desktop: ${yesterday.deviceDesktop}
  Tablet:  ${yesterday.deviceTablet}

QUELLEN
  Direct:           ${yesterday.sourceDirect}
  Referral/Suche:   ${yesterday.sourceReferral}

Gesamt Leads im System:    ${totalLeads}
Gebuchte Kunden (lifetime): ${bookedCustomers} (${totalBookings} Buchungs-Vorgänge)
`;

  return { subject, html, text };
}
