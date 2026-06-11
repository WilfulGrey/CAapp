import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendEmail,
  getTeamNotificationTemplate,
  buildCustomerCaregiverMailWithInlinePhoto,
  getPatientDataSavedEmailTemplate,
  type CaregiverDisplay,
  type CaregiverMailEvent,
  type OfferInfo,
} from '@/lib/email';
import { buildVertragAttachmentPdf } from '@/lib/vertrag';

// Bridge endpoint: the CA-App portal reports customer milestones back to the
// kostenrechner lead so the Nachfass emails can branch. Token-authenticated —
// the magic-link token (leads.token) is the shared identifier between the
// kostenrechner and the portal.
//
// Side effects:
// - Internal team notification mails for `patient_data_saved` (once per lead)
//   and `caregiver_invited` (every invitation) — PR #106.
// - Customer mails for `caregiver_interest_shown` (Mail A: a caregiver liked
//   the lead in Mamamia) and `application_received` (Mail B: staff sent the
//   formal application document to the customer) — PR #109. Caregiver display
//   info travels in the event `metadata`; no DB dedupe, one mail per event.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ALLOWED_EVENTS = [
  'portal_opened',
  'patient_data_saved',
  'caregiver_invited',
  'caregiver_interest_shown',
  'caregiver_declined',          // Kunde hat eine Pflegekraft abgelehnt (matching ODER interest)
  'caregiver_declined_undone',   // Kunde hat die Ablehnung rückgängig gemacht
  'application_received',
  // PR #123: customer confirmed acceptance via AngebotPruefenModal step 2.
  // MVP path — Mamamia NOT notified, Primundus team gets a notification
  // email with the contract form data and handles contract paperwork
  // manually. Acceptance row persisted in lead_application_acceptances.
  'application_accepted_internal',
  'application_rejected',        // Kunde hat eine Bewerbung abgelehnt
];
const TEAM_NOTIFY_EVENTS = [
  'patient_data_saved',
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
  'application_accepted_internal',
];
// Events, die in der Team-Mail einen Pflegekraft-Namen anzeigen sollen.
// Liest caregiver_name aus dem Event-Metadata und steckt ihn als
// additionalData in getTeamNotificationTemplate.
const TEAM_NOTIFY_CAREGIVER_EVENTS = new Set([
  'caregiver_invited',
  'caregiver_interest_shown',
  'application_received',
]);
const TEAM_NOTIFY_RECIPIENT = 'info@primundus.de';
// Events, die KEINEN DB-Dedupe verwenden — pro Auftreten ein Eintrag und
// (falls eine Mail dranhängt) eine Mail. Mehrere Pflegekräfte können Interesse
// zeigen, mehrere Bewerbungen können auf einen Lead landen.
const NON_DEDUPED_EVENTS = new Set([
  'caregiver_invited',
  'caregiver_interest_shown',
  'caregiver_declined',
  'caregiver_declined_undone',
  'application_received',
  'application_rejected',
]);
// Customer-facing Mails (an die Lead-Email) je Event. Trigger sind die neuen
// Caregiver-Lifecycle-Events; das eigentliche Hooking aus Mamamia kommt
// separat — der Endpoint nimmt die Events bereits entgegen.
const CUSTOMER_MAIL_EVENTS = new Set([
  'patient_data_saved',          // Mail D — Pflegedaten erfasst, Action-CTA "Pflegekräfte einladen"
  'caregiver_interest_shown',    // Mail A
  'application_received',        // Mail B
  'application_accepted_internal', // Mail C
]);

function extractCaregiverDisplay(metadata: any): CaregiverDisplay | null {
  if (!metadata || typeof metadata !== 'object') return null;
  // Accept both snake_case (matches CA-app `reportLeadEvent` payload) and
  // camelCase keys (matches existing CaregiverDisplay type) — defensive
  // because the caller (Mamamia hook, CA-app, manual test) might vary.
  const name = metadata.caregiver_name ?? metadata.caregiverName;
  if (!name || typeof name !== 'string' || !name.trim()) return null;
  return {
    name: name.trim(),
    badgeLevel: metadata.caregiver_badge_level ?? metadata.badgeLevel,
    yearsExperience: metadata.caregiver_years_experience ?? metadata.yearsExperience,
    einsatzCount: metadata.caregiver_einsatz_count ?? metadata.einsatzCount,
    age: metadata.caregiver_age ?? metadata.age,
    germanLevel: metadata.caregiver_german_level ?? metadata.germanLevel,
    photoUrl: metadata.caregiver_photo_url ?? metadata.photoUrl,
    aboutText: metadata.caregiver_about_text ?? metadata.aboutText,
  };
}

// Konditionen einer Bewerbung aus der Event-Metadata (von
// detect-caregiver-events gesetzt). Nur für application_received relevant —
// fehlt bei Interesse/Buchung, dann undefined.
function extractOffer(metadata: any): OfferInfo | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const salary = metadata.offer_salary ?? metadata.offerSalary;
  const arrivalAt = metadata.offer_arrival_at ?? metadata.offerArrivalAt;
  const departureAt = metadata.offer_departure_at ?? metadata.offerDepartureAt;
  const arrivalFee = metadata.offer_arrival_fee ?? metadata.offerArrivalFee;
  const departureFee = metadata.offer_departure_fee ?? metadata.offerDepartureFee;
  if (salary == null && arrivalAt == null && departureAt == null && arrivalFee == null && departureFee == null) {
    return undefined;
  }
  return {
    salary: salary ?? null,
    arrivalAt: arrivalAt ?? null,
    departureAt: departureAt ?? null,
    arrivalFee: arrivalFee ?? null,
    departureFee: departureFee ?? null,
  };
}

function buildPortalUrl(lead: { token?: string | null }): string {
  const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL || '';
  if (!portalBase || !lead.token) return '';
  return `${portalBase.replace(/\/$/, '')}/?token=${encodeURIComponent(lead.token)}`;
}

// Plant Reaktions-Reminder nach dem ursprünglichen caregiver_interest_shown
// bzw. application_received-Event. Pflegekraft-Metadata wird mitgespeichert,
// damit die Edge Function beim Versand die richtige Mail bauen kann.
//
// caregiver_interest_shown → 1 Reminder nach 1h (interest_reminder).
// application_received → 4 Reminder im Crescendo:
//   1h  (application_reminder)        sanft, "schon einen Blick werfen können?"
//   4h  (application_reminder_4h)     dringender, "Pflegekraft prüft andere Anfragen"
//   12h (application_reminder_12h)    dringendster, "wahrscheinlich nicht mehr verfügbar"
//   46h (application_last_chance)     letzte Erinnerung vor dem 48h-Auto-Reject
// Alle 3 tragen identische Cancel-Logik (siehe Edge Function): sobald der
// Kunde reagiert hat (accept/reject) ODER der Lead beauftragt/nicht
// interessiert ist, cancelt sich der jeweilige Reminder beim nächsten Tick.
const REMINDER_DELAY_INTEREST_MIN = 60;
const REMINDER_DELAYS_APPLICATION_MIN: { emailType: string; delay: number }[] = [
  { emailType: 'application_reminder',     delay: 60 },
  { emailType: 'application_reminder_4h',  delay: 4 * 60 },
  { emailType: 'application_reminder_12h', delay: 12 * 60 },
  // 46h — "letzte Chance"-Mail, ~2h vor dem 48h-Auto-Reject (separater
  // Cron in detect-caregiver-events). Kündigt das automatische Schließen
  // an und bittet um Reaktion.
  { emailType: 'application_last_chance',  delay: 46 * 60 },
];

async function scheduleReactionReminder(
  supabaseAdmin: any,
  leadId: string,
  recipientEmail: string,
  triggerEvent: 'caregiver_interest_shown' | 'application_received',
  caregiver: CaregiverDisplay,
  caregiverId: number | string | undefined,
): Promise<void> {
  // Pflegekraft-Snapshot für den Mail-Build beim Versand. Photo-URL ist
  // eine presigned S3-URL mit 30 Min Gültigkeit — beim 1h/4h/12h-Reminder
  // also bereits abgelaufen. Edge Function versucht trotzdem einen Inline-
  // Fetch und fällt sauber auf Initialen-Avatar zurück wenn S3 mit 403
  // antwortet (PR #142/#148-Pattern).
  const metadata = {
    caregiver_id: caregiverId,
    caregiver_name: caregiver.name,
    caregiver_badge_level: caregiver.badgeLevel ?? null,
    caregiver_years_experience: caregiver.yearsExperience ?? null,
    caregiver_einsatz_count: caregiver.einsatzCount ?? null,
    caregiver_age: caregiver.age ?? null,
    caregiver_german_level: caregiver.germanLevel ?? null,
    caregiver_photo_url: caregiver.photoUrl ?? null,
    caregiver_about_text: caregiver.aboutText ?? null,
    trigger_event: triggerEvent,
  };

  const tiers = triggerEvent === 'caregiver_interest_shown'
    ? [{ emailType: 'interest_reminder', delay: REMINDER_DELAY_INTEREST_MIN }]
    : REMINDER_DELAYS_APPLICATION_MIN;

  for (const { emailType, delay } of tiers) {
    const scheduledFor = new Date(Date.now() + delay * 60 * 1000).toISOString();
    try {
      await supabaseAdmin.from('scheduled_emails').insert({
        lead_id: leadId,
        email_type: emailType,
        recipient_email: recipientEmail,
        scheduled_for: scheduledFor,
        status: 'pending',
        metadata,
      });
    } catch (e) {
      // Fire-and-forget — falls das Scheduling fehlschlägt, sollen weder
      // die ursprüngliche Mail (A/B) noch die anderen Tiers blockiert sein.
      console.error(`scheduleReactionReminder ${emailType} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/lead-event?token=<magic-link-token>&types=caregiver_interest_shown,caregiver_declined
//
// Liefert lead_events für einen token-authenticated Lead. Wird vom Portal
// auf Mount aufgerufen um Interest-Origin + bearbeitete Interests aus
// der Historie zu rehydraten (überlebt F5, cross-device).
//
// Erlaubte Event-Typen werden auf die "öffentlichen" beschränkt — keine
// internen Tracking-Events (email_*_sent etc.) ausgeben.
const GET_PUBLIC_EVENT_TYPES = new Set([
  'caregiver_interest_shown',
  'caregiver_invited',
  'caregiver_declined',
  'caregiver_declined_undone',
  'application_received',
  'application_accepted_internal',
  'application_rejected',
]);

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    const typesParam = request.nextUrl.searchParams.get('types') ?? '';
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('token', token)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404, headers: corsHeaders });
    }

    const requestedTypes = typesParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => GET_PUBLIC_EVENT_TYPES.has(s));
    const types = requestedTypes.length > 0 ? requestedTypes : Array.from(GET_PUBLIC_EVENT_TYPES);

    const { data: events, error } = await supabase
      .from('lead_events')
      .select('id, event_type, metadata, created_at')
      .eq('lead_id', lead.id)
      .in('event_type', types)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }
    return NextResponse.json({ events: events ?? [] }, { headers: corsHeaders });
  } catch (e) {
    console.error('lead-event GET error:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: corsHeaders });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { token, event, metadata } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'invalid event' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Load the full lead row — needed for the team notification template (was
    // just `id` before, but the team mail uses kalkulation, contact data, etc.).
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: 'lead not found' }, { status: 404, headers: corsHeaders });
    }

    // Phone sync: when the portal saves the patient form, it ships the
    // current phone in metadata.phone. We mirror it to leads.telefon so
    // the team-notification template + any later admin lookup see the
    // value the customer most recently entered (Mamamia Customer.phone is
    // the source of truth but leads.telefon is what kostenrechner-side
    // code reads). Runs even on dedupe-suppressed events so a re-save
    // with an edited number still propagates.
    if (
      event === 'patient_data_saved' &&
      metadata &&
      typeof metadata === 'object' &&
      typeof metadata.phone === 'string'
    ) {
      const newPhone = metadata.phone.trim();
      if (newPhone && newPhone !== lead.telefon) {
        const { error: updateErr } = await supabase
          .from('leads')
          .update({ telefon: newPhone })
          .eq('id', lead.id);
        if (updateErr) {
          console.error('leads.telefon update failed:', updateErr.message);
        } else {
          lead.telefon = newPhone;
        }
      }
    }

    // Name-Sync: analog zu phone — wenn der Patientenbogen einen Namen
    // mitgegeben hat (seit dem Name-im-Patientenbogen-Update Pflichtfeld
    // dort), zurück nach leads.vorname/nachname schreiben. Dadurch greifen
    // die Anreden in den späteren Mails (Buchungsbestätigung, Nachfass)
    // auch für Kunden, die im Kostenrechner-Kontaktformular keinen Namen
    // eingegeben hatten.
    if (
      event === 'patient_data_saved' &&
      metadata &&
      typeof metadata === 'object'
    ) {
      const m = metadata as Record<string, unknown>;
      const newVorname = typeof m.vorname === 'string' ? m.vorname.trim() : '';
      const newNachname = typeof m.nachname === 'string' ? m.nachname.trim() : '';
      const patch: { vorname?: string; nachname?: string } = {};
      if (newVorname && newVorname !== lead.vorname) patch.vorname = newVorname;
      if (newNachname && newNachname !== lead.nachname) patch.nachname = newNachname;
      if (Object.keys(patch).length > 0) {
        const { error: nameErr } = await supabase
          .from('leads')
          .update(patch)
          .eq('id', lead.id);
        if (nameErr) {
          console.error('leads.vorname/nachname update failed:', nameErr.message);
        } else {
          if (patch.vorname) lead.vorname = patch.vorname;
          if (patch.nachname) lead.nachname = patch.nachname;
        }
      }
    }

    // Team-Only-Resend-Modus: wenn metadata.team_only_resend === true,
    // dann wird KEIN DB-Update gemacht und KEINE Kunden-Mail verschickt —
    // nur die Team-Mail (mit Vertrags-PDF-Anhang, sofern Daten passen)
    // wird neu gesendet. Use-Case: Vertrag wurde mit HTML-Anhang versendet
    // (alter Bug, gefixt 11.06.2026) und das Team braucht nachträglich
    // die PDF-Version, ohne den Kunden erneut zu benachrichtigen.
    const teamOnlyResend = !!(metadata && typeof metadata === 'object'
      && (metadata as Record<string, unknown>).team_only_resend === true);

    // Acceptance persistence (application_accepted_internal): UPSERT a
    // dedicated row in lead_application_acceptances with the full contract
    // form data. Idempotent on (lead_id, application_id) — re-clicking
    // "Akzeptieren" doesn't duplicate. Frontend queries this table via
    // mamamia-proxy.listAcceptedApplications on portal load to flip the
    // matching app's status to 'accepted' → BookedScreen renders.
    if (!teamOnlyResend && event === 'application_accepted_internal' && metadata && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      const rawAppId = m.application_id;
      const appId = typeof rawAppId === 'number' ? rawAppId : Number(rawAppId);
      if (Number.isFinite(appId)) {
        const rawCaregiverId = m.caregiver_id;
        const caregiverId = typeof rawCaregiverId === 'number'
          ? rawCaregiverId
          : (typeof rawCaregiverId === 'string' && rawCaregiverId
              ? Number(rawCaregiverId)
              : null);
        const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || request.headers.get('x-real-ip')
          || null;
        // Kern-Upsert (kritisch für die Buchungs-Persistenz / BookedScreen).
        const { error: accErr } = await supabase
          .from('lead_application_acceptances')
          .upsert({
            lead_id: lead.id,
            application_id: appId,
            caregiver_id: typeof caregiverId === 'number' && Number.isFinite(caregiverId) ? caregiverId : null,
            contract_patient: m.contract_patient ?? {},
            contract_contact: m.contract_contact ?? {},
          }, { onConflict: 'lead_id,application_id' });
        if (accErr) {
          console.error('lead_application_acceptances upsert failed:', accErr.message);
        }
        // Stufe B: Signatur-Audit + Vertrags-Snapshot SEPARAT + best-effort.
        // Entkoppelt von der Kern-Persistenz, damit eine noch nicht angewendete
        // Migration (Signatur-Spalten fehlen) die Buchung nicht bricht.
        const { error: sigErr } = await supabase
          .from('lead_application_acceptances')
          .update({
            signatur: typeof m.signatur === 'string' ? m.signatur : null,
            signed_at: new Date().toISOString(),
            signed_ip: clientIp,
            contract_snapshot: m.contract ?? null,
          })
          .eq('lead_id', lead.id)
          .eq('application_id', appId);
        if (sigErr) {
          console.warn('signature audit update skipped (Migration noch nicht angewendet?):', sigErr.message);
        }
      } else {
        console.warn('application_accepted_internal: missing/invalid application_id in metadata');
      }
    }

    // Dedupe rule per event:
    // - portal_opened / patient_data_saved → milestone (only first matters
    //   for Nachfass branching). Skip if already recorded.
    // - caregiver_invited / caregiver_interest_shown / application_received →
    //   multiple events per lead expected (different caregivers, mehrere
    //   Bewerbungen); insert every time so one mail goes per event.
    const isDeduped = !NON_DEDUPED_EVENTS.has(event);
    let isFirstOccurrence = true;
    if (isDeduped) {
      const { data: existing } = await supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', event)
        .limit(1);
      isFirstOccurrence = !existing || existing.length === 0;
    }

    if (!isDeduped || isFirstOccurrence) {
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: event,
        metadata: metadata && typeof metadata === 'object'
          ? { source: 'caapp', ...metadata }
          : { source: 'caapp' },
      });
    }

    // Vertrags-Anhang (Stufe B): beim Buchen aus dem Vertrags-Snapshot +
    // elektronischer Signatur ein vollständiges Vertragsdokument als PDF
    // rendern (Headless Chrome) und an Kunde (Mail C) + Team anhängen.
    // Best-effort — fehlen die Daten oder schlägt das Rendern fehl, fällt
    // `buildVertragAttachmentPdf` intern auf HTML-Anhang zurück damit die
    // Mail überhaupt einen Vertrag mitbringt; ohne Anhang würde der Kunde
    // mit "Buchung bestätigt" ohne Dokument dastehen.
    let contractAttachment: { filename: string; content: Buffer | string; contentType: string } | null = null;
    if (event === 'application_accepted_internal' && metadata && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      if (m.contract && typeof m.contract === 'object' && typeof m.signatur === 'string' && m.signatur.trim()) {
        try {
          contractAttachment = await buildVertragAttachmentPdf(m.contract as any, {
            signaturName: m.signatur as string,
            signedAt: typeof m.signed_at === 'string' ? (m.signed_at as string) : undefined,
            auditNote: 'Vertragsversion v1.0',
          });
        } catch (e) {
          console.error('buildVertragAttachmentPdf failed:', e instanceof Error ? e.message : String(e));
        }
      }
    }

    // Team notification (fire-and-forget — never blocks the response).
    // - patient_data_saved → einmal pro Lead (Milestone, deduped)
    // - caregiver_invited / caregiver_interest_shown / application_received →
    //   pro Event eine Mail (kein DB-Dedupe), jede mit Pflegekraft-Name.
    const shouldNotifyTeam =
      TEAM_NOTIFY_EVENTS.includes(event) &&
      (!isDeduped || isFirstOccurrence);

    if (shouldNotifyTeam) {
      const additionalData: Record<string, unknown> | undefined =
        TEAM_NOTIFY_CAREGIVER_EVENTS.has(event) && metadata && typeof metadata === 'object'
          ? { caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '' }
          : (event === 'application_accepted_internal' && metadata && typeof metadata === 'object'
              ? {
                  caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '',
                  caregiverId: metadata.caregiver_id ?? null,
                  applicationId: metadata.application_id ?? null,
                  contractPatient: metadata.contract_patient ?? null,
                  contractContact: metadata.contract_contact ?? null,
                }
              : undefined);
      const teamTemplate = getTeamNotificationTemplate(lead as any, event, additionalData as any);
      sendEmail(TEAM_NOTIFY_RECIPIENT, teamTemplate, contractAttachment ? [contractAttachment] : undefined).catch((e) =>
        console.error('team notify send threw:', e instanceof Error ? e.message : String(e)),
      );
    }

    // Customer-facing mail (Mail A / Mail B / Mail C — Buchung bestätigt).
    // Fire-and-forget — Mamamia-Hooks / Portal-Trigger dürfen niemals durch
    // eine Mail-Latenz blockiert werden. Bei fehlenden Pflegekraft-Daten
    // loggen wir und überspringen die Mail — der lead_event wird trotzdem
    // aufgezeichnet.
    // Im Team-Only-Resend-Modus wird die Kunden-Mail komplett übersprungen.
    if (!teamOnlyResend && CUSTOMER_MAIL_EVENTS.has(event)) {
      // patient_data_saved ist deduped (NON_DEDUPED_EVENTS enthält nur die
      // Caregiver-Events) — Mail nur beim ersten Speichern verschicken,
      // sonst spammen wir den Kunden bei jedem Patientendaten-Update.
      const shouldSendCustomerMail = !isDeduped || isFirstOccurrence;

      // Abmeldung (Abmelde-Link, Art. 21 DSGVO): keine automatisierten
      // Kundenmails mehr. Ausnahme: Mail C (application_accepted_internal /
      // Buchungsbestätigung) — der Kunde hat die Buchung gerade aktiv im
      // Portal ausgelöst, die Bestätigung ist transaktional.
      let unsubscribed = false;
      if (event !== 'application_accepted_internal') {
        const { data: unsubEvt } = await supabase
          .from('lead_events')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('event_type', 'email_unsubscribed')
          .limit(1);
        unsubscribed = Array.isArray(unsubEvt) && unsubEvt.length > 0;
      }

      if (!shouldSendCustomerMail) {
        console.log(`lead-event ${event}: dedupe — Customer-Mail skipped (lead ${lead.id})`);
      } else if (unsubscribed) {
        console.log(`lead-event ${event}: lead unsubscribed — Customer-Mail skipped (lead ${lead.id})`);
      } else if (!lead.email) {
        console.warn(`lead-event ${event}: lead has no email — mail skipped (lead ${lead.id})`);
      } else if (event === 'patient_data_saved') {
        // Mail D — kein Caregiver involviert, einfacher Action-CTA in
        // Richtung "Pflegekräfte ansehen + einladen".
        const portalUrl = buildPortalUrl(lead as any);
        const template = getPatientDataSavedEmailTemplate(lead as any, portalUrl);
        sendEmail((lead as any).email, template).catch((e) =>
          console.error('customer mail send threw:', e instanceof Error ? e.message : String(e)),
        );
      } else {
        // Caregiver-Event-Mails (A/B/C) — Foto inline einbetten (CID) —
        // presigned S3-URLs laufen nach 30 Min ab, daher nicht zuverlässig
        // direkt im HTML referenzierbar.
        const caregiver = extractCaregiverDisplay(metadata);
        if (!caregiver) {
          console.warn(`lead-event ${event}: caregiver display data missing in metadata — mail skipped (lead ${lead.id})`);
        } else {
          const portalUrl = buildPortalUrl(lead as any);
          const caregiverIdRaw = metadata?.caregiver_id ?? metadata?.caregiverId;
          const offer = extractOffer(metadata);
          buildCustomerCaregiverMailWithInlinePhoto(
            event as CaregiverMailEvent,
            lead as any,
            caregiver,
            portalUrl,
            offer,
          )
            .then(({ template, attachments }) =>
              // Mail C (Buchungsbestätigung): Vertrag-HTML zusätzlich anhängen.
              sendEmail(
                (lead as any).email,
                template,
                contractAttachment ? [...(attachments ?? []), contractAttachment] : attachments,
              ),
            )
            .then((result) => {
              // Reaktions-Reminder schedulen — 1h nach Mail A/B, falls
              // der Kunde bis dahin keine Reaktion (positiv ODER negativ)
              // gezeigt hat. Nur für die zwei zeitkritischen Events, nicht
              // für application_accepted_internal (= Endpunkt der Kette).
              if (
                result?.success &&
                (event === 'caregiver_interest_shown' || event === 'application_received')
              ) {
                scheduleReactionReminder(
                  supabase,
                  lead.id,
                  (lead as any).email,
                  event,
                  caregiver,
                  caregiverIdRaw,
                );
              }
            })
            .catch((e) =>
              console.error('customer mail send threw:', e instanceof Error ? e.message : String(e)),
            );
        }
      }
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('lead-event error:', error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: corsHeaders });
  }
}
