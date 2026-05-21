// SQL-Helper für den daily-analytics-report. Alle Queries laufen auf den
// Tabellen analytics_sessions / analytics_events / leads / lead_events.
// Zeitraum wird via Berlin-Tagesgrenzen berechnet (Helper unten).

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

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
  wizardCompleted: number;     // Leads angelegt (= Step 10 erfolgreich submitted)
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
  for (const e of events ?? []) {
    const ev = e as any;
    if (ev.event_name === "step_view") {
      startedSessions.add(ev.session_id);
      const step: unknown = ev.event_data?.step;
      if (typeof step === "number") {
        (stepViewSessions[step] ??= new Set()).add(ev.session_id);
      }
    }
  }
  for (let n = 1; n <= 10; n++) {
    funnelStepViewed[n] = stepViewSessions[n]?.size ?? 0;
  }
  const wizardStarted = startedSessions.size;

  // 3) Wizard abgeschlossen = Leads angelegt im Zeitraum.
  // Test-Leads (m.kepinski+test*@mamamia.app, *example.com, etc.)
  // werden über isRealLead() rausgefiltert, damit interne QA die
  // echten Conversion-Zahlen nicht verfälscht.
  const { data: leadsInPeriod, error: lErr } = await supabase
    .from("leads")
    .select("id, email, vorname, nachname")
    .gte("created_at", start)
    .lt("created_at", end);
  if (lErr) throw new Error(`leads: ${lErr.message}`);
  const wizardCompleted = (leadsInPeriod ?? []).filter(isRealLead).length;

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
