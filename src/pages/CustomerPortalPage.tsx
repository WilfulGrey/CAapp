import { useState, useEffect, useMemo, useRef, FC } from 'react';
import { Check, Bell, Phone, AlertCircle, AlertTriangle, ChevronDown, X, ArrowLeft, ArrowRight, Heart } from 'lucide-react';
import { Nurse } from '../types';
import { displayName } from '../components/portal/shared';
import {
  fetchLeadByToken,
  Lead,
  cap,
  formatEuro,
  setDeclinedCaregiver,
} from '../lib/supabase';
import { useMamamiaSession } from '../hooks/useMamamiaSession';
import { useCustomer, useJobOffer, useApplications, useInterests, useDismissedCaregivers, useAcceptedApplications, useMatchings, useCaregiver, useInvitedCaregivers, useInviteRateState, useLeadJobs } from '../lib/mamamia/hooks';
import { rankComparator } from '../lib/mamamia/matchingsRanking';
import { prefetchCaregivers } from '../lib/mamamia/caregiverCache';
import { isAboutDeStale, regenerateGermanDescription } from '../lib/mamamia/caregiverAbout';
import { feedbackInRuhezeit, reportLeadEvent, fetchLeadEvents, KOSTENRECHNER_URL } from '../lib/leadEvents';
import type { CaregiverSnapshot } from '../lib/leadEvents';
import { identifyClarity } from '../lib/clarity';
import {
  useRejectApplication,
  useStoreConfirmation,
  useInviteCaregiver,
  useDismissCaregiver,
  useUpdateCustomer,
  useUpdateJobDescription,
  useUpdateJobOfferDates,
} from '../lib/mamamia/mutations';
import {
  applyAcceptedOverlay,
  customerDisplayName,
  jobOfferArrivalDisplay,
  mapApplicationToUI,
  mapMatchingToNurse,
  mapCaregiverToNurse,
  matchesGermanyWish,
  pickFinalConfirmedJob,
} from '../lib/mamamia/mappers';
import { mapPatientFormToUpdateCustomerInput, splitCustomerName } from '../lib/mamamia/patientFormMapper';
import { customerSalutation } from '../lib/names';
import { caregiverBadgeScore, badgeScore as nurseBadgeScore, MIN_BADGE_SCORE } from '../lib/mamamia/badge';
import { callMamamia, MamamiaError } from '../lib/mamamia/client';
import { buildMonthlyBreakdown, formatDeDate } from '../lib/pricing/monthlyBreakdown';
import {
  type Application,
  type NurseStatus,
} from '../components/portal/shared';
import { BookedScreen } from '../components/portal/BookedScreen';
import { VertragSignieren } from '../components/portal/VertragSignieren';
import { AngebotCard } from '../components/portal/AngebotCard';
import { AppCard } from '../components/portal/AppCard';
import { AppCardDone } from '../components/portal/AppCardDone';
import { BeratungCTA } from '../components/portal/BeratungCTA';
import { AngebotsFeedback } from '../components/portal/AngebotsFeedback';
import type { FeedbackAnswer } from '../components/portal/AngebotsFeedback';
import { MatchCard } from '../components/portal/MatchCard';
import { MatchCardDone } from '../components/portal/MatchCardDone';
import { InterestCard, type InterestActionStatus } from '../components/portal/InterestCard';
import { ExpiredLinkScreen } from '../components/portal/ExpiredLinkScreen';
import type { ContractFormData } from '../components/portal/AngebotPruefenModal';
import { InfoPopup } from '../components/portal/InfoPopup';
import { ContactPopup } from '../components/portal/ContactPopup';
import { DeclineConfirmModal } from '../components/portal/DeclineConfirmModal';
import { InviteRateLimitModal } from '../components/portal/InviteRateLimitModal';
import { AngebotPruefenModal, buildVertragsDaten } from '../components/portal/AngebotPruefenModal';
import { CustomerNurseModal } from '../components/portal/CustomerNurseModal';
import { PflegekraftChat } from '../components/portal/PflegekraftChat';

// ─── Dev-Only Preview-Mode (NICHT für Production) ──────────────────────────
// Aktiviert via ?preview=bewerbung oder ?preview=interesse. Skipped den
// Token-Lookup + Mamamia und rendert die Portal-Seite mit hardcoded Dummy-
// Daten, damit UI-Iterationen ohne echte Test-Leads getestet werden können.
const PREVIEW_PARAM =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
const IS_PREVIEW_BEWERBUNG = PREVIEW_PARAM === 'bewerbung';
const IS_PREVIEW_INTERESSE = PREVIEW_PARAM === 'interesse';
// Dev-only preview of the post-acceptance "gebucht" screen (BookedScreen).
// Seeds a dummy accepted application so the booked layout renders with
// dummy data — real Mamamia wiring (JobOffer.status==='accepted' + the
// confirmation read) is hooked up later.
const IS_PREVIEW_GEBUCHT = PREVIEW_PARAM === 'gebucht';
// Dev-only prototype of the online-signable Dienstleistungsvertrag (Stufe A).
const IS_PREVIEW_VERTRAG = PREVIEW_PARAM === 'vertrag';
// Dev-only prototype of the (translated, guard-railed) chat with the applied
// caregiver — opens the chat directly over the bewerbung layout.
const IS_PREVIEW_CHAT = PREVIEW_PARAM === 'chat';
// Dev-only preview of the patient form (AngebotCard expanded). Forces
// patientSaved=false + no pending applications, so the Patientendaten-Card
// ist sichtbar und der Wizard durchspielbar — sonst versteckt das Portal
// die Karte sobald entweder Bewerbungen offen sind oder das Profil als
// gespeichert gilt.
const IS_PREVIEW_PATIENT = PREVIEW_PARAM === 'patient';
// Dev-only preview: Profil erfasst, 0 Bewerbungen, 0 Interest → der
// "ready"-State ("Profil vollständig. Bewerbungen werden für Sie
// vorbereitet. ✨"). Wird vom Multi-Job-Vorschau (?preview=jobs) als
// Detail-View für geplante Jobs ohne Bewerbungen genutzt.
const IS_PREVIEW_WARTET = PREVIEW_PARAM === 'wartet';
const IS_PREVIEW_ANY = IS_PREVIEW_BEWERBUNG || IS_PREVIEW_INTERESSE || IS_PREVIEW_GEBUCHT || IS_PREVIEW_CHAT || IS_PREVIEW_PATIENT || IS_PREVIEW_WARTET;

// Sub-Nav-Zeile mit Job-Kontext (Status-Badge + Zeitraum links) +
// "Alle Einsätze →" rechts, wenn der Kunde aus der Multi-Job-Übersicht
// (?preview=jobs) in einen Detail-Preview rein-navigiert ist.
//
// URL-Params:
//   back=jobs                              Sub-Nav anzeigen
//   status=laufend|geplant|abgeschlossen   Badge
//   von=01.07.2026                         Start-Datum
//   bis=12.08.2026                         End-Datum (optional, sonst "offen")
//   count=4                                Gesamtanzahl Einsätze
//                                          ("Alle…"-Link nur wenn >1)
//   abgeschlossen=1                        BookedScreen rendert
//                                          "Einsatz beendet" statt
//                                          "Vielen Dank — gerade gebucht"
function readJobsBackParams() {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get('back') !== 'jobs') return null;
  return {
    status: q.get('status') as 'laufend' | 'gebucht' | 'geplant' | 'abgeschlossen' | null,
    von: q.get('von') || '',
    bis: q.get('bis') || '',
    count: Number(q.get('count') || '1'),
    abgeschlossen: q.get('abgeschlossen') === '1',
  };
}
const JOBS_BACK = readJobsBackParams();
const HAS_JOBS_BACK = JOBS_BACK !== null;
const IS_EINSATZ_BEENDET = JOBS_BACK?.abgeschlossen === true;

// Multi-Job (Variant A): a `?job=<lead_jobs.id>` deep link scopes this portal
// to one specific job. Passed to useMamamiaSession → the edge function
// re-onboards with that job_offer_id (ownership-checked; foreign/unknown id
// falls back to the lead's default job). Absent → default job (every old link).
const JOB_ID_PARAM =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('job')
    : null;
const TOKEN_PARAM =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('token')
    : null;
// Sprungziel aus Mail-CTAs (z. B. goto=bewerbungen aus der Bewerbungs-Mail):
// nach dem Laden der Mamamia-Daten scrollt das Portal zur Ziel-Sektion,
// statt den Kunden oben auf der Startansicht abzusetzen.
const GOTO_PARAM =
  typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('goto')
    : null;
// Link back to the real "Alle meine Einsätze" overview (?view=jobs) — only
// meaningful once we arrived here scoped to a specific job via ?job=…
const JOBS_OVERVIEW_HREF =
  TOKEN_PARAM ? `?${new URLSearchParams({ token: TOKEN_PARAM, view: 'jobs' }).toString()}` : '?view=jobs';

// Feature-Flag: Chat (PflegekraftChat) ist im Backend noch nicht via
// WhatsApp/caregiver-chat angebunden + Brief-Style-UX wird noch getestet.
// Bis explizit freigegeben → keine Chat-Entry-Points für echte Kunden
// (Buttons in MatchCard/AppCard/NurseModal werden ausgeblendet). In allen
// Preview-Modi bleibt der Chat sichtbar, damit wir weiter intern testen
// können. Aktivieren: einfach hier auf `true` flippen + 1 commit.
const CHAT_ENABLED = IS_PREVIEW_ANY;

const PREVIEW_LEAD: Lead = {
  id: 'preview-lead-1',
  email: 'mueller@example.com',
  vorname: 'Anna',
  nachname: 'Müller',
  anrede: 'Frau',
  anrede_text: 'Frau',
  telefon: '+49 89 1234567',
  status: 'angebot_angefordert',
  token: 'preview-token',
  token_expires_at: null,
  token_used: true,
  care_start_timing: 'sofort',
  kalkulation: {
    bruttopreis: 3050,
    eigenanteil: 1621.75,
    // Items 1:1 wie `berechneZuschüsse` (project 3/lib/calculation.ts) sie für
    // diesen Lead liefert — am 12.08.2026 gegen die Live-`subsidies_config`
    // geprüft. Genau DREI Posten stehen auf `in_kalkulation: true`:
    //   pflegegeld · entlastungsbudget_neu · steuervorteil
    // (verhinderungspflege, kurzzeitpflege, entlastungsbetrag,
    // wohnraumanpassung, pflegehilfsmittel, hilfe_zur_pflege sind aktiv, aber
    // NICHT in der Kalkulation.)
    //
    // Werte für diesen Lead (Pflegegrad 4, Brutto 3.050 €):
    //   Pflegegeld PG4      800,00 €/Mon (fix aus subsidies_values)
    //   Entlastungsbudget   294,92 €/Mon (3.539 €/Jahr ÷ 12)
    //   Steuervorteil       333,33 €/Mon (min(3.050×12×20 %, 4.000) ÷ 12
    //                                     — die 4.000-€-Deckelung greift)
    //   Summe 1.428,25 → Eigenanteil 1.621,75 €
    //
    // Der Mock stand bis 12.08. auf zwei Posten (Pflegegeld 545 €,
    // „Steuerersparnis" 355 €) — das Entlastungsbudget fehlte ganz und die
    // Steuerzahl war frei erfunden. Beim Ändern hier: gegen
    // `berechneZuschüsse` gegenrechnen, nicht schätzen.
    zuschüsse: {
      gesamt: 1428.25,
      items: [
        { name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '', betrag_monatlich: 800, betrag_jaehrlich: 9600, typ: 'monatlich', hinweis: null, in_kalkulation: true },
        { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)', beschreibung: '', betrag_monatlich: 294.92, betrag_jaehrlich: 3539, typ: 'jaehrlich', hinweis: 'Bis zu 3.539 €/Jahr (seit 1.7.2025)', in_kalkulation: true },
        { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', beschreibung: '', betrag_monatlich: 333.33, betrag_jaehrlich: 4000, typ: 'jaehrlich', hinweis: 'Max. 4.000 € pro Jahr (= ca. 333 €/Monat). 20% der Kosten, direkt von der Steuerschuld abziehbar.', in_kalkulation: true },
      ],
    },
    // Realistischer anspruchsvoller Lead, damit der Chat-Preview die volle
    // Bandbreite kontextueller Chip-Vorschläge zeigt: Ehepaar (couple-care),
    // PG4 (pflegegrad-hoch), Rollstuhl (mobility), Demenz, Nachteinsätze,
    // gutes Deutsch + Deutsch-Confirmation Chip.
    formularDaten: {
      betreuung_fuer: 'ehepaar',
      pflegegrad: 4,
      mobilitaet: 'rollstuhl',
      nachteinsaetze: 'taeglich',
      deutschkenntnisse: 'sehr-gut',
      demenz: 'ja',
      fuehrerschein: 'ja',
      geschlecht: 'weiblich',
    },
    aufschluesselung: [],
  } as any,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as Lead;

const PREVIEW_INTEREST_PROFILE = {
  nationality: 'Polnisch',
  yearOfBirth: 1964,
  weight: '51–60 kg',
  height: '151–160 cm',
  maritalStatus: 'Verwitwet',
  drivingLicense: false,
  isNurse: false,
  smoking: 'no' as const,
  qualifications: 'Demenzbetreuung, Mobilisierung, Wundversorgung',
  motivation: 'Ich freue mich, älteren Menschen ein liebevolles Zuhause zu erhalten.',
  aboutDe: 'Maria ist eine ruhige, einfühlsame Frau, die gerne backt und sich für klassische Musik begeistert. Sie ist seit 6 Jahren in der 24h-Pflege tätig und hat in dieser Zeit 14 Familien begleitet — zuletzt zehn Wochen lang eine Familie in München. Was sie besonders auszeichnet: ihre Geduld und ihr feines Gespür für die Tagesform der Patienten — das schenkt Sicherheit und Ruhe in den Alltag.',
  furtherHobbies: 'Sie hört gerne klassische Musik und backt traditionelle polnische Kuchen.',
  hobbies: ['Backen', 'Musik', 'Gartenarbeit'],
  personalities: ['einfühlsam', 'ruhig', 'zuverlässig', 'herzlich'],
  acceptedMobilities: ['Mobil', 'Rollator', 'Bettlägerig'],
  otherLanguages: [{ name: 'Englisch', level: 'A2' }],
};

const PREVIEW_INTEREST_ASSIGNMENTS = [
  { startDate: '10.01.2026', endDate: '20.03.2026', postalCode: '80331', city: 'München', patientCount: 1, duration: '10 Wochen' },
  { startDate: '01.09.2025', endDate: '15.11.2025', postalCode: '50667', city: 'Köln', patientCount: 1, duration: '10 Wochen' },
];

const PREVIEW_INTEREST = {
  // Unique caregiver_id (≠ PREVIEW_APPLICATION 999001) damit das Szenario
  // "pending Bewerbung von Maria UND offenes Interesse von Krystyna" im
  // preview=bewerbung Modus getestet werden kann.
  id: 999020,
  caregiver_id: 999020,
  rejected_at: null,
  caregiver: {
    id: 999020,
    first_name: 'Krystyna',
    last_name: 'Nowicka',
    gender: 'female' as const,
    year_of_birth: 1964,
    birth_date: '1964-03-15',
    germany_skill: 'level_3',
    care_experience: '6',
    available_from: new Date().toISOString(),
    last_contact_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
    is_active_user: true,
    hp_total_jobs: 14,
    hp_total_days: 1200,
    hp_avg_mission_days: 84,
    avatar_retouched: { aws_url: 'https://i.pravatar.cc/200?img=47' },
  },
};

const PREVIEW_APPLICATION: Application = {
  id: 'preview-app-1',
  nurse: {
    caregiverId: 999001,
    name: 'Maria Kowalska',
    age: 62,
    experience: '6 Jahre Erfahrung',
    experienceYears: 6,
    availability: 'sofort verfügbar',
    availableSoon: true,
    language: { level: 'Gut', bars: 3 },
    color: '#8B7355',
    addedTime: 'vor 12 Min.',
    isLive: true,
    gender: 'female',
    image: 'https://i.pravatar.cc/200?img=47',
    history: { assignments: 14, avgDurationMonths: 2.8 },
    // Demo-PDF (Mozilla pdf.js TraceMonkey-Paper, öffentlich verfügbar) —
    // wird im Preview-Modus gerendert, damit man die Referenz-Download-UX
    // testen kann. Direkter PDF-Link (kein Viewer-HTML), damit der Blob-
    // Download in handleReferenceDownload greift; GitHub Pages liefert
    // Access-Control-Allow-Origin:* — wie der echte S3-Bucket.
    referencePdfUrl: 'https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf',
  },
  agencyName: 'Mamamia',
  appliedAt: 'vor 12 Min.',
  status: 'new',
  isInvited: true,
  message:
    'Ich freue mich auf den Einsatz bei Ihnen. Ich bin seit vielen Jahren in der 24h-Betreuung tätig und habe besondere Erfahrung mit demenziell veränderten Patienten.',
  coverMessage:
    'Guten Tag! Ich habe Ihre Anfrage gesehen und würde Sie sehr gerne unterstützen. Ich habe mehrere Jahre Erfahrung in der Demenzbetreuung, koche gerne und mag es, gemeinsam spazieren zu gehen. Ich freue mich darauf, Sie kennenzulernen. — Maria',
  offer: {
    monatlicheKosten: 2850,
    anreisedatum: '19.05.2026',
    abreisedatum: '19.07.2026',
    anreisekosten: 125,
    abreisekosten: 125,
    reisetage: 'Mo + Mi',
    feiertagszuschlag: 100,
    kuendigungsfrist: '4 Wochen Kündigungsfrist',
    submittedAt: 'vor 12 Min.',
  },
};

// Beispiel-Vertragsdaten für die ?preview=gebucht Ansicht — simuliert einen
// bereits unterschriebenen Vertrag, damit der gebucht-Screen die read-only
// Vertragspräsentation zeigt (statt „Vertrag folgt").
const PREVIEW_SIGNED_FORM: ContractFormData = {
  anrede: 'Frau', vorname: 'Gerda', nachname: 'Krumbholz',
  strasse: 'Musterstraße 12', einsatzort: '80331, München', telefon: '', email: '',
  agGleich: false,
  agAnrede: 'Herr', agVorname: 'Steffen', agNachname: 'Krumbholz',
  agStrasse: 'Beispielweg 5', agOrt: '80333, München', agTelefon: '089 1234567', agEmail: 'steffen@example.de',
  kpAnrede: 'Herr', kpVorname: 'Steffen', kpNachname: 'Krumbholz',
  kpTelefon: '089 1234567', kpEmail: 'steffen@example.de',
  signatur: 'Steffen Krumbholz',
};

const PREVIEW_MATCHINGS: Array<{ nurse: Nurse; caregiverId: number }> = [
  { caregiverId: 999010, nurse: { caregiverId: 999010, name: 'Anna Nowak', age: 58, experience: '8 J. Erfahrung', experienceYears: 8, availability: 'sofort verfügbar', availableSoon: true, language: { level: 'Gut', bars: 3 }, color: '#8B7355', addedTime: 'heute', isLive: true, gender: 'female', image: 'https://i.pravatar.cc/200?img=44', history: { assignments: 22, avgDurationMonths: 3.1 } } },
  { caregiverId: 999011, nurse: { caregiverId: 999011, name: 'Ewa Lewandowski', age: 65, experience: '12 J. Erfahrung', experienceYears: 12, availability: 'verfügbar ab 02.06.', availableSoon: true, language: { level: 'Gut', bars: 3 }, color: '#A18973', addedTime: 'gestern', isLive: true, gender: 'female', image: 'https://i.pravatar.cc/200?img=49', history: { assignments: 35, avgDurationMonths: 3.6 } } },
  { caregiverId: 999012, nurse: { caregiverId: 999012, name: 'Helena Wiśniewska', age: 54, experience: '4 J. Erfahrung', experienceYears: 4, availability: 'sofort verfügbar', availableSoon: true, language: { level: 'Mittel', bars: 2 }, color: '#B5A184', addedTime: 'vor 2 Tagen', isLive: true, gender: 'female', image: 'https://i.pravatar.cc/200?img=45', history: { assignments: 9, avgDurationMonths: 2.4 } } },
  { caregiverId: 999013, nurse: { caregiverId: 999013, name: 'Pavel Kowalski', age: 61, experience: '7 J. Erfahrung', experienceYears: 7, availability: 'verfügbar ab 26.05.', availableSoon: true, language: { level: 'Grund', bars: 1 }, color: '#6B5444', addedTime: 'heute', isLive: true, gender: 'male', image: 'https://i.pravatar.cc/200?img=12', history: { assignments: 18, avgDurationMonths: 2.9 } } },
];

// Rekonstruiert eine Nurse aus einem gespeicherten CaregiverSnapshot (volle
// Karte: Foto, Erfahrung, Sprache, Historie) ODER — wenn kein Snapshot da ist
// (z. B. Alt-Einladung, die nur den Namen geloggt hat) — aus dem Namen allein
// (MatchCardDone zeigt dann Initialen + Name + Status, kein Alter). Damit ist
// "Bereits bearbeitet" unabhängig davon, ob Mamamia die PK noch in den
// Matchings zurückgibt.
function nurseFromProcessedEvent(cgId: number, name: string, snapshot?: CaregiverSnapshot): Nurse {
  const base = {
    caregiverId: cgId, availability: '', availableSoon: false, addedTime: '',
    isLive: false, gender: 'female' as const,
  };
  if (snapshot) {
    return {
      ...base,
      name: snapshot.name || name || '?',
      age: snapshot.age ?? 0,
      experience: snapshot.experience ?? '',
      experienceYears: snapshot.experienceYears ?? 0,
      language: { level: snapshot.languageLevel ?? '', bars: snapshot.languageBars ?? 0 },
      color: snapshot.color ?? '#71717A',
      image: snapshot.image,
      history: (snapshot.historyAssignments != null || snapshot.historyAvgDurationMonths != null)
        ? { assignments: snapshot.historyAssignments ?? 0, avgDurationMonths: snapshot.historyAvgDurationMonths ?? 0 }
        : undefined,
    };
  }
  return {
    ...base,
    name: name || '?', age: 0, experience: '', experienceYears: 0,
    language: { level: '', bars: 0 }, color: '#B5A184', image: undefined,
  };
}

// Baut einen CaregiverSnapshot aus einer Nurse — beim Einladen mitgeloggt,
// damit "Bereits bearbeitet" die PK später voll rekonstruieren kann, auch wenn
// Mamamia sie nicht mehr in den Matchings liefert. Gleiche Felder wie der
// Snapshot bei caregiver_declined.
function snapshotFromNurse(n: Nurse): CaregiverSnapshot {
  return {
    name: n.name,
    age: n.age,
    image: n.image,
    color: n.color,
    experience: n.experience,
    experienceYears: n.experienceYears,
    languageLevel: n.language?.level,
    languageBars: n.language?.bars,
    historyAssignments: n.history?.assignments,
    historyAvgDurationMonths: n.history?.avgDurationMonths,
  };
}

// Numerische Bridge-Referenz einer accepted App für den
// lead_application_acceptances-Upsert (route.ts verlangt Number.isFinite):
// echte Bewerbungs-IDs sind bereits numerisch; synthetische fc-Apps
// (agentur-seitige Annahme, PR #378) tragen die mamamia-final_confirmation-ID
// hinter dem 'fc-'-Präfix — die einzige echte mamamia-Referenz in dem Fall.
// null = keine belastbare Referenz → der „Vertrag jetzt abschließen"-Button
// wird gar nicht erst angeboten (fail-soft).
function acceptanceApplicationId(appId: string): number | null {
  const raw = appId.startsWith('fc-') ? appId.slice(3) : appId;
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CustomerPortalPage: FC = () => {
  // Prototyp-Takeover: online-signierbarer Vertrag (?preview=vertrag).
  // IS_PREVIEW_VERTRAG ist eine Modul-Konstante → konsistent über alle Renders
  // (Rules-of-Hooks-safe, da der Early-Return-Pfad sich nie ändert).
  if (IS_PREVIEW_VERTRAG) return <VertragSignieren />;

  // ─── Lead loading via token ──────────────────────────────────────────────────
  // Preview-Mode: hardcoded Lead + skip Supabase fetch.
  const [lead, setLead] = useState<Lead | null>(IS_PREVIEW_ANY ? PREVIEW_LEAD : null);
  const [leadLoading, setLeadLoading] = useState(!IS_PREVIEW_ANY);
  const [leadError, setLeadError] = useState<string | null>(null);
  // Token the customer arrived with — exposed to ExpiredLinkScreen so its
  // "Neuen Link senden" button can identify the lead. null when no ?token
  // in the URL (different UX branch: no regen offered, just contact CTA).
  const [tokenFromUrl, setTokenFromUrl] = useState<string | null>(null);

  useEffect(() => {
    if (IS_PREVIEW_ANY) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    setTokenFromUrl(token);
    if (!token) {
      // No token → nothing to show. No demo fallback (CLAUDE.md §1).
      setLeadError('Ihr persönlicher Link fehlt. Bitte öffnen Sie die E-Mail erneut und klicken Sie auf den Angebots-Link.');
      setLeadLoading(false);
      return;
    }
    fetchLeadByToken(token).then(({ lead: l, error }) => {
      if (error || !l) {
        setLeadError('Ihr Angebot konnte nicht geladen werden. Bitte öffnen Sie den Link aus Ihrer E-Mail erneut.');
      } else {
        setLead(l);
        // Report back to the kostenrechner lead so the Nachfass emails know
        // the customer reached the portal. Fire-and-forget. `m` ist die
        // Quell-Markierung aus den Nachfass-Mail-Links (pn1/pn2/pn3/wp) —
        // damit wird messbar, welche Mail den Besuch gebracht hat.
        const mailSource = new URLSearchParams(window.location.search).get('m');
        reportLeadEvent(l.token, 'portal_opened', mailSource ? { mail_source: mailSource } : undefined);
        // Stitch this portal session to the customer's earlier
        // kostenrechner session in Clarity. The kalkulation page does the
        // matching identify on its side. Idempotent + retries until the
        // GTM-loaded Clarity tag is ready.
        identifyClarity(l.token);
      }
      setLeadLoading(false);
    });
  }, []);

  // Applications state. Empty by default — populated once Mamamia session
  // is ready and `listApplications` returns. No mock seeds (CLAUDE.md §1).
  const [applications, setApplications] = useState<Application[]>(
    IS_PREVIEW_GEBUCHT
      ? [{ ...PREVIEW_APPLICATION, status: 'accepted' }]
      : (IS_PREVIEW_BEWERBUNG || IS_PREVIEW_CHAT)
      ? [PREVIEW_APPLICATION]
      : [],
  );
  // Per-session local overrides keyed by caregiverId. Server is source of truth
  // for persistence (invitedCaregiverIds via listInvitedCaregiverIds RPC,
  // lead.declined_caregiver_ids via Supabase column). This map only carries
  // optimistic updates between the user's click and the server-side refetch.
  //   - id → 'invited':  user just clicked Einladen (before refetchInvited)
  //   - id → 'declined': user just clicked Nein danke (before lead refresh)
  //   - id → 'pending':  user just undid a declined match (mask server side)
  // Resolved status per caregiver is derived in `nurseStatusById` (useMemo).
  const [statusOverrides, setStatusOverrides] = useState<Map<number, NurseStatus>>(new Map());
  const [selectedNurse, setSelectedNurse] = useState<Nurse | null>(null);
  // Tracking: kam der gerade geöffnete Profil-Modal aus einer Interest-Card?
  // Wenn ja, zeigt das Modal oben den "Hat Interesse signalisiert"-Hinweis-
  // Block. State wird beim Modal-Close zurückgesetzt.
  const [selectedFromInterestId, setSelectedFromInterestId] = useState<number | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [nurseModalApp, setNurseModalApp] = useState<Application | null>(null);
  const [nurseMatchIdx, setNurseMatchIdx] = useState<number | null>(null);
  const [declineConfirmApp, setDeclineConfirmApp] = useState<Application | null>(null);
  // Unterschriebener Vertrag (Daten + getippte Signatur) aus dem Annahme-Flow.
  // Erlaubt die read-only Präsentation des fertigen Vertrags im gebuchten Portal.
  const [signedForm, setSignedForm] = useState<ContractFormData | null>(
    IS_PREVIEW_GEBUCHT ? PREVIEW_SIGNED_FORM : null,
  );
  const [showSignedContract, setShowSignedContract] = useState(false);
  // „Vertrag nachträglich abschließen" (Martin, 2026-07-15): App, für die das
  // AngebotPruefenModal im contractOnly-Modus (NUR Schritt 2 / Vertragsformular)
  // offen ist. Gesetzt vom BookedScreen-Button, wenn die Annahme agentur-seitig
  // erfolgte (synthetische fc-App) und noch kein Vertrag vorliegt.
  const [contractApp, setContractApp] = useState<Application | null>(null);
  // Prototyp: Chat mit der beworbenen Pflegekraft (übersetzt, mit Leitplanken).
  const [chatNurse, setChatNurse] = useState<Nurse | null>(
    IS_PREVIEW_CHAT ? PREVIEW_APPLICATION.nurse : null,
  );
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  // Patientendaten-Card im Preview-Modus normalerweise als „bereits gespeichert"
  // markieren (versteckt die Karte). Ausnahme: ?preview=patient zeigt die
  // Karte explizit — Profile-Card direkt geöffnet, damit man den Wizard
  // visuell testen kann.
  const [patientSaved, setPatientSaved] = useState(IS_PREVIEW_ANY && !IS_PREVIEW_PATIENT);
  const [showPatientReminder, setShowPatientReminder] = useState(false);
  const [triggerOpenPatient, setTriggerOpenPatient] = useState(IS_PREVIEW_PATIENT);

  // Rückmeldung zum Angebot: einmal beantwortet oder weggeklickt, ist Ruhe —
  // und zwar RUHEZEIT_TAGE lang, nicht nur für diese Sitzung (Martin, 12.08.:
  // „wann zeigen wir das eigentlich?"). Vorher stand hier bewusst KEIN
  // localStorage, mit dem Gedanken „beim nächsten Besuch kann sich die Lage
  // geändert haben". In der Praxis hiess das: antworten, Seite neu laden,
  // sofort wieder gefragt werden. Das ist keine Auffrischung, sondern Nerven.
  //
  // Nach einer Woche darf sie wieder auftauchen — dann IST „Vielleicht später"
  // eine neue Frage. Wer das Formular ausgefüllt hat, sieht sie ohnehin nie
  // wieder (`patientSaved` schaltet sie ab).
  const feedbackKey = lead?.token ? `pm_feedback_${lead.token}` : null;
  const [feedbackWeg, setFeedbackWeg] = useState(false);
  // Gespeicherten Stempel EINMAL lesen, sobald der Token da ist. iOS-WebKit im
  // privaten Modus wirft beim Zugriff → dann bleibt es beim Sitzungsverhalten.
  useEffect(() => {
    if (!feedbackKey || IS_PREVIEW_ANY) return;
    try {
      if (feedbackInRuhezeit(localStorage.getItem(feedbackKey))) setFeedbackWeg(true);
    } catch { /* privater Modus — dann eben nur für die Sitzung */ }
  }, [feedbackKey]);
  const feedbackErledigt = () => {
    setFeedbackWeg(true);
    // In der Vorschau NICHT stempeln — sonst wäre die Blase nach einmal
    // Wegklicken für sieben Tage weg und nicht mehr vorführbar.
    if (IS_PREVIEW_ANY) return;
    try { if (feedbackKey) localStorage.setItem(feedbackKey, String(Date.now())); } catch { /* s.o. */ }
  };
  // Sie erscheint NICHT sofort: Erst wenn der Kunde am Angebot und an den
  // Pflegekräften vorbei ist. Eine Frage, die über dem Preis aufpoppt,
  // unterbricht mitten im Lesen und bietet einen Ausstieg an, bevor er die
  // Pflegekräfte überhaupt gesehen hat.
  //
  // Ausgelöst wird sie, sobald der Pflegesituation-Abschnitt ins Bild kommt —
  // NICHT über eine Pixelschwelle am Scroll-Ereignis. Der Abschnitt IST die
  // Grenze („alles gesehen, jetzt käme die Arbeit"), das ist also die
  // ehrliche Bedingung statt einer geratenen Zahl. Und es funktioniert
  // unabhängig davon, WIE der Kunde dorthin kam: wischen, Sprungmarke,
  // wiederhergestellte Scroll-Position nach Reload. (Ein scroll-Listener
  // verpasst genau die letzten beiden — beim Prüfen am 12.08. feuerte
  // programmatisches Scrollen gar kein Ereignis.)
  //
  // In der Vorschau von Anfang an „reif": Dort soll die Blase sofort zu sehen
  // sein, ohne erst hinscrollen zu müssen — und die Vorschau-Umgebung meldet
  // ohnehin weder scroll- noch Intersection-Ereignisse (12.08. geprüft: auch
  // ein manuell gesetzter Observer feuert dort nie).
  // Zweite Bedingung neben dem Scrollen: eine Mindest-Verweildauer. Scrollen
  // allein beweist nicht, dass jemand gelesen hat — wer einmal schnell
  // durchwischt, hat zum Angebot noch keine Meinung, und eine Frage danach
  // erzeugt eine Zufallsantwort statt einer echten (Martin, 12.08.).
  const VERWEILDAUER_MS = 45_000;
  const [feedbackVerweilt, setFeedbackVerweilt] = useState(IS_PREVIEW_ANY);
  useEffect(() => {
    if (feedbackVerweilt) return;
    const t = setTimeout(() => setFeedbackVerweilt(true), VERWEILDAUER_MS);
    return () => clearTimeout(t);
  }, [feedbackVerweilt]);

  const [feedbackReif, setFeedbackReif] = useState(IS_PREVIEW_ANY);
  useEffect(() => {
    if (feedbackReif) return;
    const el = document.getElementById('patientendaten');
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setFeedbackReif(true); },
      { rootMargin: '0px 0px -20% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // `patientSaved` in den Abhängigkeiten, weil der beobachtete Abschnitt
    // erst existiert, wenn er gerendert ist. `hasPending` bewusst NICHT —
    // es ist hier oben noch nicht deklariert, und wenn Bewerbungen offen
    // sind, blendet die Render-Bedingung die Blase ohnehin aus.
  }, [feedbackReif, patientSaved]);

  // Sektion „Pflegesituation" klappt wie „Ihr persönliches Angebot" ueber die
  // Kopfzeile (Martin, 2026-07-12): offen solange nicht gespeichert,
  // danach eingeklappt mit Status-Pill; manueller Toggle gewinnt.
  const [patientExpandedManual, setPatientExpandedManual] = useState<boolean | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Manual override for the "Ihr Angebot" expand/collapse. null = follow
  // the auto rule below (expanded only in initial state). Toggling sets
  // an explicit value that wins over the auto rule.
  const [offerExpandedManual, setOfferExpandedManual] = useState<boolean | null>(null);
  // Zweiter, unabhängiger Zustand seit 11.08.: Der Kopf-Chevron klappt den
  // ganzen Abschnitt zu (wichtig für spätere Zustände, in denen das Angebot
  // nur noch Referenz ist), „Alle Kosten im Überblick" klappt die
  // Kostenaufstellung IM Kasten auf. Beim Umbau war das kurzzeitig derselbe
  // Schalter — dadurch fehlte das Einklappen des Abschnitts ganz.
  const [costsExpanded, setCostsExpanded] = useState(false);
  // Erstbesuch pro Lead (localStorage): beim ERSTEN Reingehen ins Portal soll
  // "Ihr Angebot" aufgeklappt sein — danach folgt es der Fortschritts-Regel
  // (collapsed sobald Patientendaten erfasst sind). In Preview immer true,
  // damit der Erstbesuch-Zustand sichtbar ist. iOS-WebKit-localStorage kann
  // fehlschlagen → Fallback "kein Erstbesuch" (greift dann nur die Auto-Regel).
  const [offerFirstVisit] = useState<boolean>(() => {
    if (IS_PREVIEW_ANY) return true;
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      if (!token) return false;
      const key = `pm_portal_offer_seen_${token}`;
      const seen = localStorage.getItem(key) === '1';
      if (!seen) localStorage.setItem(key, '1');
      return !seen;
    } catch {
      return false;
    }
  });

  // ─── Mamamia session + queries (K2-K4 integration) ───────────────────────
  const { session, ready: mmReady, error: mmError, expired: mmExpired } = useMamamiaSession(lead?.token ?? null, JOB_ID_PARAM);
  // Token lief WÄHREND der Sitzung ab (z. B. beim Speichern erkannt) —
  // gleiches Ziel wie mmExpired: Selbst-Service-Screen für neuen Link.
  const [saveTokenExpired, setSaveTokenExpired] = useState(false);
  const { data: mmCustomer, loading: mmCustomerLoading, error: mmCustomerError } = useCustomer(mmReady);
  const { data: mmJobOffer, loading: mmJobOfferLoading, error: mmJobOfferError, refetch: refetchJobOffer } = useJobOffer(mmReady);
  const { data: mmApplications, loading: mmApplicationsLoading, error: mmApplicationsError, refetch: refetchApplications } = useApplications({ limit: 20 }, mmReady);
  // limit=20 is intentional — client-side ranking (see `effectiveMatched`)
  // re-orders the page-1 batch by our own criteria (availability, freshness,
  // experience) rather than relying on Mamamia's server-side `order_by`.
  // limit=200: deckt aktuelle Mamamia-Pools (max ~110 verfügbare Matches
  // pro Lead, Stand 14.06.) mit Sicherheitsmarge ab. Vorher limit=20 hat
  // bei größeren Pools (Krentler: 112 verfügbar) ~80 % der besten PKs
  // verschluckt. Performance bleibt vertretbar — Mamamia liefert pro
  // Match einen schlanken Caregiver-Ref ohne avatar-Blob.
  const { data: mmMatchings, loading: mmMatchingsLoading, error: mmMatchingsError, refetch: refetchMatchings } = useMatchings({ limit: 200 }, mmReady);
  // Mamamia's default listMatchings excludes matchings where is_request=true
  // (already-invited caregivers), so without this second call the invited
  // ones simply vanish from the list after F5 — only their ids would survive
  // via useInvitedCaregivers, but the seed-effect below can only flip the
  // status of caregivers that are still in `effectiveMatched`. Fetching the
  // invited matchings explicitly puts them back into the list with full
  // caregiver data so the modal click and badge both work.
  const { data: mmInvitedMatchings } = useMatchings({ limit: 100, filters: { is_request: true } }, mmReady);
  // Set of caregiver IDs already invited (Request rows in Mamamia). Used
  // below to seed nurseStatuses with 'invited' so the badge survives F5.
  const { data: invitedCaregiverIds, loading: invitedLoading, error: invitedError, refetch: refetchInvited } = useInvitedCaregivers(mmReady);

  // Interests (Pflegekraft signalisiert proaktiv Interesse — precursor
  // to a formal Bewerbung). Surface in a dedicated section between
  // "Ihre Bewerbungen" and matchings. Filter by dismissed_set so
  // caregivers the customer already said "no thanks" to don't reappear
  // after refetch.
  const { data: mmInterests, refetch: refetchInterests } = useInterests(mmReady);
  const { data: dismissedCaregivers, refetch: refetchDismissed } = useDismissedCaregivers(mmReady);
  const [interestStatusOverrides, setInterestStatusOverrides] = useState<Map<number, InterestActionStatus>>(new Map());
  // Preview-Mode-Helper: nach erfolgreicher Einladung wird die Pflegekraft
  // hier abgelegt. In Production passiert das durch Mamamia-Refetch
  // (`mmInvitedMatchings` enthält den frisch invitierten Caregiver mit
  // is_request=true), in Preview simulieren wir das.
  // - Key: caregiverId
  // - Value: Nurse (damit wir sie als invited match in effectiveMatched
  //   einhängen können)
  // Effekt: visibleInterests filtert die Karte aus (über invitedSet) UND
  // sie taucht in effectiveMatched mit Status='invited' wieder auf.
  const [previewInvitedFromInterest, setPreviewInvitedFromInterest] = useState<Map<number, Nurse>>(new Map());

  // Caregiver-IDs die irgendwann mal als Interest aufgetaucht sind. Wird
  // gebraucht damit eine bereits-eingeladene oder bereits-abgelehnte
  // Pflegekraft, die ursprünglich proaktiv Interesse gezeigt hat, im
  // unteren bearbeitet-Bereich der Matching-Liste ein "Hat Interesse"-
  // Badge zusätzlich zum Status-Pill bekommt — der Kunde kann so
  // differenzieren ob die Einladung/Ablehnung aus einem Interest oder
  // einem normalen Matching kam.
  //
  // Akkumulierend über die Session: sourceInterests kann nach Mamamia-
  // Refetch eine Pflegekraft verlieren (z.B. nach Invite/Dismiss), aber
  // wir wollen die Origin-Info trotzdem behalten.
  const [interestOriginIds, setInterestOriginIds] = useState<Set<number>>(new Set());

  // Nurses, die der Kunde aus dem Interest-Bereich abgelehnt hat. Werden im
  // bearbeitet-Bereich (am Ende der Matching-Liste) als virtuelle declined
  // MatchCards mit "Hat Interesse" + "Abgelehnt"-Badges gerendert. Nurse-
  // Daten kommen aus dem Snapshot in lead_events.metadata (initial seed
  // auf Mount, optimistisch bei confirmDismissInterest).
  const [declinedFromInterest, setDeclinedFromInterest] = useState<Map<number, Nurse>>(new Map());

  // Accepted applications (lead_application_acceptances). Written by the
  // kostenrechner bridge after AngebotPruefenModal step 2 → bridge fires
  // info@primundus.de team mail with contract data, no Mamamia call.
  // On portal load we flip the matching app's status to 'accepted' →
  // existing BookedScreen renders. Persists across reload.
  const { data: acceptedApplications, refetch: refetchAcceptedApplications } = useAcceptedApplications(mmReady);

  // Multi-Job (Opcja B, Dachs 8899): die Jobs des Leads — speist den
  // "Alle meine Einsätze"-Link auch OHNE ?job=-Deeplink (vorher war die
  // Übersicht nur von einem ?job=-Einstieg aus erreichbar; Kunden mit
  // Folge-Einsatz konnten den alten gebuchten Job nie wiederfinden).
  // Nebeneffekt erwünscht: listLeadJobs synct best-effort aus Mamamia →
  // der lead_jobs-Spiegel (Basis der Aktiv-Job-Wahl beim Onboard) ist
  // nach jedem Portal-Besuch frisch.
  const { data: leadJobs } = useLeadJobs(mmReady);
  const hasMultipleJobs = (leadJobs?.length ?? 0) > 1;

  // Gebucht-Ableitung aus dem Mamamia-Stand (Fix Hagedorn 2026-07-15):
  // akzeptiert die AGENTUR die Bewerbung im SA-Portal, gibt es keine
  // lead_application_acceptances-Zeile — der einzige Beleg ist
  // JobOffer.final_confirmation (via GET_CUSTOMER job_offers). Fail-soft:
  // liefert der Proxy die job_offers (noch) nicht, bleibt das null und am
  // heutigen Verhalten ändert sich nichts.
  const mamamiaConfirmedJob = useMemo(
    () => pickFinalConfirmedJob(mmCustomer?.job_offers, session?.job_offer_id ?? null),
    [mmCustomer, session],
  );

  // Wenn Mamamia die akzeptierte Application aus listApplications entfernt
  // (kommt vor sobald die Bewerbung dort als abgeschlossen markiert wird),
  // brauchen wir die volle Pflegekraft-Daten getrennt zu laden, um eine
  // synthetische Application zu rekonstruieren. Wir nehmen den ersten Row
  // (in der Praxis gibt's pro Lead genau eine Annahme). Fallback: die per
  // final_confirmation bestätigte Pflegekraft (agentur-seitige Annahme).
  const firstAcceptedCaregiverId = acceptedApplications?.rows[0]?.caregiver_id
    ?? mamamiaConfirmedJob?.final_confirmation?.caregiver?.id
    ?? null;
  const { data: acceptedCaregiverProfile } = useCaregiver(firstAcceptedCaregiverId);

  // K5 mutations
  const rejectAppMutation = useRejectApplication();
  const confirmMutation = useStoreConfirmation();
  const inviteMutation = useInviteCaregiver();
  const dismissCaregiverMutation = useDismissCaregiver();
  const updateCustomerMutation = useUpdateCustomer();
  const updateJobDescriptionMutation = useUpdateJobDescription();
  const updateJobOfferDatesMutation = useUpdateJobOfferDates();
  // Invite rate-limit snapshot from our Supabase ledger
  // (caregiver_invite_attempts). Read on portal load, refetched after
  // every successful invite. Backend hard-gate in mamamia-proxy.inviteCaregiver
  // is the security boundary; this hook drives UX (disable button + modal).
  const { data: inviteRate, refetch: refetchInviteRate } = useInviteRateState(mmReady);
  const [inviteRateModalState, setInviteRateModalState] = useState<{
    retryAfterSeconds: number;
    limit: number;
    windowMinutes: number;
  } | null>(null);
  // Global "an invite is in flight on this page" lock. The race that
  // motivated this: customer rapid-clicks 5+ Einladen buttons before the
  // first backend response returns; each parallel call to mamamia-proxy
  // reads `used < 5` from the ledger and all pass the gate, blowing the
  // 5/hr cap. We serialize at the UI: while one invite is in flight,
  // ALL other Einladen buttons (MatchCard + InterestCard) render
  // disabled via the `globalInviteLocked` prop. The active card carries
  // its own 'sending' spinner; the rest dim. canInviteNurse also rejects
  // pre-emptive clicks while this is true so even a stale (= not yet
  // re-rendered) button still can't fire a parallel mutation.
  const [inviteInFlight, setInviteInFlight] = useState(false);
  // K6 (replaced) — customer-scope auth used to require a verify-mail
  // round-trip. As of the panel-style flow (mamamia-proxy → Sanctum SPA
  // login + ImpersonateCustomer), the Edge Function impersonates the
  // customer server-side, so no banner / token exchange is needed in
  // the browser. Invite simply calls the proxy.

  // Lazy-load full caregiver profile when modal opens — replaces mockProfile().
  // Backed by `caregiverCache` so that prefetched ids (visible matchings +
  // application caregivers) open instantly instead of paying GET_CAREGIVER's
  // 1.7-3.1s round-trip every click.
  const { data: fullCaregiver, loading: caregiverLoading } = useCaregiver(
    selectedNurse?.caregiverId ?? null,
  );

  // "Über die Pflegekraft" — take about_de straight from Mamamia. If it's
  // STALE (Mamamia's old ≤200-char descriptions), regenerate via Mamamia and
  // swap in the fresh text; the modal shows a spinner meanwhile. Fresh (>200)
  // → shown directly, no LLM cost. Error → keep the old (real) text.
  const [aboutRegen, setAboutRegen] = useState<{ forId: number | null; loading: boolean; text: string | null }>(
    { forId: null, loading: false, text: null },
  );
  useEffect(() => {
    if (!fullCaregiver) return;
    const id = fullCaregiver.id;
    if (!isAboutDeStale(fullCaregiver.about_de)) {
      // Fresh Mamamia description → use as-is, no regeneration.
      setAboutRegen({ forId: id, loading: false, text: null });
      return;
    }
    // Stale → regenerate (dedup'd per caregiver). Spinner meanwhile.
    setAboutRegen({ forId: id, loading: true, text: null });
    let cancelled = false;
    regenerateGermanDescription(id)
      .then(({ aboutDe }) => {
        if (!cancelled) setAboutRegen({ forId: id, loading: false, text: aboutDe });
      })
      .catch(() => {
        // Error → drop the spinner, fall back to the old (real) text.
        if (!cancelled) setAboutRegen({ forId: id, loading: false, text: null });
      });
    return () => { cancelled = true; };
  }, [fullCaregiver?.id]);

  const enrichedSelectedNurse = (() => {
    if (!selectedNurse) return null;
    // Preview: Bewerbungs-Pflegekraft hat kein echtes Profil (kein Mamamia-
    // Fetch). Ohne Anreicherung zeigt das Profil-Modal nur „Geschlecht" und
    // wirkt leer/nicht-scrollbar. Wie bei den Interesse-Karten ein volles
    // Dummy-Profil einsetzen, damit der Preview repräsentativ + scrollbar ist.
    if (IS_PREVIEW_ANY && !selectedNurse.profile) {
      return { ...selectedNurse, profile: PREVIEW_INTEREST_PROFILE, detailedAssignments: PREVIEW_INTEREST_ASSIGNMENTS };
    }
    if (!fullCaregiver) return selectedNurse;
    const enriched = mapCaregiverToNurse(fullCaregiver, {
      nowIso: new Date().toISOString(),
      nowYear: new Date().getFullYear(),
    });
    const base = { ...selectedNurse, ...enriched };
    // profile.aboutDe is Mamamia's raw about_de (from the mapper). If it was
    // stale and we regenerated a fresh one, swap that in.
    if (
      aboutRegen.text
      && aboutRegen.forId === fullCaregiver.id
      && base.profile
    ) {
      base.profile = { ...base.profile, aboutDe: aboutRegen.text };
    }
    // Preserve color (deterministic by id, identical anyway) + caregiverId.
    return base;
  })();

  // Caregiver id mapping per match index (for invite flow).
  // effectiveMatched[idx].caregiverId resolves to real Mamamia id. Empty
  // array until session ready — NO mock/demo fallback (CLAUDE.md §1).
  //
  // Client-side ranking — Mamamia returns up to 20 already wish-filtered
  // candidates (gender, skill floor, driving license — verified live
  // 2026-04-29: 0 wish violations across 6 customers / 241 matches).
  // What we add on top: order by signals we care about per business rule.
  //   primary  : available_from ASC  (next available first; null/past = top)
  //   secondary: last_contact_at DESC (recently-active CGs respond faster)
  //   tertiary : hp_total_jobs   DESC (more experience first)
  // ─── Sprach-Strikt-Filter (Kostenrechner 3 Stufen vs Mamamia 5) ────────
  // Kostenrechner kennt nur grund/mittel/gut — Mamamia hat level_0..level_4.
  // Ohne Filter sähe ein Kunde, der "kommunikativ" gewählt hat, auch level_4-
  // Pflegekräfte und würde im Vertrag plötzlich +450 €/Mo Aufpreis sehen.
  // Wir filtern daher strikt auf den passenden Bucket — lieber 1-2 Karten
  // statt 3 mit falscher Preis-Erwartung. Wenn die Form das Feld nicht
  // enthält (alte Leads pre-2025), bleibt der Filter aus.
  const deutschWish: string | null | undefined = (() => {
    const k = lead?.kalkulation as Record<string, unknown> | null | undefined;
    const fd = k?.formularDaten as Record<string, unknown> | null | undefined;
    const v = fd?.deutschkenntnisse;
    return typeof v === 'string' ? v : null;
  })();

  // Zähler des Matching-Trichters für das ?debug=1-Overlay. Anlass: die
  // Meldung „beim Ablehnen verschwinden mehrere Karten" (11.08.) liess sich
  // in der Vorschau nicht nachstellen — dort geht immer genau eine. Der
  // wahrscheinliche Grund steckt in den beiden Fallback-Filtern unten: sie
  // hängen den GANZEN Rest-Eimer an, solange weniger als TARGET_VISIBLE
  // Kräfte durchkommen, und lassen ihn komplett fallen, sobald die Schwelle
  // erreicht ist. Ohne diese Zahlen ist im Nachhinein nicht zu sehen, ob
  // eine Karte oder ein ganzer Eimer gewandert ist.
  const funnel = {
    merged: 0, langFiltered: 0, young: 0, ageRest: 0,
    goodBadge: 0, badgeRest: 0, final: 0, ageFallback: false, badgeFallback: false,
  };

  const effectiveMatched = (() => {
    if (IS_PREVIEW_ANY) {
      // Base matchings + post-invite-from-interest (so Maria erscheint nach
      // Einladung in der gleichen Liste mit Status 'invited').
      const fromInterest = [...previewInvitedFromInterest.entries()].map(
        ([caregiverId, nurse]) => ({ caregiverId, nurse }),
      );
      return [...PREVIEW_MATCHINGS, ...fromInterest];
    }
    if (!mmReady || !mmMatchings?.data) return [];
    const now = new Date();
    const nowIso = now.toISOString();
    const nowYear = now.getFullYear();

    // Merge open matchings (default listMatchings) + already-invited matchings
    // (filters: is_request:true). Dedup by caregiver.id — a row should never
    // appear in both lists, but be defensive against backend overlap.
    // invitedIds merken wir uns explizit, weil der Sprach-Strikt-Filter
    // unten eingeladene Pflegekräfte bewusst durchwinkt (sonst würde eine
    // bereits eingeladene CG durch den Filter optisch verschwinden).
    const seen = new Set<number>();
    const invitedIds = new Set<number>();
    const merged: typeof mmMatchings.data = [];
    for (const m of mmMatchings.data) {
      if (seen.has(m.caregiver.id)) continue;
      seen.add(m.caregiver.id);
      merged.push(m);
    }
    if (mmInvitedMatchings?.data) {
      for (const m of mmInvitedMatchings.data) {
        invitedIds.add(m.caregiver.id);
        if (seen.has(m.caregiver.id)) continue;
        seen.add(m.caregiver.id);
        merged.push(m);
      }
    }

    const langFiltered = merged
      .filter(m => m.is_show !== false)
      // Strikter Sprach-Filter: wenn der Kunde ein Tier gewählt hat UND wir die
      // Stufe der Pflegekraft kennen, muss sie EXAKT der Tier-Stufe entsprechen
      // (grundlegend=level_1, kommunikativ=level_2, sehr-gut=level_4 — Preis-
      // Tier-Modell, kein "mind."-Bereich). Pflegekräfte mit fehlendem
      // germany_skill (null) lassen wir durch — ohne Daten lieber zeigen als
      // fälschlich rausfiltern. Bereits eingeladene (invitedIds) immer sichtbar.
      .filter(m => {
        if (invitedIds.has(m.caregiver.id)) return true;
        return matchesGermanyWish(m.caregiver.germany_skill ?? null, deutschWish);
      })
      .sort(rankComparator(now));

    // Zwei Hartfilter mit Fallback (User-Spec 14.06.):
    //   (a) Alter ≤ 60 — wer drüber ist, kommt nur rein wenn sonst <5 sichtbar
    //   (b) Badge ≥ Silber — Bronze/Starter kommen nur rein wenn sonst <5
    //
    // Beide Filter werden NACH dem rankComparator-Sort angewendet, damit die
    // best-rangierten Kandidaten der jeweiligen Filter-Bucket-Ebene zuerst
    // kommen. Eingeladene Pflegekräfte umgehen beide Filter (sonst würden
    // sie aus Kundensicht verschwinden, was verwirrend wäre).
    //
    // Unbekanntes Geburtsjahr läuft beim Alters-Filter durch (defensiv —
    // könnte jung oder alt sein).
    const TARGET_VISIBLE = 5;
    const MAX_AGE = 60;
    // Badge-Score + Schwellen + "Silber+"-Cut (MIN_BADGE_SCORE): zentrale
    // Quelle lib/mamamia/badge.ts (geteilt mit nurseLevel + rankComparator).
    const isTooOld = (yob: number | null): boolean =>
      yob !== null && (nowYear - yob) > MAX_AGE;
    const badgeScore = (m: typeof langFiltered[number]): number =>
      caregiverBadgeScore(m.caregiver);

    // Stufe 1: Alter ≤ 60
    const young = langFiltered.filter(m => {
      if (invitedIds.has(m.caregiver.id)) return true;
      return !isTooOld(m.caregiver.year_of_birth);
    });
    const ageRest = langFiltered.filter(m => {
      if (invitedIds.has(m.caregiver.id)) return false;
      return isTooOld(m.caregiver.year_of_birth);
    });
    const ageFiltered = young.length >= TARGET_VISIBLE
      ? young
      : [...young, ...ageRest];

    // Stufe 2: Badge ≥ Silber (innerhalb des Alters-Buckets)
    const goodBadge = ageFiltered.filter(m => {
      if (invitedIds.has(m.caregiver.id)) return true;
      return badgeScore(m) >= MIN_BADGE_SCORE;
    });
    const badgeRest = ageFiltered.filter(m => {
      if (invitedIds.has(m.caregiver.id)) return false;
      return badgeScore(m) < MIN_BADGE_SCORE;
    });
    const final = goodBadge.length >= TARGET_VISIBLE
      ? goodBadge
      : [...goodBadge, ...badgeRest];

    funnel.merged = merged.length;
    funnel.langFiltered = langFiltered.length;
    funnel.young = young.length;
    funnel.ageRest = ageRest.length;
    funnel.goodBadge = goodBadge.length;
    funnel.badgeRest = badgeRest.length;
    funnel.final = final.length;
    // true = der Rest-Eimer hängt gerade dran. Kippt dieser Wert zwischen
    // zwei Renders, wandern mehrere Karten auf einmal.
    funnel.ageFallback = young.length < TARGET_VISIBLE;
    funnel.badgeFallback = goodBadge.length < TARGET_VISIBLE;

    return final.map(m => ({
      nurse: mapMatchingToNurse(m, { nowIso, nowYear }),
      caregiverId: m.caregiver.id,
    }));
  })();

  // Server-authoritative override for `patientSaved`. Mamamia flips
  // Customer.status from 'draft' → 'active' on the first patient-form
  // save (StoreCustomer → UpdateCustomer transition). Local state defaults
  // to false and only the AngebotCard's localStorage-hydrate flips it on
  // mount — but that misses (a) customers visiting from a new device /
  // incognito, and (b) customers whose Mamamia profile was completed via
  // a different path (e.g. agency-driven). Any of these would otherwise
  // see the misleading "Achtung: Profil unvollständig" banner despite
  // having a job offer with real applications. We trust Mamamia status as
  // the source of truth and only ever flip TO true, never back to false
  // (so an in-progress mid-edit doesn't accidentally clear the badge).
  useEffect(() => {
    if (mmCustomer?.status && mmCustomer.status !== 'draft' && !patientSaved) {
      setPatientSaved(true);
    }
  }, [mmCustomer?.status, patientSaved]);

  // Sync real applications from Mamamia → local state (keeps existing mutation flow).
  useEffect(() => {
    if (!mmReady || !mmApplications) return;
    const nowIso = new Date().toISOString();
    const nowYear = new Date().getFullYear();
    setApplications(prev => {
      // Preserve local status overlays (accepted/declined) on top of fresh Mamamia data
      const statusById = new Map(prev.map(p => [p.id, p.status]));
      return mmApplications.data.map(a => {
        const mapped = mapApplicationToUI(a, null, { nowIso, nowYear });
        return { ...mapped, status: statusById.get(mapped.id) ?? 'new' };
      });
    });
  }, [mmReady, mmApplications]);

  // Persistence merge — flip status to 'accepted' für Applications, die
  // der Kunde via AngebotPruefenModal step 2 angenommen hat (gespeichert
  // in lead_application_acceptances). Läuft sowohl beim Initial-Mount
  // (nach mmReady + acceptedApplications fetch) als auch nach jedem
  // Refetch. Drei Pfade (Logik extrahiert nach mappers.applyAcceptedOverlay,
  // damit sie testbar ist):
  //
  //   1) Mamamia liefert die akzeptierte Application weiter in
  //      listApplications → wir patchen das vorhandene Objekt auf
  //      status='accepted'.
  //   2) Mamamia liefert sie NICHT mehr (Standardfall ab dem Moment, in
  //      dem die Bewerbung als abgeschlossen markiert ist) → wir
  //      rekonstruieren eine synthetische Application aus dem
  //      contract_snapshot + den getrennt geladenen Caregiver-Daten.
  //      Sonst wäre acceptedApp = null und BookedScreen würde nicht
  //      rendern (Bug Michael Dachs / lead 39def7b2, 11.06.2026).
  //   3) KEINE Portal-Annahme, aber ein Job hat eine Mamamia-
  //      final_confirmation (die Agentur hat im SA-Portal akzeptiert —
  //      Bug Hagedorn, 15.07.2026) → synthetische accepted-App aus dem
  //      Job-Stand, damit acceptedApp + BookedScreen trotzdem greifen.
  //
  // mmApplications ist bewusst in den Deps: der Sync-Effect oben ersetzt
  // den applications-State komplett (synthetische Apps fallen raus) — der
  // Overlay muss danach erneut laufen. Idempotent, daher unkritisch.
  useEffect(() => {
    if (!mmReady || !acceptedApplications) return;
    const hasPortalAcceptance = acceptedApplications.application_ids.length > 0;
    // Heutiges Verhalten unverändert, wenn weder Portal-Annahme noch
    // Mamamia-Confirmation existieren (Fail-soft bei alter Proxy-Version).
    if (!hasPortalAcceptance && !mamamiaConfirmedJob) return;

    const nowIso = new Date().toISOString();
    const nowYear = new Date().getFullYear();
    setApplications(prev => applyAcceptedOverlay(prev, {
      acceptances: acceptedApplications,
      confirmedJob: mamamiaConfirmedJob,
      caregiverProfile: acceptedCaregiverProfile,
      firstAcceptedCaregiverId,
      opts: { nowIso, nowYear },
    }));
  }, [mmReady, mmApplications, acceptedApplications, acceptedCaregiverProfile, firstAcceptedCaregiverId, mamamiaConfirmedJob]);

  // Background prefetch full caregiver profiles for visible matchings +
  // applications. GET_CAREGIVER takes 1.7-3.1s on Mamamia beta — without
  // prefetch, every modal open pays full latency. With prefetch, by the
  // time the user clicks the data is already cached.
  // Concurrency capped inside prefetchCaregivers; safe even with 50 ids.
  useEffect(() => {
    if (!mmReady) return;
    const ids = new Set<number>();
    for (const m of effectiveMatched) ids.add(m.caregiverId);
    if (mmApplications?.data) {
      for (const a of mmApplications.data) ids.add(a.caregiver.id);
    }
    if (ids.size > 0) {
      prefetchCaregivers([...ids]);
    }
    // intentionally not depending on `effectiveMatched` reference identity —
    // its caregiverIds is what we care about, derived from mmMatchings.
  }, [mmReady, mmMatchings, mmApplications]);

  // Resolved nurse status per caregiver — DERIVED from server data + local
  // overrides every render. Replaces the previous synced-state pattern
  // (multi-effect setNurseStatuses({...prev})) which caused an infinite
  // render loop because `effectiveMatched` is recomputed each render
  // (new array ref) and the dep would refire the effect → setState → repeat.
  //
  // Precedence: localOverride (this-session click) > server declined >
  // server invited > 'pending'. An override of 'pending' explicitly
  // unwinds the server declined (used by undo).
  const nurseStatusById = useMemo(() => {
    const out = new Map<number, NurseStatus>();
    const invitedServer = new Set(invitedCaregiverIds ?? []);
    const declinedServer = new Set(lead?.declined_caregiver_ids ?? []);
    for (const m of effectiveMatched) {
      const id = m.caregiverId;
      const override = statusOverrides.get(id);
      if (override !== undefined) {
        out.set(id, override);
      } else if (declinedServer.has(id)) {
        out.set(id, 'declined');
      } else if (invitedServer.has(id)) {
        out.set(id, 'invited');
      } else if (IS_PREVIEW_ANY && previewInvitedFromInterest.has(id)) {
        // Preview: invitierte Interest-Caregiver erscheinen mit 'invited'.
        out.set(id, 'invited');
      } else {
        out.set(id, 'pending');
      }
    }
    return out;
  }, [effectiveMatched, invitedCaregiverIds, lead?.declined_caregiver_ids, statusOverrides, previewInvitedFromInterest]);

  const animateThenProcess = (id: string, fn: () => void) => {
    setExitingIds(prev => new Set([...prev, id]));
    setTimeout(() => {
      fn();
      setExitingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }, 320);
  };

  const openNurseFromApp = (nurse: Nurse, app: Application) => {
    setSelectedApp(null);
    setNurseModalApp(app);
    setNurseMatchIdx(null);
    setSelectedNurse(nurse);
  };
  const openNurseFromMatch = (nurse: Nurse, idx: number) => {
    setNurseModalApp(null);
    setNurseMatchIdx(idx);
    setSelectedNurse(nurse);
  };

  const pendingApps = applications.filter((a) => a.status === 'new');

  // Mail-Deeplink goto=bewerbungen: sobald die Bewerbungen geladen sind,
  // EINMAL zur Sektion scrollen (ref-Guard gegen Re-Scroll bei Refetches).
  const gotoScrolledRef = useRef(false);
  useEffect(() => {
    if (GOTO_PARAM !== 'bewerbungen' || gotoScrolledRef.current) return;
    if (pendingApps.length === 0) return;
    gotoScrolledRef.current = true;
    // Nächster Frame — die Sektion muss erst gerendert sein.
    requestAnimationFrame(() => {
      document.getElementById('bewerbungen')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [pendingApps.length]);
  const doneApps = applications.filter((a) => a.status !== 'new');
  // Declined matches sind jetzt direkt in der Haupt-Matching-Liste am
  // Ende einsortiert (Status='declined', "Abgelehnt"-Pill + Undo im
  // Button). Frühere `declinedMatches`-Liste + MatchCardDone-Pfad
  // entfallen — Status kommt aus dem derived `nurseStatusById`.
  const acceptedApp = applications.find((a) => a.status === 'accepted') ?? null;
  const hasPending = pendingApps.length > 0;
  const matchesUnlocked = !hasPending;

  // Mamamia-Matchings vorübergehend nicht erreichbar (Upstream-500/Netzwerk)
  // ODER noch am Laden — UND wir haben (noch) keine Daten. Dann zeigt das
  // Portal einen ruhigen Lade-Zustand statt einer leeren "keine Pflegekräfte"-
  // Seite (2026-06-26: Mamamia-Matchings 500'ten kurz → Kunden sahen 0 PKs).
  // Bei echtem "0 Treffer" ist mmMatchings.data = [] (truthy) → NICHT hier.
  const matchingsLoadingOrError = mmReady && !mmMatchings?.data && (!!mmMatchingsError || mmMatchingsLoading);

  // Auto-Retry, solange die Matchings-Abfrage fehlerhaft ist: alle 8s im
  // Hintergrund nachladen, bis Mamamia wieder antwortet — der Kunde muss
  // nicht selbst neu laden.
  useEffect(() => {
    if (!mmReady || !mmMatchingsError) return;
    const t = setInterval(() => { refetchMatchings(); }, 8000);
    return () => clearInterval(t);
  }, [mmReady, mmMatchingsError, refetchMatchings]);

  // Prefill for AngebotPruefenModal step 2 — replaces the previous
  // hardcoded fixture (Hildegard/Müller/Rosenstraße/München) that bled
  // through to every customer regardless of their actual data.
  // Priority: stage-B patient_* fields → stage-A lead.* → mmCustomer →
  // empty string. KP (Kontaktperson) fields stay fresh — first time we
  // ask for them.
  const pruefenPrefill: Partial<ContractFormData> = (() => {
    const stageBStreet = lead?.patient_street ?? '';
    const stageBZip = lead?.patient_zip ?? mmCustomer?.customer_contract?.zip_code ?? '';
    const stageBCity = lead?.patient_city ?? mmCustomer?.customer_contract?.city ?? '';
    const ortLine = [stageBZip, stageBCity].filter(Boolean).join(', ');
    return {
      anrede: lead?.patient_anrede || lead?.anrede_text || 'Frau',
      vorname: lead?.patient_vorname || lead?.vorname || '',
      nachname: lead?.patient_nachname || lead?.nachname || '',
      strasse: stageBStreet || mmCustomer?.customer_contract?.street_number || '',
      einsatzort: ortLine,
      // Patient hat meist KEINE eigene Telefon/E-Mail — die vorhandenen
      // Kontaktdaten gehören i.d.R. der Kontaktperson, daher dort vorausfüllen.
      telefon: '',
      email: '',
      kpAnrede: '',
      kpVorname: '',
      kpNachname: '',
      kpTelefon: lead?.telefon || mmCustomer?.phone || mmCustomer?.customer_contract?.phone || '',
      kpEmail: lead?.email || mmCustomer?.email || '',
    };
  })();

  // Compute visible interests — drop rejected-by-caregiver and locally-
  // dismissed-by-customer entries. Also drop interests whose caregiver
  // has already become a pending Application (stronger signal already
  // surfaced) or already been invited (we sent StoreRequest, waiting on
  // their formal application).
  const dismissedSet = new Set(dismissedCaregivers?.caregiver_ids ?? []);
  const applicationCaregiverIds = new Set(
    applications.map((a) => a.nurse?.caregiverId).filter((id): id is number => typeof id === 'number'),
  );
  const invitedSet = new Set(invitedCaregiverIds ?? []);
  // Preview: gemerge invitierte Caregiver in den Filter-Set, damit der
  // InterestCard nach Klick verschwindet (statt auf Mamamia-Refetch zu warten,
  // den es im Preview nicht gibt). Die Pflegekraft taucht stattdessen in
  // effectiveMatched mit Status='invited' wieder auf.
  if (IS_PREVIEW_ANY) previewInvitedFromInterest.forEach((_n, id) => invitedSet.add(id));
  // Preview-Modi: beide (bewerbung + interesse) bekommen die Interest-Dummy
  // damit das Szenario "pending Bewerbung UND offenes Interesse" getestet
  // werden kann.
  // ?preview=wartet simuliert "Profil voll, 0 Bewerbungen, 0 Interest" —
  // ist der einzige Preview-Mode, der KEINE Interest-Dummy haben soll.
  const sourceInterests = IS_PREVIEW_WARTET
    ? []
    : IS_PREVIEW_ANY
      ? [PREVIEW_INTEREST as any]
      : (mmInterests ?? []);
  // Akkumuliere Interest-Origin-IDs aus sourceInterests + Preview-State.
  // Wird in einem Effect synchronisiert (statt direkt in setState im
  // Render) damit React nicht über setState-in-render schreit.
  useEffect(() => {
    const fromSource = (sourceInterests ?? []).map((i: any) => i.caregiver_id).filter((id: any) => typeof id === 'number');
    const fromPreview = Array.from(previewInvitedFromInterest.keys());
    if (fromSource.length === 0 && fromPreview.length === 0) return;
    setInterestOriginIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of fromSource) { if (!next.has(id)) { next.add(id); changed = true; } }
      for (const id of fromPreview) { if (!next.has(id)) { next.add(id); changed = true; } }
      return changed ? next : prev;
    });
  }, [sourceInterests, previewInvitedFromInterest]);

  // Persistenz: auf Mount lead_events laden und
  // (a) Interest-Origin-IDs rehydraten (für "Hat Interesse"-Badge)
  // (b) declined-from-interest aus Snapshots rekonstruieren (für virtuelle
  //     declined MatchCards im bearbeitet-Bereich)
  // Damit überlebt beides F5 + cross-device, auch wenn Mamamia die
  // Pflegekraft inzwischen aus mmInterests gedroppt hat.
  useEffect(() => {
    if (!lead?.token) return;
    let cancelled = false;
    fetchLeadEvents(lead.token, [
      'caregiver_interest_shown',
      'caregiver_declined',
      'caregiver_declined_undone',
    ]).then((events) => {
      if (cancelled || !events.length) return;

      // (a) Interest-Origin
      const interestIds = events
        .filter((e) => e.event_type === 'caregiver_interest_shown')
        .map((e) => Number(e.metadata?.caregiver_id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (interestIds.length > 0) {
        setInterestOriginIds((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const id of interestIds) { if (!next.has(id)) { next.add(id); changed = true; } }
          return changed ? next : prev;
        });
      }

      // (b) Declined-from-interest. Logik: per caregiver_id den letzten
      //     caregiver_declined finden (origin=interest, mit snapshot) und
      //     checken ob danach ein caregiver_declined_undone kam → wenn ja,
      //     überspringen. Sonst als declined-from-interest aufnehmen.
      const byCgId = new Map<number, { lastDeclineTs?: string; lastUndoTs?: string; snapshot?: CaregiverSnapshot }>();
      for (const e of events) {
        const cgId = Number(e.metadata?.caregiver_id);
        if (!Number.isFinite(cgId) || cgId <= 0) continue;
        const bucket = byCgId.get(cgId) ?? {};
        if (e.event_type === 'caregiver_declined' && e.metadata?.decline_origin === 'interest') {
          if (!bucket.lastDeclineTs || e.created_at > bucket.lastDeclineTs) {
            bucket.lastDeclineTs = e.created_at;
            bucket.snapshot = e.metadata?.caregiver_snapshot as CaregiverSnapshot | undefined;
          }
        } else if (e.event_type === 'caregiver_declined_undone') {
          if (!bucket.lastUndoTs || e.created_at > bucket.lastUndoTs) {
            bucket.lastUndoTs = e.created_at;
          }
        }
        byCgId.set(cgId, bucket);
      }
      const newDeclined = new Map<number, Nurse>();
      for (const [cgId, bucket] of byCgId.entries()) {
        if (!bucket.lastDeclineTs || !bucket.snapshot) continue;
        // Undo nach letzter Decline → übersprungen
        if (bucket.lastUndoTs && bucket.lastUndoTs > bucket.lastDeclineTs) continue;
        const s = bucket.snapshot;
        const nurse: Nurse = {
          caregiverId: cgId,
          name: s.name || '?',
          age: s.age ?? 0,
          experience: s.experience ?? '',
          experienceYears: s.experienceYears ?? 0,
          availability: '',
          availableSoon: false,
          language: { level: s.languageLevel ?? '', bars: s.languageBars ?? 0 },
          color: s.color ?? '#71717A',
          addedTime: '',
          isLive: false,
          gender: 'female',
          image: s.image,
          history: (s.historyAssignments != null || s.historyAvgDurationMonths != null)
            ? { assignments: s.historyAssignments ?? 0, avgDurationMonths: s.historyAvgDurationMonths ?? 0 }
            : undefined,
        };
        newDeclined.set(cgId, nurse);
      }
      if (newDeclined.size > 0) {
        setDeclinedFromInterest((prev) => {
          // Merge: server-state als Basis, lokal-state als overlay
          // (für optimistische frische Dismiss-Aktionen).
          const next = new Map(newDeclined);
          for (const [k, v] of prev.entries()) next.set(k, v);
          return next;
        });
      }
    });
    return () => { cancelled = true; };
  }, [lead?.token]);

  // Vollständige Bearbeitet-Historie aus UNSEREN Events (unabhängig davon, ob
  // Mamamia die PK noch in den Matchings liefert): alle eingeladenen + alle
  // abgelehnten Pflegekräfte. Snapshot → volle Karte, sonst Name-only. Wird im
  // "Bereits bearbeitet"-Bereich für die PKs genutzt, die NICHT mehr in
  // effectiveMatched stecken (3 sichtbar + "Weitere anzeigen").
  const [extraProcessed, setExtraProcessed] = useState<{ caregiverId: number; nurse: Nurse; status: 'invited' | 'declined' }[]>([]);
  useEffect(() => {
    if (!lead?.token) return;
    let cancelled = false;
    fetchLeadEvents(lead.token, ['caregiver_invited', 'caregiver_declined', 'caregiver_declined_undone']).then((events) => {
      if (cancelled) return;
      // Chronologisch: letzte Aktion pro caregiver gewinnt; eine Ablehnung kann
      // per späterem caregiver_declined_undone aufgehoben werden.
      const byId = new Map<number, { status: 'invited' | 'declined'; ts: string; name?: string; snapshot?: CaregiverSnapshot; undoneTs?: string }>();
      const sorted = [...events].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
      for (const e of sorted) {
        const cgId = Number(e.metadata?.caregiver_id);
        if (!Number.isFinite(cgId) || cgId <= 0) continue;
        const b = byId.get(cgId) ?? { status: 'invited', ts: '' };
        const snap = e.metadata?.caregiver_snapshot as CaregiverSnapshot | undefined;
        const nm = e.metadata?.caregiver_name as string | undefined;
        if (e.event_type === 'caregiver_invited') {
          b.status = 'invited'; b.ts = e.created_at; if (nm) b.name = nm; if (snap) b.snapshot = snap;
        } else if (e.event_type === 'caregiver_declined') {
          b.status = 'declined'; b.ts = e.created_at; if (nm) b.name = nm; if (snap) b.snapshot = snap;
        } else if (e.event_type === 'caregiver_declined_undone') {
          b.undoneTs = e.created_at;
        }
        byId.set(cgId, b);
      }
      const out: { caregiverId: number; nurse: Nurse; status: 'invited' | 'declined' }[] = [];
      for (const [cgId, b] of byId.entries()) {
        // Ablehnung durch späteres Undo aufgehoben → nicht als bearbeitet zählen.
        if (b.status === 'declined' && b.undoneTs && b.undoneTs > b.ts) continue;
        out.push({ caregiverId: cgId, nurse: nurseFromProcessedEvent(cgId, b.name ?? '', b.snapshot), status: b.status });
      }
      setExtraProcessed(out);
    });
    return () => { cancelled = true; };
  }, [lead?.token]);

  const [showAllDone, setShowAllDone] = useState(false);

  const visibleInterests = sourceInterests.filter((i) => {
    if (i.rejected_at) return false;
    if (dismissedSet.has(i.caregiver_id)) return false;
    if (applicationCaregiverIds.has(i.caregiver_id)) return false;
    if (invitedSet.has(i.caregiver_id)) return false;
    const override = interestStatusOverrides.get(i.caregiver_id);
    if (override === 'dismissed') return false;
    return true;
  });

  const showToast = (msg: string, durationMs = 4000) => {
    setToast(msg);
    setTimeout(() => setToast(null), durationMs);
  };

  // Annahme-Pfad (seit 2026-07-15 automatisch — vorher MVP mit manueller
  // Nacharbeit): die Portal-Annahme führt BEIDES aus:
  //   1. StoreConfirmation in mamamia (über den Proxy, Ownership-geprüft) —
  //      Buchung ist sofort im SA-Portal/mamamia sichtbar, keine manuelle
  //      Annahme mehr nötig.
  //   2. POST an die kostenrechner-Bridge (application_accepted_internal):
  //      Team-Mail mit Vertragsdaten, UPSERT lead_application_acceptances
  //      (BookedScreen nach Reload), Mail C an den Kunden.
  // Schlägt (1) fehl, läuft (2) trotzdem — die Team-Mail trägt dann eine
  // rote Warnung „bitte manuell im SA-Portal annehmen" (alter Ablauf als
  // Fallback). Schlägt (2) fehl, obwohl (1) durch ist, heilt der Detektor
  // nach: er erkennt die final_confirmation und liefert Mails + internen
  // Datensatz beim nächsten Tick (Dedupe-sicher) nach.
  // Event-Metadata für application_accepted_internal — geteilt zwischen
  // acceptApp (Portal-Annahme) und submitContractOnly (Vertrag nachträglich).
  // route.ts baut daraus den lead_application_acceptances-Upsert inkl.
  // contract_snapshot + die Vertragskopie (PDF) für Kunden-/Team-Mail.
  const buildAcceptanceMetadata = (
    appIdNumeric: number,
    targetApp: Application | undefined,
    formData: ContractFormData,
  ) => {
    // Zeitstempel der Unterschrift (menschenlesbar) + vollständige
    // Vertragsdaten — der Server rendert daraus die Vertragskopie (HTML)
    // und hängt sie an Kunden- + Team-Mail (Stufe B).
    const now = new Date();
    const signedAtLabel = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} um ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} Uhr`;
    const contract = targetApp ? buildVertragsDaten(formData, targetApp.offer) : undefined;
    return {
      application_id: appIdNumeric,
      caregiver_id: targetApp?.nurse?.caregiverId,
      caregiver_name: targetApp?.nurse?.name,
      // Pflegekraft-Profil für die Buchungs-Mail (Mail C) — ohne diese Felder
      // stand in der Kachel nur der Name (Martin, 18.08.: „CG-Box fast kaputt
      // ohne Info"). Quelle ist dasselbe nurse-Objekt wie in der Portal-Karte,
      // damit die Box in Mail = Portal denselben Inhalt zeigt.
      caregiver_age: targetApp?.nurse?.age,
      caregiver_german_level: targetApp?.nurse?.language?.level,
      caregiver_einsatz_count: targetApp?.nurse?.history?.assignments,
      caregiver_years_experience: targetApp?.nurse?.experienceYears,
      caregiver_photo_url: targetApp?.nurse?.image,
      contract_patient: {
        anrede: formData.anrede,
        vorname: formData.vorname,
        nachname: formData.nachname,
        strasse: formData.strasse,
        einsatzort: formData.einsatzort,
        telefon: formData.telefon,
        email: formData.email,
      },
      contract_contact: {
        anrede: formData.kpAnrede,
        vorname: formData.kpVorname,
        nachname: formData.kpNachname,
        telefon: formData.kpTelefon,
        email: formData.kpEmail,
      },
      // Elektronische Signatur + Vertrags-Snapshot für die Vertragskopie.
      signatur: formData.signatur,
      signed_at: signedAtLabel,
      contract,
      // Multi-Job (Bug #25): Job der Session — die Bridge dedupliziert Mail C
      // pro Application/Job (Folge-Buchungen mailen!), promotet den Wert in
      // die lead_events-Spalte und baut den &job=-Deeplink der Mail C.
      mamamia_job_offer_id: session?.job_offer_id ?? null,
    };
  };

  // (Refactor 2026-07-22) Das Deutsch→Mamamia-Mapping (SALUTATION_TOKEN,
  // einsatzort-Split, contract_patient/contract_contact) lebt jetzt SERVER-SIDE
  // in supabase/functions/_shared/acceptanceSync.ts — der Browser schickt nur
  // noch die deutschen Roh-Felder an die Bridge (buildAcceptanceMetadata).

  // (Refactor 2026-07-22) Der PDF-Upload zu Mamamia (früher hier:
  // download → base64 → uploadSignedContract aus dem Browser) läuft jetzt
  // server-side in sync-acceptance/detect-Cron — mit final_confirmation-
  // Bramka und garantiertem Retry statt Fire-and-forget aus dem Tab.

  const acceptApp = (id: string, formData: ContractFormData) => {
    setSelectedApp(null);
    // Unterschriebenen Vertrag merken → gebucht-Screen kann ihn präsentieren.
    setSignedForm(formData);
    animateThenProcess(id, async () => {
      // Optimistic — flips status to 'accepted' → existing acceptedApp
      // derivation truthy → BookedScreen takes over the layout.
      const targetApp = applications.find((a) => a.id === id);
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a))
      );
      showToast('✓ Vielen Dank — wir bereiten alles vor.');

      // Preview: keine echte Bridge — optimistischen 'accepted'-Status halten,
      // damit der gebucht-Screen (BookedScreen) zuverlässig erscheint.
      if (IS_PREVIEW_ANY) return;

      if (!lead?.token) return;

      // Server-side Sequenz (Refactor 2026-07-22): der Browser macht NUR noch
      // diesen einen POST. Die Bridge persistiert ATOMAR und triggert die Edge
      // Fn sync-acceptance, die Michałs Reihenfolge ausführt:
      //   1. UpdateCustomer (Kontaktdaten aus dem Konfirmationsformular)
      //   2. StoreConfirmation (verbindlicher Akzept)
      //   3. Vertrag rendern → 4. Upload zu Mamamia (nach Verarbeitung)
      //   5. Mails wie bisher (Bridge, unverändert)
      // Fällt irgendwas davon aus, holt der detect-Cron es ≤15 Min nach —
      // die Buchung hängt NICHT mehr am Leben dieses Browser-Tabs.
      try {
        const res = await fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: lead.token,
            event: 'application_accepted_internal',
            metadata: buildAcceptanceMetadata(Number(id), targetApp, formData),
          }),
        });
        if (!res.ok) throw new Error(`bridge HTTP ${res.status}`);
        // Refetch so the persistence merge useEffect re-flips status on
        // next render even if optimistic state somehow drops.
        refetchAcceptedApplications();
      } catch (err) {
        // Bridge-Write fehlgeschlagen ⇒ es existiert KEINE Buchung (weder bei
        // uns noch in Mamamia — der Akzept läuft jetzt server-side hinter dem
        // Upsert). Ehrlich zurückdrehen + Retry anbieten.
        console.error('application_accepted_internal failed:', (err as Error).message);
        setApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
        );
        showToast('Etwas ist schiefgelaufen. Bitte erneut versuchen oder uns anrufen.');
      }
    });
  };

  // „Vertrag nachträglich abschließen" (Martin, 2026-07-15): Die Annahme kam
  // NICHT aus dem Portal — die Agentur hat im SA-Portal akzeptiert, das Portal
  // zeigt die synthetische fc-App ohne contract_snapshot. Der Kunde holt hier
  // NUR den Vertrag nach; KEIN erneutes Accept: kein Status-Flip (die App ist
  // längst accepted), keine Mamamia-Mutation, keine Annahme-Animation.
  // Gleiche Bridge-Kette wie acceptApp, in zwei Schritten:
  //   1. POST application_accepted_internal → route.ts UPSERTet
  //      lead_application_acceptances inkl. contract_snapshot (der Upsert läuft
  //      dort VOR dem Event-Dedupe). Die Kunden-Buchungsmail (Mail C) ist per
  //      Dedupe geschützt — der Annahme-Detektor hat sie bereits verschickt.
  //   2. POST mit team_only_resend=true → Team-Mail mit Vertragsdaten + PDF,
  //      die der Event-Dedupe in Schritt 1 sonst verschluckt (bestehender
  //      route.ts-Mechanismus: nur Team-Mail, kein DB-Write, keine Kunden-Mail).
  // setSignedForm erst NACH erfolgreichem Upsert — dann zeigt der BookedScreen
  // den Vertrag sofort inkl. PDF-Link (/api/contract-pdf liest die frisch
  // geschriebene Acceptance-Row). Den Mamamia-Teil (Vertrag an die existierende
  // Confirmation hängen) erledigt die von route.ts getriggerte sync-acceptance.
  const submitContractOnly = async (id: string, formData: ContractFormData) => {
    const targetApp = contractApp?.id === id
      ? contractApp
      : applications.find((a) => a.id === id);
    setContractApp(null);
    const appIdNumeric = acceptanceApplicationId(id);
    if (!lead?.token || !targetApp || appIdNumeric === null) {
      // Sollte nie passieren (Button wird nur mit gültiger Referenz angeboten)
      // — Defensive: nicht crashen, Kunde kann anrufen.
      showToast('Etwas ist schiefgelaufen. Bitte erneut versuchen oder uns anrufen.');
      return;
    }
    const metadata = buildAcceptanceMetadata(appIdNumeric, targetApp, formData);
    try {
      const res = await fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: lead.token,
          event: 'application_accepted_internal',
          metadata,
        }),
      });
      if (!res.ok) throw new Error(`bridge HTTP ${res.status}`);
      // Persistenz ist durch → Vertrag sofort im Kasten präsentieren.
      setSignedForm(formData);
      showToast('✓ Vielen Dank — Ihr Vertrag ist abgeschlossen.');
      refetchAcceptedApplications();
      // PDF-Upload zu Mamamia übernimmt jetzt die Server-Sequenz
      // (sync-acceptance, von der Bridge getriggert): der Guard adoptiert die
      // längst existierende final_confirmation (Caregiver-Match) und hängt den
      // Vertrag dort an — wichtig für PK-Wechsel-Fälle (Schiffer/Dachs 15.07.).
      // Team-Mail-Resend, best-effort: Fehler nur loggen — die kritische
      // Persistenz (Upsert oben) ist bereits erfolgreich gelaufen.
      fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: lead.token,
          event: 'application_accepted_internal',
          metadata: { ...metadata, team_only_resend: true },
        }),
      }).catch((err) => {
        console.error('contract team mail resend failed:', (err as Error).message);
      });
    } catch (err) {
      console.error('nachtraeglicher Vertrag failed:', (err as Error).message);
      showToast('Etwas ist schiefgelaufen. Bitte erneut versuchen oder uns anrufen.');
    }
  };

  const declineApp = (id: string, message?: string) => {
    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'declined' } : a))
    );

    // Bridge-Event: Kunde hat eine Bewerbung abgelehnt. Wichtig für den
    // Application-Reminder-Flow (send-scheduled-emails liest dieses Event
    // als "Reaktion erfolgt", auch wenn negativ) — ohne das würden wir
    // 30 Min später eine "Bitte entscheiden Sie"-Mail schicken, obwohl
    // der Kunde längst entschieden hat.
    const app = applications.find((a) => a.id === id);
    reportLeadEvent(lead?.token, 'application_rejected', {
      application_id: id,
      caregiver_id: app?.nurse?.caregiverId,
      caregiver_name: app?.nurse?.name ? displayName(app.nurse.name) : undefined,
      reject_message: message,
    });

    // Persist to Mamamia
    if (mmReady && Number.isFinite(Number(id))) {
      rejectAppMutation.mutate({
        application_id: Number(id),
        reject_message: message,
      }).then(() => refetchApplications())
        .catch(err => {
          console.error('rejectApplication failed:', err);
          setApplications((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
          );
          showToast('Fehler beim Ablehnen — bitte erneut versuchen.');
        });
    }
  };

  // Mamamia currently has no RestoreApplication mutation (verified 2026-04-24
  // via schema introspection — zero hits for restore/unreject/undo/revert/cancel).
  // Backend will add the mutation later; for now we show a support-contact dialog.
  const [undoErrorOpen, setUndoErrorOpen] = useState(false);
  const undoApp = (_id: string) => {
    setUndoErrorOpen(true);
  };

  const canInviteNurse = (_idx: number): boolean => {
    // Strict gate: no invitations until patient profile is complete.
    // Without it, the caregiver can't prepare a meaningful application
    // and we get back-and-forth queries that frustrate both sides.
    if (!patientSaved) {
      setShowPatientReminder(true);
      return false;
    }
    // Serialize concurrent invite clicks. Backend gate is per-request
    // and the rate-limit count read can race with a sibling click that
    // hasn't recorded yet. Reject any click while another invite is
    // still in flight (button is also disabled visually, but stale
    // renders could still let a click through). User waits ~1 s; the
    // active card carries the spinner so they know what's happening.
    if (inviteInFlight) {
      return false;
    }
    // Pre-emptive rate-limit gate. Backend enforces hard limit (5 per 60min),
    // this just spares the user a wasted round-trip + opens the wait modal
    // with the retry_after value the server returned last sync. Race-safe:
    // if our cached count is stale, backend rejects with 429 and the
    // confirmInviteNurse catch block opens the same modal with fresh data.
    if (inviteRate?.blocked) {
      setInviteRateModalState({
        retryAfterSeconds: inviteRate.retry_after_seconds,
        limit: inviteRate.limit,
        windowMinutes: inviteRate.window_minutes,
      });
      return false;
    }
    return true;
  };

  const confirmInviteNurse = async (idx: number, name: string): Promise<void> => {
    const match = effectiveMatched[idx];
    if (!mmReady || typeof match?.caregiverId !== 'number') {
      showToast('Einladung derzeit nicht möglich. Bitte später erneut versuchen.');
      throw new Error('not-ready');
    }

    const id = match.caregiverId;
    const nurseName = match.nurse.name ?? '';

    // Hold the global lock for the full duration of the mutation (incl.
    // any cat=authorization retries below). All OTHER Einladen buttons
    // render disabled via the `globalInviteLocked` prop while this is
    // true — that's what prevents the 5+ concurrent clicks from racing
    // past the rate-limit gate.
    setInviteInFlight(true);
    try {

    // Mamamia's backend translator runs async after patient-form save and
    // transiently wipes patient description fields for ~5-7s. During that
    // window StoreRequest fails with cat=validation. We hide this from the
    // user: flip optimistic state immediately, retry silently for up to
    // 10s (3 attempts × 5s), only surface the toast if every retry fails.
    // 10s covers the worst-case warm-up (translator wipe + a just-opened job
    // needing 3-5s); longer just makes a genuine failure feel laggy.
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, 'invited');
      return next;
    });
    if (nurseName) {
      setApplications((prev) =>
        prev.map((a) => a.nurse.name === nurseName ? { ...a, isInvited: true } : a)
      );
    }

    const RETRY_DELAY_MS = 5000;
    const MAX_ATTEMPTS = 3;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await inviteMutation.mutate({ caregiver_id: id });
        // Report back to the kostenrechner lead — invite = goal reached, the
        // Nachfass chain gets cancelled server-side, and the team gets a
        // notification mail with the caregiver name. Per-caregiver dedupe in
        // reportLeadEvent so each different invite in the same session fires.
        reportLeadEvent(lead?.token, 'caregiver_invited', {
          caregiver_id: id,
          caregiver_name: nurseName,
          caregiver_snapshot: snapshotFromNurse(match.nurse),
        });
        refetchInvited();
        refetchInviteRate();
        showToast(`✓ ${name} wurde eingeladen!`);
        return;
      } catch (err) {
        lastErr = err as Error;
        // Rate-limited (HTTP 429): backend says client is over quota.
        // Open the modal with the fresh retry_after, revert optimistic
        // state, and STOP retrying — waiting doesn't change the gate.
        if (err instanceof MamamiaError) {
          const rate = err.rateLimitPayload;
          if (rate) {
            setInviteRateModalState({
              retryAfterSeconds: rate.retry_after_seconds,
              limit: rate.limit,
              windowMinutes: rate.window_minutes,
            });
            // Revert immediately — the rest of the optimistic-revert path
            // below handles UI cleanup uniformly. Skip the retry loop.
            lastErr = err;
            break;
          }
        }
        // Mamamia's panel-mode StoreRequest returns "Unauthorized" with
        // cat=authorization transiently while the just-saved customer is
        // still being processed server-side (translator + permission cache
        // warm-up). Retry only this exact shape — other auth failures
        // (genuine permission denial, expired session, etc.) also surface
        // as cat=authorization, but those won't resolve in 10s either and
        // delaying the toast is the lesser evil vs spamming a confused user.
        const isRaceShape = err instanceof MamamiaError && err.category === 'authorization';
        if (!isRaceShape) break;
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    // Exhausted retries or hit a non-race error — revert optimistic state.
    console.error('inviteCaregiver failed after retries:', lastErr?.message);
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    if (nurseName) {
      setApplications((prev) =>
        prev.map((a) => a.nurse.name === nurseName ? { ...a, isInvited: false } : a)
      );
    }
    showToast('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.');
    throw lastErr ?? new Error('invite-failed');
    } finally {
      setInviteInFlight(false);
    }
  };

  // Interest-side invite handler. Same retry-on-cat=authorization shape as
  // confirmInviteNurse but keyed by caregiver_id (no matching-array index
  // available for interests). Updates interestStatusOverrides + refetches
  // both interests + invited so the next render moves the caregiver out
  // of the Interest section into the invited matchings.
  const confirmInviteInterest = async (caregiverId: number, displayLabel: string): Promise<void> => {
    // Hold the global lock — same rationale as confirmInviteNurse above.
    // Disables other Einladen buttons (MatchCard + InterestCard) until
    // this mutation settles (success / failure / preview-timeout).
    setInviteInFlight(true);
    try {
    // Preview-Mode: simuliere erfolgreiche Einladung lokal (kein Mamamia-Call).
    // Override auf 'invited' → InterestCard zeigt "Einladung gesendet"-Pill;
    // nach 1.5s wird die Pflegekraft in previewInvitedFromInterest abgelegt
    // → Filter entfernt sie aus visibleInterests, effectiveMatched hängt sie
    // mit Status='invited' wieder ein, genau wie der Mamamia-Refetch in
    // Production.
    if (IS_PREVIEW_ANY) {
      // Pflegekraft aus visibleInterests holen, damit wir die Nurse-Daten
      // an previewInvitedFromInterest weiterreichen können.
      const interest = sourceInterests.find((i: any) => i.caregiver_id === caregiverId);
      const interestNurse = interest
        ? mapCaregiverToNurse(interest.caregiver, {
            nowIso: new Date().toISOString(),
            nowYear: new Date().getFullYear(),
          })
        : null;
      setInterestStatusOverrides((prev) => {
        const next = new Map(prev);
        next.set(caregiverId, 'invited');
        return next;
      });
      setTimeout(() => {
        if (interestNurse) {
          setPreviewInvitedFromInterest((prev) => {
            const next = new Map(prev);
            next.set(caregiverId, interestNurse);
            return next;
          });
        }
        showToast(`✓ ${displayLabel} wurde eingeladen!`);
      }, 1500);
      return;
    }
    if (!mmReady) {
      showToast('Einladung derzeit nicht möglich. Bitte später erneut versuchen.');
      throw new Error('not-ready');
    }
    setInterestStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(caregiverId, 'invited');
      return next;
    });

    const RETRY_DELAY_MS = 5000;
    const MAX_ATTEMPTS = 3;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await inviteMutation.mutate({ caregiver_id: caregiverId });
        // Snapshot aus dem Interest-Caregiver mitloggen → volle Karte in
        // "Bereits bearbeitet", auch wenn Mamamia die PK später nicht mehr liefert.
        const interestForSnap = sourceInterests.find((i: { caregiver_id: number }) => i.caregiver_id === caregiverId);
        const snapNurse = interestForSnap
          ? mapCaregiverToNurse((interestForSnap as { caregiver: unknown }).caregiver as Parameters<typeof mapCaregiverToNurse>[0], { nowIso: new Date().toISOString(), nowYear: new Date().getFullYear() })
          : null;
        reportLeadEvent(lead?.token, 'caregiver_invited', {
          caregiver_id: caregiverId,
          caregiver_name: displayLabel,
          ...(snapNurse ? { caregiver_snapshot: snapshotFromNurse(snapNurse) } : {}),
        });
        refetchInvited();
        refetchInterests();
        refetchInviteRate();
        showToast(`✓ ${displayLabel} wurde eingeladen!`);
        return;
      } catch (err) {
        lastErr = err as Error;
        // Rate-limited path — same handling as confirmInviteNurse.
        if (err instanceof MamamiaError) {
          const rate = err.rateLimitPayload;
          if (rate) {
            setInviteRateModalState({
              retryAfterSeconds: rate.retry_after_seconds,
              limit: rate.limit,
              windowMinutes: rate.window_minutes,
            });
            lastErr = err;
            break;
          }
        }
        const isRaceShape = err instanceof MamamiaError && err.category === 'authorization';
        if (!isRaceShape) break;
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }

    console.error('inviteCaregiver (interest) failed after retries:', lastErr?.message);
    setInterestStatusOverrides((prev) => {
      const next = new Map(prev);
      next.delete(caregiverId);
      return next;
    });
    showToast('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.');
    throw lastErr ?? new Error('invite-failed');
    } finally {
      setInviteInFlight(false);
    }
  };

  // Interest-side dismiss handler. Local-only — writes a row to
  // lead_dismissed_caregivers so the next portal refresh / refetch
  // filters this caregiver out. Mamamia is NOT informed; detect-
  // caregiver-events still emails when the caregiver re-appears as a
  // formal application (by design).
  const confirmDismissInterest = async (caregiverId: number): Promise<void> => {
    setInterestStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(caregiverId, 'dismissed');
      return next;
    });
    // Nurse-Snapshot ins lead_event speichern damit wir die Pflegekraft
    // später im bearbeitet-Bereich rekonstruieren können, auch nach
    // Reload (Mamamia entfernt sie permanent aus mmInterests).
    const interest = sourceInterests.find((i: any) => i.caregiver_id === caregiverId);
    let nurseForSnapshot: Nurse | null = null;
    if (interest) {
      try {
        nurseForSnapshot = mapCaregiverToNurse((interest as any).caregiver, {
          nowIso: new Date().toISOString(),
          nowYear: new Date().getFullYear(),
        });
      } catch {
        nurseForSnapshot = null;
      }
    }
    const snapshot: CaregiverSnapshot | undefined = nurseForSnapshot ? {
      name: nurseForSnapshot.name,
      age: nurseForSnapshot.age,
      image: nurseForSnapshot.image,
      color: nurseForSnapshot.color,
      experience: nurseForSnapshot.experience,
      experienceYears: nurseForSnapshot.experienceYears,
      languageLevel: nurseForSnapshot.language?.level,
      languageBars: nurseForSnapshot.language?.bars,
      historyAssignments: nurseForSnapshot.history?.assignments,
      historyAvgDurationMonths: nurseForSnapshot.history?.avgDurationMonths,
    } : undefined;
    // Optimistisches Lokal-Update: die Pflegekraft soll sofort im
    // bearbeitet-Bereich erscheinen (auch bevor das lead_event-Refetch
    // sie aus dem Backend bringt).
    if (nurseForSnapshot) {
      setDeclinedFromInterest((prev) => {
        const next = new Map(prev);
        next.set(caregiverId, nurseForSnapshot!);
        return next;
      });
    }
    reportLeadEvent(lead?.token, 'caregiver_declined', {
      caregiver_id: caregiverId,
      caregiver_name: nurseForSnapshot ? displayName(nurseForSnapshot.name) : undefined,
      caregiver_snapshot: snapshot,
      decline_origin: 'interest',
    });
    // Preview-Mode: Mamamia-Mutation skippen, optimistischer Lokal-State
    // reicht für UI-Test. Sonst würde der Mock-Caregiver-ID Mamamia mit
    // 404 oder 401 antworten und den optimistischen State zurückrollen.
    if (IS_PREVIEW_ANY) {
      showToast('✓ Pflegekraft abgelehnt');
      return;
    }
    try {
      await dismissCaregiverMutation.mutate({ caregiver_id: caregiverId, kind: 'interest' });
      refetchDismissed();
    } catch (err) {
      console.error('dismissCaregiver failed:', (err as Error).message);
      setInterestStatusOverrides((prev) => {
        const next = new Map(prev);
        next.delete(caregiverId);
        return next;
      });
      // Lokal zurück: Pflegekraft aus declined-Bereich wieder raus
      setDeclinedFromInterest((prev) => {
        const next = new Map(prev);
        next.delete(caregiverId);
        return next;
      });
      showToast('Konnte nicht ablehnen. Bitte erneut versuchen.');
      throw err;
    }
  };

  // Undo der Interest-Ablehnung: feuert caregiver_declined_undone-Event
  // (überschreibt die letzte Decline in der lead_events-Historie) +
  // entfernt lokales Override damit die Interest-Karte wieder oben
  // auftaucht. Wenn Mamamia eine "restoreCaregiver"-Mutation hätte
  // würden wir die auch rufen — gibt's aber nicht, also kann die Karte
  // erst nach dem nächsten mmInterests-Refetch wieder sichtbar sein
  // (Mamamia muss sie zurückbringen). Best-effort.
  const undoDismissInterest = (caregiverId: number): void => {
    setDeclinedFromInterest((prev) => {
      const next = new Map(prev);
      next.delete(caregiverId);
      return next;
    });
    setInterestStatusOverrides((prev) => {
      const next = new Map(prev);
      next.delete(caregiverId);
      return next;
    });
    reportLeadEvent(lead?.token, 'caregiver_declined_undone', {
      caregiver_id: caregiverId,
    });
    refetchInterests?.();
  };

  // Used by modal (calls after own animation). Modal doesn't await — it just
  // needs to know whether the gating check (patient reminder) passed.
  const inviteNurse = (idx: number, name: string): boolean => {
    if (!canInviteNurse(idx)) return false;
    confirmInviteNurse(idx, name).catch(() => { /* already toasted */ });
    return true;
  };

  const declineNurse = (idx: number) => {
    // Optimistic local override — UI flips immediately, customer doesn't wait
    // on the round-trip. Persist to Supabase so the rejection survives F5
    // + cross-device. RPC errors stay silent in the UI; on next mount the
    // server-side lead.declined_caregiver_ids reflects truth and the override
    // collapses naturally.
    const match = effectiveMatched[idx];
    const caregiverId = match?.caregiverId;
    if (caregiverId == null) return;
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(caregiverId, 'declined');
      return next;
    });
    if (lead?.token) {
      setDeclinedCaregiver(lead.token, caregiverId, true).catch(err => {
        console.error('setDeclinedCaregiver failed:', err);
      });
      // Bridge-Event: Kunde hat eine Pflegekraft abgelehnt (vor Bewerbung).
      // Wichtig für den Interest-Reminder-Flow — wenn die Pflegekraft schon
      // Interesse gezeigt hat (caregiver_interest_shown) und der Kunde sie
      // 30 Min später abgelehnt hat, soll keine "Bitte reagieren"-Mail mehr
      // rausgehen.
      reportLeadEvent(lead.token, 'caregiver_declined', {
        caregiver_id: caregiverId,
        caregiver_name: match?.nurse?.name ? displayName(match.nurse.name) : undefined,
      });
    }
  };

  // Reset a locally-declined match back to 'pending' so the caregiver
  // reappears in the matched-nurses list. Override to 'pending' masks the
  // server lead.declined_caregiver_ids until the RPC completes + lead
  // re-fetches; from then on the override is harmless (server agrees).
  const undoDeclinedMatch = (idx: number) => {
    const caregiverId = effectiveMatched[idx]?.caregiverId;
    if (caregiverId == null) return;
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(caregiverId, 'pending');
      return next;
    });
    if (lead?.token) {
      setDeclinedCaregiver(lead.token, caregiverId, false).catch(err => {
        console.error('setDeclinedCaregiver(undo) failed:', err);
      });
    }
  };

  // ─── Debug overlay (?debug=1) ────────────────────────────────────────────
  // Renders fixed-bottom black panel with key state. Only active when URL
  // has `?debug=1` so production traffic doesn't see it. Designed for
  // iPhone-side diagnosis where remote DevTools isn't always available —
  // user opens with ?debug=1, screenshots panel, sends.
  //
  // Auth section reflects the dual mechanism added in Bug #13j: cookie
  // (cross-site, often dropped on iOS) AND X-Session-Token header
  // (sessionStorage-backed, bulletproof). The header path is what works
  // on iOS WebKit incognito; cookie is transparent fallback for desktop.
  const debugOn = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('debug');
  const fmtErr = (e: Error | null) => e ? `${e.name}: ${e.message.slice(0, 80)}` : 'null';
  const fmtVal = (v: unknown) => v == null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v);

  // Read auth artifacts safely (guard SSR / private mode throws).
  let sessionTokenInStorage: string | null = null;
  try { sessionTokenInStorage = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('mamamia_session_token') : null; } catch { /* private mode */ }
  const cookieDoc = typeof document !== 'undefined' ? (document.cookie || '') : '';
  const sessionCookieVisible = cookieDoc.includes('session=');
  const hasAnyCookie = cookieDoc.length > 0;

  // Infer which auth method is actively carrying proxy calls. The
  // frontend prefers header when sessionStorage has a token (Bug #13j);
  // otherwise it falls back to credentials: include cookie path. We can
  // verify the cookie path is *probably* live by checking mmReady but
  // not seeing the token in storage — meaning cookie HttpOnly carried it.
  let authMethod: string;
  if (sessionTokenInStorage) {
    authMethod = 'X-Session-Token header (sessionStorage)';
  } else if (sessionCookieVisible) {
    authMethod = 'session cookie (visible — non-HttpOnly?)';
  } else if (mmReady && hasAnyCookie) {
    authMethod = 'session cookie (HttpOnly — JS-invisible)';
  } else if (mmReady) {
    authMethod = 'unknown — mmReady=true but no token visible (proxy calls likely failing)';
  } else {
    authMethod = 'none yet (mmSession not ready)';
  }

  const tokenPreview = (t: string | null) => t ? `${t.slice(0, 12)}…(${t.length} chars)` : '(absent)';

  const debugOverlay = debugOn ? (
    <div style={{position:'fixed',bottom:0,left:0,right:0,zIndex:9999,background:'rgba(0,0,0,0.92)',color:'#0f0',fontFamily:'ui-monospace,Menlo,monospace',fontSize:10,lineHeight:1.4,padding:'8px 10px',maxHeight:'45vh',overflowY:'auto',borderTop:'2px solid #0f0'}}>
      <div style={{color:'#ff0',fontWeight:'bold',marginBottom:4}}>🔧 DEBUG (?debug=1)</div>
      <div>UA: {typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : '?'}</div>
      <div>online: {typeof navigator !== 'undefined' ? String(navigator.onLine) : '?'} · cookieEnabled: {typeof navigator !== 'undefined' ? String(navigator.cookieEnabled) : '?'}</div>
      <div>lead.token URL: {new URLSearchParams(window.location.search).get('token')?.slice(0, 12) ?? 'MISSING'}…</div>
      <hr style={{borderColor:'#0f04',margin:'4px 0'}}/>
      <div style={{color:'#ff0'}}>auth via: {authMethod}</div>
      <div>sessionStorage.mamamia_session_token: {tokenPreview(sessionTokenInStorage)}</div>
      <div>document.cookie has any: {String(hasAnyCookie)} · session= visible: {String(sessionCookieVisible)}</div>
      <div>cookie raw (truncated): {cookieDoc.slice(0, 120) || '(empty — iOS WebKit incognito normalny stan)'}</div>
      <hr style={{borderColor:'#0f04',margin:'4px 0'}}/>
      <div>lead: loading={String(leadLoading)} err={leadError ?? 'null'} loaded={lead ? 'yes id='+lead.id.slice(0,8) : 'null'}</div>
      <div>mmSession: ready={String(mmReady)} err={fmtErr(mmError)} session={fmtVal(session)}</div>
      <div>mmCustomer: loading={String(mmCustomerLoading)} err={fmtErr(mmCustomerError)} id={fmtVal(mmCustomer?.id)} status={fmtVal(mmCustomer?.status)}</div>
      <div>mmJobOffer: loading={String(mmJobOfferLoading)} err={fmtErr(mmJobOfferError)} id={fmtVal(mmJobOffer?.id)} status={fmtVal(mmJobOffer?.status)}</div>
      <div>mmApplications: loading={String(mmApplicationsLoading)} err={fmtErr(mmApplicationsError)} total={fmtVal(mmApplications?.total)} count={fmtVal(mmApplications?.data.length)}</div>
      <div>mmMatchings: loading={String(mmMatchingsLoading)} err={fmtErr(mmMatchingsError)} total={fmtVal(mmMatchings?.total)} count={fmtVal(mmMatchings?.data.length)}</div>
      <div>invitedCaregiverIds: loading={String(invitedLoading)} err={fmtErr(invitedError)} count={fmtVal(invitedCaregiverIds?.length)}</div>
      <hr style={{borderColor:'#0f04',margin:'4px 0'}}/>
      {/* Matching-Trichter — für die Diagnose „mehrere Karten verschwinden".
          Beim Ablehnen VORHER und NACHHER ablesen: ändert sich nur `sichtbar`
          um 1, ist alles normal. Kippt `ageFallback`/`badgeFallback`, wandert
          ein ganzer Eimer (ageRest bzw. badgeRest) rein oder raus. */}
      <div style={{color:'#ff0'}}>Matching-Trichter (TARGET_VISIBLE=5)</div>
      <div>merged={funnel.merged} → sprachOk={funnel.langFiltered} → alter≤60={funnel.young} (+rest {funnel.ageRest}{funnel.ageFallback ? ' ANGEHÄNGT' : ' verworfen'})</div>
      <div>badge≥Bewährt={funnel.goodBadge} (+rest {funnel.badgeRest}{funnel.badgeFallback ? ' ANGEHÄNGT' : ' verworfen'}) → final={funnel.final}</div>
      <div>gehaltene Einladungen 24h={fmtVal(inviteRate?.used_24h)} → Slots={Math.max(0, 5 - (inviteRate?.used_24h ?? 0))} · abgelehnt lokal={statusOverrides.size}</div>
    </div>
  ) : null;

  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (leadLoading) {
    return (
      <>
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#8B7355] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Ihr Angebot wird geladen…</p>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  if (leadError) {
    return (
      <>
        <ExpiredLinkScreen token={tokenFromUrl} message={leadError} />
        {debugOverlay}
      </>
    );
  }

  // Expired/invalid magic-link token: the lead row still loads
  // (fetchLeadByToken ignores token_expires_at) but onboard returns 401, so
  // leadError above is null and we'd otherwise fall through to the generic
  // "Verbindung fehlgeschlagen" screen — a dead end (retry never refreshes the
  // token). Route to the self-service ExpiredLinkScreen ("Neuen Link
  // anfordern") so the customer can request a fresh link themselves.
  if (lead && (mmExpired || saveTokenExpired) && !IS_PREVIEW_ANY) {
    return (
      <>
        <ExpiredLinkScreen token={tokenFromUrl} message={mmError?.message ?? 'Link nicht mehr gültig'} />
        {debugOverlay}
      </>
    );
  }

  // Mamamia session failure — surface it rather than silently falling back.
  if (lead && mmError && !IS_PREVIEW_ANY) {
    return (
      <>
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{background:'linear-gradient(160deg,#F8F5F1 0%,#EFE8DE 100%)'}}>
        <div className="text-center space-y-5 max-w-xs">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{background:'#E76F6320'}}>
            <AlertCircle className="w-8 h-8" style={{color:'#E76F63'}} />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 mb-2">Verbindung fehlgeschlagen</p>
            <p className="text-sm text-gray-500 leading-relaxed">{mmError.message || 'Bitte versuchen Sie es in wenigen Augenblicken erneut.'}</p>
          </div>
          <div className="flex gap-2 justify-center">
            <button onClick={() => window.location.reload()}
                    className="text-sm font-bold rounded-2xl px-5 py-3 border"
                    style={{color:'#8B7355', borderColor:'#C4B49A', background:'white'}}>
              Erneut versuchen
            </button>
            <a href="tel:+4989200000830"
               className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-2xl px-5 py-3"
               style={{background:'#8B7355'}}>
              <Phone className="w-4 h-4" /> Kontakt
            </a>
          </div>
        </div>
      </div>
      {debugOverlay}
      </>
    );
  }

  // Lead loaded but Mamamia session still bootstrapping.
  if (lead && !mmReady && !IS_PREVIEW_ANY) {
    // Einheitliche formale Anrede (Herr/Frau Nachname), sonst neutral — siehe
    // customerSalutation. Kein bloßer Vorname/Nachname mehr.
    const salutation = customerSalutation(lead);
    return (
      <>
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-8"
           style={{background: 'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)'}}>

        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full pointer-events-none" style={{background:'rgba(255,255,255,0.07)'}} />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full pointer-events-none" style={{background:'rgba(255,255,255,0.07)'}} />
        <div className="absolute top-1/3 -left-12 w-32 h-32 rounded-full pointer-events-none" style={{background:'rgba(255,255,255,0.04)'}} />

        {/* Wordmark */}
        <p className="absolute top-10 text-white/50 text-xs font-semibold tracking-[0.25em] uppercase">Primundus</p>

        {/* Animated card stack */}
        <div className="relative mb-10" style={{animation:'float 3.5s ease-in-out infinite'}}>
          {/* Back card */}
          <div className="absolute w-56 h-[76px] rounded-2xl"
               style={{background:'rgba(255,255,255,0.12)', transform:'rotate(-7deg) translateY(14px) translateX(-10px)'}} />
          {/* Mid card */}
          <div className="absolute w-56 h-[76px] rounded-2xl"
               style={{background:'rgba(255,255,255,0.20)', transform:'rotate(-3.5deg) translateY(7px) translateX(-5px)'}} />
          {/* Front card */}
          <div className="relative w-56 h-[76px] bg-white rounded-2xl shadow-2xl flex items-center gap-3 px-4">
            <div className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base"
                 style={{background:'linear-gradient(135deg,#8B7355,#A18973)'}}>A</div>
            <div className="flex-1 min-w-0">
              <div className="h-2.5 rounded-full mb-2" style={{background:'#F5F5F6', width:'72%', animation:'shimmer 1.8s ease-in-out infinite'}} />
              <div className="h-2 rounded-full mb-2.5" style={{background:'#F5F5F6', width:'52%'}} />
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-4 h-1.5 rounded-full" style={{background: i < 4 ? '#C4B49A' : '#F5F5F6'}} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-8">
          <h2 className="text-[1.7rem] font-bold text-white leading-tight mb-3">
            {salutation ? `${salutation}, wir` : 'Wir'} bereiten<br/>Ihre Pflegekräfte vor
          </h2>
          <p className="text-sm leading-relaxed" style={{color:'rgba(255,255,255,0.72)'}}>
            Gleich sehen Sie Ihr persönliches Angebot<br/>und passende Betreuungspersonen.
          </p>
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-2.5">
          {[0, 160, 320].map(d => (
            <div key={d} className="w-2.5 h-2.5 rounded-full animate-bounce"
                 style={{background:'rgba(255,255,255,0.75)', animationDelay:`${d}ms`}} />
          ))}
        </div>

        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(0.5deg); }
          }
          @keyframes shimmer {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
      {debugOverlay}
      </>
    );
  }

  // ── Angebots-Sektion als Konstante ────────────────────────────────────
  // Seit 13.08. wandert das Angebot im GESPEICHERTEN Zustand nach unten
  // (Martin: „das Angebot kann eher nach unten rutschen — wir sehen nur
  // Bewerbungen, und wenn nicht da, dann Pflegekräfte"). Dieselbe Sektion
  // an zwei möglichen Stellen — deshalb einmal gebaut und unten je nach
  // Zustand eingehängt, statt 300 Zeilen zu duplizieren.
      const angebotSection = (() => {
        // Seit 11.08. steuert dieser Toggle NUR noch die Konditionen und den
        // Mustervertrag — der Preis steht immer. Default zu: Der Kunde soll
        // nach dem Preis direkt bei den Pflegekräften landen, nicht erst an
        // vier Vertrauens-Zeilen vorbei. Wer sie sucht, findet sie über den
        // Chevron („Details").
        // Abschnitt offen beim Erstbesuch und solange die Patientendaten
        // fehlen; sobald eine Bewerbung da ist, hat die Vorrang. Manueller
        // Toggle gewinnt. (Wieder die Regel von vor dem 11.08.-Umbau —
        // Martin: „muss einklappbar sein für spätere Zustände".)
        const offerExpanded =
          offerExpandedManual ?? (!hasPending && (offerFirstVisit || !patientSaved));
        const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
        const tagessatz = Math.round(brutto / 30);
        // Gekürzt (Martin, 11.08.: „die Punkte schöner darstellen"). Zwei der
        // vier Texte brachen auf 375 px um — eine Liste, in der die Hälfte der
        // Zeilen zweizeilig ist, wirkt unruhig, egal wie sie gestylt ist.
        // Inhalt unverändert, nur knapper gesagt; die Langfassung steht im
        // Snapshot, falls eine Formulierung so nicht stimmt.
        const items = [
          { text: 'Täglich kündbar' },
          { text: 'Tagesgenaue Abrechnung' },
          // „Zahlung erst ab Anreise" → „Kein Vertrag vor Auswahl nötig"
          // (Martin, 12.08.): Im Ausgangszustand steht der Kunde vor der
          // Frage, ob er sich mit dem Weiterklicken schon bindet — nicht vor
          // einer Zahlungsfrage.
          { text: 'Kein Vertrag vor Auswahl nötig' },
          { text: 'Keine Vermittlungsgebühren' },
        ];
        return (
        <div style={{background:'#FFFFFF', borderBottom:'1px solid #E9E9EB'}}>
        <div className="max-w-3xl mx-auto">
          {/* „Ihr persönliches Angebot" steht im Header unter dem Namen
              (Martin, 11.08.) — der Abschnitt heißt deshalb nach seinem
              Inhalt und wiederholt den Titel nicht. Der Chevron klappt den
              ganzen Abschnitt zu, sobald er nur noch Referenz ist. */}
          <button
            onClick={() => setOfferExpandedManual(!offerExpanded)}
            className={`w-full px-5 pt-6 flex items-center justify-between gap-3 text-left ${offerExpanded ? 'pb-3' : 'pb-6'}`}
          >
            <div>
              <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>{hasPending ? 'Ihr Angebot' : 'Ihre Betreuungskosten'}</h2>
            </div>
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform duration-200 ${offerExpanded ? 'rotate-180' : ''}`} style={{color:'#71717A'}} />
          </button>

          {/* Die Kosten stehen IMMER (Martin, 11.08.). Der Kunde kam für den
              Preis; ihn hinter einen Toggle zu legen wäre die teuerste
              Ersparnis an Bildschirmhöhe.

              Der MONATSBETRAG führt, nicht der Tagessatz: Angehörige rechnen
              in Monaten, und der Tagessatz allein (Brutto/30) lässt die
              Zuschüsse unsichtbar — der Kunde überschätzt seine Belastung um
              genau deren Summe. `eigenanteil` und `zuschüsse` liegen im Lead
              und wurden bis 11.08. nirgends angezeigt; im Kostenrechner sieht
              er sie auch nicht (der Ergebnis-Block dort ist seit dem
              Direct-Redirect toter Code, setShowResults(true) existiert
              nicht). Das Portal ist die EINZIGE Stelle. */}
          {offerExpanded && (
          <div className="px-4 pb-4">
                {/* NUR unser Angebot (Martin, 11.08.). Pflegegeld,
                    Steuerersparnis und der daraus gebildete Eigenanteil sind
                    bewusst NICHT hier: Das sind fremde Leistungen mit eigenen
                    Voraussetzungen — wir nennen unseren Preis, nicht eine
                    Rechnung über das Geld anderer. `eigenanteil` und
                    `zuschüsse` bleiben unangetastet im Lead. */}
                <div className="rounded-2xl border px-5 py-5" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
                  <p className="text-[2.5rem] font-bold leading-none tracking-tight tabular-nums" style={{color:'#18181B'}}>{formatEuro(brutto)}</p>
                  <p className="text-[15px] mt-2.5 leading-relaxed" style={{color:'#71717A'}}>
                    Monatlich inkl. Steuern, Gebühren und Sozialabgaben.
                  </p>

                  {/* Konditionen stehen OFFEN unter dem Preis (Martin, 11.08.):
                      Sie sind das Verkaufsargument — hinter einem Toggle
                      erreichen sie niemanden. Die Zahlen (Reisekosten, Kost &
                      Logis, Sommerzuschlag) sind umgekehrt Nachschlagewerk und
                      liegen im Aufklapper.

                      Einspaltig, nicht im 2er-Raster: Auf 375 px bleiben pro
                      Spalte ~18 Zeichen, „Tagesgenaue Abrechnung" und „Ohne
                      Vermittlungsgebühr" brachen dort erneut um — vier
                      umbrechende Halbzeilen sind unruhiger als vier ganze.
                      Mit den gekürzten Texten passt jetzt jede Zeile. */}
                  <div className="mt-5 pt-5 space-y-3" style={{borderTop:'1px solid #E9E9EB'}}>
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2.5">
                        <Check className="w-4 h-4 flex-shrink-0" strokeWidth={3} style={{color:'#8B7355'}} />
                        <span className="text-[15px]" style={{color:'#18181B'}}>{item.text}</span>
                      </div>
                    ))}
                  </div>

                  {/* Beweis-Zeile direkt am Preis (Martin, 13.08.): die vier
                      Checks sind Konditionen, hier steht, WER das verspricht.
                      Form nach zwei verworfenen Anläufen (graue Textzeile,
                      Statistik-Spalten): echtes Welt-Siegel + EIN Fließsatz —
                      Wortlaut von Martin. Die ausführlichen Kacheln bleiben
                      unten im Kontakt-Block. */}
                  <div className="mt-4 pt-4 flex items-center gap-3" style={{borderTop:'1px solid #E9E9EB'}}>
                    <img src="/badge-testsieger.webp" alt="Testsieger Die Welt" className="h-11 w-auto flex-shrink-0 object-contain" />
                    <p className="text-[15px] leading-snug" style={{color:'#52525B'}}>
                      <span className="font-semibold" style={{color:'#18181B'}}>Testsieger – DIE&nbsp;WELT</span> mit über 20&nbsp;Jahren Erfahrung und 60.000 Betreuungseinsätzen
                    </p>
                  </div>

                  {/* Der Toggle sitzt IM Kasten (Martin, 11.08.) — er gehört
                      zum Angebot, nicht daneben. */}
                  <button
                    type="button"
                    onClick={() => setCostsExpanded(!costsExpanded)}
                    className="mt-5 -mb-1 w-full flex items-center justify-center gap-1.5 pt-4 pb-1 text-[15px] font-semibold"
                    style={{color:'#8B7355', borderTop:'1px solid #E9E9EB'}}
                  >
                    {costsExpanded ? 'Weniger anzeigen' : 'Alle Kosten im Überblick'}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${costsExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {costsExpanded && (<>

                {/* Kalkulation über 7 Wochen — DEAKTIVIERT 14.06.2026.
                    Begründung: zusammen mit dem aufgeklappten "Ihr Angebot"-
                    Toggle wirkten zwei Klapp-/Detail-Blöcke gleichzeitig
                    überladen. Die Monats-Aufstellung erscheint später beim
                    konkreten Bewerbungs-Vergleich (MonatsAufstellung im
                    AngebotPruefenModal + BookedScreen), wo die Daten zur
                    realen Pflegekraft auch wirklich passen.
                    `false &&` lässt den Code intakt für späteres Re-Enable
                    via Flag / A/B-Test. */}
                {false && (() => {
                  const timingToDays: Record<string, number> = {
                    'sofort': 0,
                    '1-2-wochen': 10,
                    '2-4-wochen': 21,
                    '1-monat': 30,
                    '1-2-monate': 45,
                    'spaeter': 60,
                    'unklar': 30,
                  };
                  const offsetDays = timingToDays[lead?.care_start_timing ?? 'sofort'] ?? 0;
                  const start = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
                  const end = new Date(start.getTime() + 49 * 24 * 60 * 60 * 1000);
                  const startStr = formatDeDate(start);
                  const endStr = formatDeDate(end);
                  // Anreise/Abreise = 125 €, Feiertagszuschlag = tagessatz
                  // (doppelter Tagessatz = 1× tagessatz extra).
                  const rows = buildMonthlyBreakdown(startStr, endStr, tagessatz, 125, 125, tagessatz);
                  if (rows.length === 0) return null;
                  return (
                    <div className="rounded-2xl border mt-3 px-5 py-4" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
                      <p className="text-[12px] font-semibold uppercase tracking-widest mb-1" style={{color:'#8B7355'}}>Kalkulation</p>
                      <p className="text-[12px] mb-3" style={{color:'#71717A'}}>
                        Annahme: 7 Wochen ab {startStr} (bis {endStr}):
                      </p>
                      <div className="space-y-2">
                        {rows.map((r, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-[14px]" style={{color:'#18181B'}}>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-tight">{r.monat}</p>
                              <p className="text-[12px] leading-snug mt-0.5" style={{color:'#71717A'}}>{r.details.join(' · ')}</p>
                            </div>
                            <p className="font-semibold whitespace-nowrap flex-shrink-0">{formatEuro(r.betrag)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] mt-3 leading-snug" style={{color:'#71717A'}}>
                        Die tatsächlichen Kosten richten sich nach dem konkreten Einsatzzeitraum der gewählten Pflegekraft.
                      </p>
                    </div>
                  );
                })()}

                {/* „Alle Kosten im Überblick" — die Aufstellung, die vorher als
                    Fließtext-Zeile unter dem Preis stand. Keine zweite
                    Überschrift im Kasten: der Toggle darüber benennt ihn schon
                    (Martin, 11.08.: „nicht doppeln"). */}
                <div className="rounded-2xl border mt-3 px-5 py-4 space-y-3" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
                  {[
                    { label: 'Betreuung', value: `${formatEuro(brutto)} / Monat`, note: '' },
                    { label: 'Entspricht', value: `${formatEuro(tagessatz)} / Tag`, note: 'tagesgenau abgerechnet' },
                    { label: 'Reisekosten', value: '125 € pro Strecke', note: '' },
                    { label: 'Kost & Logis', value: 'stellt der Haushalt', note: '' },
                    { label: 'Sommerzuschlag', value: '6,67 € / Tag', note: 'Juli + August' },
                  ].map((row, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-4">
                      <span className="text-[15px] flex-shrink-0" style={{color:'#71717A'}}>{row.label}</span>
                      <span className="text-right">
                        <span className="block text-[15px] tabular-nums" style={{color:'#18181B'}}>{row.value}</span>
                        {row.note && <span className="block text-[13px] mt-0.5" style={{color:'#71717A'}}>{row.note}</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {/* ── Was bleibt für Sie übrig ──────────────────────────────
                    Martin, 12.08.: Eigenanteil doch zeigen — aber HIER, nicht
                    am Hauptpreis. Die Regel vom 11.08. („wir nennen unseren
                    Preis, nicht eine Rechnung über das Geld anderer") gilt für
                    den Betrag oben; der Aufklapper ist ausdrücklich
                    Nachschlagewerk, dort gehört die Rechnung hin.

                    Der Eigenanteil wird AUS DEM ANGEZEIGTEN BRUTTO gerechnet,
                    nicht aus `kalkulation.eigenanteil` gelesen: Der gespeicherte
                    Wert stammt vom Kostenrechner-Zeitpunkt und driftet, sobald
                    das Angebot nachträglich angepasst wird — dann stünden oben
                    3.050 € und hier ein Eigenanteil zu einem anderen Brutto.
                    Summiert werden nur Posten mit `in_kalkulation`, genau wie
                    `zuschüsse.gesamt` es serverseitig tut. */}
                {(() => {
                  const posten = (lead?.kalkulation?.['zuschüsse']?.items ?? [])
                    .filter(z => z.in_kalkulation && z.betrag_monatlich > 0);
                  if (posten.length === 0) return null;
                  const summe = posten.reduce((a, z) => a + z.betrag_monatlich, 0);
                  const eigen = Math.max(0, brutto - summe);
                  // vdek-Auswertung zum 01.07.2026: bundesweiter Durchschnitt
                  // des Eigenanteils im ERSTEN Heimjahr. Bewusst das erste Jahr
                  // — später sinkt es durch den Leistungszuschlag, und wer jetzt
                  // entscheidet, vergleicht mit dem, was er zuerst zahlt.
                  // Stand + Quelle stehen mit in der Zeile: Ohne sie wäre es
                  // eine Behauptung. Beim nächsten vdek-Update (jeweils 01.01.
                  // und 01.07.) nachziehen.
                  const HEIM_EIGENANTEIL = 3364;
                  const guenstiger = HEIM_EIGENANTEIL - eigen;
                  return (
                    <div className="rounded-2xl border mt-3 px-5 py-4" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
                      <p className="text-[12px] font-semibold uppercase tracking-widest mb-3" style={{color:'#8B7355'}}>
                        Was bleibt für Sie übrig
                      </p>
                      <div className="space-y-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-[15px] flex-shrink-0" style={{color:'#71717A'}}>Betreuung</span>
                          <span className="text-[15px] tabular-nums" style={{color:'#18181B'}}>{formatEuro(brutto)}</span>
                        </div>
                        {posten.map((z, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-4">
                            <span className="text-[15px] min-w-0" style={{color:'#71717A'}}>
                              {/* `label` kommt aus subsidies_config und ist für
                                  die Admin-Oberfläche geschrieben — das
                                  Entlastungsbudget heisst dort „Entlastungs-
                                  budget (3.539 Euro/Jahr ab Pflegegrad 2)".
                                  Neben „− 295 €" gelesen widerspricht sich das.
                                  Die Klammer fliegt raus; die Jahreszahl steht
                                  ohnehin im `hinweis` darunter. */}
                              {z.label.replace(/\s*\([^)]*\)\s*$/, '')}
                              {/* Der Vorbehalt steht AM Posten, nicht im FAQ. */}
                              {(z.hinweis || z.name === 'steuervorteil') && (
                                <span className="block text-[13px] mt-0.5 leading-snug">
                                  {/* Fallback nur, falls jemand den hinweis in
                                      subsidies_config leert. NICHT „hängt vom
                                      Steuersatz ab": §35a ist ein direkter
                                      Abzug von der Steuerschuld, nicht vom zu
                                      versteuernden Einkommen — die Voraussetzung
                                      ist, dass überhaupt so viel Steuer anfällt. */}
                                  {z.hinweis ?? 'Setzt voraus, dass entsprechend Steuern anfallen.'}
                                </span>
                              )}
                            </span>
                            <span className="text-[15px] tabular-nums whitespace-nowrap flex-shrink-0" style={{color:'#18181B'}}>
                              − {formatEuro(z.betrag_monatlich)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-4 pt-3" style={{borderTop:'1px solid #E9E9EB'}}>
                          <span className="text-[15px] font-semibold flex-shrink-0" style={{color:'#18181B'}}>Ihr Eigenanteil</span>
                          <span className="text-[17px] font-bold tabular-nums" style={{color:'#18181B'}}>{formatEuro(eigen)}</span>
                        </div>
                      </div>

                      {/* Heim-Vergleich: die einzige Zeile, die „ist das viel?"
                          beantwortet. Nur zeigen, wenn wir wirklich günstiger
                          sind — sonst wäre es ein Argument gegen uns. */}
                      {guenstiger > 0 && (
                        <p className="text-[14px] leading-relaxed mt-4 pt-4" style={{color:'#71717A', borderTop:'1px solid #E9E9EB'}}>
                          Im Pflegeheim liegt der Eigenanteil im ersten Jahr bundesweit bei
                          durchschnittlich <span className="font-semibold" style={{color:'#18181B'}}>{formatEuro(HEIM_EIGENANTEIL)}</span> im Monat
                          {/* Nur die Ersparnis grün (#22A06B, das Portal-Grün
                              aus den Verfügbarkeits-Chips). Der Heim-Betrag
                              bleibt schwarz — grün wäre er ein Gütesiegel für
                              die Zahl, gegen die wir argumentieren. */}
                          — bei Ihnen zu Hause sind es <span className="font-bold" style={{color:'#22A06B'}}>{formatEuro(guenstiger)} weniger</span>.
                          <span className="block mt-1 text-[13px]">Quelle: vdek-Auswertung, Stand 1. Juli 2026.</span>
                        </p>
                      )}

                      <p className="text-[13px] leading-snug mt-3" style={{color:'#71717A'}}>
                        Pflegegeld, Entlastungsbudget und Steuervorteil sind Leistungen
                        Dritter mit eigenen Voraussetzungen — die Beträge sind eine
                        Orientierung, keine Zusage. Jahresbeträge sind auf den Monat umgelegt.
                      </p>
                    </div>
                  );
                })()}

                <div className="mt-2 flex justify-center">
                  <a
                    href="/primundus-mustervertrag.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,color:'#18181B'}}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/>
                    </svg>
                    <span className="text-[13px] underline" style={{color:'#18181B'}}>Mustervertrag als PDF herunterladen</span>
                  </a>
                </div>
                </>)}
            </div>
          )}
        </div>
        </div>
        );
      })();

  return (
    <>
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
    <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{fontFamily: 'inherit'}}>
    <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] max-w-[85vw] bg-white border border-[#E8D0EA] text-gray-800 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium flex items-center gap-2.5"
          style={{ animation: 'slideDown 0.25s ease-out' }}
        >
          <div className="w-5 h-5 rounded-full bg-[#9B1FA1] flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" strokeWidth={3} />
          </div>
          <span className="leading-snug">{toast.replace(/^✓\s*/, '')}</span>
        </div>
      )}

      {/* Navbar */}
      <nav className="sticky top-0 z-40" style={{background:'white', boxShadow:'0 1px 0 #E9E9EB, 0 2px 8px rgba(0,0,0,0.06)'}}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactPopup(true)}
              className="flex items-center gap-1.5 bg-white hover:bg-[#F5F5F6] text-[#8B7355] border border-[#E9E9EB] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Hilfe
            </button>
          </div>
        </div>
        {/* Sub-Nav: Einsatz-Kontext (Status + Zeitraum) links, Link zur
            Einsätze-Übersicht rechts. Logo bleibt darüber sichtbar.
            Rendert nur wenn ?back=jobs gesetzt (= aus Multi-Job-Übersicht
            rein-navigiert). Wird später durch das echte Multi-Job-Routing
            (lead_jobs Tabelle) ersetzt. */}
        {HAS_JOBS_BACK && JOBS_BACK && (() => {
          const statusStyle = {
            laufend: { label: 'Laufend', cls: 'bg-green-50 text-green-700 border-green-200' },
            gebucht: { label: 'Gebucht', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
            geplant: { label: 'Geplant', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
            abgeschlossen: { label: 'Abgeschlossen', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
          } as const;
          const s = JOBS_BACK.status ? statusStyle[JOBS_BACK.status] : null;
          const zeitraum = JOBS_BACK.bis
            ? `${JOBS_BACK.von} – ${JOBS_BACK.bis}`
            : JOBS_BACK.von ? `ab ${JOBS_BACK.von}` : '';
          return (
            <div className="max-w-3xl mx-auto px-4 pb-2 -mt-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {s && (
                  <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.cls}`}>{s.label}</span>
                )}
                {zeitraum && (
                  <span className="text-xs font-semibold text-gray-700 truncate">{zeitraum}</span>
                )}
              </div>
              {JOBS_BACK.count > 1 && (
                <a
                  href="?preview=jobs"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#8B7355] hover:text-[#6B5444] flex-shrink-0"
                >
                  Alle Einsätze
                  <ArrowLeft className="w-3 h-3 rotate-180" />
                </a>
              )}
            </div>
          );
        })()}
        {/* Real Multi-Job back-link: sichtbar wenn (a) das Portal via
            ?job=<lead_jobs.id> auf einen Job scoped ist ODER (b) der Lead
            mehrere Einsätze hat (Opcja B, Dachs 8899 — ohne den Link war
            die ?view=jobs-Übersicht von einem Deeplink-losen Einstieg aus
            unerreichbar). Suppressed unter dem ?back=jobs Mock-Flow oben,
            der seinen eigenen "Alle Einsätze"-Link rendert. */}
        {(JOB_ID_PARAM || hasMultipleJobs) && !HAS_JOBS_BACK && (
          <div className="max-w-3xl mx-auto px-4 pb-2 -mt-1 flex items-center">
            <a
              href={JOBS_OVERVIEW_HREF}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#8B7355] hover:text-[#6B5444]"
            >
              <ArrowLeft className="w-3 h-3" />
              Alle meine Einsätze
            </a>
          </div>
        )}
      </nav>

      {acceptedApp ? (
        (() => {
          // vertragSigned aus zwei Quellen ableiten:
          //   1) signedForm — frisch im Annahme-Flow gesetzt (in-memory, lebt
          //      nur bis Page-Reload)
          //   2) acceptedApplications.rows[].contract_snapshot — vom Server
          //      persistiert. Nach Reload ist signedForm null, die Acceptance-
          //      Row aber noch in der DB. Wenn contract_snapshot existiert,
          //      hat der Kunde signiert (Stufe-B-Update schreibt signatur +
          //      contract_snapshot zusammen).
          // Sonst zeigte BookedScreen "Vertrag · Folgt" obwohl die Mail-PDF
          // längst raus ist — Michael-Dachs-Reproducer 12.06.
          const hasPersistedContract = (acceptedApplications?.rows ?? []).some(
            (r) => !!r.contract_snapshot,
          );
          const vertragSigned = !!signedForm?.signatur || hasPersistedContract;
          // Vertrag nachträglich abschließen (Martin, 2026-07-15): Fehlt der
          // unterschriebene Vertrag (Annahme kam agentur-seitig → synthetische
          // fc-App ohne signedForm/contract_snapshot), wird der Vertrag-
          // Milestone zum aktiven Schritt. Nur mit belastbarer numerischer
          // Bridge-Referenz (fail-soft) + echtem Lead-Token; nie im Preview,
          // nie für beendete Einsätze, nie wenn der Vertrag schon vorliegt.
          const contractAppId = acceptanceApplicationId(acceptedApp.id);
          const canCompleteContract =
            !vertragSigned
            && !IS_EINSATZ_BEENDET
            && !IS_PREVIEW_ANY
            && !!lead?.token
            && contractAppId !== null;
          return (
            <BookedScreen
              app={acceptedApp}
              onNurseClick={setSelectedNurse}
              vertragSigned={vertragSigned}
              onSignContract={
                canCompleteContract ? () => setContractApp(acceptedApp) : undefined
              }
              // leadId + Token aktivieren den eingebetteten PDF-Viewer im
              // Vertrag-Milestone (Mustervertrag-Look via /api/contract-pdf).
              // Wenn das Lead oder der URL-Token fehlt → Fallback Modal mit
              // React-VertragSignieren (onShowContract).
              leadId={lead?.id}
              leadToken={lead?.token ?? undefined}
              onShowContract={
                signedForm?.signatur && !(lead?.id && lead?.token)
                  ? () => setShowSignedContract(true)
                  : undefined
              }
              // Multi-Job-Vorschau: abgeschlossener Einsatz → Header
              // "📋 Einsatz beendet" statt "🎊 Vielen Dank gebucht".
              einsatzBeendet={IS_EINSATZ_BEENDET}
            />
          );
        })()
      ) : (
      <>
      {/* ── Hero (full-width gradient) — state-aware copy ── */}
      {(() => {
        // Einheitliche formale Anrede (Herr/Frau Nachname), abgeleitet via
        // Geschlechts-Erkennung wenn das anrede-Feld leer ist; sonst neutral
        // ("Guten Tag."). Nie bloßer Nachname. Siehe customerSalutation.
        const heroNameLine = lead ? customerSalutation(lead) : 'Herr Mustermann';

        // Hero copy adapts to where the customer is in the flow:
        //   pending  — at least one application waiting on a decision
        //              → focus the customer on reviewing it now
        //   ready    — patient profile saved, no applications yet
        //              → encourage them to invite a Wunschkraft
        //   initial  — fresh portal, profile not filled
        //              → explain what the portal does next
        const n = pendingApps.length;

        const heroCopy = hasPending
          ? {
              title: n > 1
                ? `Sie haben ${n} neue Bewerbungen. 📨`
                : 'Sie haben eine neue Bewerbung. 📨',
              subtitle: n > 1
                ? 'Schauen Sie sich die Pflegekräfte in Ruhe an und entscheiden Sie, welche am besten passt.'
                : 'Schauen Sie sich die Bewerbung in Ruhe an und entscheiden Sie, ob die Pflegekraft passt.',
              pill: n > 1 ? `${n} Bewerbungen aktiv` : '1 Bewerbung aktiv',
              steps: null as 'initial' | 'saved' | null,
            }
          : patientSaved && !IS_PREVIEW_ANY && (!mmReady || mmApplicationsLoading || !mmApplications)
          ? {
              // Mamamia-Daten laden noch (oder der Abruf hakt) — hier NICHT
              // "werden vorbereitet" behaupten: Wer aus der Bewerbungs-Mail
              // kommt, hat nachweislich eine Bewerbung (Martin, 2026-07-09).
              //
              // In der Vorschau ist dieser Zweig ausgeschlossen: ohne echtes
              // mamamia wird `mmReady` nie true, dadurch hing JEDER gespeicherte
              // Zustand lokal auf "Einen Moment" fest — auch ?preview=wartet,
              // das genau den Zweig darunter zeigen soll (Übergabe 11.08.).
              title: 'Einen Moment — Ihre Bewerbungen werden geladen.',
              subtitle: 'Wir holen gerade den aktuellen Stand Ihrer Anfrage. Das dauert nur wenige Sekunden.',
              pill: 'Portal wird geladen',
              steps: null as 'initial' | 'saved' | null,
            }
          : patientSaved
          ? {
              // Nach dem Speichern ist die Seite kein Angebot mehr, sondern
              // der Arbeitsplatz des Kunden (Martin, 13.08.: „Ihr
              // Betreuungsportal" — „Ihr persönliches Angebot" passte nicht
              // mehr, das Angebot rutscht in diesem Zustand auch nach unten).
              title: 'Ihr Betreuungsportal',
              subtitle:
                'Hier sehen Sie eingehende Bewerbungen und können in der Zwischenzeit passende Pflegekräfte zur Bewerbung einladen — es bleibt alles unverbindlich.',
              // Kein Pill (Martin, 13.08.): „unverbindlich" steht schon im
              // Satz darüber — die Zeile war eine Wiederholung.
              pill: '',
              steps: 'saved' as 'initial' | 'saved' | null,
            }
          : {
              // Der Header IST die Überschrift des Angebots (Martin, 11.08.) —
              // keine Statusmeldung („fertig"), sondern die Sache selbst. Der
              // Abschnitt darunter heißt deshalb „Ihre Betreuungskosten" und
              // wiederholt den Titel nicht.
              title: 'Ihr persönliches Angebot',
              // Wird im Ausgangszustand NICHT im Hero gerendert: Die Begründung
              // steht dort, wo gehandelt wird — als Einleitung über dem
              // Formular (Martin, 11.08.: erst Angebot und Pflegekräfte
              // zeigen, dann um die Pflegesituation bitten).
              subtitle:
                // "beschrieben" — dasselbe Verb wie über dem Formular, im
                // Text über den Pflegekräften und in der Schritt-Liste
                // ("Pflegesituation beschreiben"). "vervollständigt" klang
                // nach einem zweiten, anderen Schritt (Übergabe 11.08.).
                'Hier finden Sie Ihre Betreuungskosten inklusive aller Gebühren und passende Pflegekräfte, die verfügbar sind. Sobald Sie die Pflegesituation beschrieben haben, können sich diese ganz unverbindlich bei Ihnen bewerben.',
              // Kein Pill hier: Der Einleitungssatz darüber sagt bereits, was
              // den Kunden erwartet. In den anderen Zuständen trägt die Zeile
              // echten Status („1 Bewerbung aktiv") — dort bleibt sie.
              pill: '',
              steps: 'initial' as 'initial' | 'saved' | null,
            };

        // Die nummerierte Schritt-Checkliste (Martin, 2026-07-12: „der Kunde
        // soll SEHEN, dass genau ein Schritt fehlt") ist am 11.08. entfallen.
        // Sie war inhaltlich richtig, kostete aber den halben ersten Bildschirm
        // und erzählte genau die Struktur, die die Abschnitte darunter ohnehin
        // tragen. Der Kunde kommt aus dem Kostenrechner von „✓ Ihr Angebot ist
        // fertig" + Button „Angebot & Pflegekräfte anzeigen →" — und muss genau
        // das sehen, nicht eine Aufgabenliste davor. Die Führung liegt jetzt in
        // der Reihenfolge der Abschnitte selbst:
        //   Angebot → Passende Pflegekräfte → Pflegesituation → Vorteile/FAQ

        return (
          <div className="relative" style={{background:'#FFFFFF', borderBottom:'1px solid #E9E9EB'}}>
            <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
              <p className="text-[15px] font-medium mb-3" style={{color:'#71717A'}}>
                Guten Tag{heroNameLine ? `, ${heroNameLine}` : ''}.
              </p>
              <h1 className="text-[1.75rem] font-bold leading-tight tracking-tight mb-2" style={{color:'#18181B'}}>
                {heroCopy.title}
              </h1>
              {/* Im Ausgangszustand steht hier NICHTS mehr außer der
                  Bestätigung — kein Erklärabsatz, keine Checkliste, kein
                  Button. Alle drei waren Kopien dessen, was die Abschnitte
                  darunter ohnehin tragen (Abschnitt „Pflegesituation" hat
                  einen eigenen Karten-Kopf mit genau diesem Aufruf). */}
              <p className="text-[16px] leading-relaxed mb-5" style={{color:'#71717A'}}>
                {heroCopy.subtitle}
              </p>

              {/* Trust-Zeile: ohne Fläche und Rahmen im schlanken Hero — als
                  Pill wirkte sie wie der Primärbutton und war ein
                  Fehlklick-Magnet, der nichts tut. */}
              {heroCopy.pill && (
              <div
                className={`inline-flex items-center gap-2 ${heroCopy.steps ? '' : 'rounded-full px-4 py-2'}`}
                style={heroCopy.steps ? undefined : {background:'#F5F5F6', border:'1px solid #E9E9EB'}}
              >
                <Check className="w-4 h-4 flex-shrink-0" strokeWidth={3} style={{color:'#8B7355'}} />
                <span className="text-[15px]" style={{color:'#18181B'}}>{heroCopy.pill}</span>
              </div>
              )}
            </div>
            {/* Die geschwungene Welle als Übergang zum Body ist am 11.08.
                entfallen (Martin: „diese Trennung zwischen Header und Rest ist
                krass unpassend"). Sie war das einzige verspielte Element in
                einem sonst sachlichen Layout und ließ den Hero wie einen
                aufgeklebten Banner wirken. Jetzt: gerade Kante, der Header
                sitzt als Block auf der Seite. */}
          </div>
        );
      })()}

      {/* ── SECTION: Ihr Angebot (collapsible) ── */}
      {!patientSaved && angebotSection}


      <div className="max-w-3xl mx-auto px-4 pt-1 pb-6 space-y-4" style={{background:'#FFFFFF'}}>


        {/* ── SECTION HEADER: Ihre Bewerbungen — NUR bei offenen
             Bewerbungen. Der Header war state-aware für beide Listen; seit
             13.08. ist er geteilt, weil das Interesse ZWISCHEN beide rückt:
             Bewerbung zuerst (Hero kündigt sie an, Entscheidung eilt), dann
             Interesse, dann die Matching-Liste. Vorher stand die
             Interesse-Karte VOR der Bewerbung — der Hero sagte „Sie haben
             eine neue Bewerbung" und das Erste im Bild war etwas anderes. */}
        {hasPending && (
          <div className="px-1 pt-2">
            <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>Ihre Bewerbungen</h2>
          </div>
        )}


        {/* ── SECTION: Pending Applications ──
             Höchste Priorität: pending Bewerbungen wollen eine Entscheidung
             vom Kunden — die kommen ZUERST, vor allem anderen. */}
        {hasPending && (
          <div id="bewerbungen" className="space-y-3 scroll-mt-4">
            <p className="text-[16px] leading-relaxed px-1" style={{color:'#18181B'}}>
              Tippen Sie auf <span className="font-semibold">"Angebot prüfen"</span>, um die Details der Pflegekraft zu sehen und über das Angebot zu entscheiden.
            </p>
            {pendingApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                exiting={exitingIds.has(app.id)}
                onReview={() => setSelectedApp(app)}
                onDecline={() => setDeclineConfirmApp(app)}
                onNurseClick={(n) => openNurseFromApp(n, app)}
                onChat={CHAT_ENABLED ? (n) => setChatNurse(n) : undefined}
              />
            ))}
            {/* Beratungs-CTA direkt unter den Bewerbungen — Bewerbungen sind
                der entscheidungsstärkste Moment, hier sind Kunden besonders
                empfänglich für persönliche Hilfe. */}
            <BeratungCTA
              headline="Fragen zur Bewerbung?"
              body="Ich gehe das Angebot gerne mit Ihnen durch und beantworte alle offenen Fragen."
            />
          </div>
        )}

        {/* ── SECTION: Interest-Karten ──
             NUR ohne offene Bewerbung (Martin, 13.08.: „interessierte würde
             ich ausblenden, weil Bewerbung doch wichtiger"): Liegt eine
             Bewerbung zur Entscheidung, ist alles andere Ablenkung — das
             Interesse taucht wieder auf, sobald entschieden ist. Sonst ÜBER
             der Matching-Liste (Interest ist heißer als ein normales
             Matching).

             NUR bei vollständiger Pflegesituation (Martin, 13.08.): Vorher
             ist der Kunde in mamamia `draft`, der Job nicht öffentlich —
             keine Pflegekraft kann ihn sehen, Interesse ist dort eine
             logische Unmöglichkeit. Real käme der Fall nie vor (Interests
             existieren erst ab `active`), aber die Vorschau-Mocks zeigten
             ihn und stifteten Verwirrung; das Gate macht Darstellung und
             Wirklichkeit deckungsgleich. */}
        {!hasPending && patientSaved && visibleInterests.length > 0 && (<>
          {/* Kleine Abschnitts-Überschrift wie bei den Nachbarn (Martin,
              13.08.) — der Kasten hing vorher ohne Einordnung zwischen
              Kosten und Pflegekräften. */}
          <div className="px-1 pt-2">
            <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>
              {visibleInterests.length === 1 ? 'Interessierte Pflegekraft' : 'Interessierte Pflegekräfte'}
            </h2>
          </div>
          {/* Erklärtext ÜBER dem Kasten (gleiches Muster wie bei den
              passenden Pflegekräften): Was heißt „Interesse", und was
              passiert beim Einladen (Martin, 13.08.) — die Pflegekraft
              findet den Einsatz gut, ein Mitarbeiter stößt nach der
              Einladung die offizielle Bewerbung an. */}
          <p className="text-[16px] leading-relaxed px-1 mb-3" style={{ color: '#18181B' }}>
            {visibleInterests.length === 1
              ? 'Diese Pflegekraft hat Ihre Anfrage gesehen und würde die Betreuung gerne übernehmen. Wenn Sie sie einladen, stößt ein Mitarbeiter von uns die offizielle Bewerbung an — für Sie ganz unverbindlich.'
              : 'Diese Pflegekräfte haben Ihre Anfrage gesehen und würden die Betreuung gerne übernehmen. Wenn Sie eine einladen, stößt ein Mitarbeiter von uns die offizielle Bewerbung an — für Sie ganz unverbindlich.'}
          </p>
          {/* Eigener, hervorgehobener Kasten ÜBER den passenden Pflegekräften
             (Martin, 11.08.): Proaktives Interesse ist mehr wert als ein
             Matching — vorher lag es optisch gleichauf in derselben Liste und
             ging unter. Kräftigerer Rahmen als die Matching-Karten. Seit dem
             Fragment-Umbau 13.08. MUSS das ein JSX-Kommentar sein — als
             blanker /*-Block zwischen Elementen wurde er als TEXT gerendert
             und stand wörtlich auf der Seite. */}
          <div className="rounded-3xl px-3 py-4 border space-y-3" style={{ background: '#FFFFFF', borderColor: '#F0B0A4' }}>
            {/* Coral „Interesse"-Kopf wie im Profil-Modal (CustomerNurseModal):
                Herz im Kreis + coral Fettzeile. Proaktives Interesse soll auch
                in der Liste warm/hervorgehoben wirken statt blass-braun
                (Martin, 18.08.). */}
            <div className="flex items-center gap-2.5 px-1">
              <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#FFCFC4' }}>
                <Heart className="w-3.5 h-3.5" fill="currentColor" style={{ color: '#C04A40' }} />
              </div>
              <p className="text-[15px] font-bold leading-snug" style={{ color: '#C04A40' }}>
                {visibleInterests.length === 1
                  ? 'Eine Pflegekraft interessiert sich für die Betreuung'
                  : `${visibleInterests.length} Pflegekräfte interessieren sich für die Betreuung`}
              </p>
            </div>
            {visibleInterests.map((i) => {
              const baseNurse = mapCaregiverToNurse(i.caregiver, {
                nowIso: new Date().toISOString(),
                nowYear: new Date().getFullYear(),
              });
              const nurse = IS_PREVIEW_ANY
                ? { ...baseNurse, profile: PREVIEW_INTEREST_PROFILE, detailedAssignments: PREVIEW_INTEREST_ASSIGNMENTS }
                : baseNurse;
              const status: InterestActionStatus =
                interestStatusOverrides.get(i.caregiver_id) ?? 'idle';
              const label = displayName(nurse.name);
              return (
                <InterestCard
                  key={`interest-${i.id}`}
                  nurse={nurse}
                  status={status}
                  onNurseClick={() => {
                    setSelectedNurse(nurse);
                    setSelectedFromInterestId(i.caregiver_id);
                  }}
                  onInvite={() => canInviteNurse(0)}
                  onInviteConfirm={() => confirmInviteInterest(i.caregiver_id, label)}
                  onDismiss={() => confirmDismissInterest(i.caregiver_id)}
                  globalInviteLocked={inviteInFlight}
                />
              );
            })}
          </div>
        </>)}

        {/* ── SECTION HEADER: Passende Pflegekräfte einladen — nur ohne
             offene Bewerbungen (mit Bewerbung ist die Matching-Liste eh
             ausgeblendet, der Kunde soll erst entscheiden). */}
        {!hasPending && (
          <div className="px-1 pt-2" id="pflegekraefte">
            <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>Passende Pflegekräfte einladen</h2>
          </div>
        )}

        {/* ── SECTION: Matched Nurses — pending + invited + Interests, nur
             wenn keine offenen Bewerbungen. Interest-Karten (Pflegekräfte,
             die proaktiv Interesse signalisiert haben) werden ganz oben in
             die gleiche Liste eingehängt — keine eigene Section, kein
             Erklär-Text. ── */}
        {/* Mamamia-Matchings vorübergehend nicht erreichbar / noch am Laden →
            ruhiger Lade-Zustand STATT einer leeren "keine Pflegekräfte"-Seite.
            Auto-Retry (useEffect oben) lädt im Hintergrund nach. */}
        {!hasPending && matchingsLoadingOrError && (
          <div className="rounded-3xl px-5 py-8 border text-center" style={{ background: '#F5F5F6', borderColor: '#D4D4D8' }}>
            <div className="inline-block w-6 h-6 rounded-full border-2 animate-spin mb-3" style={{ borderColor: '#C4B49A', borderTopColor: 'transparent' }} />
            <p className="text-[15px] font-semibold mb-1" style={{ color: '#18181B' }}>Wir laden Ihre Pflegekräfte …</p>
            <p className="text-[14px] leading-relaxed" style={{ color: '#71717A' }}>Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
          </div>
        )}

        {!hasPending && !matchingsLoadingOrError && (() => {
          // Interest-Pflegekräfte (sowohl invited als auch declined)
          // werden NICHT in der Matching-Liste gerendert sondern unten
          // in der "Bereits bearbeitet"-Sektion (User-Wunsch: gleiche
          // Behandlung wie bei Bewerbungen). Filter: caregiverId raus
          // wenn interestOriginIds das hat UND Status invited/declined.
          const allVisible = effectiveMatched
            .map((m, i) => ({ nurse: m.nurse, i, caregiverId: m.caregiverId, status: nurseStatusById.get(m.caregiverId) ?? 'pending' as NurseStatus, virtualDeclinedFromInterest: false as const }))
            .filter(({ status, caregiverId }) => {
              if (status === 'pending') return true;
              // invited/declined ausschließen wenn aus Interest stammt
              return !interestOriginIds.has(caregiverId);
            });
          // Order: pending (cap 5, oben) → invited → declined (ganz unten,
          // ausgegraut mit "Abgelehnt"-Pill + Undo-Link). User-Wunsch:
          // bearbeitete (normale) Pflegekräfte rutschen nach unten in der
          // Matching-Liste. Interest-Aktionen leben in "Bereits bearbeitet"
          // (siehe unten — InterestActionCards in der doneApps-Sektion).
          // Oben NUR die frischen Vorschläge (max 3). Bereits bearbeitete
          // Matchings (invited/declined) wandern in die gedämpfte
          // "Bereits bearbeitet"-Sektion unten (MatchCardDone) — sonst
          // wirken sie zu prominent / zu ähnlich wie die offenen Vorschläge.
          type VisibleNurse = {
            nurse: Nurse;
            i: number;
            caregiverId: number;
            status: NurseStatus;
            virtualDeclinedFromInterest: boolean;
          };
          // Batch-Reveal (User-Wunsch 25.06.): sichtbarer Pool = 5 −
          // Einladungen der letzten 24h. Einladen hält den Slot 24h (die
          // Pflegekraft wartet auf Antwort); nach 24h ohne Reaktion füllt sich
          // der Pool wieder auf 5 + die "neue Pflegekräfte"-Mail geht raus.
          // Ablehnen zählt NICHT mit (caregiver_invite_attempts erfasst nur
          // echte Einladungen) → rückt sofort nach. used_24h aus getInviteRateState.
          const heldInvites = inviteRate?.used_24h ?? 0;
          const visibleCount = Math.max(0, 5 - heldInvites);
          const pendingNurses: VisibleNurse[] = allVisible.filter(({ status }) => status === 'pending').slice(0, visibleCount);
          // Die Empfehlung (höchste Badge-Bewertung, Score = Erfahrungsjahre +
          // Einsätze) nach ganz oben ziehen — die anderen behalten ihre
          // Reihenfolge. So steht "Empfehlung des Beraters" immer zuoberst.
          const badgeScore = (n: Nurse) => nurseBadgeScore(n.history?.assignments);
          let bestIdx = -1;
          let bestScore = -Infinity;
          pendingNurses.forEach((p, idx) => {
            const s = badgeScore(p.nurse);
            if (s > bestScore) { bestScore = s; bestIdx = idx; }
          });
          const visibleNurses: VisibleNurse[] = bestIdx > 0
            ? [pendingNurses[bestIdx], ...pendingNurses.filter((_, idx) => idx !== bestIdx)]
            : pendingNurses;
          const hasAnyCard = visibleNurses.length > 0;
          return (
            <>
              {hasAnyCard && (
                <>
                {/* Der Erklärtext steht ÜBER dem Kasten auf Weiß (Martin,
                    11.08.), nicht darin: Er beschreibt, was im Kasten kommt —
                    innen wirkte er wie ein weiteres Element der Liste und
                    schob die erste Pflegekraft nach unten. */}
                {!patientSaved && (
                <p className="text-[16px] leading-relaxed px-1 mb-3" style={{color:'#18181B'}}>
                  {(
                    // Kein Schloss, keine Schritt-Nummer: Seit dem Umbau am
                    // 11.08. steht die Pflegesituation UNTER den
                    // Pflegekräften — der alte Text („nach Schritt 2", Pfeil
                    // nach oben) zeigte ins Leere. Formuliert als
                    // Gegenleistung, nicht als Schranke.
                    <>Diese Pflegekräfte passen zu Ihrer Anfrage und sind im gewünschten Zeitraum frei. Damit sie sich bei Ihnen bewerben können, brauchen sie noch ein paar Angaben zur Pflegesituation. {' '}
                      <button type="button" className="font-semibold underline underline-offset-2"
                        style={{color:'#8B7355'}}
                        onClick={() => { document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                        Pflegesituation beschreiben ↓
                      </button>
                    </>
                  )}
                </p>
                )}
                <div
                  className="rounded-3xl px-3 py-4 border"
                  style={{ background: '#F5F5F6', borderColor: '#D4D4D8' }}
                >
                  <div className="space-y-3">
                    {/* Interest-Karten werden jetzt OBEN in einer eigenen
                        always-visible Section gerendert (siehe oben), nicht
                        mehr hier — damit sie auch bei hasPending sichtbar
                        bleiben. */}
                    {(() => {
                      // Genau EINE "Empfehlung des Beraters": die pending
                      // Pflegekraft mit der höchsten Badge-Bewertung. Score =
                      // Erfahrungsjahre + Einsätze (gleiche Formel wie
                      // nurseLevel → höchster Score = bestes Tier). Eine klare
                      // Empfehlung wirkt stärker als zwei.
                      const badgeScore = (n: Nurse) => nurseBadgeScore(n.history?.assignments);
                      let recIdx = -1;
                      let recBest = -Infinity;
                      visibleNurses.forEach(({ nurse, status }, idx) => {
                        if (status !== 'pending') return;
                        const s = badgeScore(nurse);
                        if (s > recBest) { recBest = s; recIdx = idx; }
                      });
                      return visibleNurses.map(({ nurse, i, status }, idx) => {
                        const isRecommended = idx === recIdx;
                        return (
                          <MatchCard
                            key={`m-${i}`}
                            nurse={nurse}
                            status={status}
                            isRecommended={isRecommended}
                            onNurseClick={() => openNurseFromMatch(nurse, i)}
                            onInvite={() => canInviteNurse(i)}
                            onInviteConfirm={() => confirmInviteNurse(i, displayName(nurse.name))}
                            onUndoDecline={status === 'declined' ? () => undoDeclinedMatch(i) : undefined}
                            globalInviteLocked={inviteInFlight}
                          />
                        );
                      });
                    })()}
                  </div>

                  {/* Beratungs-CTA — direkt unter den 3 Match-Karten.
                       Fängt Kunden ab die überfordert oder unsicher sind
                       und sonst still abspringen würden. */}
                  {patientSaved && (
                    <div className="mt-4">
                      <BeratungCTA
                        headline="Unsicher bei der Auswahl?"
                        body="Ich helfe Ihnen gerne, die passende Pflegekraft für Ihre Situation zu finden — schnell und unverbindlich."
                      />
                    </div>
                  )}
                </div>
                </>
              )}

              {/* Warte-Hinweis: alle frischen Slots sind durch Einladungen der
                  letzten 24h "gehalten" (visibleCount 0). Ruhig formuliert —
                  kein Drängen. Nach 24h ohne Reaktion füllt sich der Pool wieder
                  auf + die "neue Pflegekräfte"-Mail geht raus. Nur zeigen, wenn
                  wirklich gehalten (heldInvites > 0), nicht wenn der Pool leer ist. */}
              {!hasAnyCard && heldInvites > 0 && (
                <div className="rounded-3xl px-5 py-5 border text-center" style={{ background: '#F5F5F6', borderColor: '#D4D4D8' }}>
                  <p className="text-[15px] font-semibold mb-1" style={{color:'#18181B'}}>Ihre Auswahl ist eingeladen</p>
                  <p className="text-[14px] leading-relaxed" style={{color:'#71717A'}}>
                    Die Pflegekräfte melden sich meist innerhalb von 1&ndash;2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier &mdash; meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.
                  </p>
                </div>
              )}

              {/* Alle Vorschläge bearbeitet (abgelehnt), keine offene Einladung
                  und nichts Frisches mehr im Pool → sonst stünde hier nur die
                  Überschrift ohne Karten (wirkt wie ein Bug). Ruhiger Hinweis,
                  dass weitere folgen (Martin, 18.08.). */}
              {!hasAnyCard && heldInvites === 0 && allVisible.length > 0 && (
                <div className="rounded-3xl px-5 py-5 border text-center" style={{ background: '#F5F5F6', borderColor: '#D4D4D8' }}>
                  <p className="text-[15px] font-semibold mb-1" style={{color:'#18181B'}}>Alle aktuellen Vorschläge bearbeitet</p>
                  <p className="text-[14px] leading-relaxed" style={{color:'#71717A'}}>
                    Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
                  </p>
                </div>
              )}

              {/* "Bereits bearbeitet" wird einheitlich unten gerendert
                  (außerhalb dieser IIFE) — beide Branches (hasPending /
                  !hasPending) sehen dieselbe Sektion am Ende. */}
            </>
          );
        })()}

        {/* ── SECTION: Bereits bearbeitet ──
             Immer unten sichtbar wenn doneApps ODER bearbeitete Matchings
             existieren. Bewusst gedämpft (MatchCardDone: kompakt, grau) +
             klar getrennt unter den frischen Vorschlägen — sonst wirken die
             bearbeiteten Karten zu ähnlich wie die offenen. Sammelt:
             - bearbeitete Bewerbungen (AppCardDone)
             - eingeladene Pflegekräfte (normal + aus Interesse) — kein Undo
               (Mamamia kennt keine uninvite-Mutation)
             - abgelehnte Pflegekräfte (normal + aus Interesse) — mit Undo
             Reihenfolge: eingeladen zuerst, abgelehnt (ausgegraut) zuletzt. */}
        {(() => {
          // Normale Matchings (NICHT aus Interesse) nach Status, mit
          // effectiveMatched-Index für die Undo-/Detail-Handler.
          const matchInvited = effectiveMatched
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => nurseStatusById.get(m.caregiverId) === 'invited' && !interestOriginIds.has(m.caregiverId))
            .map(({ m, i }) => ({ nurse: m.nurse, caregiverId: m.caregiverId, status: 'invited' as const, key: `mi-${m.caregiverId}`, matchIdx: i, interest: false }));
          const matchDeclined = effectiveMatched
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => nurseStatusById.get(m.caregiverId) === 'declined' && !interestOriginIds.has(m.caregiverId))
            .map(({ m, i }) => ({ nurse: m.nurse, caregiverId: m.caregiverId, status: 'declined' as const, key: `md-${m.caregiverId}`, matchIdx: i, interest: false }));
          // Aktionen die aus einer Interest-Karte stammen (♥ Interesse-Label).
          const interestInvited = effectiveMatched
            .filter((m) => nurseStatusById.get(m.caregiverId) === 'invited' && interestOriginIds.has(m.caregiverId))
            .map((m) => ({ nurse: m.nurse, caregiverId: m.caregiverId, status: 'invited' as const, key: `ii-${m.caregiverId}`, matchIdx: -1, interest: true }));
          const interestDeclined = Array.from(declinedFromInterest.entries())
            .map(([cgId, nurse]) => ({ nurse, caregiverId: cgId, status: 'declined' as const, key: `id-${cgId}`, matchIdx: -1, interest: true }));
          // Eingeladen zuerst, abgelehnt zuletzt. Aus effectiveMatched (volle
          // Daten + Undo-Handler).
          const fromMatched = [...matchInvited, ...interestInvited, ...matchDeclined, ...interestDeclined]
            .map((d) => ({ ...d, fromEvent: false as const }));
          // Bearbeitete PKs, die Mamamia NICHT mehr in den Matchings liefert →
          // aus unseren Events rekonstruiert (Snapshot/Name). Dedupe gegen das,
          // was schon aus effectiveMatched kommt + Interesse-Aktionen.
          const matchedIds = new Set(fromMatched.map((d) => d.caregiverId));
          const fromEvents = extraProcessed
            .filter((p) => !matchedIds.has(p.caregiverId) && !interestOriginIds.has(p.caregiverId))
            .map((p) => ({ nurse: p.nurse, caregiverId: p.caregiverId, status: p.status, key: `ev-${p.caregiverId}`, matchIdx: -1, interest: false, fromEvent: true as const }));
          // Eingeladene zuerst, dann Abgelehnte (über beide Quellen).
          const allDone = [...fromMatched, ...fromEvents]
            .sort((a, b) => (a.status === b.status ? 0 : a.status === 'invited' ? -1 : 1));
          const hasAny = doneApps.length > 0 || allDone.length > 0;
          if (!hasAny) return null;
          // 3 sichtbar, Rest hinter "Weitere anzeigen" (User-Wunsch 26.06.).
          const VISIBLE_DONE = 3;
          const shownDone = showAllDone ? allDone : allDone.slice(0, VISIBLE_DONE);
          const moreCount = allDone.length - shownDone.length;
          return (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
              {doneApps.map((app) => (
                <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
              ))}
              {shownDone.map(({ nurse, caregiverId, status, key, matchIdx, interest, fromEvent }) => (
                <MatchCardDone
                  key={key}
                  nurse={nurse}
                  status={status}
                  hasInterestOrigin={interest}
                  onNurseClick={() => (fromEvent || interest) ? setSelectedNurse(nurse) : openNurseFromMatch(nurse, matchIdx)}
                  onUndo={(!fromEvent && status === 'declined') ? (interest ? () => undoDismissInterest(caregiverId) : () => undoDeclinedMatch(matchIdx)) : undefined}
                />
              ))}
              {!showAllDone && moreCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllDone(true)}
                  className="w-full text-center text-[13px] font-semibold py-2.5 rounded-xl transition-colors"
                  style={{ color: '#8B7355', background: '#F6F2EC' }}
                >
                  Weitere anzeigen ({moreCount})
                </button>
              )}
            </div>
          );
        })()}

      </div>

      {!hasPending && (
      <div style={{background:'#FFFFFF'}}>
      <div className="max-w-3xl mx-auto px-4 pt-1 pb-4 space-y-4">
        {/* ── SECTION: 2 · Patientendaten — der Onboarding-Schritt steht VOR
             den Pflegekräften (vorher lag die Karte zwischen PK-Header und
             PK-Karten — genau die „zwei Kästen"-Verwirrung, Martin 2026-07-12). ── */}
        {/* Die Hervorhebung sitzt seit 13.08. am FORMULAR selbst (brauner
             Rand + Schatten in AngebotCard), nicht mehr als Rahmen um Kopf
             UND Formular: Auf dem Handy presste der Aussenrahmen Einleitung
             und Formular aneinander (Martin: „zu eng"). Der Kopf mit
             „Ohne diese Angaben keine Bewerbungen" traegt die Dringlichkeit
             im Text weiter. Das div bleibt als neutraler Anker. */}
        <div>
        {!hasPending && (() => {
          // Unvollständig = IMMER offen (Martin, 13.08.): Solange die
          // Angaben fehlen, gibt es nichts wegzuklappen — der Bogen ist die
          // Aufgabe. Erst „Vollständig" macht den Abschnitt zur Referenz,
          // die eingeklappt startet und per Chevron zu öffnen ist.
          const patientExpanded = patientSaved ? (patientExpandedManual ?? false) : true;
          // Der Abschnitt ist die SCHRANKE: ohne ihn keine Bewerbungen.
          // Optisch hatte er bis 12.08. aber dasselbe Gewicht wie „So
          // funktioniert's" oder die FAQ (Martin: „sollten wir den nicht
          // prominenter machen, ohne den geht nichts?"). Jetzt trägt er
          // denselben hervorgehobenen Rahmen wie der Interesse-Kasten — weiß
          // mit braunem Rand. Bewusst KEIN neues Gestaltungsmittel: Diese
          // Hervorhebung ist im Portal seit dem 11.08. etabliert und genau
          // für „das hier ist wichtiger als der Rest" reserviert. Nur solange
          // offen — nach dem Speichern ist es Referenz und fällt auf den
          // ruhigen Rahmen zurück.
          return (
          <div id="patientendaten" className="px-1 pt-2">
            <button
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => {
                // Unvollständig ist nicht zuklappbar — der Klick täte sonst
                // heimlich nichts bzw. würde einen manual-Zustand setzen,
                // der nach dem Speichern falsch nachwirkt.
                if (!patientSaved) return;
                const next = !patientExpanded;
                setPatientExpandedManual(next);
                // Nach dem Speichern direkt in den bearbeitbaren Stepper
                // springen — sonst braeuchte es einen zweiten Klick auf den
                // Karten-Kopf.
                if (next) setTriggerOpenPatient(true);
              }}
            >
              <div className="min-w-0">
                <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>Pflegesituation</h2>
                {/* Sagt in fünf Wörtern, warum dieser Abschnitt anders ist
                    als die darüber. */}
                {!patientSaved && (
                  <p className="text-[13px] font-semibold mt-0.5" style={{color:'#8B7355'}}>
                    Ohne diese Angaben keine Bewerbungen möglich
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {patientSaved ? (
                  <span className="text-[12px] font-semibold px-3 py-1 rounded-full" style={{background:'#E3F7EF', color:'#2a9a6f'}}>✓ Vollständig</span>
                ) : (
                  <span className="text-[12px] font-semibold px-3 py-1 rounded-full" style={{background:'#FDF1E2', color:'#B45309'}}>Unvollständig</span>
                )}
                {patientSaved && (
                  <ChevronDown className={`w-5 h-5 text-[#8B7355] transition-transform duration-200 ${patientExpanded ? 'rotate-180' : ''}`} />
                )}
              </div>
            </button>

            {/* Einleitung „warum" (Martin, 11.08.) — seit 13.08. ohne den
                Minuten-/Kostenrechner-Satz: Auf dem Handy stand der Text
                gequetscht direkt auf dem Formular („zu eng"). Ein Satz plus
                Luft; die Dauer erklaert sich im Formular von selbst
                (Fortschrittsbalken, 4 Schritte). */}
            {!patientSaved && (
              <p className="text-[16px] leading-relaxed mt-3 mb-4" style={{color:'#18181B'}}>
                Sobald Sie die Pflegesituation beschrieben haben, erhalten Sie
                ganz unverbindlich Bewerbungen und sehen, welche Pflegekräfte
                die Betreuung übernehmen können.
              </p>
            )}
          </div>
          );
        })()}
        {/* ── Kombinierte Karte: Identität + Anfrage + Stepper ──
             Hidden once a Bewerbung is in: customer should focus on the
             pending application, not on revisiting saved patient data. */}
        {!hasPending && (patientSaved ? (patientExpandedManual ?? false) : true) && (
        <div>
        <AngebotCard
          lead={lead}
          mmCustomer={mmCustomer}
          onPatientSaved={(saved) => {
            if (saved && !patientSaved) {
              showToast('✓ Vielen Dank! Ihre Daten sind gespeichert. Sie können jetzt Pflegekräfte einladen und Bewerbungen erhalten.', 7000);
              // Frisch gespeichert → Abschnitt klappt zu (Referenz-Zustand).
              // Ohne den Reset würde ein früher gesetzter manual-Wert den
              // Bogen offen halten, obwohl die Aufgabe erledigt ist.
              setPatientExpandedManual(null);
            }
            setPatientSaved(saved);
          }}
          forceSaved={patientSaved}
          triggerOpenPatient={triggerOpenPatient}
          onTriggerHandled={() => setTriggerOpenPatient(false)}
          mamamiaEnabled={mmReady}
          onSaveToMamamia={async (form) => {
            const existingPatientIds = mmCustomer?.patients?.map(p => p.id) ?? [];

            // ── Save flow ──────────────────────────────────────────────────
            //
            // One write to land the full patient profile, then a separate
            // narrow write to overlay the AI-generated job_description.
            //
            // Why narrow overlay (proxy action `updateJobDescription`)
            // instead of re-sending the whole patch with AI text spread:
            //   - re-sending the full patch a second time bounces every
            //     association through Mamamia's resolver again — the
            //     resolver takes ~10-15 s to fully validate, during which
            //     panel-side StoreRequest (invite) returns Unauthorized.
            //   - a thin `{ job_description }` payload would trip Mamamia's
            //     "omitted associations = wipe" rule AND the proxy's
            //     defensive `patches=[]` workaround → wipes patients.
            //   - the dedicated proxy action re-fetches current patient
            //     and equipment ids and re-passes them as bare-id stubs,
            //     which Mamamia merges into the existing rows. Nothing
            //     else is touched, no wipe, no 10s lag.
            //
            // Sonnet (generateJobDescription) is fire-and-forget after the
            // gating write so the invite gate opens in ~1 s instead of
            // ~5 s. Mechanical job_description from the mapper is already
            // persisted by the gating write — if AI fails or never lands,
            // the customer profile still has a usable summary.

            // Location lookup synchronous, ~500 ms typical. Required before
            // building the patch so customer_contract carries the id.
            let locationId: number | undefined;
            let locationUnresolved = false;
            const plz = form.plz?.trim();
            if (plz && /^\d{4,5}$/.test(plz)) {
              try {
                const r = await callMamamia<{
                  LocationsWithPagination: {
                    data: Array<{ id: number; zip_code: string; country_code: string }>;
                  };
                }>('searchLocations', { search: plz, limit: 10, page: 1 });
                const rows = r.LocationsWithPagination.data;
                locationId = (rows.find(l => l.country_code === 'DE') ?? rows[0])?.id as number | undefined;
              } catch {
                // Lookup-Call selbst fehlgeschlagen → wie "nicht gefunden"
                // behandeln (unten sichtbar gemeldet, NICHT mehr still).
              }
              // Ort eingegeben, aber Mamamia kennt keinen passenden Einsatzort
              // (z. B. österreichische PLZ — Mamamias Locations sind deutsch).
              // location_id ist das Aktivierungs-Gate; ohne ihn bleibt der Kunde
              // Entwurf → NICHT verschlucken, sondern unten melden (Kunde + Team).
              locationUnresolved = locationId == null;
            }

            const patch = mapPatientFormToUpdateCustomerInput(form, {
              existingPatientIds,
              locationId,
              // Kontaktperson (Osoba Kontaktowa) aus dem Lead → customer_contract
              // (salutation/first_name/last_name), damit das Mamamia-Panel die
              // Kontaktdaten zeigt statt nur Customer.first_name top-level.
              contact: {
                anrede: lead?.anrede_text ?? lead?.anrede ?? null,
                vorname: lead?.vorname ?? null,
                nachname: lead?.nachname ?? null,
              },
            });

            // ── Gating write: full mechanical patch. Awaited so the caller
            // (AngebotCard) keeps patientSaved=false until Mamamia has the
            // complete profile — invite gate opens only on success.
            // portal_form_snapshot: der ROHE Patientenbogen — der Proxy friert ihn
            // nach erfolgreichem Write an leads.patient_form ein (SA-Portal zeigt
            // ihn im Anfrage-Block); Mamamia erreicht das Feld nie (Allowlist).
            try {
              await updateCustomerMutation.mutate({
                ...(patch as Record<string, unknown>),
                portal_form_snapshot: form,
              });
            } catch (err) {
              const raw = err instanceof Error ? err.message : String(err ?? '');
              // Token während des Ausfüllens abgelaufen → ehrlich sagen und in
              // den Selbst-Service (neuen Link anfordern) leiten statt eines
              // ratlosen „fehlgeschlagen".
              if (/401|unauthorized|unauthenticated|token/i.test(raw)) {
                showToast('Ihr Zugangslink ist abgelaufen. Sie können sich gleich einen neuen Link zusenden lassen.');
                setSaveTokenExpired(true);
              } else {
                // Sprechende Meldung statt Ratespiel — häufige mamamia-Ablehnungen übersetzt.
                const friendly = /location/i.test(raw)
                  ? 'Die Postleitzahl konnte nicht zugeordnet werden — bitte PLZ und Ort prüfen.'
                  : /too long|exceeds|max/i.test(raw)
                    ? 'Eine Angabe ist zu lang (z. B. Diagnosen) — bitte etwas kürzen und erneut speichern.'
                    : `Speichern fehlgeschlagen: ${raw.slice(0, 140)}`;
                showToast(friendly);
              }
              // Fürs Team sichtbar machen, WORAN Kunden scheitern (Dashboard/Report).
              reportLeadEvent(lead?.token, 'patient_form_save_failed', { error: raw.slice(0, 200) });
              throw err;
            }

            // Report back to the kostenrechner lead — patient data complete
            // unlocks invites/applications, so the Nachfass switches to the
            // "last step: invite" variant. Fire-and-forget.
            //
            // Pass phone so the kostenrechner endpoint can refresh
            // leads.telefon (kept in sync with Mamamia Customer.phone after
            // a step-4 edit). Dedupe key includes phone, so a follow-up
            // save with an edited number re-fires.
            const phoneForLead = form.phone?.trim();
            const startDateForLead = form.startDate?.trim();
            // Vorname/Nachname für den Bridge-Sync nach leads.vorname/nachname.
            // Identischer Split wie im Mapper (splitCustomerName) → Mamamia
            // Customer.first_name/last_name und die leads-Spalten bleiben
            // konsistent. Der Mapper hat den Namen bereits in den updateCustomer-
            // Patch gelegt; hier nur für die Bridge-Metadaten wiederverwendet.
            const { vorname: vornameForLead, nachname: nachnameForLead } = splitCustomerName(form.name);
            const leadEventMeta: Record<string, string> = {};
            if (phoneForLead) leadEventMeta.phone = phoneForLead;
            if (startDateForLead) leadEventMeta.startDate = startDateForLead;
            if (vornameForLead) leadEventMeta.vorname = vornameForLead;
            if (nachnameForLead) leadEventMeta.nachname = nachnameForLead;
            // Einsatzort nicht auflösbar (Ort eingegeben, aber kein Mamamia-
            // Location-Treffer): NICHT als sauberen Erfolg ausgeben. Die
            // Patientendaten sind gespeichert (bleiben), aber ohne location_id
            // bleibt der Kunde in Mamamia Entwurf (keine Einladung/Veröffentlichung).
            //  1) Kunde sichtbar informieren statt stillem "fertig".
            //  2) Team-Ereignis loggen — unterscheidet "Ort eingegeben, nicht
            //     auflösbar" von "leer gelassen" (Dashboard/Report).
            //  3) Flag am patient_data_saved → der Kostenrechner unterdrückt die
            //     irreführende "Pflegekräfte können sich bewerben"-Mail.
            if (locationUnresolved) {
              const ortLabel = [plz, form.ort?.trim()].filter(Boolean).join(' ');
              // Deutsche PLZ sind IMMER 5-stellig; eine 4-stellige PLZ ist
              // Österreich/Schweiz — dort vermittelt Primundus nicht. Dann eine
              // ehrliche Absage statt „wir kümmern uns darum" (Marcin 03.08.:
              // „wir bedienen kein Österreich — Info an Kunde wäre perfekt").
              const outsideGermany = /^\d{4}$/.test(plz ?? '');
              showToast(outsideGermany
                ? `Wir vermitteln 24-Stunden-Betreuung aktuell ausschließlich innerhalb Deutschlands${ortLabel ? ` — für Ihren Ort „${ortLabel}"` : ''} können wir daher leider keine Pflegekraft anbieten. Bei Fragen melden Sie sich gern bei uns.`
                : `Ihre Angaben sind gespeichert. Ihren Ort${ortLabel ? ` „${ortLabel}"` : ''} konnten wir aber nicht automatisch übernehmen — wir kümmern uns darum und melden uns bei Ihnen.`);
              reportLeadEvent(lead?.token, 'patient_form_location_unresolved', {
                plz: plz ?? '',
                ort: form.ort?.trim() ?? '',
                ...(outsideGermany ? { outside_germany: '1' } : {}),
              });
              leadEventMeta.location_unresolved = '1';
            }
            reportLeadEvent(
              lead?.token,
              'patient_data_saved',
              Object.keys(leadEventMeta).length > 0 ? leadEventMeta : undefined,
            );
            // Patient form save flippa customer na active + dorzuca pełne
            // patient/wish dane. Mamamia matching engine re-scoreuje całą
            // listę z nowymi inputami — początkowo zwrócone caregivers
            // (na bazie minimal onboard payload) mogą już nie pasować lub
            // mogą się pojawić nowi. Refetch listę żeby user widział
            // aktualny scoring, nie stale wynik z czasu onboardu.
            refetchMatchings();

            // ── JobOffer.arrival_at sync (fire-and-forget).
            // Form Step 5 collects "Voraussichtliches Startdatum" — push it
            // to Mamamia's JobOffer.arrival_at via UpdateJobOfferDates.
            // Onboard set arrival_at as a fuzzy offset from care_start_timing
            // (e.g. "sofort" → +7d); the customer's explicit pick wins.
            //
            // Only fire when the user's pick actually differs from what
            // Mamamia currently holds — avoid no-op writes that would log
            // noise + reload the JobOffer.
            const pickedStartDate = form.startDate?.trim();
            const currentArrival = mmJobOffer?.arrival_at ?? null;
            if (pickedStartDate && pickedStartDate !== currentArrival) {
              void (async () => {
                try {
                  await updateJobOfferDatesMutation.mutate({ arrival_at: pickedStartDate });
                  refetchJobOffer();
                } catch (err) {
                  // Best-effort. Customer profile is saved; only the
                  // arrival_at didn't update. Surface a soft toast so the
                  // user knows to retry the form Save if the date was
                  // critical, but don't block the flow.
                  console.warn('updateJobOfferDates failed:', err);
                  showToast('Startdatum konnte nicht aktualisiert werden. Ihre Angaben wurden gespeichert.');
                }
              })();
            }

            // ── AI overlay (fire-and-forget). Only writes job_description.
            // Sonnet polishes the mechanical summary into a 2-3 sentence
            // German text. The proxy's `updateJobDescription` action
            // preserves patients + equipments by re-fetching their ids,
            // so nothing else in the customer state is touched.
            void (async () => {
              try {
                const aiResult = await callMamamia<{ description: string | null }>(
                  'generateJobDescription',
                  {
                    anzahl: form.anzahl,
                    geschlecht: form.geschlecht, geburtsjahr: form.geburtsjahr,
                    pflegegrad: form.pflegegrad, mobilitaet: form.mobilitaet,
                    heben: form.heben, demenz: form.demenz,
                    inkontinenz: form.inkontinenz, nacht: form.nacht,
                    diagnosen: form.diagnosen,
                    p2_geschlecht: form.p2_geschlecht, p2_geburtsjahr: form.p2_geburtsjahr,
                    p2_pflegegrad: form.p2_pflegegrad, p2_mobilitaet: form.p2_mobilitaet,
                    p2_demenz: form.p2_demenz,
                    ort: form.ort, wohnungstyp: form.wohnungstyp,
                    urbanisierung: form.urbanisierung, familieNahe: form.familieNahe,
                    haushalt: form.haushalt, pflegedienst: form.pflegedienst,
                    aufgaben: form.aufgaben, sonstigeWuensche: form.sonstigeWuensche,
                  },
                );
                if (aiResult.description) {
                  await updateJobDescriptionMutation.mutate({ text: aiResult.description });
                }
              } catch (err) {
                // AI overlay is best-effort. Mechanical job_description
                // from the mapper is already persisted by the gating write.
                console.warn('AI job_description overlay failed (mechanical retained):', err);
              }
            })();
          }}
        />
        </div>
        )}
        </div>{/* Ende Hervorhebung Pflegesituation (Kopf + Formular) */}

      </div>
      </div>
      )}

      {/* Im gespeicherten Zustand steht das Angebot HIER — unter Bewerbungen/
          Pflegekräften und der Pflegesituation, vor dem FAQ-Block (Martin,
          13.08.). Der Kunde hat den Preis längst gesehen; jetzt ist die Seite
          sein Betreuungsportal, und oben gehören die Dinge hin, auf die er
          wartet. Als Referenz bleibt das Angebot vollständig erreichbar. */}
      {patientSaved && angebotSection}

      <div className="max-w-3xl mx-auto px-4 pt-1 pb-6 space-y-4" style={{background:'#FFFFFF'}}>
        {/* ── SECTION HEADER: So funktioniert's ── */}
        <div className="px-1 pt-3">
          <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>So funktioniert's</h2>
          <p className="text-[15px] mt-2" style={{color:'#71717A'}}>Von der ersten Anfrage bis zur laufenden Betreuung.</p>
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
          {[
            // „vieles ist schon vorausgefüllt" war falsch (Martin, 12.08.):
            // Aus dem Kostenrechner kommen anzahl, pflegegrad, mobilität,
            // nachteinsätze, haushalt und das gewünschte Geschlecht — von
            // zwölf Pflichtfeldern also vier. Jetzt ohne Mengenangabe.
            { n: 1, title: 'Pflegesituation beschreiben', desc: 'Ein paar Angaben, die aus dem Kostenrechner sind schon übernommen. Dann sehen Sie sofort, welche Pflegekräfte passen und verfügbar sind. Unverbindlich.', cta: !patientSaved, done: patientSaved },
            { n: 2, title: 'Bewerbungen erhalten & Pflegekräfte einladen', desc: 'Geeignete Pflegekräfte bewerben sich bei Ihnen. In der Zwischenzeit können Sie Wunschkandidatinnen gezielt einladen.', cta: false, done: hasPending },
            { n: 3, title: 'Vertrag abschließen', desc: 'Sie wählen Ihre Favoritin aus und bestätigen das Angebot — den Rest übernehmen wir.', cta: false, done: false },
            { n: 4, title: 'Laufende Betreuung', desc: 'Die Pflegekraft ist da. Ihr persönlicher Ansprechpartner begleitet Sie während des gesamten Einsatzes.', cta: false, done: false },
          ].map((s, i, arr) => (
            <div key={s.n} className={`flex items-start gap-4 px-5 py-4 ${i < arr.length - 1 ? 'border-b' : ''}`} style={{borderColor:'#E9E9EB'}}>
              {s.done ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:'#E3F7EF'}}>
                  <Check className="w-4 h-4" strokeWidth={3} style={{color:'#22A06B'}} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white mt-0.5" style={{background:'#8B7355', fontSize:'15px'}}>{s.n}</div>
              )}
              <div>
                <p className="text-[15px] font-semibold" style={{color: s.done ? '#9CA3AF' : '#18181B'}}>{s.title}</p>
                <p className="text-[15px] mt-0.5 leading-relaxed" style={{color: s.done ? '#B5B5B5' : '#71717A'}}>{s.desc}</p>
                {s.cta && (
                  <button
                    onClick={() => { setPatientExpandedManual(true); setTriggerOpenPatient(true); document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                    className="mt-1.5 text-[13px] font-semibold flex items-center gap-1 transition-colors"
                    style={{color:'#8B7355'}}
                  >
                    Jetzt ausfüllen ↑
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── SECTION HEADER: Häufige Fragen ── */}
        <div className="px-1 pt-3">
          <h2 className="text-[1.2rem] font-bold tracking-tight" style={{color:'#18181B'}}>Häufige Fragen</h2>
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'#F4F4F6', borderColor:'#D4D4D8'}}>
          {[
            /* Reihenfolge (Martin, 13.08.): Sprach-Niveaus ZUERST — die
               Stufen (Grund/Mittel/Gut) stehen auf jeder Pflegekraft-Karte,
               also ist das die Frage, die der Kunde beim Lesen der Liste
               zuerst hat. Der Rest folgt dem Weg: Einladen → Vertrag →
               Kündigung → Abrechnung → … */
            /* Sprach-Stufen-Antwort als JSX statt String, damit wir die
               Bar-Indikatoren genauso rendern können wie im Profil/Liste
               (statt der Unicode-Punkte ●). Konsistente Optik im ganzen
               Portal. Quelltext der Sätze identisch zur Modal-FAQ
               (LANGUAGE_LEVELS in CustomerNurseModal). */
            {
              q: 'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
              a: (
                <div className="text-[15px] leading-[1.75] text-gray-600 space-y-3">
                  <p>Eine grobe Orientierung — kein Sprach-Zertifikat. Die genaue Kommunikation hängt immer auch vom Tempo, der Mundart und der Geduld beider Seiten ab.</p>
                  {[
                    { bars: 1, label: 'Grund', desc: 'einzelne Wörter und einfache Sätze. Für eine Verständigung im Alltag braucht es Geduld, Gesten und etwas Vorbereitung; differenzierte Gespräche sind in der Regel nicht möglich.' },
                    { bars: 2, label: 'Mittel', desc: 'einfache Alltagsthemen lassen sich besprechen, gängige Anweisungen werden meist verstanden. Bei komplexeren Themen (Diagnosen, Behörden, Telefonate) kann es zu Rückfragen oder Missverständnissen kommen.' },
                    { bars: 3, label: 'Gut', desc: 'die Verständigung im Alltag und in der Pflege funktioniert in der Regel zuverlässig. Auch ausführlichere Gespräche sind möglich; sehr seltene Fachbegriffe, schnelles Sprechen oder Dialekt können dennoch Nachfragen erfordern.' },
                  ].map((lvl) => (
                    <div key={lvl.label} className="flex items-start gap-3">
                      <div className="flex gap-0.5 pt-2.5 flex-shrink-0">
                        {Array.from({ length: 3 }, (_, i) => (
                          <div key={i} className={`w-3 h-1.5 rounded-full ${i < lvl.bars ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <p><span className="font-semibold text-[#3D2B1F]">{lvl.label}</span> — {lvl.desc}</p>
                    </div>
                  ))}
                  <p>Wenn Sprachsicherheit besonders wichtig ist (z. B. Demenz, schwerhörige oder spracheingeschränkte Patienten), sprechen Sie uns gerne an — wir helfen bei der Einordnung.</p>
                </div>
              ),
            },
            { q: 'Was bedeutet „Einladen"?', a: 'Wenn Ihnen eine Pflegekraft gefällt, laden Sie sie ein, sich bei Ihnen zu bewerben. Dafür müssen Sie nur kurz die Pflegesituation beschreiben — damit wir Ihnen passende, verfügbare Pflegekräfte zeigen können. Alles unverbindlich; ein Vertrag entsteht erst, wenn Sie ein konkretes Angebot annehmen.' },
            { q: 'Gehe ich mit dem Einladen einen Vertrag ein?', a: 'Nein — das Einladen und Anschauen von Profilen ist vollständig unverbindlich. Ein Vertrag kommt erst zustande, wenn Sie ein konkretes Angebot ausdrücklich annehmen.' },
            { q: 'Kann ich jederzeit kündigen?', a: 'Ja, täglich kündbar — ohne Mindestlaufzeit und ohne Angabe von Gründen. Kosten entstehen ausschließlich für Tage, an denen die Pflegekraft tatsächlich vor Ort ist.' },
            { q: 'Wie funktioniert die Abrechnung?', a: 'Tagesgenau: Sie zahlen nur für geleistete Betreuungstage. Die Rechnung für den laufenden Monat wird jeweils zur Monatsmitte erstellt — transparent, nachvollziehbar, ohne versteckte Posten.' },
            { q: 'Wie lange bleibt die Pflegekraft — und wie läuft der Wechsel?', a: 'Pflegekräfte bleiben im Durchschnitt 6 bis 8 Wochen. Zur Mitte des Einsatzes beginnen wir bereits mit der Planung der Nachfolge, damit der Übergang nahtlos klappt. Sie müssen sich um nichts kümmern — Primundus organisiert den gesamten Wechsel.' },
            { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus kümmert sich umgehend um eine qualifizierte Vertretung. Ihr persönlicher Ansprechpartner informiert Sie proaktiv und begleitet die Übergabe.' },
            { q: 'Wie werden Reisekosten abgerechnet?', a: 'Die Reisekosten betragen pauschal 125 € pro Strecke — also je einmal bei der Anreise und bei der Abreise. Weitere versteckte Reisekosten gibt es nicht.' },
            { q: 'Ist das legal?', a: 'Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland.' },
            { q: 'Mit wem wird der Vertrag geschlossen?', a: 'Der Betreuungsvertrag wird mit der PRIMUNDUS Sp. z o.o. geschlossen — der Gesellschaft hinter Primundus Deutschland und Ihrem Vertragspartner für die gesamte Betreuung. Die Pflegekräfte sind bei uns sozialversicherungspflichtig angestellt und werden offiziell nach Deutschland entsandt.' },
            { q: 'Welche Kosten entstehen insgesamt?', a: 'Es gibt vier Kostenpunkte: Die monatlichen Betreuungskosten laut Ihrem Angebot. Anreise und Abreise pauschal je 125 €. Kost und Logis, die Sie der Pflegekraft frei zur Verfügung stellen. Fällt der Einsatz in einen Sommermonat (Juli oder August), kommen 200 €/Monat (bzw. 6,67 €/Tag) Sommerzuschlag hinzu. An folgenden Feiertagen wird der doppelte Tagessatz berechnet: Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester und Neujahr. Darüber hinaus gibt es keinerlei versteckte Kosten.' },
            /* Sachleistungs-Frage (Martin, 13.08.): kommt in Beratungen
               regelmäßig. Fachlich: 24h-Betreuung im Entsendemodell ist
               KEINE ambulante Pflegesachleistung (§ 36 SGB XI, zugelassenen
               Pflegediensten vorbehalten) — der Kunde nutzt die
               GELDleistungen (Pflegegeld u. a.). Bewusst ohne Beträge: die
               stehen personalisiert im Angebot unter „Alle Kosten im
               Überblick" (Block „Was bleibt für Sie übrig"). */
            { q: 'Kann ich die Pflegesachleistungen der Pflegekasse dafür einsetzen?', a: 'Nein — die 24-Stunden-Betreuung zählt nicht als Pflegesachleistung; diese sind zugelassenen ambulanten Pflegediensten vorbehalten. Sie nutzen stattdessen die Geldleistungen Ihrer Pflegekasse, allen voran das Pflegegeld. Welche Leistungen in Ihrer Situation zusammenkommen, sehen Sie in Ihrem Angebot unter „Alle Kosten im Überblick".' },
          ].map((item, i, arr) => (
            <div key={i} className={i < arr.length - 1 ? 'border-b' : ''} style={{borderColor:'#E9E9EB'}}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-5 text-left transition-colors duration-150"
                style={{background: openFaq === i ? '#F5F5F6' : 'transparent'}}
              >
                <span className="text-[15px] font-semibold pr-4 leading-snug transition-colors duration-150"
                  style={{color: openFaq === i ? '#6B5444' : '#18181B'}}>
                  {item.q}
                </span>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ${
                  openFaq === i ? 'bg-[#8B7355]' : 'bg-[#F0EDE8]'
                }`}>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${
                    openFaq === i ? 'rotate-180 text-white' : 'text-[#8B7355]'
                  }`} />
                </div>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-6 pt-1" style={{background:'#F5F5F6'}}>
                  {typeof item.a === 'string' ? (
                    <p className="text-[15px] leading-[1.75] text-gray-600 whitespace-pre-line">{item.a}</p>
                  ) : (
                    item.a
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Ilka-Box (Beraterin / Trust / CTA) ── */}
        <div className="rounded-2xl overflow-hidden border bg-white" style={{borderColor:'#E9E9EB'}}>
          <div className="px-5 pt-5 pb-5 space-y-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Noch Fragen? Ihre Beraterin</p>
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <img
                  src="/ilka.webp"
                  alt="Ilka Wysocki"
                  className="w-[72px] h-[72px] rounded-2xl object-cover object-top"
                  style={{border:'1.5px solid #F0C4B4'}}
                />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#22A06B] rounded-full border-2 border-white">
                  <span className="relative flex h-full w-full items-center justify-center">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-white opacity-60" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                  </span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 text-[17px] leading-tight">Ilka Wysocki</p>
                <p className="text-[14px] text-gray-500 mb-2">Pflegeberaterin · Primundus</p>
                <a href="tel:089200000830" className="inline-flex items-center gap-1.5 text-[#8B7355] font-bold text-[16px] hover:opacity-80 transition-opacity">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  089 200 000 830
                </a>
                <p className="text-[14px] text-gray-500 mt-0.5">Mo–So, 8:00–18:00 Uhr</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <img src="/badge-testsieger.webp" alt="Testsieger" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
                <p className="text-xs font-semibold text-gray-500 leading-tight">Testsieger<br/>Die Welt</p>
              </div>
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <div className="flex justify-center mb-1.5">
                  <svg className="w-6 h-6 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 leading-tight">20+ Jahre<br/>Erfahrung</p>
              </div>
              <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
                <div className="flex justify-center mb-1.5">
                  <svg className="w-6 h-6 text-[#8B7355]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-gray-500 leading-tight">60.000+<br/>Einsätze</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider text-center mb-2.5">Bekannt aus</p>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                {[
                  { src: '/media-welt.webp', alt: 'Die Welt' },
                  { src: '/media-bildderfau.webp', alt: 'Bild der Frau' },
                  { src: '/media-faz.webp', alt: 'FAZ' },
                  { src: '/media-ard.webp', alt: 'ARD' },
                  { src: '/media-ndr.webp', alt: 'NDR' },
                  { src: '/media-sat1.webp', alt: 'SAT.1' },
                ].map(logo => (
                  <img key={logo.alt} src={logo.src} alt={logo.alt} className="h-4 w-auto object-contain opacity-50 grayscale" />
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <a
                href="tel:089200000830"
                className="flex-1 flex items-center justify-center gap-2 bg-[#E76F63] hover:bg-[#D65E52] text-white rounded-xl py-3 text-sm font-bold transition-colors"
              >
                <Phone className="w-4 h-4" />
                Anrufen
              </a>
              <a
                href={`https://wa.me/4989200000830?text=${encodeURIComponent('Hallo Frau Wysocki, ich habe folgendes Anliegen:')}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-xl py-3 text-sm font-bold transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.529 5.845L.057 23.571l5.865-1.539A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.894a9.86 9.86 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374A9.86 9.86 0 012.106 12C2.106 6.58 6.58 2.106 12 2.106S21.894 6.58 21.894 12 17.42 21.894 12 21.894z"/>
                </svg>
                WhatsApp
              </a>
            </div>
          </div>
        </div>

      </div>
      </>
      )}

      {/* Unterschriebenen Vertrag ansehen (read-only) — vom gebucht-Screen */}
      {showSignedContract && signedForm && acceptedApp && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={() => setShowSignedContract(false)} />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div
              className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
              style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-lg font-bold text-gray-900">Ihr Vertrag</h2>
                <button onClick={() => setShowSignedContract(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-5">
                <VertragSignieren
                  embedded
                  readOnly
                  daten={buildVertragsDaten(signedForm, acceptedApp.offer)}
                  initialSignedName={signedForm.signatur}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Nachrichten an die Pflegekraft (Prototyp).
          Bewusst KEIN klassischer Chat — Backend sendet via WhatsApp an
          die PK, also schreibt der Kunde eine kompakte Nachricht, drückt
          Senden und wartet auf die Antwort (siehe PflegekraftChat.tsx).
          Doppelte Sperre: Modal rendert nur wenn CHAT_ENABLED — selbst
          falls irgendwann unerwartet setChatNurse() ausgelöst wird,
          bleibt das UI bei echten Kunden unsichtbar. */}
      {chatNurse && CHAT_ENABLED && (
        <PflegekraftChat nurse={chatNurse} onClose={() => setChatNurse(null)} />
      )}

      {/* ── Rückmeldung zum Angebot (schwebend, unten rechts) ────────────
           Als Kasten im Fluss saß sie ~3000 px weit unten und wurde kaum
           gesehen (Martin, 12.08.). Jetzt schwebend mit Ilkas Gesicht:
           erst zusammengeklappt als ein Satz, wegklickbar, und sie taucht
           erst auf, wenn der Kunde am Angebot und an den Pflegekräften
           vorbei ist (`feedbackReif`).

           Nur solange das Profil offen ist: Wer gespeichert hat, hat die
           Frage „wie geht es weiter" beantwortet, und wer offene
           Bewerbungen hat, soll sich um die kümmern. Chat und Modale
           liegen auf z-[60]+ — die Blase auf z-40 verdeckt sie nicht. */}
      {!hasPending && !patientSaved && !feedbackWeg && feedbackReif && feedbackVerweilt && !chatNurse && !selectedApp && !selectedNurse && (
        <AngebotsFeedback
          onDismiss={feedbackErledigt}
          onGoToForm={() => {
            document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setPatientExpandedManual(true);
            setTriggerOpenPatient(true);
          }}
          onAnswer={(answer, detail, endgueltig) => {
            // Der erste Tap geht STILL raus (notify:false) — er sichert die
            // Antwort, falls der Kunde jetzt abbricht, löst aber keine Mail
            // aus. Die Team-Mail hängt am endgültigen Aufruf, der genau
            // einmal kommt. Sonst bekäme info@primundus.de zwei Mails pro
            // Rückmeldung (Martin, 12.08.: „ich will immer eine Antwort
            // erhalten" — eine, nicht zwei).
            reportLeadEvent(
              lead?.token,
              'angebots_feedback',
              {
                feedback_answer: answer,
                feedback_detail: detail,
                ...(endgueltig ? { feedback_final: '1' } : {}),
              },
              endgueltig ? undefined : false,
            );
          }}
        />
      )}

      {/* Angebot prüfen Modal */}
      {selectedApp && (
        <AngebotPruefenModal
          app={selectedApp}
          prefill={pruefenPrefill}
          onClose={() => setSelectedApp(null)}
          onAccept={acceptApp}
          onNurseClick={(n) => openNurseFromApp(n, selectedApp)}
        />
      )}

      {/* Vertrag nachträglich abschließen — gleiches Modal, NUR Schritt 2
          (Vertragsformular). app.offer trägt die Eckdaten der gebuchten
          Kraft/des Jobs (Anreise/Abreise/Konditionen aus der fc-Synthese),
          pruefenPrefill die Personendaten aus Lead + mmCustomer. */}
      {contractApp && (
        <AngebotPruefenModal
          app={contractApp}
          prefill={pruefenPrefill}
          contractOnly
          onClose={() => setContractApp(null)}
          onAccept={submitContractOnly}
          // Nur Profil-Ansicht (wie im BookedScreen) — KEIN nurseModalApp,
          // sonst böte das Profil-Modal „Angebot prüfen"/„Ablehnen" für die
          // längst gebuchte Pflegekraft an.
          onNurseClick={setSelectedNurse}
        />
      )}

      {/* Nurse Detail Modal */}
      {selectedNurse && enrichedSelectedNurse && (
        <CustomerNurseModal
          nurse={enrichedSelectedNurse}
          profileLoading={caregiverLoading && !fullCaregiver}
          aboutLoading={
            // Spinner instead of the old text while we regenerate a STALE
            // about_de. Fresh descriptions skip this entirely.
            !!fullCaregiver
            && aboutRegen.forId === fullCaregiver.id
            && aboutRegen.loading
          }
          onClose={() => { setSelectedNurse(null); setNurseModalApp(null); setNurseMatchIdx(null); setSelectedFromInterestId(null); }}
          app={nurseModalApp ?? undefined}
          onReview={() => { setSelectedNurse(null); setSelectedApp(nurseModalApp); setNurseModalApp(null); setSelectedFromInterestId(null); }}
          onDecline={() => { setDeclineConfirmApp(nurseModalApp); setSelectedNurse(null); setNurseModalApp(null); setSelectedFromInterestId(null); }}
          onChat={CHAT_ENABLED && nurseModalApp ? () => { const n = enrichedSelectedNurse; setSelectedNurse(null); setNurseModalApp(null); setNurseMatchIdx(null); setSelectedFromInterestId(null); setChatNurse(n); } : undefined}
          hasInterest={selectedFromInterestId !== null && enrichedSelectedNurse.caregiverId === selectedFromInterestId}
          onUndo={() => { if (nurseModalApp) undoApp(nurseModalApp.id); setNurseModalApp(null); }}
          isInvited={
            nurseMatchIdx !== null
            && effectiveMatched[nurseMatchIdx] !== undefined
            && nurseStatusById.get(effectiveMatched[nurseMatchIdx].caregiverId) === 'invited'
          }
          onInvite={
            nurseMatchIdx !== null
              ? async () => {
                  const idx = nurseMatchIdx;
                  // Modal animation is driven by the returned Promise — surfaces
                  // failure to the user instead of fake success (CLAUDE.md §1).
                  try {
                    if (canInviteNurse(idx)) {
                      await confirmInviteNurse(idx, displayName(selectedNurse.name));
                    }
                  } finally {
                    setSelectedNurse(null); setNurseMatchIdx(null);
                  }
                }
              : selectedFromInterestId !== null
              ? async () => {
                  // Modal wurde aus einer Interest-Karte geöffnet —
                  // Einladen ruft denselben Interest-Invite-Pfad wie der
                  // Card-Footer-Button.
                  const cgId = selectedFromInterestId;
                  try {
                    await confirmInviteInterest(cgId, displayName(selectedNurse.name));
                  } finally {
                    setSelectedNurse(null); setSelectedFromInterestId(null);
                  }
                }
              : undefined
          }
          onDeclineMatch={
            nurseMatchIdx !== null
              ? () => {
                  declineNurse(nurseMatchIdx);
                  setSelectedNurse(null); setNurseMatchIdx(null);
                }
              : selectedFromInterestId !== null
              ? () => {
                  // Modal wurde aus einer Interest-Karte geöffnet —
                  // "Nein danke" feuert den Dismiss-Flow analog zum
                  // Ablehnen-Button auf der Card. Optimistic: die Karte
                  // rutscht via declinedFromInterest in den bearbeitet-
                  // Bereich.
                  const cgId = selectedFromInterestId;
                  confirmDismissInterest(cgId).catch(() => { /* parent zeigt Toast */ });
                  setSelectedNurse(null); setSelectedFromInterestId(null);
                }
              : undefined
          }
        />
      )}

      {/* Info Popup */}
      {showInfoPopup && <InfoPopup onClose={() => setShowInfoPopup(false)} />}

      {undoErrorOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={() => setUndoErrorOpen(false)}
            style={{ animation: 'fadeIn 0.15s ease-out' }} />
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
            style={{ animation: 'fadeIn 0.15s ease-out' }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
              style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-gray-300" /></div>
              <div className="px-5 pt-4 pb-6 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-xl">⚠️</div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Rückgängig machen derzeit nicht möglich</h2>
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                      Eine abgelehnte Bewerbung kann aktuell nicht automatisch wiederhergestellt werden.
                      Bitte kontaktieren Sie Ihre Ansprechpartnerin — sie kann die Bewerbung manuell
                      reaktivieren.
                    </p>
                  </div>
                </div>
                <a
                  href="tel:089200000830"
                  className="flex items-center justify-center gap-2 w-full bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-xl py-3 text-sm font-bold transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Beraterin anrufen: 089 200 000 830
                </a>
                <button
                  onClick={() => setUndoErrorOpen(false)}
                  className="w-full text-gray-500 font-semibold py-2 text-sm"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Contact Popup */}
      {showContactPopup && <ContactPopup onClose={() => setShowContactPopup(false)} />}

      {/* Patient Reminder Popup */}
      {showPatientReminder && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={() => setShowPatientReminder(false)} style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl px-5 pt-5 pb-8 sm:pb-6 space-y-4" style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center mb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" style={{color:'#D97706'}} />
                </div>
                <div>
                  <p className="text-base font-bold text-gray-900">Nur ein kurzer Schritt: die Pflegesituation</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    Das meiste ist schon vorausgefüllt (ca. 2 Min.). Dann sehen Sie sofort, welche Pflegekräfte zu Ihnen passen und verfügbar sind — ganz unverbindlich.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowPatientReminder(false);
                    setPatientExpandedManual(true);
                    setTriggerOpenPatient(true);
                    document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="w-full bg-[#E76F63] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#D65E52] shadow-sm transition-colors"
                >
                  Pflegesituation beschreiben
                </button>
                <button
                  onClick={() => setShowPatientReminder(false)}
                  className="w-full text-gray-500 font-semibold py-2.5 text-sm"
                >
                  Später
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Decline Confirm Modal */}
      {declineConfirmApp && (
        <DeclineConfirmModal
          app={declineConfirmApp}
          onCancel={() => setDeclineConfirmApp(null)}
          onConfirm={(msg) => {
            const id = declineConfirmApp.id;
            setDeclineConfirmApp(null);
            animateThenProcess(id, () => {
              declineApp(id, msg);
              showToast('Bewerbung abgelehnt' + (msg ? ' — Nachricht wurde gesendet.' : '.'));
            });
          }}
        />
      )}

      {/* Invite Rate-Limit Modal — fires when canInviteNurse pre-emptively
          detects the customer is over their 5/hr quota OR when the
          backend returns HTTP 429 mid-invite (race / DevTools bypass). */}
      {inviteRateModalState && (
        <InviteRateLimitModal
          retryAfterSeconds={inviteRateModalState.retryAfterSeconds}
          limit={inviteRateModalState.limit}
          windowMinutes={inviteRateModalState.windowMinutes}
          onClose={() => {
            setInviteRateModalState(null);
            // Re-query the ledger after close — countdown may have
            // expired in the modal, oldest attempt may have aged out,
            // and the gate may now be open.
            refetchInviteRate();
          }}
        />
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translate(-50%, -12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideSheet { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes exitCard { 0% { opacity: 1; transform: translateY(0) } 100% { opacity: 0; transform: translateY(16px) } }
      `}</style>
    </div>
    </div>
    </div>

    {import.meta.env.VITE_DEBUG === '1' && (
      <div className="fixed bottom-0 inset-x-0 bg-black/85 text-white text-[11px] font-mono px-3 py-2 z-[100] overflow-x-auto whitespace-nowrap">
        <span className="text-emerald-400">Mamamia</span>
        {' '}ready={String(mmReady)}
        {mmError && <span className="text-red-400"> · err={mmError.message}</span>}
        {session && (
          <>
            {' · '}cust={session.customer_id}
            {' · '}job={session.job_offer_id}
            {' · '}apps={mmApplications?.total ?? '…'}
            {' · '}matches={mmMatchings?.total ?? '…'}
            {' · '}name={customerDisplayName(mmCustomer) ?? '…'}
            {' · '}arrival={jobOfferArrivalDisplay(mmJobOffer) ?? '…'}
          </>
        )}
      </div>
    )}
    {debugOverlay}
    </>
  );
};

export default CustomerPortalPage;
