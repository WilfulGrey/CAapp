// SQL-Helper für den daily-analytics-report. Alle Queries laufen auf den
// Tabellen analytics_sessions / analytics_events / leads / lead_events.
// Zeitraum wird via Berlin-Tagesgrenzen berechnet (Helper unten).

import { type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

// Test-Lead-Filter: gleicher Set wie das Live-Dashboard (/api/analytics/stats).
// Wendet sich auf vorname / nachname / email an, damit interne QA-Submits
// (z.B. m.kepinski+test...@mamamia.app, *example.com, *mailinator.com) nicht
// die echten Conversion-Zahlen verfälschen.
export function isRealLead(lead: { vorname?: string | null; nachname?: string | null; email?: string | null } | null | undefined): boolean {
  if (!lead) return false;
  const v = (lead.vorname ?? "").toLowerCase();
  const n = (lead.nachname ?? "").toLowerCase();
  const e = (lead.email ?? "").toLowerCase();
  if (v.includes("test")) return false;
  if (n.includes("test")) return false;
  if (e.includes("test")) return false;
  if (e.includes("mailinator")) return false;
  if (e.includes("example.com")) return false;
  if (e.includes("wyzzi")) return false;
  if (e.includes("mamamia")) return false;
  return true;
}

export interface DailyStats {
  visitors: number;            // Unique analytics_sessions
  wizardStarted: number;       // Sessions mit mind. einem step_view-Event
  wizardCompleted: number;     // Leads angelegt + isRealLead() (= Step 9 submitted ohne Tests)
  /** Alle Leads im Zeitraum — inkl. Test-Vornamen/-Emails. Wird im Funnel
   *  als Brücke zwischen "Step 9 viewed" und "echte Leads" gebraucht,
   *  damit der Test-Split sichtbar ist und 15 → 2 nicht magisch wirkt. */
  wizardCompletedIncludingTests: number;
  patientDataSaved: number;    // lead_events.patient_data_saved
  caregiverInvited: number;    // lead_events.caregiver_invited
  interestShown: number;       // lead_events.caregiver_interest_shown
  applicationReceived: number; // lead_events.application_received
  bookings: number;            // lead_events.application_accepted_internal
  deviceMobile: number;
  deviceDesktop: number;
  deviceTablet: number;
  sourceDirect: number;
  sourceReferral: number;
  // Funnel: Anzahl unique sessions, die step N gesehen haben (1..10)
  funnelStepViewed: Record<number, number>;
  /** Sessions je CTA, die den Wizard geöffnet haben (wizard_opened.source).
   *  Die Kennung wurde seit dem 18.08. aufgezeichnet, aber nirgends gezeigt. */
  wizardOpenedBySource: Record<string, number>;
  /** Echte Leads je Herkunfts-SEITE (`leads.source`): 'rechner' = Formular
   *  auf dem Kostenrechner, 'pria-chat' = Voll-Chat auf /sofortangebot.
   *  Andere Dimension als wizardOpenedBySource (das ist der KNOPF, dies ist
   *  die SEITE). Leads vor dem 27.08.2026 tragen alle 'rechner', weil die
   *  Quelle bis dahin hart gesetzt wurde — ältere Zeiträume zeigen deshalb
   *  keinen echten Split. */
  leadsBySource: Record<string, number>;
}

/**
 * Berechnet Start/End-ISO-Strings für den Berlin-Tag „heute − daysAgo".
 * Robust gegen DST (Sommer/Winter) — Offset wird aus einer UTC-Probe
 * Mitternacht auf dem Zieltag abgeleitet.
 */
export function berlinDayRange(daysAgo: number): { start: string; end: string; label: string; iso: string } {
  const now = new Date();
  const todayBerlin = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = todayBerlin.split("-").map(Number);

  // UTC Date für den Berlin-Zieltag (Mittag, um DST-Edges zu meiden).
  const target = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const td = target.getUTCDate();

  // Berlin-Offset für diesen Tag bestimmen: format eine UTC-Mittag-Date in
  // Berlin und schau, welche Stunde rauskommt.
  const probe = new Date(Date.UTC(ty, tm, td, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(probe);
  const berlinHour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const offsetHours = berlinHour - 12; // 1 (CET) oder 2 (CEST)

  const startUTC = new Date(Date.UTC(ty, tm, td, -offsetHours, 0, 0));
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);

  const isoDateStr = `${ty}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
  const label = `${String(td).padStart(2, "0")}.${String(tm + 1).padStart(2, "0")}.${ty}`;

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
    label,
    iso: isoDateStr,
  };
}

/**
 * Liefert alle Tageskennzahlen für ein gegebenes Berlin-Datum (start..end-Strings).
 * Die Lead-Filter „test"-Vornamen/-Nachnamen/-Emails werden hier nicht angewandt
 * (anders als im Live-Dashboard) — kommt eventuell später dazu, fürs erste
 * sehen wir die Roh-Zahlen.
 */
export async function fetchDailyStats(
  supabase: SupabaseClient,
  start: string,
  end: string,
): Promise<DailyStats> {
  // 1) Sessions (Besucher) + Devices + Quellen
  const { data: sessions, error: sErr } = await supabase
    .from("analytics_sessions")
    .select("id, device_type, referrer")
    .gte("started_at", start)
    .lt("started_at", end);
  if (sErr) throw new Error(`analytics_sessions: ${sErr.message}`);

  const visitors = sessions?.length ?? 0;
  let deviceMobile = 0, deviceDesktop = 0, deviceTablet = 0;
  let sourceDirect = 0, sourceReferral = 0;
  for (const s of sessions ?? []) {
    const dev = (s as any).device_type;
    if (dev === "mobile") deviceMobile++;
    else if (dev === "tablet") deviceTablet++;
    else deviceDesktop++;
    const ref = (s as any).referrer;
    if (!ref || ref === "") sourceDirect++;
    else sourceReferral++;
  }

  // 2) Wizard-Events (step_view) für den Funnel + Wizard-Started
  const { data: events, error: eErr } = await supabase
    .from("analytics_events")
    .select("session_id, event_name, event_data")
    .eq("event_type", "wizard")
    .gte("created_at", start)
    .lt("created_at", end);
  if (eErr) throw new Error(`analytics_events: ${eErr.message}`);

  const startedSessions = new Set<string>();
  const funnelStepViewed: Record<number, number> = {};
  const stepViewSessions: Record<number, Set<string>> = {};
  /* Welcher CTA den Wizard geöffnet hat. Sieben Knöpfe auf der Rechner-Seite
     (hero_cta, ablauf, voraussetzungen, leistungen, vergleich, final_cta,
     hilfe_dialog) plus der Direkteinstieg vom Apex per ?start=1&src=apex-*.
     Gezählt werden SESSIONS, nicht Klicks: wer zweimal öffnet, ist ein
     Interessent, nicht zwei. */
  const openedSessions: Record<string, Set<string>> = {};
  for (const e of events ?? []) {
    const ev = e as any;
    if (ev.event_name === "wizard_opened") {
      const quelle = typeof ev.event_data?.source === "string" && ev.event_data.source
        ? String(ev.event_data.source).slice(0, 40)
        : "unbekannt";
      (openedSessions[quelle] ??= new Set()).add(ev.session_id);
    }
    if (ev.event_name === "step_view") {
      startedSessions.add(ev.session_id);
      const step: unknown = ev.event_data?.step;
      if (typeof step === "number") {
        (stepViewSessions[step] ??= new Set()).add(ev.session_id);
      }
    }
  }
  // Wizard hat 9 Schritte (siehe MultiStepForm.totalSteps + template.ts
  // TOTAL_STEPS). Schritt 10 existiert nicht mehr — bis n<=10 zu zählen war
  // historisches Artefakt aus der Zeit mit care_start_timing.
  for (let n = 1; n <= 9; n++) {
    funnelStepViewed[n] = stepViewSessions[n]?.size ?? 0;
  }
  const wizardStarted = startedSessions.size;
  const wizardOpenedBySource: Record<string, number> = {};
  for (const [quelle, sessions] of Object.entries(openedSessions)) {
    wizardOpenedBySource[quelle] = sessions.size;
  }

  // 3) Wizard abgeschlossen = Leads angelegt im Zeitraum.
  // Test-Leads (m.kepinski+test*@mamamia.app, *example.com, etc.)
  // werden über isRealLead() rausgefiltert, damit interne QA die
  // echten Conversion-Zahlen nicht verfälscht.
  const { data: leadsInPeriod, error: lErr } = await supabase
    .from("leads")
    .select("id, email, vorname, nachname, source")
    .gte("created_at", start)
    .lt("created_at", end);
  if (lErr) throw new Error(`leads: ${lErr.message}`);
  const wizardCompletedIncludingTests = leadsInPeriod?.length ?? 0;
  const echteLeads = (leadsInPeriod ?? []).filter(isRealLead);
  const wizardCompleted = echteLeads.length;

  // Herkunft NUR aus echten Leads — sonst färben Test-Anfragen den Split.
  const leadsBySource: Record<string, number> = {};
  for (const l of echteLeads) {
    const quelle = String((l as any).source ?? "").trim() || "unbekannt";
    leadsBySource[quelle] = (leadsBySource[quelle] ?? 0) + 1;
  }

  // 4) Lead-Events pro Typ
  const { data: leadEvents, error: leErr } = await supabase
    .from("lead_events")
    .select("event_type")
    .gte("created_at", start)
    .lt("created_at", end);
  if (leErr) throw new Error(`lead_events: ${leErr.message}`);

  let patientDataSaved = 0;
  let caregiverInvited = 0;
  let interestShown = 0;
  let applicationReceived = 0;
  let bookings = 0;
  for (const le of leadEvents ?? []) {
    const t = (le as any).event_type;
    if (t === "patient_data_saved") patientDataSaved++;
    else if (t === "caregiver_invited") caregiverInvited++;
    else if (t === "caregiver_interest_shown") interestShown++;
    else if (t === "application_received") applicationReceived++;
    else if (t === "application_accepted_internal") bookings++;
  }

  return {
    visitors,
    wizardStarted,
    wizardCompleted,
    wizardCompletedIncludingTests,
    patientDataSaved,
    caregiverInvited,
    interestShown,
    applicationReceived,
    bookings,
    deviceMobile,
    deviceDesktop,
    deviceTablet,
    sourceDirect,
    sourceReferral,
    funnelStepViewed,
    wizardOpenedBySource,
    leadsBySource,
  };
}

// Aggregations-Result für die letzten N Tage. Pro Metrik:
//   avg — arithmetisches Mittel über die N Tage
//   top — höchster Tageswert
//   topDate — Label-Datum (TT.MM.JJJJ) des Top-Tages
// Conversion-Rates werden aus den aufsummierten Zahlen über den ganzen
// Zeitraum gebaut (nicht avg der Tages-Rates), damit kleine Tage mit
// wenig Traffic die Rate nicht verzerren.
export interface PeriodStat { avg: number; top: number; topDate: string }
export interface PeriodSums {
  wizardCompleted: number;
  patientDataSaved: number;
}
export interface PeriodStats {
  /** Perioden-SUMMEN (nicht Ø) — für Kosten-je-Stück-Rechnungen (Ads). */
  sums: PeriodSums;
  visitors: PeriodStat;
  wizardStarted: PeriodStat;
  wizardCompleted: PeriodStat;
  patientDataSaved: PeriodStat;
  caregiverInvited: PeriodStat;
  interestShown: PeriodStat;
  applicationReceived: PeriodStat;
  bookings: PeriodStat;
  // Conversion-Raten als Prozentzahlen über die Periode (0..100).
  // Berechnet aus den jeweiligen Summen, nicht aus den Tages-Avg.
  convLeadVisitor: number;        // wizardCompleted / visitors
  convProfilLead: number;         // patientDataSaved / wizardCompleted
  convInviteProfil: number;       // caregiverInvited / patientDataSaved
  convAppInvite: number;          // applicationReceived / caregiverInvited
  convBookingApp: number;
  /** Echte Leads je Herkunfts-Seite, aufsummiert über den Zeitraum. */
  leadsBySource: Record<string, number>;         // bookings / applicationReceived
  // Tageskennzahl der einzelnen 7 Tage — für Mini-Sparkline/Debug.
  days: { label: string; stats: DailyStats }[];
}

/**
 * Holt N Tageskennzahlen (Tag −1 bis Tag −N) und aggregiert sie zu avg+top.
 * Lädt sequenziell um Supabase-Connection-Pool nicht zu sprengen.
 */
export async function fetchPeriodStats(
  supabase: SupabaseClient,
  daysBack: number,
  // offsetDays: 0 = letzte N Tage ab gestern; 7 = die 7 Tage DAVOR
  // (Vorwochen-Vergleich für den Trend-Pfeil im Tagesfazit, 15.08.).
  offsetDays = 0,
): Promise<PeriodStats> {
  const perDay: { label: string; stats: DailyStats }[] = [];
  for (let i = 1 + offsetDays; i <= daysBack + offsetDays; i++) {
    const r = berlinDayRange(i);
    const stats = await fetchDailyStats(supabase, r.start, r.end);
    perDay.push({ label: r.label, stats });
  }

  const aggregate = (pick: (s: DailyStats) => number): PeriodStat => {
    let sum = 0; let top = -1; let topDate = perDay[0]?.label ?? "";
    for (const d of perDay) {
      const v = pick(d.stats);
      sum += v;
      if (v > top) { top = v; topDate = d.label; }
    }
    return { avg: perDay.length > 0 ? sum / perDay.length : 0, top: top < 0 ? 0 : top, topDate };
  };

  const sumOf = (pick: (s: DailyStats) => number): number =>
    perDay.reduce((acc, d) => acc + pick(d.stats), 0);
  const rate = (num: number, den: number): number =>
    den > 0 ? (num / den) * 100 : 0;

  const visitorsSum = sumOf((s) => s.visitors);
  const wizardCompletedSum = sumOf((s) => s.wizardCompleted);
  const patientDataSavedSum = sumOf((s) => s.patientDataSaved);
  const caregiverInvitedSum = sumOf((s) => s.caregiverInvited);
  const applicationReceivedSum = sumOf((s) => s.applicationReceived);
  const bookingsSum = sumOf((s) => s.bookings);

  const leadsBySourceSum: Record<string, number> = {};
  for (const d of perDay) {
    for (const [quelle, n] of Object.entries(d.stats.leadsBySource ?? {})) {
      leadsBySourceSum[quelle] = (leadsBySourceSum[quelle] ?? 0) + n;
    }
  }

  return {
    sums: { wizardCompleted: wizardCompletedSum, patientDataSaved: patientDataSavedSum },
    visitors: aggregate((s) => s.visitors),
    wizardStarted: aggregate((s) => s.wizardStarted),
    wizardCompleted: aggregate((s) => s.wizardCompleted),
    patientDataSaved: aggregate((s) => s.patientDataSaved),
    caregiverInvited: aggregate((s) => s.caregiverInvited),
    interestShown: aggregate((s) => s.interestShown),
    applicationReceived: aggregate((s) => s.applicationReceived),
    bookings: aggregate((s) => s.bookings),
    convLeadVisitor: rate(wizardCompletedSum, visitorsSum),
    convProfilLead: rate(patientDataSavedSum, wizardCompletedSum),
    convInviteProfil: rate(caregiverInvitedSum, patientDataSavedSum),
    convAppInvite: rate(applicationReceivedSum, caregiverInvitedSum),
    convBookingApp: rate(bookingsSum, applicationReceivedSum),
    leadsBySource: leadsBySourceSum,
    days: perDay,
  };
}

/**
 * Echte Leads im System (lifetime, ohne Test-Submits). Konstante Referenz
 * für Watershed-Zahl im Report-Footer.
 */
export async function fetchTotalLeads(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("leads")
    .select("email, vorname, nachname");
  if (error) throw new Error(`leads (total): ${error.message}`);
  return (data ?? []).filter(isRealLead).length;
}

/**
 * Kunden mit mindestens einer bestätigten Buchung (lifetime).
 * Primärquelle: lead_application_acceptances (PR #125).
 * Fallback: distinct lead_id in lead_events mit
 *   event_type='application_accepted_internal' — für ältere DB-Stände
 *   in denen die Tabelle nicht existiert.
 *
 * Liefert:
 *   uniqueCustomers — Anzahl distinct Kunden, die mindestens 1× gebucht haben
 *   totalBookings    — Anzahl Buchungs-Vorgänge insgesamt (Re-Buchungen
 *                       desselben Kunden zählen mit)
 */
export async function fetchBookedCustomers(supabase: SupabaseClient): Promise<{
  uniqueCustomers: number;
  totalBookings: number;
}> {
  // Erst: alle Booking-Rows holen (lead_id)
  let bookingLeadIds: string[] = [];
  const { data: accRows, error: accErr } = await supabase
    .from("lead_application_acceptances")
    .select("lead_id");
  if (!accErr && Array.isArray(accRows)) {
    bookingLeadIds = accRows.map((r: any) => r.lead_id);
  } else {
    const { data: evRows, error: evErr } = await supabase
      .from("lead_events")
      .select("lead_id")
      .eq("event_type", "application_accepted_internal");
    if (evErr) {
      console.error("fetchBookedCustomers fallback failed:", evErr.message);
      return { uniqueCustomers: 0, totalBookings: 0 };
    }
    bookingLeadIds = (evRows ?? []).map((r: any) => r.lead_id);
  }

  if (bookingLeadIds.length === 0) {
    return { uniqueCustomers: 0, totalBookings: 0 };
  }

  // Test-Leads ausfiltern: hole zugehörige Lead-Daten + isRealLead-Check.
  const uniqueIds = [...new Set(bookingLeadIds)];
  const { data: leadRows, error: lErr } = await supabase
    .from("leads")
    .select("id, email, vorname, nachname")
    .in("id", uniqueIds);
  if (lErr) {
    console.error("fetchBookedCustomers leads fetch failed:", lErr.message);
    // Fallback: ungefiltert zählen
    return { uniqueCustomers: uniqueIds.length, totalBookings: bookingLeadIds.length };
  }
  const realLeadIds = new Set(
    (leadRows ?? []).filter(isRealLead).map((l: any) => l.id),
  );
  const realBookings = bookingLeadIds.filter((id) => realLeadIds.has(id));
  return { uniqueCustomers: realLeadIds.size, totalBookings: realBookings.length };
}

// ── Mail-Ausfall-Überwachung: der Reminder-Blackout 25.05.–25.06.2026 (207
// stille Fehlschläge, „Buffer is not defined") darf nie wieder unbemerkt bleiben.
export interface MailHealth {
  failed24h: number;
  overduePending: number;              // scheduled_for > 2h überfällig, status pending
  samples: Array<{ type: string; error: string }>;
}

export async function fetchMailHealth(supabase: SupabaseClient): Promise<MailHealth> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const overdueBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const [failedRes, overdueRes] = await Promise.all([
    supabase.from("scheduled_emails")
      .select("email_type,error_message", { count: "exact" })
      .eq("status", "failed").gte("updated_at", since).limit(5),
    supabase.from("scheduled_emails")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending").lt("scheduled_for", overdueBefore),
  ]);

  return {
    failed24h: failedRes.count ?? 0,
    overduePending: overdueRes.count ?? 0,
    samples: (failedRes.data ?? []).map((r) => ({
      type: String(r.email_type ?? "?"),
      error: String(r.error_message ?? "").slice(0, 120),
    })),
  };
}

/**
 * Notizen der SEO-/SEA-Agenten für den Report-Tag (Tabelle
 * daily_report_notes, Migration 20260815090000). Agenten schreiben nach
 * jedem Lauf 1-3 Kernerkenntnisse hinein; der Report nimmt alles seit
 * Tagesbeginn des Report-Tags mit (deckt „gestern" + heutigen Morgenlauf
 * vor Mailversand ab). Fehler wird sichtbar zurückgegeben, nicht
 * verschluckt (Święta zasada 1).
 */
export interface AgentNotes { notes: Array<{ source: string; note: string }>; error?: string }
export async function fetchAgentNotes(supabase: SupabaseClient, sinceIso: string): Promise<AgentNotes> {
  const { data, error } = await supabase
    .from("daily_report_notes")
    .select("source, note, created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) return { notes: [], error: error.message };
  return { notes: (data ?? []).map((r: { source?: string; note?: string }) => ({ source: String(r.source || "?"), note: String(r.note || "") })) };
}

// ─── Google-Ads-Kosten (SEA, 16.08.) ───────────────────────────────────────
// Spend gestern + Perioden-Summe fürs Kosten-je-Stück im Report. Fail-soft:
// jeder Fehler (fehlende Vault-Secrets auf Staging, API-Ausfall) → null,
// die Mail geht IMMER raus — dann ohne Ads-Block.

import {
  adsSearch,
  fetchAdsAccessToken,
  getGoogleAdsSecrets,
} from "../_shared/googleAdsAuth.ts";

export interface AdsSpend {
  yesterday: number; // € am Report-Tag (Berlin-Kalendertag = Konto-Zeitzone)
  period: number;    // € Summe der letzten `periodDays` Tage bis gestern
  periodDays: number;
}

export async function fetchAdsSpend(
  supabase: SupabaseClient,
  periodDays: number,
  daysAgo = 1,
): Promise<AdsSpend | null> {
  try {
    const secrets = await getGoogleAdsSecrets(supabase);
    if (!secrets) {
      console.log("fetchAdsSpend: keine Google-Secrets (Staging?) — Ads-Block entfällt");
      return null;
    }
    const endIso = berlinDayRange(daysAgo).iso;
    const startIso = berlinDayRange(daysAgo + periodDays - 1).iso;
    const token = await fetchAdsAccessToken(secrets);
    const rows = await adsSearch(
      token,
      secrets,
      `SELECT segments.date, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${startIso}' AND '${endIso}'`,
    );
    let period = 0;
    let yesterday = 0;
    for (const r of rows) {
      const cost = Number((r as any)?.metrics?.costMicros ?? 0) / 1e6;
      period += cost;
      if ((r as any)?.segments?.date === endIso) yesterday += cost;
    }
    return { yesterday, period, periodDays };
  } catch (e) {
    console.error("fetchAdsSpend:", e instanceof Error ? e.message : String(e));
    return null;
  }
}
