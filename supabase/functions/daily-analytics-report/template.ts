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
  mailHealth?: { failed24h: number; overduePending: number; samples: Array<{ type: string; error: string }> };
  prevPeriod?: PeriodStats;   // die 7 Tage VOR der Vergleichsperiode (Trend)
  agentNotes?: { notes: Array<{ source: string; note: string }>; error?: string };
  /** Google-Ads-Kosten (SEA, 16.08.) — null/undefined = Block entfällt (fail-soft). */
  adsSpend?: { yesterday: number; period: number; periodDays: number } | null;
}): { subject: string; html: string; text: string } {
  const { yesterday, period, yesterdayLabel, periodLabel, totalLeads, bookedCustomers, totalBookings, siteUrl, mailHealth, prevPeriod, agentNotes, adsSpend } = opts;

  // Ads-Kosten je Stufe (auf Martins Wunsch 16.08.: Spend, €/Lead,
  // €/Patientenprofil — bewusst OHNE Kunden-Stufe). Blended: Spend ÷ ALLE
  // Leads (auch organische) — Kanal-genau wird es erst mit gclid-Historie.
  const euro = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;
  const perPiece = (spend: number, count: number) => (count > 0 ? euro(spend / count) : "—");
  const adsRows = adsSpend
    ? [
      { label: "Ads-Kosten", g: euro(adsSpend.yesterday), p: euro(adsSpend.period) },
      { label: "Kosten je Lead (blended)", g: perPiece(adsSpend.yesterday, yesterday.wizardCompleted), p: perPiece(adsSpend.period, period.sums.wizardCompleted) },
      { label: "Kosten je Patientenprofil", g: perPiece(adsSpend.yesterday, yesterday.patientDataSaved), p: perPiece(adsSpend.period, period.sums.patientDataSaved) },
    ]
    : [];

  const mailAlarm = mailHealth && (mailHealth.failed24h > 0 || mailHealth.overduePending > 0);

  // Tagesfazit (Martin, 15.08.): die Mail beantwortet selbst, ob es ein
  // guter Tag war und wohin der Trend zeigt — Klartext oben statt nur
  // Tabellen. Maßstab: echte Leads gestern vs. 7-Tage-Schnitt; Trend:
  // 7-Tage-Schnitt vs. die 7 Tage davor.
  const leadsY = yesterday.wizardCompleted;
  const leadsAvg = period.wizardCompleted.avg;
  const verdict = leadsY >= Math.max(leadsAvg * 1.25, leadsAvg + 1)
    ? { emoji: "✅", wort: "Guter Tag" }
    : leadsY <= leadsAvg * 0.6
      ? { emoji: "🔻", wort: "Schwacher Tag" }
      : { emoji: "➖", wort: "Normaler Tag" };
  const prevAvg = prevPeriod?.wizardCompleted.avg ?? 0;
  const trendPct = prevAvg > 0 ? ((leadsAvg - prevAvg) / prevAvg) * 100 : 0;
  const trend = prevAvg <= 0
    ? { pfeil: "→", text: "kein Vorwochen-Vergleich" }
    : trendPct > 10
      ? { pfeil: "↗", text: `+${trendPct.toFixed(0)} % vs. Vorwoche (Ø ${leadsAvg.toFixed(1)} nach ${prevAvg.toFixed(1)} Leads/Tag)` }
      : trendPct < -10
        ? { pfeil: "↘", text: `${trendPct.toFixed(0)} % vs. Vorwoche (Ø ${leadsAvg.toFixed(1)} nach ${prevAvg.toFixed(1)} Leads/Tag)` }
        : { pfeil: "→", text: `stabil (Ø ${leadsAvg.toFixed(1)} vs. ${prevAvg.toFixed(1)} Leads/Tag Vorwoche)` };
  const profilQuoteY = leadsY > 0 ? (yesterday.patientDataSaved / leadsY) * 100 : 0;
  const fazitPunkte: string[] = [
    `${leadsY >= leadsAvg ? "✅" : "⚠️"} ${leadsY} neue Leads (7-T-Ø ${leadsAvg.toFixed(1)})`,
    `${yesterday.patientDataSaved > 0 ? "✅" : "⚠️"} ${yesterday.patientDataSaved} Patientenprofil(e) ausgefüllt${leadsY > 0 ? ` — ${profilQuoteY.toFixed(0)} % der neuen Leads (Ø ${period.convProfilLead.toFixed(0)} %)` : ""}`,
    `${yesterday.visitors >= period.visitors.avg ? "✅" : "⚠️"} ${yesterday.visitors} Besucher (Ø ${period.visitors.avg.toFixed(0)})`,
  ];
  const fazitHtml = `
        <div style="margin:0 0 18px;padding:14px 16px;background:${verdict.wort === "Guter Tag" ? "#F0FAF4" : verdict.wort === "Schwacher Tag" ? "#FEF5F2" : "#FAF7F0"};border:1px solid #e8ddd0;border-radius:10px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#2D1F0F;">${verdict.emoji} ${verdict.wort} · Trend ${trend.pfeil} <span style="font-weight:400;color:#5C4A32;font-size:13px;">${trend.text}</span></p>
          ${fazitPunkte.map((pt) => `<p style="margin:2px 0;font-size:13px;color:#444;">${pt}</p>`).join("")}
        </div>`;
  const notesHtml = (() => {
    const n = agentNotes?.notes ?? [];
    const inner = n.length > 0
      ? n.map((x) => `<p style="margin:3px 0;font-size:13px;color:#444;line-height:1.6;"><strong style="color:#5C4A32;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${x.source}</strong> &middot; ${x.note}</p>`).join("")
      : `<p style="margin:0;font-size:13px;color:#9a8a73;">Keine Notizen der Agenten für diesen Tag.</p>`;
    const errLine = agentNotes?.error ? `<p style="margin:6px 0 0;font-size:11px;color:#b91c1c;">Notizen nicht lesbar: ${agentNotes.error}</p>` : "";
    return `
        <div style="margin-top:16px;padding:14px 16px;background:#fff;border:1px solid #e8ddd0;border-radius:10px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3D2B1F;">🧭 Notizen der Agenten (SEO / SEA)</p>
          ${inner}${errLine}
        </div>`;
  })();

  const subject = `${mailAlarm ? '🚨 ' : ''}📊 Primundus Daily — ${yesterdayLabel} · ${yesterday.wizardCompleted} neue Leads · ${verdict.wort} ${trend.pfeil}`;

  // Mail-Ausfall-Alarm ganz oben — der stille Reminder-Blackout (25.05.–25.06.,
  // 207 Fehlschläge) darf sich nicht wiederholen.
  const mailAlarmHtml = mailAlarm
    ? `<div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#b91c1c;">🚨 Mail-System: ${mailHealth!.failed24h} fehlgeschlagen (24h) · ${mailHealth!.overduePending} überfällig</p>
        ${mailHealth!.samples.map((s) => `<p style=\"margin:2px 0;font-size:12px;color:#b91c1c;\">· ${s.type}: ${s.error}</p>`).join('')}
       </div>`
    : '';

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
  /* CTA-Herkunft: welcher Knopf den Wizard geöffnet hat.

     Die Kennung steckt seit dem 18.08. in wizard_opened.source — aufgezeichnet,
     aber nie gezeigt. Sieben CTAs liegen auf der Rechner-Seite, drei Einstiege
     kommen vom Apex (?start=1&src=apex-*). Getrennt ausgewiesen, weil sich
     sonst Website-Verkehr und Direkteinstieg in einer Zahl vermischen.

     Klartext statt Schlüssel: „voraussetzungen" sagt im Report wenig. */
  const CTA_NAMEN: Record<string, string> = {
    hero_cta: "Hero-Button (oben)",
    ablauf: "Abschnitt „So läuft es“",
    voraussetzungen: "Abschnitt „Voraussetzungen“",
    leistungen: "Abschnitt „Leistungen“",
    vergleich: "Abschnitt „Vergleich“",
    final_cta: "Abschluss-CTA (unten)",
    hilfe_dialog: "Hilfe-Dialog",
    "apex-startseite": "primundus.de — Startseite",
    "apex-components": "primundus.de — Bausteine",
    "apex-usp": "primundus.de — USP-Block",
    extern: "Direkteinstieg (ohne Kennung)",
    unbekannt: "ohne Kennung",
  };
  const ctaEintraege = Object.entries(yesterday.wizardOpenedBySource ?? {})
    .sort((a, b) => b[1] - a[1]);
  const ctaGesamt = ctaEintraege.reduce((s, [, n]) => s + n, 0);
  const vomApex = ctaEintraege
    .filter(([q]) => q.startsWith("apex-"))
    .reduce((s, [, n]) => s + n, 0);
  const ctaHtml = ctaEintraege.map(([quelle, anzahl], idx) => `
    <tr style="background:${idx % 2 ? "#fdfbf7" : "#fff"};">
      <td style="padding:7px 12px;font-size:12px;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">
        ${CTA_NAMEN[quelle] ?? quelle}
      </td>
      <td align="right" style="padding:7px 12px;font-size:12px;font-weight:700;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">
        ${anzahl}
      </td>
      <td align="right" style="padding:7px 12px;font-size:11px;color:#9a8a73;border-bottom:1px solid #f0e8dc;">
        ${ctaGesamt ? Math.round((anzahl / ctaGesamt) * 100) : 0}&thinsp;%
      </td>
    </tr>`).join("");

  /* Über welche SEITE kam der Lead (leads.source)? Andere Frage als der CTA
     oben: dort geht es um den Knopf, hier um Formular vs. Voll-Chat. Zeigt den
     Landingpage-Test im Alltag — ohne dass jemand eine Auswertung anstoßen
     muss. Leads von vor dem 27.08.2026 tragen alle 'rechner' (die Quelle wurde
     bis dahin hart gesetzt), der 7-Tage-Wert ist also erst ab dem 03.09.
     vollständig aussagekräftig. */
  /* Kanal UND Seite (Martin, 27.08.) — die drei Test-Varianten sollen sich
     hier unterscheiden lassen:
       A  /                 Formular ohne Chat   (Kontrolle)
       B  /kosten-berechnen Formular + Pria-Float
       C  /sofortangebot    Pria als ganze Seite */
  const QUELL_NAMEN: Record<string, string> = {
    rechner: "A · Formular (Startseite)",
    "kostenrechner-result": "A · Formular (Startseite)",
    "rechner:kosten-berechnen": "B · Formular (Seite mit Pria)",
    "chat:kosten-berechnen": "B · Pria-Float (Seite mit Formular)",
    "chat:sofortangebot": "C · Pria Voll-Chat",
    "pria-chat": "C · Pria Voll-Chat",
    unbekannt: "ohne Kennung",
  };
  const quellGestern = yesterday.leadsBySource ?? {};
  const quellPeriode = period.leadsBySource ?? {};
  const quellKeys = Array.from(new Set([...Object.keys(quellGestern), ...Object.keys(quellPeriode)]))
    .sort((a, b) => (quellPeriode[b] ?? 0) - (quellPeriode[a] ?? 0));
  const quellGesternGesamt = Object.values(quellGestern).reduce((s, n) => s + n, 0);
  const quellPeriodeGesamt = Object.values(quellPeriode).reduce((s, n) => s + n, 0);
  /* ── Die drei Test-Varianten nebeneinander (Martin, 27.08.) ──────────
     Besucher je Landingpage aus analytics_sessions, Leads je Herkunft aus
     leads.source — daraus die Quote, die den Test entscheidet. Der Block
     erscheint nur, solange eine der Chat-Varianten überhaupt Besuch hatte;
     sonst steht er als leere Tabelle im Weg. */
  const VARIANTEN: Array<{ seite: string; name: string; quellen: string[] }> = [
    { seite: "/", name: "A · Startseite (Formular)", quellen: ["rechner", "kostenrechner-result"] },
    { seite: "/kosten-berechnen", name: "B · Formular + Pria-Float",
      quellen: ["rechner:kosten-berechnen", "chat:kosten-berechnen"] },
    { seite: "/sofortangebot", name: "C · Pria Voll-Chat",
      quellen: ["chat:sofortangebot", "pria-chat"] },
  ];
  const besucherGestern = yesterday.besucherJeSeite ?? {};
  const besucherPeriode = period.besucherJeSeite ?? {};
  const chatBesuch = (besucherPeriode["/sofortangebot"] ?? 0) + (besucherPeriode["/kosten-berechnen"] ?? 0);
  const variantenHtml = chatBesuch === 0 ? "" : `
        <p style="margin:16px 0 6px;font-size:12px;font-weight:700;color:#3D2B1F;">
          Chat-Test — die drei Varianten (7 Tage)
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid #f0e8dc;border-radius:6px;">
          <tr style="background:#faf6ef;">
            <td style="padding:6px 12px;font-size:11px;color:#9a8a73;">Variante</td>
            <td align="right" style="padding:6px 12px;font-size:11px;color:#9a8a73;">Besucher</td>
            <td align="right" style="padding:6px 12px;font-size:11px;color:#9a8a73;">Leads</td>
            <td align="right" style="padding:6px 12px;font-size:11px;color:#9a8a73;">Quote</td>
          </tr>
          ${VARIANTEN.map((v, idx) => {
            const bes = besucherPeriode[v.seite] ?? 0;
            const leads = v.quellen.reduce((s, q) => s + (quellPeriode[q] ?? 0), 0);
            const quote = bes > 0 ? ((leads / bes) * 100).toFixed(1) : "—";
            const gesternBes = besucherGestern[v.seite] ?? 0;
            return `<tr style="background:${idx % 2 ? "#fdfbf7" : "#fff"};">
              <td style="padding:7px 12px;font-size:12px;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">${v.name}</td>
              <td align="right" style="padding:7px 12px;font-size:12px;color:#5C4A32;border-bottom:1px solid #f0e8dc;">${bes}<span style="color:#9a8a73;font-size:11px;"> (gestern ${gesternBes})</span></td>
              <td align="right" style="padding:7px 12px;font-size:12px;font-weight:700;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">${leads}</td>
              <td align="right" style="padding:7px 12px;font-size:12px;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">${quote}${bes > 0 ? "&thinsp;%" : ""}</td>
            </tr>`;
          }).join("")}
        </table>
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Gleiche Anzeigen, gleiches Budget, unterschiedlicher Weg zum Angebot.
          Entscheidend ist die Quote (Leads je Besucher) — nicht die absolute Zahl,
          die vom Budget je Kampagne abhängt.
        </p>`;

  const quellHtml = quellKeys.map((quelle, idx) => {
    const g = quellGestern[quelle] ?? 0;
    const w = quellPeriode[quelle] ?? 0;
    return `
    <tr style="background:${idx % 2 ? "#fdfbf7" : "#fff"};">
      <td style="padding:7px 12px;font-size:12px;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">
        ${QUELL_NAMEN[quelle] ?? quelle}
      </td>
      <td align="right" style="padding:7px 12px;font-size:12px;font-weight:700;color:#3D2B1F;border-bottom:1px solid #f0e8dc;">
        ${g}
      </td>
      <td align="right" style="padding:7px 12px;font-size:12px;color:#5C4A32;border-bottom:1px solid #f0e8dc;">
        ${w}
      </td>
      <td align="right" style="padding:7px 12px;font-size:11px;color:#9a8a73;border-bottom:1px solid #f0e8dc;">
        ${quellPeriodeGesamt ? Math.round((w / quellPeriodeGesamt) * 100) : 0}&thinsp;%
      </td>
    </tr>`;
  }).join("");

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
${mailAlarmHtml}
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
        ${fazitHtml}
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

        ${adsSpend ? `<p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Google Ads — Kosten</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <thead><tr>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Metrik</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Gestern</th>
            <th style="padding:8px 12px;background:#5C4A32;color:#fff;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${adsSpend.periodDays} Tage</th>
          </tr></thead>
          <tbody>${adsRows.map((r, i) => `<tr style="background:${i % 2 ? "#faf7f2" : "#fff"};">
            <td style="padding:8px 12px;font-size:13px;color:#3D2B1F;">${r.label}</td>
            <td style="padding:8px 12px;font-size:13px;color:#3D2B1F;text-align:right;font-weight:600;">${r.g}</td>
            <td style="padding:8px 12px;font-size:13px;color:#555;text-align:right;">${r.p}</td>
          </tr>`).join("")}</tbody>
        </table>
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Blended: Ads-Kosten ÷ alle echten Leads/Profile (auch organische). Kampagnen-genaue Kosten je Stufe folgen, sobald genug Klick-ID-Historie da ist.
        </p>` : ""}

        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Wizard-Funnel (Sessions pro Step, Gestern)</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <tbody>${funnelHtml}${completionBridgeHtml}</tbody>
        </table>
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Steps 1–9 zählen <em>unique Sessions</em>, die den Step gesehen haben (Quelle: <code>analytics_events.step_view</code>, inkl. Tests).
          Die letzten zwei Zeilen zählen tatsächlich gespeicherte Leads in der DB (Quelle: <code>leads.created_at</code>).
          Der Sprung &bdquo;Step 9 → echte Leads&ldquo; ist der eigentliche letzte Drop — wer das Kontaktformular sieht, aber nicht abschickt, fällt hier raus.
        </p>

        ${ctaEintraege.length ? `
        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Welcher CTA öffnet den Wizard? (Gestern)</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <tbody>${ctaHtml}</tbody>
        </table>
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Unique Sessions je Knopf (Quelle: <code>analytics_events.wizard_opened.source</code>).
          Davon vom Apex: <strong>${vomApex}</strong> von ${ctaGesamt} — der Rest sind CTAs auf der Rechner-Seite selbst.
          Wer zweimal öffnet, zählt einmal.
        </p>` : ""}

        ${quellKeys.length ? `
        <p style="margin:24px 0 8px;font-size:14px;font-weight:700;color:#3D2B1F;">Über welche Seite kam der Lead?</p>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #e8ddd0;border-radius:8px;overflow:hidden;background:#fff;">
          <thead><tr style="background:#f7f2ea;">
            <th align="left" style="padding:7px 12px;font-size:11px;color:#5C4A32;font-weight:600;">Seite</th>
            <th align="right" style="padding:7px 12px;font-size:11px;color:#5C4A32;font-weight:600;">Gestern</th>
            <th align="right" style="padding:7px 12px;font-size:11px;color:#5C4A32;font-weight:600;">7 Tage</th>
            <th align="right" style="padding:7px 12px;font-size:11px;color:#5C4A32;font-weight:600;">Anteil</th>
          </tr></thead>
          <tbody>${quellHtml}</tbody>
        </table>
        ${variantenHtml}
        <p style="margin:6px 0 0;font-size:11px;color:#9a8a73;line-height:1.5;">
          Echte Leads je Herkunfts-Seite (Quelle: <code>leads.source</code>), Tests herausgefiltert.
          Gestern insgesamt <strong>${quellGesternGesamt}</strong>, über sieben Tage ${quellPeriodeGesamt}.
          Die Kennung wird seit dem 27.08.2026 gesetzt — ältere Leads tragen alle
          &bdquo;Formular&ldquo;, der 7-Tage-Wert ist deshalb erst ab dem 03.09. vollständig.
        </p>` : ""}

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
        ${notesHtml}
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
${verdict.emoji} ${verdict.wort} · Trend ${trend.pfeil} — ${trend.text}
${fazitPunkte.join("\n")}
(Vergleich: ${periodLabel} Ø + Top-Tag)

${rows.map((r) => `${r.label.padEnd(50)} ${String(fmtInt(r.today)).padStart(6)}   Ø ${fmtAvg(r.avg).padStart(5)}   Top ${fmtInt(r.top).padStart(4)} (${r.topDate.slice(0, 5)})`).join("\n")}

CONVERSION-RATEN
${convRows.map((r) => `  ${r.label.padEnd(50)} ${r.today.padStart(6)}   Ø ${fmtPct(r.avg).padStart(6)}`).join("\n")}

${adsSpend ? `GOOGLE ADS — KOSTEN (blended)
${adsRows.map((r) => `  ${r.label.padEnd(30)} ${r.g.padStart(10)}   ${adsSpend.periodDays}T ${r.p.padStart(10)}`).join("\n")}

` : ""}WIZARD-FUNNEL (Gestern)
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

NOTIZEN DER AGENTEN
${(agentNotes?.notes ?? []).length > 0 ? (agentNotes!.notes).map((x) => `  [${x.source}] ${x.note}`).join("\n") : "  (keine)"}${agentNotes?.error ? `\n  Notizen nicht lesbar: ${agentNotes.error}` : ""}
`;

  return { subject, html, text };
}
