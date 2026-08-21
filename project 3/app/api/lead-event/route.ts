import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  sendEmail,
  getTeamNotificationTemplate,
  buildCustomerCaregiverMailWithInlinePhoto,
  getPatientDataSavedEmailTemplate,
  getOfferUpdatedEmailTemplate,
  type CaregiverDisplay,
  type CaregiverMailEvent,
  type EmailTemplate,
  type OfferInfo,
} from '@/lib/email';
import { buildVertragAttachmentPdf, formatSignedAtBerlin } from '@/lib/vertrag';
import { appendJobParam } from '@/lib/portal-url';
import { sendezeitIso } from '@/lib/quiet-hours';
import { createHash } from 'crypto';

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
  // Patientenbogen-Diagnose (2026-07-08): Schritt erreicht + Save-Fehler —
  // reine Analyse-Events, KEINE Team-Mail/Nachfass-Verzweigung.
  'patient_form_step',
  'patient_form_save_failed',
  // Einsatzort eingegeben, aber nicht auf einen Mamamia-location_id auflösbar
  // (z. B. österreichische PLZ) — Analyse-Event fürs Team, KEINE Mail.
  'patient_form_location_unresolved',
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
  // Angebots-Anpassung (2026-07-15): der Berater hat preisrelevante Kundendaten
  // korrigiert und die Lead-Kalkulation wurde neu geschrieben (direkter
  // Service-Key-Write aus dem SA-Portal — bewusst NICHT über diesen Endpoint,
  // Token liegt beim Kunden). Event = Audit-Trail + optionale Kundenmail
  // (notify:false → nur Aufzeichnung, keine Mail).
  'offer_updated',
  // Rückmeldung des Kunden zum Angebot (12.08.2026): EIN Tap im Portal —
  // „Passt so nicht" / „Noch nicht so weit" / „Wir wollen loslegen", dazu ein
  // optionales Detail (Grund bzw. Zeitpunkt) aus der Rückfrage. Reines
  // Analyse-/Team-Signal, KEINE Kundenmail und KEINE automatische
  // Statusänderung: „zu teuer" ist ein Berater-Fall (Angebots-Anpassung),
  // kein Abschied, und ein automatischer Sende-Stopp aus einem einzelnen Tap
  // wäre zu grob. NON_DEDUPED, weil die Antwort zweimal kommt (Tap, dann
  // Detail) und sich bei einem späteren Besuch ändern darf.
  'angebots_feedback',
  // Alarm-Policy (2026-07-21): Buchung unterschrieben, aber Mamamia-Sync
  // unvollständig (z.B. Bewerbung von der Agentur zurückgezogen ⇒
  // StoreConfirmation dauerhaft abgelehnt). Gesendet vom
  // detect-caregiver-events-Cron; TEAM-MAIL-ONLY — nie in
  // GET_PUBLIC_EVENT_TYPES, keine Kundenmail. Audit-Row in lead_events.
  'acceptance_sync_alarm',
];
const TEAM_NOTIFY_EVENTS = [
  'patient_data_saved',
  // Martin, 12.08.2026: „ich will immer eine Antwort erhalten" — also bei
  // JEDER Rückmeldung eine Team-Mail, nicht nur bei „zu teuer". Das Portal
  // schickt den ersten Tap mit `notify: false` (stille Aufzeichnung als
  // Netz, falls der Kunde abbricht) und die endgültige Antwort normal —
  // sonst kämen zwei Mails pro Kunde.
  'angebots_feedback',
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
// Version des Vertragstextes — gepinnt in der Acceptance-Row. Der §§-Text lebt
// im Code (lib/vertrag.ts); ohne Version würden alte Verträge nach einer
// Textänderung mit NEUEM Wortlaut re-rendern. Bump NUR mit bewusster
// Textänderung (alten Text dann als eingefrorene Version behalten).
const CONTRACT_VERSION = 'v1.2';
// Zusätzliche BCC-Empfänger NUR für die Accept-/Buchungs-Team-Mail
// (application_accepted_internal). Andere Team-Notifications behalten den
// Default-BCC (SMTP_BCC = info@primundus.de,info@mamamia.app). Kommasepariert.
const ACCEPT_TEAM_NOTIFY_EXTRA_BCC =
  'm.kepinski@mamamia.app,marta.kapcio@vitanas.pl,kamila.bilska-wabik@vitanas.pl';
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
  'offer_updated',               // Preis kann mehrfach angepasst werden
  'acceptance_sync_alarm',       // jeder Alarm-Versuch wird aufgezeichnet
  'angebots_feedback',           // Tap + Detail = zwei Einträge; darf sich später ändern
]);
// Customer-facing Mails (an die Lead-Email) je Event. Trigger sind die neuen
// Caregiver-Lifecycle-Events; das eigentliche Hooking aus Mamamia kommt
// separat — der Endpoint nimmt die Events bereits entgegen.
const CUSTOMER_MAIL_EVENTS = new Set([
  'patient_data_saved',          // Mail D — Pflegedaten erfasst, Action-CTA "Pflegekräfte einladen"
  'caregiver_interest_shown',    // Mail A
  'application_received',        // Mail B
  'application_accepted_internal', // Mail C
  'offer_updated',               // Aktualisiertes Angebot (alt → neu Preis)
]);

// Transaktionale Mails, die den Abmelde-Status ignorieren: der Kunde hat die
// Aktion selbst ausgelöst (Buchung) bzw. muss sie zwingend erfahren
// (Preisänderung seines Angebots) — das ist keine Werbe-/Nurture-Mail.
const TRANSACTIONAL_MAIL_EVENTS = new Set([
  'application_accepted_internal',
  'offer_updated',
]);

// ─── Acceptance-Sync-Alarm (2026-07-21) ────────────────────────────────────
// "Nie możemy mieć sytuacji, gdzie klient myśli że zlecenie jest obstawione,
// a nie jest" (Michał). Zwei Auslöser, EIN Mail-Kanal (Team):
//   a) T+0: der synchrone sync-acceptance-Call meldet einen PERMANENTEN
//      StoreConfirmation-Fehler (Mamamia lehnt deterministisch ab, z.B.
//      Bewerbung von der Agentur zurückgezogen) → Alarm sofort aus der Bridge.
//   b) Cron: Row nach Retry weiter unbestätigt und >5 Min alt (bzw. PDF >24h)
//      → Cron POSTet Event acceptance_sync_alarm hierher; die Mail ist die
//      Antwort-Bedingung (Fehler ⇒ 502 ⇒ Cron stempelt nicht ⇒ Re-Alarm).

interface AcceptanceAlarmInfo {
  application_id: number | string;
  caregiver_id?: number | string | null;
  caregiver_name?: string | null;
  confirmed: boolean;
  pdf_uploaded: boolean;
  permanent: boolean;
  error?: string | null;
  age_minutes?: number | null;
  source: 'bridge' | 'cron' | 'sync-retry' | string;
}

function buildAcceptanceSyncAlarmTemplate(lead: any, info: AcceptanceAlarmInfo): EmailTemplate {
  const kunde = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || lead.id;
  const confirmCase = !info.confirmed;
  const subject = confirmCase
    ? `🚨 ALARM: Buchung OHNE Mamamia-Bestätigung — ${kunde} (Bewerbung ${info.application_id})`
    : `⚠️ ALARM: Vertrags-PDF fehlt in Mamamia — ${kunde} (Bewerbung ${info.application_id})`;

  const lage = confirmCase
    ? 'Der Kunde hat die Buchung im Portal abgeschlossen (Unterschrift + Bestätigungsseite), aber in Mamamia existiert KEINE verbindliche Confirmation für diese Bewerbung. Der Kunde glaubt an eine Buchung, die aktuell nicht besteht.'
    : 'Die Buchung ist in Mamamia bestätigt, aber der signierte Vertrag (PDF) konnte seit über 24 Stunden nicht hochgeladen werden. Kein unmittelbares Kundenrisiko — das Vertragsarchiv in Mamamia ist aber unvollständig.';
  const ursache = confirmCase
    ? (info.permanent
        ? 'Mamamia hat den Akzept DAUERHAFT abgelehnt — wahrscheinlichste Ursache: die Bewerbung wurde von der Agentur zurückgezogen oder existiert nicht mehr. Automatische Wiederholungen ändern daran nichts.'
        : 'Der automatische Sync schlägt bisher fehl (transienter Fehler). Weitere automatische Versuche laufen alle 15 Minuten weiter — dieser Alarm kommt trotzdem, damit niemand auf den Automatismus wartet.')
    : 'Der Upload-Schritt (StoreFile/UpdateConfirmation bzw. das PDF-Rendering) schlägt wiederholt fehl — Details in den Supabase-Logs (sync-acceptance / detect-caregiver-events).';
  const schritte = confirmCase
    ? [
        'SA-Portal → Kunde → Bewerbung öffnen: existiert sie noch, welcher Status?',
        'Bewerbung zurückgezogen/weg: Kunden SOFORT kontaktieren — er wartet auf eine Pflegekraft, die nicht kommt.',
        'Bewerbung in Ordnung: Annahme manuell im SA-Portal durchführen.',
      ]
    : [
        'Supabase-Logs (sync-acceptance / detect-caregiver-events) prüfen.',
        'Notfalls Vertrag aus der Buchungs-Team-Mail manuell in Mamamia hochladen.',
      ];

  const daten: Array<[string, string]> = [
    ['Kunde', String(kunde)],
    ['E-Mail', String(lead.email ?? '—')],
    ['Telefon', String(lead.telefon ?? '—')],
    ['Lead-ID', String(lead.id)],
    ['Bewerbung (application_id)', String(info.application_id)],
    ['Pflegekraft', [info.caregiver_name, info.caregiver_id != null ? `(ID ${info.caregiver_id})` : null].filter(Boolean).join(' ') || '—'],
    ['Mamamia-Fehler', info.error || '—'],
    ['Alter der Buchung', info.age_minutes != null ? `${info.age_minutes} Min` : '—'],
    ['Alarm-Quelle', info.source === 'bridge' ? 'sofort (synchroner Sync)' : 'Cron (detect-caregiver-events)'],
  ];

  const text = [
    subject,
    '',
    lage,
    '',
    ursache,
    '',
    'Daten:',
    ...daten.map(([k, v]) => `- ${k}: ${v}`),
    '',
    'Bitte SOFORT prüfen:',
    ...schritte.map((s, i) => `${i + 1}. ${s}`),
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <div style="background-color: ${confirmCase ? '#dc2626' : '#d97706'}; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${subject}</h2>
      </div>
      <div style="border: 2px solid ${confirmCase ? '#dc2626' : '#d97706'}; border-top: none; border-radius: 0 0 8px 8px; padding: 20px;">
        <p style="margin-top: 0;"><strong>${lage}</strong></p>
        <p>${ursache}</p>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          ${daten.map(([k, v]) => `<tr><td style="padding: 4px 8px; border: 1px solid #e5e7eb; background: #f9fafb; white-space: nowrap;">${k}</td><td style="padding: 4px 8px; border: 1px solid #e5e7eb;">${v}</td></tr>`).join('')}
        </table>
        <p style="margin-bottom: 4px;"><strong>Bitte SOFORT prüfen:</strong></p>
        <ol style="margin-top: 4px;">
          ${schritte.map((s) => `<li>${s}</li>`).join('')}
        </ol>
      </div>
    </div>
  `;

  return { subject, html, text };
}

// Mail + (bei Erfolg) Alarm-Stempel + Audit-Row. Mail-Fehler ⇒ {ok:false,
// error} und KEIN Stempel — der Cron re-alarmiert beim nächsten Lauf. Der
// Fehlertext wandert in die 502-Antwort (Diagnose ohne Render-Log-Zugriff).
async function raiseAcceptanceSyncAlarm(
  supabase: any,
  lead: any,
  info: AcceptanceAlarmInfo,
): Promise<{ ok: boolean; error?: string }> {
  const template = buildAcceptanceSyncAlarmTemplate(lead, info);
  const res = await sendEmail(TEAM_NOTIFY_RECIPIENT, template, undefined, {
    extraBcc: ACCEPT_TEAM_NOTIFY_EXTRA_BCC,
  });
  if (!res.success) {
    console.error(`acceptance alarm mail failed (lead=${lead.id}, app=${info.application_id}):`, res.error);
    return { ok: false, error: res.error };
  }
  const appIdNum = Number(info.application_id);
  if (Number.isFinite(appIdNum)) {
    const { error: stampErr } = await supabase
      .from('lead_application_acceptances')
      .update({ mamamia_sync_alerted_at: new Date().toISOString() })
      .eq('lead_id', lead.id)
      .eq('application_id', appIdNum);
    if (stampErr) console.error('mamamia_sync_alerted_at stamp failed:', stampErr.message);
  }
  return { ok: true };
}

// ─── EIN kanonischer Vertrags-PDF (Michał 2026-07-21) ──────────────────────
// „Generować 1 PDF, wysyłać go do klienta, do nas i na serwer. 1 i ten sam,
// niezmieniany plik." — Der Vertrag wird GENAU EINMAL gerendert (beim Akzept),
// als Bytes im Storage-Bucket `contracts/<lead>/<app>.pdf` abgelegt und von
// dort überall identisch verwendet: Mail C (Kunde), Team-Mail, Mamamia-Upload
// (sync-acceptance/Cron) und Portal-Vertragskasten (/api/contract-pdf).
// Zeitstempel auf dem Dokument = Server-Moment der Unterschrift (signed_at)
// in Europe/Berlin — nie Browser-Label, nie Render-Zeit, nie UTC.
const CONTRACT_BUCKET = 'contracts';
const CONTRACT_FILENAME = 'Betreuungsvertrag_Primundus.pdf';

function contractObjectPath(leadId: string, applicationId: number): string {
  return `${leadId}/${applicationId}.pdf`;
}

type ContractAttachment = { filename: string; content: Buffer | string; contentType: string };

async function downloadCanonicalContractPdf(
  supabase: any,
  leadId: string,
  applicationId: number,
): Promise<Buffer | null> {
  try {
    const { data, error } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .download(contractObjectPath(leadId, applicationId));
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return buf.subarray(0, 5).toString('latin1') === '%PDF-' ? buf : null;
  } catch {
    return null;
  }
}

// Kanon holen oder (einmalig) erzeugen: Bucket-Hit ⇒ exakt diese Bytes.
// Miss ⇒ EIN Render mit kanonischem signed_at-Label, echte PDFs landen im
// Bucket + sha256 in der Acceptance-Row. HTML-Fallback (Chromium down) wird
// NIE gespeichert — Mail bekommt ihn als Notlösung, der Kanon entsteht dann
// beim Cron-Retry über /api/contract-pdf (der ebenfalls Bucket-first liest).
async function getOrCreateCanonicalContract(
  supabase: any,
  leadId: string,
  applicationId: number | null,
  snapshot: Record<string, unknown>,
  signaturName: string,
  signedAtIso: string | null,
  legacyLabel: string | null,
): Promise<ContractAttachment | null> {
  if (applicationId != null) {
    const cached = await downloadCanonicalContractPdf(supabase, leadId, applicationId);
    if (cached) {
      return { filename: CONTRACT_FILENAME, content: cached, contentType: 'application/pdf' };
    }
  }
  let attachment: ContractAttachment;
  try {
    attachment = await buildVertragAttachmentPdf(snapshot as any, {
      signaturName,
      signedAt: (signedAtIso ? formatSignedAtBerlin(signedAtIso) : undefined) ?? legacyLabel ?? undefined,
      auditNote: 'Vertragsversion v1.2',
    });
  } catch (e) {
    console.error('buildVertragAttachmentPdf failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
  const isRealPdf =
    attachment.contentType.startsWith('application/pdf') &&
    Buffer.isBuffer(attachment.content) &&
    attachment.content.subarray(0, 5).toString('latin1') === '%PDF-';
  if (isRealPdf && applicationId != null) {
    const bytes = attachment.content as Buffer;
    // upsert:false (hardening, Registry #27): istniejący kanon NIGDY nie
    // jest nadpisywany świeżym renderem. Wcześniejsze upsert:true mogło po
    // transient-fail downloadu podmienić bajty, które klient dostał mailem
    // i które leżą w Mamamii — od zmiany renderera (pdfkit vs puppeteer)
    // taka podmiana byłaby dodatkowo widoczna. Konflikt ⇒ re-download i
    // zwrot ISTNIEJĄCYCH bajtów; ponowny fail ⇒ świeży render idzie TYLKO
    // do maila (bez uploadu i bez stempla sha — kanon nietknięty).
    const { error: upErr } = await supabase.storage
      .from(CONTRACT_BUCKET)
      .upload(contractObjectPath(leadId, applicationId), bytes, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (upErr) {
      const isConflict = /exists|duplicate|409/i.test(upErr.message ?? '');
      if (isConflict) {
        const existing = await downloadCanonicalContractPdf(supabase, leadId, applicationId);
        if (existing) {
          return { filename: CONTRACT_FILENAME, content: existing, contentType: 'application/pdf' };
        }
      }
      console.error('contract canonical upload failed:', upErr.message ?? String(upErr));
    } else {
      const sha = createHash('sha256').update(bytes).digest('hex');
      const { error: shaErr } = await supabase
        .from('lead_application_acceptances')
        .update({ pdf_sha256: sha })
        .eq('lead_id', leadId)
        .eq('application_id', applicationId);
      if (shaErr) console.error('pdf_sha256 stamp failed:', shaErr.message);
    }
  }
  return attachment;
}

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

// appendJobParam (Multi-Job-Deeplink) importiert aus '@/lib/portal-url' —
// pure Modul, dort auch die Doku + der Hinweis aufs Edge-Fn-Duplikat.

// mamamia_job_offer_id (int, aus dem Event) → lead_jobs.id (uuid, was das
// Portal in ?job= erwartet). Fail-soft: kein Wiersz (Job noch nicht im
// Mirror — sollte seit dem Upsert-Vorziehen in detect selten sein) ⇒ null ⇒
// plain Link; der landet seit #406 ohnehin auf dem neuesten geplanten Job.
async function resolveLeadJobUuid(
  supabase: any,
  leadId: string,
  mamamiaJobOfferId: number | null,
): Promise<string | null> {
  if (mamamiaJobOfferId == null) return null;
  try {
    const { data } = await supabase
      .from('lead_jobs')
      .select('id')
      .eq('lead_id', leadId)
      .eq('mamamia_job_offer_id', mamamiaJobOfferId)
      .maybeSingle();
    return typeof data?.id === 'string' ? data.id : null;
  } catch (e) {
    console.warn('resolveLeadJobUuid failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Plant Reaktions-Reminder nach dem ursprünglichen caregiver_interest_shown
// bzw. application_received-Event. Pflegekraft-Metadata wird mitgespeichert,
// damit die Edge Function beim Versand die richtige Mail bauen kann.
//
// caregiver_interest_shown → 1 Reminder nach 1h (interest_reminder).
// application_received → 4 Reminder im Crescendo (Ton: persönliche Nachfrage
// von Ilka, keine Drohkulisse — Martin, 2026-07-20):
//   1h  (application_reminder)        "schon gesehen?"
//   4h  (application_reminder_4h)     "kurze Frage"
//   12h (application_reminder_12h)    "wie ist Ihr Eindruck?"
//   70h (application_last_chance)     letzte Erinnerung vor dem 72h-Auto-Reject
// Alle 3 tragen identische Cancel-Logik (siehe Edge Function): sobald der
// Kunde reagiert hat (accept/reject) ODER der Lead beauftragt/nicht
// interessiert ist, cancelt sich der jeweilige Reminder beim nächsten Tick.
const REMINDER_DELAY_INTEREST_MIN = 60;
const REMINDER_DELAYS_APPLICATION_MIN: { emailType: string; delay: number }[] = [
  { emailType: 'application_reminder',     delay: 60 },
  { emailType: 'application_reminder_4h',  delay: 4 * 60 },
  { emailType: 'application_reminder_12h', delay: 12 * 60 },
  // 70h — "letzte Chance"-Mail, ~2h vor dem 72h-Auto-Reject (separater
  // Cron in detect-caregiver-events). Kündigt das automatische Freigeben
  // an und bittet um Reaktion.
  { emailType: 'application_last_chance',  delay: 70 * 60 },
];

async function scheduleReactionReminder(
  supabaseAdmin: any,
  leadId: string,
  recipientEmail: string,
  triggerEvent: 'caregiver_interest_shown' | 'application_received',
  caregiver: CaregiverDisplay,
  caregiverId: number | string | undefined,
  jobOfferId: number | null,
  // Rohwert der Deutsch-Stufe aus der Event-Metadata. Muss durchgereicht
  // werden: das `metadata` des Requests ist in dieser Funktion nicht in
  // Reichweite — der Griff danach traf die lokale Konstante unten und
  // damit sich selbst (ReferenceError zur Laufzeit, Build-Stopp).
  germanySkillRoh: unknown,
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
    // Rohwert mitschleifen, damit der Versand frisch beschriften kann
    // (Schnappschuss-Falle wie Registry-Bug #34).
    caregiver_germany_skill: germanySkillRoh ?? null,
    caregiver_german_level: caregiver.germanLevel ?? null,
    caregiver_photo_url: caregiver.photoUrl ?? null,
    caregiver_about_text: caregiver.aboutText ?? null,
    trigger_event: triggerEvent,
    // Multi-Job: which job this reminder belongs to (for future per-job
    // reminder handling; cancellation logic unchanged for now).
    mamamia_job_offer_id: jobOfferId,
  };

  const tiers = triggerEvent === 'caregiver_interest_shown'
    ? [{ emailType: 'interest_reminder', delay: REMINDER_DELAY_INTEREST_MIN }]
    : REMINDER_DELAYS_APPLICATION_MIN;

  for (const { emailType, delay } of tiers) {
    // Nachtruhe (Martin, 19.08.): faellt die Erinnerung zwischen 21:00 und
    // 08:00 Berliner Zeit, wird sie auf 8:00 morgens geschoben. Der
    // 12-Stunden-Tier war der groesste Nacht-Sender (72 Mails in 30 Tagen),
    // weil eine Bewerbung am fruehen Nachmittag zwangslaeufig nachts erinnert.
    const scheduledFor = sendezeitIso(new Date(Date.now() + delay * 60 * 1000));
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

async function handleGet(request: NextRequest) {
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

async function handlePost(request: NextRequest) {
  try {
    const { token, event, metadata, notify } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token required' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_EVENTS.includes(event)) {
      return NextResponse.json({ error: 'invalid event' }, { status: 400, headers: corsHeaders });
    }

    // Multi-Job: detect-caregiver-events transports the concrete Mamamia job
    // in metadata.mamamia_job_offer_id; we promote it to a dedicated column.
    // `notify: false` = silent seed pass (record the event for per-job dedup,
    // but send NO customer mail / team mail / reminder — used on the first scan
    // of a follow-up job to register pre-existing applications without spamming).
    const silent = notify === false;
    const jobOfferIdNum =
      metadata && typeof metadata === 'object' && (metadata as Record<string, unknown>).mamamia_job_offer_id != null
        ? Number((metadata as Record<string, unknown>).mamamia_job_offer_id)
        : null;
    const mamamiaJobOfferId = Number.isFinite(jobOfferIdNum as number) ? (jobOfferIdNum as number) : null;

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
    // EIN kanonischer Vertrags-PDF für alle Kanäle (Kunde/Team/Mamamia/Portal)
    // — befüllt im Accept-Block (frischer Akzept) oder unten (Resend-Pfad).
    let contractAttachment: ContractAttachment | null = null;

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
        // Kanonischer Unterschrifts-Moment: EIN Server-Zeitpunkt für die Row
        // (signed_at) UND das Dokument-Label — nie zwei Uhren.
        const signedAtIso = new Date().toISOString();
        // EIN atomarer Upsert: Kern + Signatur-Audit + Snapshot + Version.
        // Der frühere Zwei-Statement-Split („best-effort", Schutz gegen fehlende
        // Migration) war gefährlich: die Buchung konnte OHNE Signatur/Snapshot
        // „gelingen" (Kunde sieht Erfolg, /api/contract-pdf 404t). Die Spalten
        // sind seit 06+07/2026 auf Staging UND Prod → Schutz obsolet.
        // Fehler ⇒ 500 — der bestehende acceptApp-Error-Pfad zeigt dem Kunden
        // Toast + Retry (Święta zasada nr 1: kein stiller Teilerfolg).
        const { error: accErr } = await supabase
          .from('lead_application_acceptances')
          .upsert({
            lead_id: lead.id,
            application_id: appId,
            caregiver_id: typeof caregiverId === 'number' && Number.isFinite(caregiverId) ? caregiverId : null,
            contract_patient: m.contract_patient ?? {},
            contract_contact: m.contract_contact ?? {},
            signatur: typeof m.signatur === 'string' ? m.signatur : null,
            signed_at: signedAtIso,
            signed_ip: clientIp,
            contract_snapshot: m.contract ?? null,
            contract_version: CONTRACT_VERSION,
          }, { onConflict: 'lead_id,application_id' });
        if (accErr) {
          console.error('lead_application_acceptances upsert failed:', accErr.message);
          return NextResponse.json(
            { error: 'acceptance persistence failed' },
            { status: 500, headers: corsHeaders },
          );
        }

        // KANON: Vertrag GENAU EINMAL rendern (Zeitstempel = signedAtIso in
        // Europe/Berlin — derselbe Moment, der in der Row steht) und in den
        // Bucket legen — BEVOR der Sync feuert, damit auch ein sofortiger
        // Mamamia-Upload (Confirmation schon verarbeitet) dieselben Bytes
        // nimmt. Mails unten hängen exakt dieses Attachment an.
        if (m.contract && typeof m.contract === 'object' && typeof m.signatur === 'string' && m.signatur.trim()) {
          contractAttachment = await getOrCreateCanonicalContract(
            supabase,
            lead.id,
            appId,
            m.contract as Record<string, unknown>,
            (m.signatur as string).trim(),
            signedAtIso,
            typeof m.signed_at === 'string' ? (m.signed_at as string) : null,
          );
        }

        // Mamamia-Sync (Refactor 2026-07-22, Sequenz Michał):
        //   1. UpdateCustomer (Kontaktdaten) → 2. StoreConfirmation →
        //   3. Vertrag = KANON aus dem Bucket (oben gerade abgelegt) →
        //   4. Upload (nach Verarbeitung der Confirmation).
        // Läuft in der Edge Fn sync-acceptance (Agentur-Creds leben NUR dort).
        // Best-effort mit kurzem Timeout: schlägt der synchrone Versuch fehl
        // oder ist die Confirmation noch nicht verarbeitet, holt der
        // detect-caregiver-events-Cron (15 Min) alles nach — die Buchung
        // selbst steht bereits (Upsert oben). Mails (unten) laufen unverändert.
        // skip_confirm: Alt-Bundles feuern storeConfirmation noch selbst
        // (metadata.mamamia_accepted === true) — dann NICHT doppelt akzeptieren.
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 25_000);
          const syncRes = await fetch(`${supabaseUrl}/functions/v1/sync-acceptance`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              lead_id: lead.id,
              application_id: appId,
              skip_confirm: m.mamamia_accepted === true,
            }),
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          const syncBody = await syncRes.json().catch(() => null);
          console.log(`[sync-acceptance] lead=${lead.id} app=${appId} http=${syncRes.status} result=${JSON.stringify(syncBody).slice(0, 400)}`);

          // Alarm-Policy (2026-07-21): PERMANENTER StoreConfirmation-Fehler
          // (Mamamia lehnt deterministisch ab — z.B. Bewerbung von der
          // Agentur zurückgezogen) ⇒ Team-Alarm SOFORT, nicht erst nach dem
          // Cron-Fenster. Der Kunde sieht gerade "Buchung bestätigt", ohne
          // dass in Mamamia etwas gebucht ist. Transiente Fehler alarmieren
          // hier NICHT (sync-acceptance hat intern schon 3× versucht; Cron
          // übernimmt, Alarm dort nach 5 Min). Audit-Row wird mitgeloggt.
          const confErr = syncBody && typeof syncBody === 'object'
            ? (syncBody as Record<string, any>).confirm_error
            : null;
          if (confErr && confErr.permanent === true) {
            const alarmInfo: AcceptanceAlarmInfo = {
              application_id: appId,
              caregiver_id: typeof caregiverId === 'number' && Number.isFinite(caregiverId) ? caregiverId : null,
              caregiver_name: typeof m.caregiver_name === 'string' ? m.caregiver_name : null,
              confirmed: false,
              pdf_uploaded: false,
              permanent: true,
              error: typeof confErr.message === 'string' ? confErr.message : String(confErr.message ?? ''),
              age_minutes: 0,
              source: 'bridge',
            };
            const alarmRes = await raiseAcceptanceSyncAlarm(supabase, lead, alarmInfo);
            if (alarmRes.ok) {
              await supabase.from('lead_events').insert({
                lead_id: lead.id,
                event_type: 'acceptance_sync_alarm',
                metadata: { ...alarmInfo }, // trägt bereits source:'bridge'
              });
            }
            // alarmRes.ok=false ⇒ kein Stempel (raiseAcceptanceSyncAlarm) ⇒ der
            // Cron re-alarmiert (permanent ⇒ altersunabhängig) im nächsten Lauf.
          }
        } catch (e) {
          console.error(`[sync-acceptance] trigger failed (cron will retry): lead=${lead.id} app=${appId}:`, e instanceof Error ? e.message : String(e));
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
    // - application_accepted_internal → dedupe pro APPLICATION, nicht pro
    //   Lead (Bug #25, Michał: „8 jobów rocznie i więcej") — der ZWEITE und
    //   jeder weitere Booking desselben Kunden muss Mail C + Team-Mail
    //   bekommen; re-Klick derselben Annahme bleibt dedupliziert.
    const isDeduped = !NON_DEDUPED_EVENTS.has(event);
    let isFirstOccurrence = true;
    if (isDeduped) {
      const acceptAppId = event === 'application_accepted_internal'
        && metadata && typeof metadata === 'object'
        && (metadata as Record<string, unknown>).application_id != null
        ? String((metadata as Record<string, unknown>).application_id)
        : null;
      let query = supabase
        .from('lead_events')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('event_type', event);
      if (acceptAppId != null) {
        query = query.eq('metadata->>application_id', acceptAppId);
      } else if (event === 'application_accepted_internal' && mamamiaJobOfferId != null) {
        // Annahme-Detektor (SA-Portal-Buchung) liefert keine application_id,
        // aber den Job → Dedupe pro Job (zweite Buchung auf NEUEM Job mailt).
        query = query.eq('mamamia_job_offer_id', mamamiaJobOfferId);
      }
      const { data: existing } = await query.limit(1);
      isFirstOccurrence = !existing || existing.length === 0;
    }

    if (!isDeduped || isFirstOccurrence) {
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: event,
        mamamia_job_offer_id: mamamiaJobOfferId,
        metadata: metadata && typeof metadata === 'object'
          ? { source: 'caapp', ...metadata }
          : { source: 'caapp' },
      });
    }

    // 🚨 Acceptance-Sync-Alarm (Cron-Pfad): Team-Mail ist die EINZIGE Wirkung
    // dieses Events — keine Kundenmail, kein Reminder. Die Mail entscheidet
    // die Antwort: Fehler ⇒ 502 ⇒ der Cron stempelt mamamia_sync_alerted_at
    // NICHT und re-alarmiert im nächsten Lauf (15 Min).
    if (event === 'acceptance_sync_alarm') {
      const m = (metadata ?? {}) as Record<string, unknown>;
      const ok = await raiseAcceptanceSyncAlarm(supabase, lead, {
        application_id: (m.application_id as number | string | undefined) ?? '?',
        caregiver_id: (m.caregiver_id as number | string | null | undefined) ?? null,
        caregiver_name: typeof m.caregiver_name === 'string' ? m.caregiver_name : null,
        confirmed: m.confirmed === true,
        pdf_uploaded: m.pdf_uploaded === true,
        permanent: m.permanent === true,
        error: typeof m.error === 'string' ? m.error : null,
        age_minutes: typeof m.age_minutes === 'number' ? m.age_minutes : null,
        // 'cron' (15-Min-Backstop) oder 'sync-retry' (Chain 15/30/60 s).
        source: typeof m.source === 'string' ? m.source : 'cron',
      });
      if (!ok.ok) {
        return NextResponse.json(
          { error: `alarm mail failed: ${(ok.error ?? 'unknown').slice(0, 300)}` },
          { status: 502, headers: corsHeaders },
        );
      }
      return NextResponse.json({ ok: true }, { headers: corsHeaders });
    }

    // Vertrags-Anhang für den RESEND-Pfad (teamOnlyResend — der Accept-Block
    // oben wurde übersprungen): Kanon aus dem Bucket; fehlt er (Alt-Buchung
    // vor dem Kanon-Refactor), EIN Render mit signed_at der Row (Europe/
    // Berlin) — der dann als Kanon gespeichert wird.
    if (contractAttachment === null && event === 'application_accepted_internal' && metadata && typeof metadata === 'object') {
      const m = metadata as Record<string, unknown>;
      if (m.contract && typeof m.contract === 'object' && typeof m.signatur === 'string' && m.signatur.trim()) {
        const rawAppId = Number(m.application_id);
        const appIdNum = Number.isFinite(rawAppId) ? rawAppId : null;
        let rowSignedAtIso: string | null = null;
        if (appIdNum != null) {
          const { data: accRow } = await supabase
            .from('lead_application_acceptances')
            .select('signed_at')
            .eq('lead_id', lead.id)
            .eq('application_id', appIdNum)
            .maybeSingle();
          rowSignedAtIso = typeof accRow?.signed_at === 'string' ? accRow.signed_at : null;
        }
        contractAttachment = await getOrCreateCanonicalContract(
          supabase,
          lead.id,
          appIdNum,
          m.contract as Record<string, unknown>,
          (m.signatur as string).trim(),
          rowSignedAtIso,
          typeof m.signed_at === 'string' ? (m.signed_at as string) : null,
        );
      }
    }

    // Team notification (fire-and-forget — never blocks the response).
    // - patient_data_saved → einmal pro Lead (Milestone, deduped)
    // - caregiver_invited / caregiver_interest_shown / application_received →
    //   pro Event eine Mail (kein DB-Dedupe), jede mit Pflegekraft-Name.
    // - teamOnlyResend bypasst die Dedup-Sperre, damit ein nachträglicher
    //   Re-Send (z.B. mit neuem PDF-Anhang nach Bugfix) die Team-Mail
    //   tatsächlich erneut auslöst — sonst würde sie wegen isDeduped +
    //   !isFirstOccurrence unterdrückt.
    const shouldNotifyTeam =
      !silent &&
      TEAM_NOTIFY_EVENTS.includes(event) &&
      (!isDeduped || isFirstOccurrence || teamOnlyResend);

    if (shouldNotifyTeam) {
      const FEEDBACK_ANTWORT: Record<string, string> = {
        passt_nicht: 'Passt nicht',
        spaeter: 'Vielleicht später',
        loslegen: 'Interessant',
      };
      const additionalData: Record<string, unknown> | undefined =
        event === 'angebots_feedback' && metadata && typeof metadata === 'object'
          ? {
              feedbackText: [
                FEEDBACK_ANTWORT[String((metadata as Record<string, unknown>).feedback_answer)]
                  ?? String((metadata as Record<string, unknown>).feedback_answer ?? '—'),
                (metadata as Record<string, unknown>).feedback_detail,
              ].filter(Boolean).join(' — '),
            }
          :
        TEAM_NOTIFY_CAREGIVER_EVENTS.has(event) && metadata && typeof metadata === 'object'
          ? { caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '' }
          : (event === 'application_accepted_internal' && metadata && typeof metadata === 'object'
              ? {
                  caregiverName: metadata.caregiver_name ?? metadata.caregiverName ?? '',
                  caregiverId: metadata.caregiver_id ?? null,
                  applicationId: metadata.application_id ?? null,
                  contractPatient: metadata.contract_patient ?? null,
                  contractContact: metadata.contract_contact ?? null,
                  // Auto-Annahme (2026-07-15): true = StoreConfirmation in mamamia
                  // ist bereits durch (Buchung synchron), false = fehlgeschlagen →
                  // Team-Mail warnt „bitte manuell im SA-Portal annehmen".
                  // undefined (Detektor / ältere Clients) → kein Hinweis.
                  mamamiaAccepted: typeof (metadata as Record<string, unknown>).mamamia_accepted === 'boolean'
                    ? (metadata as Record<string, unknown>).mamamia_accepted
                    : undefined,
                }
              : undefined);
      const teamTemplate = getTeamNotificationTemplate(lead as any, event, additionalData as any);
      // Nur die Accept-/Buchungs-Mail bekommt das erweiterte interne BCC.
      const teamMailOptions = event === 'application_accepted_internal'
        ? { extraBcc: ACCEPT_TEAM_NOTIFY_EXTRA_BCC }
        : undefined;
      sendEmail(TEAM_NOTIFY_RECIPIENT, teamTemplate, contractAttachment ? [contractAttachment] : undefined, teamMailOptions).catch((e) =>
        console.error('team notify send threw:', e instanceof Error ? e.message : String(e)),
      );
    }

    // Customer-facing mail (Mail A / Mail B / Mail C — Buchung bestätigt).
    // Fire-and-forget — Mamamia-Hooks / Portal-Trigger dürfen niemals durch
    // eine Mail-Latenz blockiert werden. Bei fehlenden Pflegekraft-Daten
    // loggen wir und überspringen die Mail — der lead_event wird trotzdem
    // aufgezeichnet.
    // Im Team-Only-Resend-Modus wird die Kunden-Mail komplett übersprungen.
    if (!teamOnlyResend && !silent && CUSTOMER_MAIL_EVENTS.has(event)) {
      // patient_data_saved ist deduped (NON_DEDUPED_EVENTS enthält nur die
      // Caregiver-Events) — Mail nur beim ersten Speichern verschicken,
      // sonst spammen wir den Kunden bei jedem Patientendaten-Update.
      const shouldSendCustomerMail = !isDeduped || isFirstOccurrence;

      // Abmeldung (Abmelde-Link, Art. 21 DSGVO): keine automatisierten
      // Kundenmails mehr. Ausnahme: transaktionale Mails (Mail C /
      // Buchungsbestätigung, offer_updated / Preisänderung des eigenen
      // Angebots) — siehe TRANSACTIONAL_MAIL_EVENTS.
      let unsubscribed = false;
      if (!TRANSACTIONAL_MAIL_EVENTS.has(event)) {
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
        // ABER: konnte der Einsatzort nicht aufgelöst werden (Flag
        // location_unresolved vom Portal, z. B. österreichische PLZ ohne
        // Mamamia-Location), bleibt der Kunde in Mamamia Entwurf — dann wäre
        // "Pflegekräfte können sich bewerben" schlicht falsch. Mail
        // unterdrücken; das Team-Event patient_form_location_unresolved hat den
        // Fall bereits gemeldet, die übrigen patient_data_saved-Effekte
        // (Nudge-Stopp, Kontakt-Sync, Team-Notiz) bleiben.
        const locationUnresolved = !!(metadata && typeof metadata === 'object'
          && (metadata as Record<string, unknown>).location_unresolved);
        if (locationUnresolved) {
          console.log(`lead-event patient_data_saved: Einsatzort unresolved — Mail D unterdrückt (lead ${lead.id})`);
        } else {
          const portalUrl = buildPortalUrl(lead as any);
          const template = getPatientDataSavedEmailTemplate(lead as any, portalUrl);
          sendEmail((lead as any).email, template).catch((e) =>
            console.error('customer mail send threw:', e instanceof Error ? e.message : String(e)),
          );
        }
      } else if (event === 'offer_updated') {
        // Aktualisiertes Angebot — alter/neuer Preis + geänderte Angaben aus
        // der Metadata (vom SA-Portal gesetzt; die Kalkulation selbst wurde
        // dort bereits per Service-Key auf den Lead geschrieben). Ohne
        // plausible Preise keine Mail — Event bleibt trotzdem aufgezeichnet.
        const m = (metadata ?? {}) as Record<string, unknown>;
        const oldB = Number(m.old_bruttopreis);
        const newB = Number(m.new_bruttopreis);
        if (!Number.isFinite(oldB) || !Number.isFinite(newB) || newB <= 0) {
          console.warn(`lead-event offer_updated: missing/invalid prices in metadata — mail skipped (lead ${lead.id})`);
        } else {
          const rawChanged = Array.isArray(m.changed) ? (m.changed as Array<Record<string, unknown>>) : [];
          const portalUrl = buildPortalUrl(lead as any);
          const template = getOfferUpdatedEmailTemplate(
            lead as any,
            {
              oldBruttopreis: oldB,
              newBruttopreis: newB,
              newEigenanteil: Number.isFinite(Number(m.new_eigenanteil)) ? Number(m.new_eigenanteil) : null,
              changed: rawChanged.map((c) => ({
                name: typeof c?.name === 'string' ? c.name : undefined,
                alt: typeof c?.alt === 'string' ? c.alt : undefined,
                neu: typeof c?.neu === 'string' ? c.neu : undefined,
              })),
            },
            portalUrl,
          );
          sendEmail((lead as any).email, template).catch((e) =>
            console.error('customer mail send threw:', e instanceof Error ? e.message : String(e)),
          );
        }
      } else {
        // Caregiver-Event-Mails (A/B/C) — Foto inline einbetten (CID) —
        // presigned S3-URLs laufen nach 30 Min ab, daher nicht zuverlässig
        // direkt im HTML referenzierbar.
        const caregiver = extractCaregiverDisplay(metadata);
        if (!caregiver) {
          console.warn(`lead-event ${event}: caregiver display data missing in metadata — mail skipped (lead ${lead.id})`);
        } else {
          // Multi-Job (Bug #25): Mail über eine Bewerbung auf Job X öffnet das
          // Portal AUF Job X (&job=<lead_jobs.id>) — nicht auf dem Default-Job.
          const leadJobUuid = await resolveLeadJobUuid(supabase, lead.id, mamamiaJobOfferId);
          const portalUrl = appendJobParam(buildPortalUrl(lead as any), leadJobUuid);
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
                  mamamiaJobOfferId,
                  metadata && typeof metadata === 'object'
                    ? (metadata as Record<string, unknown>).caregiver_germany_skill ?? null
                    : null,
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

// ─── Telemetria RAM (diagnoza OOM — plan 2026-08-09; format: [req] …) ───
import { withMem } from '@/lib/memlog';
export const GET = withMem('lead-event GET', handleGet);
export const POST = withMem('lead-event POST', handlePost);
