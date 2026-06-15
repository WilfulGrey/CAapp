import { useState, useEffect, useMemo, FC } from 'react';
import { Check, Bell, Phone, AlertCircle, AlertTriangle, ChevronDown, X, ArrowLeft } from 'lucide-react';
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
import { useCustomer, useJobOffer, useApplications, useInterests, useDismissedCaregivers, useAcceptedApplications, useMatchings, useCaregiver, useInvitedCaregivers, useInviteRateState } from '../lib/mamamia/hooks';
import { rankComparator } from '../lib/mamamia/matchingsRanking';
import { prefetchCaregivers } from '../lib/mamamia/caregiverCache';
import { scheduleAiAbouts, getAiAbout, subscribeAiAbout } from '../lib/mamamia/aiAboutCache';
import { reportLeadEvent, fetchLeadEvents, KOSTENRECHNER_URL } from '../lib/leadEvents';
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
  customerDisplayName,
  jobOfferArrivalDisplay,
  mapApplicationToUI,
  mapMatchingToNurse,
  mapCaregiverToNurse,
  matchesGermanyWish,
  synthesizeAcceptedApplicationFromSnapshot,
} from '../lib/mamamia/mappers';
import { mapPatientFormToUpdateCustomerInput, splitCustomerName } from '../lib/mamamia/patientFormMapper';
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
    eigenanteil: 2150,
    zuschüsse: { gesamt: 900 },
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
        // the customer reached the portal. Fire-and-forget.
        reportLeadEvent(l.token, 'portal_opened');
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
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Manual override for the "Ihr Angebot" expand/collapse. null = follow
  // the auto rule below (expanded only in initial state). Toggling sets
  // an explicit value that wins over the auto rule.
  const [offerExpandedManual, setOfferExpandedManual] = useState<boolean | null>(null);
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

  // Wenn Mamamia die akzeptierte Application aus listApplications entfernt
  // (kommt vor sobald die Bewerbung dort als abgeschlossen markiert wird),
  // brauchen wir die volle Pflegekraft-Daten getrennt zu laden, um eine
  // synthetische Application zu rekonstruieren. Wir nehmen den ersten Row
  // (in der Praxis gibt's pro Lead genau eine Annahme).
  const firstAcceptedCaregiverId = acceptedApplications?.rows[0]?.caregiver_id ?? null;
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

  // AI "Über die Pflegekraft" — reads from aiAboutCache (pre-baked during
  // prefetch). 3-state to distinguish "in flight" from "resolved-but-null":
  //   kind='loading'                  → modal shows a friendly "we're
  //                                       preparing the introduction" loader
  //                                       (no Mamamia-text flash, then swap)
  //   kind='resolved', text=string    → modal shows AI text
  //   kind='resolved', text=null      → modal falls back to Mamamia motivation
  //                                       / synthesized sentence
  type AiAboutState = { kind: 'loading' } | { kind: 'resolved'; text: string | null };
  const [aiAboutState, setAiAboutState] = useState<AiAboutState>({ kind: 'loading' });
  const [aiAboutForId, setAiAboutForId] = useState<number | null>(null);
  useEffect(() => {
    if (!fullCaregiver) return;
    const id = fullCaregiver.id;
    if (aiAboutForId === id) return; // already wired for this nurse
    setAiAboutForId(id);

    const cached = getAiAbout(id);
    if (cached !== undefined) {
      // Cache hit — instant (pre-baked during prefetch).
      setAiAboutState({ kind: 'resolved', text: cached });
      return;
    }
    // Still pending — subscribe; scheduleAiAbouts already fired the call.
    setAiAboutState({ kind: 'loading' });
    const unsub = subscribeAiAbout(id, () => {
      const text = getAiAbout(id);
      if (text !== undefined) setAiAboutState({ kind: 'resolved', text });
    });
    return unsub;
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
    // Inject AI-generated about text once available — overrides Mamamia's
    // about_de / motivation fields which are often empty or low quality.
    if (
      aiAboutState.kind === 'resolved'
      && aiAboutState.text
      && aiAboutForId === fullCaregiver.id
      && base.profile
    ) {
      base.profile = { ...base.profile, aboutDe: aiAboutState.text };
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
    // Badge-Score wie nurseLevel(): experienceYears + assignments. Schwellen
    // 14.06. nach Live-Pool-Analyse angepasst:
    //   ≥18 Platin / ≥10 Gold / ≥4 Silber / ≥1 Bronze / sonst Starter.
    // Filter zielt auf "Silber+" → Score ≥ 4.
    const MIN_BADGE_SCORE = 4;
    const isTooOld = (yob: number | null): boolean =>
      yob !== null && (nowYear - yob) > MAX_AGE;
    const badgeScore = (m: typeof langFiltered[number]): number => {
      const cg = m.caregiver;
      const exp = typeof cg.care_experience === 'string'
        ? Math.max(0, parseInt(cg.care_experience, 10) || 0)
        : 0;
      return exp + (cg.hp_total_jobs ?? 0);
    };

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
  // Refetch. Zwei Pfade:
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
  useEffect(() => {
    if (!mmReady || !acceptedApplications) return;
    const acceptedIds = new Set(acceptedApplications.application_ids);
    if (acceptedIds.size === 0) return;

    setApplications(prev => {
      const presentIds = new Set(prev.map(a => Number(a.id)));
      // Pfad 1: vorhandene Apps auf accepted patchen
      const patched = prev.map(a =>
        acceptedIds.has(Number(a.id)) ? { ...a, status: 'accepted' as const } : a,
      );
      // Pfad 2: für jede acceptedRow, die NICHT bereits in applications
      // ist, eine synthetische Application bauen — wenn das Caregiver-
      // Profil schon geladen ist. Sonst überspringen wir; sobald
      // `acceptedCaregiverProfile` nachfließt, läuft der useEffect erneut
      // (deps enthalten den Profile-State) und wir holen es nach.
      const nowIso = new Date().toISOString();
      const nowYear = new Date().getFullYear();
      const additions: typeof patched = [];
      for (const row of acceptedApplications.rows) {
        if (presentIds.has(row.application_id)) continue;
        // Wir können (vorerst) nur ein Profil pro Render-Cycle laden —
        // nimmt das passende Caregiver-Profil, falls geladen.
        const profile = row.caregiver_id === firstAcceptedCaregiverId
          ? acceptedCaregiverProfile
          : null;
        const synth = synthesizeAcceptedApplicationFromSnapshot(
          row,
          profile ?? null,
          { nowIso, nowYear },
        );
        if (synth) additions.push(synth);
      }
      return additions.length > 0 ? [...patched, ...additions] : patched;
    });
  }, [mmReady, acceptedApplications, acceptedCaregiverProfile, firstAcceptedCaregiverId]);

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
      // Once each full profile lands in caregiverCache, scheduleAiAbouts
      // fires the AI generation immediately — so "Über die Pflegekraft" text
      // is often pre-baked by the time the user opens a modal.
      scheduleAiAbouts([...ids]);
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
  const doneApps = applications.filter((a) => a.status !== 'new');
  // Declined matches sind jetzt direkt in der Haupt-Matching-Liste am
  // Ende einsortiert (Status='declined', "Abgelehnt"-Pill + Undo im
  // Button). Frühere `declinedMatches`-Liste + MatchCardDone-Pfad
  // entfallen — Status kommt aus dem derived `nurseStatusById`.
  const acceptedApp = applications.find((a) => a.status === 'accepted') ?? null;
  const hasPending = pendingApps.length > 0;
  const matchesUnlocked = !hasPending;

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
          color: s.color ?? '#999999',
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

  // MVP path — acceptance does NOT call Mamamia (no STORE_CONFIRMATION).
  // Instead we POST to the kostenrechner bridge, which:
  //   1. fires the team mail to info@primundus.de with the full contract
  //      form data (step 2 of the modal)
  //   2. UPSERTs into lead_application_acceptances so portal reload still
  //      shows the BookedScreen
  // Mamamia learns about the booking only when a Primundus team member
  // manually processes it. This is intentional for MVP — confirmation
  // logic + downstream Mamamia state is too complex for first launch.
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

      // Zeitstempel der Unterschrift (menschenlesbar) + vollständige
      // Vertragsdaten — der Server rendert daraus die Vertragskopie (HTML)
      // und hängt sie an Kunden- + Team-Mail (Stufe B).
      const now = new Date();
      const signedAtLabel = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()} um ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} Uhr`;
      const contract = targetApp ? buildVertragsDaten(formData, targetApp.offer) : undefined;

      try {
        const res = await fetch(`${KOSTENRECHNER_URL}/api/lead-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: lead.token,
            event: 'application_accepted_internal',
            metadata: {
              application_id: Number(id),
              caregiver_id: targetApp?.nurse?.caregiverId,
              caregiver_name: targetApp?.nurse?.name,
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
            },
          }),
        });
        if (!res.ok) throw new Error(`bridge HTTP ${res.status}`);
        // Refetch so the persistence merge useEffect re-flips status on
        // next render even if optimistic state somehow drops.
        refetchAcceptedApplications();
      } catch (err) {
        console.error('application_accepted_internal failed:', (err as Error).message);
        setApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
        );
        showToast('Etwas ist schiefgelaufen. Bitte erneut versuchen oder uns anrufen.');
      }
    });
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
    // 30s (6 attempts × 5s), only surface the toast if every retry fails.
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
    const MAX_ATTEMPTS = 6;
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
        // as cat=authorization, but those won't resolve in 30s either and
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
    const MAX_ATTEMPTS = 6;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        await inviteMutation.mutate({ caregiver_id: caregiverId });
        reportLeadEvent(lead?.token, 'caregiver_invited', {
          caregiver_id: caregiverId,
          caregiver_name: displayLabel,
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
  if (lead && mmExpired && !IS_PREVIEW_ANY) {
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
    const firstName = lead.vorname ?? null;
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
              <div className="h-2.5 rounded-full mb-2" style={{background:'#F0EBE3', width:'72%', animation:'shimmer 1.8s ease-in-out infinite'}} />
              <div className="h-2 rounded-full mb-2.5" style={{background:'#F0EBE3', width:'52%'}} />
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-4 h-1.5 rounded-full" style={{background: i < 4 ? '#C4B49A' : '#F0EBE3'}} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-8">
          <h2 className="text-[1.7rem] font-bold text-white leading-tight mb-3">
            {firstName ? `${firstName}, wir` : 'Wir'} bereiten<br/>Ihre Pflegekräfte vor
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
      <nav className="sticky top-0 z-40" style={{background:'white', boxShadow:'0 1px 0 #E5E3DF, 0 2px 8px rgba(0,0,0,0.06)'}}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactPopup(true)}
              className="flex items-center gap-1.5 bg-white hover:bg-[#F8F7F5] text-[#8B7355] border border-[#E5E3DF] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
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
        {/* Real Multi-Job back-link: when this portal is scoped to a specific
            job via ?job=<lead_jobs.id> (deep link from the real ?view=jobs
            overview), offer a way back. Suppressed under the ?back=jobs mock
            flow above, which renders its own "Alle Einsätze" link. */}
        {JOB_ID_PARAM && !HAS_JOBS_BACK && (
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
          return (
            <BookedScreen
              app={acceptedApp}
              onNurseClick={setSelectedNurse}
              vertragSigned={vertragSigned}
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
        const anrede = lead?.anrede_text ?? lead?.anrede;
        const nachname = cap(lead?.nachname);
        const vorname = cap(lead?.vorname);
        const heroNameLine = lead
          ? (anrede && nachname
              ? `${anrede} ${nachname}`
              : nachname || vorname || '')
          : 'Herr Mustermann';

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
            }
          : patientSaved
          ? {
              title: 'Profil vollständig. Bewerbungen werden für Sie vorbereitet. ✨',
              subtitle: 'Sobald sich Pflegekräfte bewerben, erscheinen die Angebote hier. Laden Sie in der Zwischenzeit weitere Pflegekräfte ein, sich bei Ihnen zu bewerben.',
              pill: 'Profil vollständig',
            }
          : {
              title: 'Ihr Angebot ist fertig. 🎉',
              subtitle: 'Prüfen Sie Ihr persönliches Angebot, ergänzen Sie die Patientendaten und laden Sie Ihre Wunsch-Pflegekraft direkt ein.',
              pill: 'Angebot kostenlos & unverbindlich',
            };

        return (
          <div className="relative overflow-hidden" style={{background:'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)'}}>
            <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{background:'rgba(255,255,255,0.06)'}} />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{background:'rgba(255,255,255,0.06)'}} />
            <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
              <p className="text-[15px] font-medium mb-3" style={{color:'rgba(255,255,255,0.8)'}}>
                Guten Tag{heroNameLine ? `, ${heroNameLine}` : ''}.
              </p>
              <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">
                {heroCopy.title}
              </h1>
              <p className="text-[14px] leading-relaxed mb-5" style={{color:'rgba(255,255,255,0.8)'}}>
                {heroCopy.subtitle}
              </p>
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)'}}>
                <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} style={{color:'rgba(255,255,255,0.9)'}} />
                <span className="text-[14px] font-medium" style={{color:'rgba(255,255,255,0.95)'}}>{heroCopy.pill}</span>
              </div>
            </div>
            <svg viewBox="0 0 390 28" className="w-full block" style={{marginBottom:'-1px'}} preserveAspectRatio="none">
              <path d="M0,14 C100,28 290,0 390,14 L390,28 L0,28 Z" fill="#F8F7F5"/>
            </svg>
          </div>
        );
      })()}

      {/* ── SECTION: Ihr Angebot (collapsible) ── */}
      {(() => {
        // Beim Erstbesuch immer aufgeklappt (offerFirstVisit). Sonst: nur im
        // initialen Zustand — sobald Patientendaten erfasst sind, ist das
        // Angebot Referenzmaterial und wird eingeklappt. Bei offener Bewerbung
        // (hasPending) hat die Bewerbung Priorität → immer eingeklappt.
        // Manueller Toggle (offerExpandedManual) überschreibt die Auto-Regel.
        const autoExpanded = !hasPending && (offerFirstVisit || !patientSaved);
        const offerExpanded = offerExpandedManual ?? autoExpanded;
        const brutto = lead?.kalkulation?.bruttopreis ?? 3050;
        const tagessatz = Math.round(brutto / 30);
        const items = [
          { text: 'Täglich kündbar' },
          { text: 'Tagesgenaue Abrechnung' },
          { text: 'Kosten entstehen immer erst, wenn Pflegekraft vor Ort ist' },
          { text: 'Direktanbieter ohne Vermittlungsgebühren' },
        ];
        return (
        <div style={{background:'#F8F7F5'}}>
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => setOfferExpandedManual(!offerExpanded)}
            className="w-full px-5 pt-6 pb-4 flex items-center justify-between text-left transition-colors hover:bg-black/[0.02]"
          >
            <div>
              <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>Ihr Angebot</h2>
              <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[12px] font-semibold px-3 py-1 rounded-full" style={{background:'#E3F7EF', color:'#2a9a6f'}}>
                100 % risikofrei
              </span>
              <ChevronDown className={`w-5 h-5 text-[#8B7355] transition-transform duration-200 ${offerExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {offerExpanded && (
            <div className="px-4 pb-4">
                <div className="rounded-2xl border px-5 pt-5 pb-4" style={{background:'white', borderColor:'#E5E3DF'}}>
                  <p className="text-[12px] font-semibold uppercase tracking-widest mb-2" style={{color:'#8B7355'}}>Betreuungskosten</p>
                  <div className="flex items-center gap-4">
                    <div className="flex items-baseline gap-1 flex-shrink-0" style={{minWidth:'55%'}}>
                      <span className="text-[2.2rem] font-bold leading-none" style={{color:'#3D3D3D'}}>{formatEuro(tagessatz)}</span>
                      <span className="text-[15px]" style={{color:'#8B8B8B'}}>/&nbsp;Tag</span>
                    </div>
                    <p className="text-[13px] leading-snug flex-1" style={{color:'#ABABAB'}}>inkl. Steuern, Gebühren &amp; Sozialabgaben</p>
                  </div>
                  <p className="text-[13px] mt-3 leading-snug" style={{color:'#3D3D3D'}}>zzgl. 125 € Reisekosten pro Strecke, Kost &amp; Logis und Sommerzuschlag 6,67 €/Tag (Juli + Aug.)</p>
                </div>

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
                    <div className="rounded-2xl border mt-3 px-5 py-4" style={{background:'white', borderColor:'#E5E3DF'}}>
                      <p className="text-[12px] font-semibold uppercase tracking-widest mb-1" style={{color:'#8B7355'}}>Kalkulation</p>
                      <p className="text-[12px] mb-3" style={{color:'#8B8B8B'}}>
                        Annahme: 7 Wochen ab {startStr} (bis {endStr}):
                      </p>
                      <div className="space-y-2">
                        {rows.map((r, i) => (
                          <div key={i} className="flex items-start justify-between gap-3 text-[14px]" style={{color:'#3D3D3D'}}>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold leading-tight">{r.monat}</p>
                              <p className="text-[12px] leading-snug mt-0.5" style={{color:'#8B8B8B'}}>{r.details.join(' · ')}</p>
                            </div>
                            <p className="font-semibold whitespace-nowrap flex-shrink-0">{formatEuro(r.betrag)}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-[11px] mt-3 leading-snug" style={{color:'#ABABAB'}}>
                        Die tatsächlichen Kosten richten sich nach dem konkreten Einsatzzeitraum der gewählten Pflegekraft.
                      </p>
                    </div>
                  );
                })()}

                <div className="rounded-2xl overflow-hidden border mt-3" style={{background:'white', borderColor:'#E5E3DF'}}>
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-[12px] font-semibold uppercase tracking-widest" style={{color:'#8B7355'}}>Unsere fairen Konditionen</p>
                  </div>
                  {items.map((item, i, arr) => (
                    <div key={i} className={`flex items-start gap-3 px-5 py-3.5 ${i < arr.length - 1 ? 'border-b' : ''}`} style={{borderColor:'#E5E3DF'}}>
                      <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:'#E3F7EF'}}>
                        <Check className="w-3 h-3" strokeWidth={3} style={{color:'#2a9a6f'}} />
                      </div>
                      <span className="text-[15px] leading-snug" style={{color:'#3D3D3D'}}>{item.text}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex justify-center">
                  <a
                    href="/primundus-mustervertrag.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,color:'#3D3D3D'}}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 18 15 15"/>
                    </svg>
                    <span className="text-[13px] underline" style={{color:'#3D3D3D'}}>Mustervertrag als PDF herunterladen</span>
                  </a>
                </div>
            </div>
          )}
        </div>
        </div>
        );
      })()}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── INFO-Box: Passende PK vorbereitet (state B only) ── */}
        {patientSaved && !hasPending && (
          <div className="rounded-2xl border px-5 py-4 flex gap-3" style={{background:'#F0EBE3', borderColor:'#D9CFC4'}}>
            <span className="text-lg flex-shrink-0 mt-0.5">👋</span>
            <p className="text-sm leading-relaxed" style={{color:'#4A3F35'}}>
              Wir haben passende Pflegekräfte für Sie vorbereitet – laden Sie jetzt Ihre Wunschpflegekräfte ein, sich bei Ihnen zu bewerben. Für Sie völlig unverbindlich.
            </p>
          </div>
        )}

        {/* ── SECTION HEADER: Passende Pflegekräfte / Ihre Bewerbungen (state-aware) ── */}
        <div className="px-1">
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>{hasPending ? 'Ihre Bewerbungen' : 'Passende Pflegekräfte einladen'}</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
        </div>

        {/* ── INFO-Box: Profil unvollständig ── */}
        {!patientSaved && (
          <div className="rounded-2xl border px-5 py-4 flex gap-3" style={{background:'#FFFBF5', borderColor:'#E8D9C0'}}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{color:'#D97706'}} />
            <div>
              <p className="text-[15px] font-semibold" style={{color:'#3D3D3D'}}>Achtung: Profil unvollständig</p>
              {/* 14.06.: color #8B8B8B → #3D3D3D (war zu hellgrau und schlecht
                  lesbar). Wir bleiben unterhalb des bold-Headers, daher kein
                  font-medium hier — Hierarchie bleibt durch das semibold oben
                  erhalten. */}
              <p className="text-[15px] mt-1 leading-relaxed" style={{color:'#3D3D3D'}}>
                Damit Sie Bewerbungen erhalten und Pflegekräfte einladen können, vervollständigen Sie bitte das Patientenprofil hier.
              </p>
            </div>
          </div>
        )}

        {/* ── Kombinierte Karte: Identität + Anfrage + Stepper ──
             Hidden once a Bewerbung is in: customer should focus on the
             pending application, not on revisiting saved patient data. */}
        {!hasPending && !patientSaved && (
        <div id="patientendaten">
        <AngebotCard
          lead={lead}
          mmCustomer={mmCustomer}
          onPatientSaved={(saved) => {
            setPatientSaved(saved);
            if (saved) {
              showToast('✓ Vielen Dank! Ihre Daten sind gespeichert. Sie können jetzt Pflegekräfte einladen und Bewerbungen erhalten.', 7000);
            }
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
                // swallow — mapper falls back to location_custom_text
              }
            }

            const patch = mapPatientFormToUpdateCustomerInput(form, {
              existingPatientIds,
              locationId,
            });

            // ── Gating write: full mechanical patch. Awaited so the caller
            // (AngebotCard) keeps patientSaved=false until Mamamia has the
            // complete profile — invite gate opens only on success.
            try {
              await updateCustomerMutation.mutate(patch as Record<string, unknown>);
            } catch (err) {
              showToast('Speichern fehlgeschlagen. Bitte erneut versuchen.');
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
                  showToast('Startdatum konnte nicht aktualisiert werden. Patientendaten wurden gespeichert.');
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

        {/* ── SECTION: Pending Applications ──
             Höchste Priorität: pending Bewerbungen wollen eine Entscheidung
             vom Kunden — die kommen ZUERST, vor allem anderen. */}
        {hasPending && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed px-1" style={{color:'#3D3D3D'}}>
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
             IMMER sichtbar wenn proaktiv interessierte Pflegekräfte da sind,
             egal ob hasPending oder nicht. Steht UNTER pending Bewerbungen
             (Bewerbung hat Priorität: schnelle Entscheidung nötig), aber
             ÜBER der Matching-Liste (Interest ist heißer als ein normales
             Matching). */}
        {visibleInterests.length > 0 && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed px-1" style={{color:'#3D3D3D'}}>
              {visibleInterests.length === 1
                ? 'Eine Pflegekraft hat proaktiv Interesse an Ihnen signalisiert.'
                : `${visibleInterests.length} Pflegekräfte haben proaktiv Interesse an Ihnen signalisiert.`}
            </p>
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
        )}

        {/* ── SECTION: Matched Nurses — pending + invited + Interests, nur
             wenn keine offenen Bewerbungen. Interest-Karten (Pflegekräfte,
             die proaktiv Interesse signalisiert haben) werden ganz oben in
             die gleiche Liste eingehängt — keine eigene Section, kein
             Erklär-Text. ── */}
        {!hasPending && (() => {
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
          // 14.06.: Cap 3 → 5 (User-Wunsch — mehr Auswahl gleich sichtbar
          // ohne Scrollen). Das matched die TARGET_VISIBLE=5 im
          // Alters-Filter-Fallback in effectiveMatched.
          const pendingNurses: VisibleNurse[] = allVisible.filter(({ status }) => status === 'pending').slice(0, 5);
          // Die Empfehlung (höchste Badge-Bewertung, Score = Erfahrungsjahre +
          // Einsätze) nach ganz oben ziehen — die anderen behalten ihre
          // Reihenfolge. So steht "Empfehlung des Beraters" immer zuoberst.
          const badgeScore = (n: Nurse) => (n.experienceYears ?? 0) + (n.history?.assignments ?? 0);
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
                /* 14.06.: Karten-Bereich mit leichtem Primundus-Beige-
                   Hintergrund + Innen-Padding, damit der Pflegekraft-
                   Auswahl-Bereich visuell als zusammenhängender, wichtiger
                   Block wirkt (vorher waren die Karten lose auf weißer
                   Page-Background). Border subtle, nicht aufdringlich. */
                <div
                  className="rounded-3xl px-3 py-4 border"
                  style={{ background: '#FAF8F4', borderColor: '#EAE3D8' }}
                >
                  <p className="text-[14px] leading-relaxed pb-2 px-1" style={{color:'#3D3D3D'}}>
                    {!patientSaved
                      ? 'Damit sich Pflegekräfte bewerben bzw. Sie diese einladen können, vervollständigen Sie bitte die Patienteninformationen.'
                      : 'Tippen Sie auf „Einladen", wenn Ihnen eine Pflegekraft gefällt — die Anfrage geht direkt an die Pflegekraft.'}
                  </p>
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
                      const badgeScore = (n: Nurse) => (n.experienceYears ?? 0) + (n.history?.assignments ?? 0);
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
          // Eingeladen zuerst, abgelehnt zuletzt.
          const doneMatches = [...matchInvited, ...interestInvited, ...matchDeclined, ...interestDeclined];
          const hasAny = doneApps.length > 0 || doneMatches.length > 0;
          if (!hasAny) return null;
          return (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
              {doneApps.map((app) => (
                <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
              ))}
              {doneMatches.map(({ nurse, caregiverId, status, key, matchIdx, interest }) => (
                <MatchCardDone
                  key={key}
                  nurse={nurse}
                  status={status}
                  hasInterestOrigin={interest}
                  onNurseClick={() => interest ? setSelectedNurse(nurse) : openNurseFromMatch(nurse, matchIdx)}
                  onUndo={status === 'declined' ? (interest ? () => undoDismissInterest(caregiverId) : () => undoDeclinedMatch(matchIdx)) : undefined}
                />
              ))}
            </div>
          );
        })()}

        {/* ── SECTION HEADER: So funktioniert's ── */}
        <div className="px-1 pt-3">
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>So funktioniert's</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
          <p className="text-[15px] mt-2" style={{color:'#8B8B8B'}}>Von der ersten Anfrage bis zur laufenden Betreuung.</p>
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'white', borderColor:'#E5E3DF'}}>
          {[
            { n: 1, title: 'Patientendaten vervollständigen', desc: 'Das Angebot sagt Ihnen zu? Ergänzen Sie jetzt die Angaben zum Patienten — so können sich Pflegekräfte optimal vorbereiten.', cta: !patientSaved, done: patientSaved },
            { n: 2, title: 'Bewerbungen erhalten & Pflegekräfte einladen', desc: 'Geeignete Pflegekräfte bewerben sich bei Ihnen. In der Zwischenzeit können Sie Wunschkandidatinnen gezielt einladen.', cta: false, done: hasPending },
            { n: 3, title: 'Vertrag abschließen', desc: 'Sie wählen Ihre Favoritin aus und bestätigen das Angebot — den Rest übernehmen wir.', cta: false, done: false },
            { n: 4, title: 'Laufende Betreuung', desc: 'Die Pflegekraft ist da. Ihr persönlicher Ansprechpartner begleitet Sie während des gesamten Einsatzes.', cta: false, done: false },
          ].map((s, i, arr) => (
            <div key={s.n} className={`flex items-start gap-4 px-5 py-4 ${i < arr.length - 1 ? 'border-b' : ''}`} style={{borderColor:'#E5E3DF'}}>
              {s.done ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:'#E3F7EF'}}>
                  <Check className="w-4 h-4" strokeWidth={3} style={{color:'#22A06B'}} />
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white mt-0.5" style={{background:'#8B7355', fontSize:'15px'}}>{s.n}</div>
              )}
              <div>
                <p className="text-[15px] font-semibold" style={{color: s.done ? '#9CA3AF' : '#3D3D3D'}}>{s.title}</p>
                <p className="text-[15px] mt-0.5 leading-relaxed" style={{color: s.done ? '#B5B5B5' : '#8B8B8B'}}>{s.desc}</p>
                {s.cta && (
                  <button
                    onClick={() => { setTriggerOpenPatient(true); document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
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
          <h2 className="text-[1.1rem] font-bold" style={{color:'#3D3D3D'}}>Häufige Fragen</h2>
          <div className="mt-1.5 h-[2px] w-10 rounded-full" style={{background:'#8B7355'}} />
        </div>
        <div className="rounded-2xl overflow-hidden border" style={{background:'white', borderColor:'#E5E3DF'}}>
          {[
            { q: 'Was bedeutet „Einladen"?', a: 'Wenn Ihnen eine Pflegekraft gefällt, können Sie sie einladen, sich bei Ihnen zu bewerben. Voraussetzung ist, dass das Patientenprofil vollständig ausgefüllt ist — damit sich die Pflegekraft optimal vorbereiten kann. Erst wenn Sie ein konkretes Angebot annehmen, kommt ein Vertrag zustande.' },
            { q: 'Gehe ich mit dem Einladen einen Vertrag ein?', a: 'Nein — das Einladen und Anschauen von Profilen ist vollständig unverbindlich. Ein Vertrag kommt erst zustande, wenn Sie ein konkretes Angebot ausdrücklich annehmen.' },
            { q: 'Kann ich jederzeit kündigen?', a: 'Ja, täglich kündbar — ohne Mindestlaufzeit und ohne Angabe von Gründen. Kosten entstehen ausschließlich für Tage, an denen die Pflegekraft tatsächlich vor Ort ist.' },
            { q: 'Wie funktioniert die Abrechnung?', a: 'Tagesgenau: Sie zahlen nur für geleistete Betreuungstage. Die Rechnung für den laufenden Monat wird jeweils zur Monatsmitte erstellt — transparent, nachvollziehbar, ohne versteckte Posten.' },
            { q: 'Wie lange bleibt die Pflegekraft — und wie läuft der Wechsel?', a: 'Pflegekräfte bleiben im Durchschnitt 6 bis 8 Wochen. Zur Mitte des Einsatzes beginnen wir bereits mit der Planung der Nachfolge, damit der Übergang nahtlos klappt. Sie müssen sich um nichts kümmern — Primundus organisiert den gesamten Wechsel.' },
            { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus kümmert sich umgehend um eine qualifizierte Vertretung. Ihr persönlicher Ansprechpartner informiert Sie proaktiv und begleitet die Übergabe.' },
            { q: 'Wie werden Reisekosten abgerechnet?', a: 'Die Reisekosten betragen pauschal 125 € pro Strecke — also je einmal bei der Anreise und bei der Abreise. Weitere versteckte Reisekosten gibt es nicht.' },
            { q: 'Ist das legal?', a: 'Ja, vollständig. Die Pflegekräfte sind sozialversicherungspflichtig bei uns angestellt und werden von uns nach Deutschland entsandt. Für jeden Einsatz liegt eine offizielle A1-Bescheinigung vor — der Nachweis der Sozialversicherungspflicht im Herkunftsland.' },
            { q: 'Mit wem wird der Vertrag geschlossen?', a: 'Der Betreuungsvertrag wird mit unserer Muttergesellschaft, der Vitanas Group, geschlossen — einem der größten und erfahrensten Pflegeunternehmen Deutschlands.' },
            { q: 'Welche Kosten entstehen insgesamt?', a: 'Es gibt vier Kostenpunkte: Die monatlichen Betreuungskosten laut Ihrem Angebot. Anreise und Abreise pauschal je 125 €. Kost und Logis, die Sie der Pflegekraft frei zur Verfügung stellen. Fällt der Einsatz in einen Sommermonat (Juli oder August), kommen 200 €/Monat (bzw. 6,67 €/Tag) Sommerzuschlag hinzu. An folgenden Feiertagen wird der doppelte Tagessatz berechnet: Karfreitag, Ostersonntag, Ostermontag, 1. Mai, Heiligabend, 1. + 2. Weihnachtstag, Silvester und Neujahr. Darüber hinaus gibt es keinerlei versteckte Kosten.' },
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
          ].map((item, i, arr) => (
            <div key={i} className={i < arr.length - 1 ? 'border-b' : ''} style={{borderColor:'#E5E3DF'}}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-5 text-left transition-colors duration-150"
                style={{background: openFaq === i ? '#FAFAF9' : 'transparent'}}
              >
                <span className="text-[15px] font-semibold pr-4 leading-snug transition-colors duration-150"
                  style={{color: openFaq === i ? '#6B5444' : '#3D3D3D'}}>
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
                <div className="px-5 pb-6 pt-1" style={{background:'#FAFAF9'}}>
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
        <div className="rounded-2xl overflow-hidden border bg-white" style={{borderColor:'#E5E3DF'}}>
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
                <p className="font-bold text-gray-900 text-base leading-tight">Ilka Wysocki</p>
                <p className="text-xs text-gray-500 mb-2">Pflegeberaterin · Primundus</p>
                <a href="tel:089200000830" className="inline-flex items-center gap-1.5 text-[#8B7355] font-bold text-sm hover:opacity-80 transition-opacity">
                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                  089 200 000 830
                </a>
                <p className="text-xs text-gray-500 mt-0.5">Mo–So, 8:00–18:00 Uhr</p>
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

      {/* Nurse Detail Modal */}
      {selectedNurse && enrichedSelectedNurse && (
        <CustomerNurseModal
          nurse={enrichedSelectedNurse}
          profileLoading={caregiverLoading && !fullCaregiver}
          aboutLoading={
            // Show "we're preparing the intro" loader instead of the Mamamia
            // motivation text while AI is in flight. Once AI resolves
            // (success OR null-failure) the loader collapses and the modal
            // shows whichever text the fallback chain ends on.
            !!fullCaregiver
            && aiAboutForId === fullCaregiver.id
            && aiAboutState.kind === 'loading'
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
                  <p className="text-base font-bold text-gray-900">Noch ein Schritt — die Patientendaten</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    Damit sich Pflegekräfte gut auf Ihre Situation vorbereiten können, fehlen uns noch ein paar Angaben zum Patienten. Sobald das ausgefüllt ist, können Sie Pflegekräfte einladen und Bewerbungen erhalten.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowPatientReminder(false);
                    setTriggerOpenPatient(true);
                    document.getElementById('patientendaten')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="w-full bg-[#E76F63] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#D65E52] shadow-sm transition-colors"
                >
                  Jetzt Patientendaten ausfüllen
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
