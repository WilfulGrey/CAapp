import { useState, useEffect, useRef, FC } from 'react';
import { Check, X, Bell, MapPin, Calendar, User, UserPlus, FileText, Euro, Clock, Plane, ChevronDown, Phone, AlertCircle, Shield, Users } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Nurse } from '../types';
import { NURSES } from '../data/nurses';
import {
  fetchLeadByToken,
  Lead,
  formatDate,
  addDays,
  leadDisplayName,
  leadGreeting,
  careStartLabel,
  formatEuro,
  cap,
  prefillPatientFromLead,
} from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type AppStatus = 'new' | 'accepted' | 'declined';
type NurseStatus = 'pending' | 'invited' | 'declined';

interface OfferDetails {
  monatlicheKosten: number;
  anreisedatum: string;
  abreisedatum: string;
  anreisekosten: number;
  abreisekosten: number;
  reisetage: string;
  feiertagszuschlag: number;
  kuendigungsfrist: string;
  submittedAt: string;
}

interface Application {
  id: string;
  nurse: Nurse;
  agencyName: string;
  appliedAt: string;
  status: AppStatus;
  message: string;
  offer: OfferDetails;
  isInvited?: boolean;
}

interface NurseStatuses {
  [index: number]: NurseStatus;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_APPLICATIONS: Application[] = [
  {
    id: '1',
    nurse: NURSES[0],
    agencyName: 'CarePartner GmbH',
    appliedAt: 'vor 23 Min.',
    status: 'new',
    isInvited: true,
    message:
      'Anna hat 6 Jahre Erfahrung in der 24h-Betreuung und ist sofort einsatzbereit. Ihre Sprachkenntnisse auf B2-Niveau ermöglichen eine reibungslose Kommunikation.',
    offer: {
      monatlicheKosten: 2250,
      anreisedatum: '01.05.2026',
      abreisedatum: '12.07.2026',
      anreisekosten: 120,
      abreisekosten: 120,
      reisetage: 'Halb',
      feiertagszuschlag: 0,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: '16.04.2026, 09:14',
    },
  },
  {
    id: '2',
    nurse: NURSES[1],
    agencyName: 'CareConnect Vermittlung',
    appliedAt: 'vor 1 Std.',
    status: 'new',
    message:
      'Marta bringt 8 Jahre Berufserfahrung mit und hat bereits ähnliche Patienten erfolgreich betreut. Sie kann flexibel und kurzfristig beginnen.',
    offer: {
      monatlicheKosten: 2150,
      anreisedatum: '01.05.2026',
      abreisedatum: '30.06.2026',
      anreisekosten: 140,
      abreisekosten: 140,
      reisetage: 'Halb',
      feiertagszuschlag: 75,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: '16.04.2026, 08:31',
    },
  },
  {
    id: '3',
    nurse: NURSES[4],
    agencyName: 'Herz & Hand Pflegedienst',
    appliedAt: 'vor 2 Std.',
    status: 'new',
    message:
      'Katarzyna ist eine sehr erfahrene Pflegekraft mit 12 Jahren im Bereich 24h-Betreuung. Sie ist bei Patienten sehr beliebt.',
    offer: {
      monatlicheKosten: 2350,
      anreisedatum: '01.05.2026',
      abreisedatum: '30.06.2026',
      anreisekosten: 130,
      abreisekosten: 130,
      reisetage: 'Halb',
      feiertagszuschlag: 0,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: '16.04.2026, 07:55',
    },
  },
];

// Matched nurses — exclude those already in applications
const MATCHED_NURSES = NURSES.slice(2, 14).filter(
  (n) => !MOCK_APPLICATIONS.some((a) => a.nurse.name === n.name)
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Nurse Level ──────────────────────────────────────────────────────────────

function nurseLevel(assignments: number): { label: string; emoji: string; cls: string } {
  if (assignments >= 36) return { label: 'Platin',  emoji: '🏆', cls: 'bg-violet-50 text-violet-600 border-violet-200' };
  if (assignments >= 25) return { label: 'Gold',    emoji: '🥇', cls: 'bg-yellow-50 text-yellow-600 border-yellow-300' };
  if (assignments >= 15) return { label: 'Silber',  emoji: '🥈', cls: 'bg-slate-100 text-slate-500 border-slate-300' };
  if (assignments >= 8)  return { label: 'Bronze',  emoji: '🥉', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return                        { label: 'Starter', emoji: '⭐', cls: 'bg-gray-100 text-gray-500 border-gray-200' };
}

function displayName(fullName: string) {
  const parts = fullName.split(' ');
  return parts.map((p, i) => (i === parts.length - 1 ? `${p[0]}.` : p)).join(' ');
}

function initials(fullName: string) {
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('');
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const CustomerPortalPage: FC = () => {
  // ─── Lead loading via token ──────────────────────────────────────────────────
  const [lead, setLead] = useState<Lead | null>(null);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      // No token → demo mode with hardcoded data
      setLeadLoading(false);
      return;
    }
    fetchLeadByToken(token).then(({ lead: l, error }) => {
      if (error || !l) {
        setLeadError('Ihr Angebot konnte nicht geladen werden. Bitte öffnen Sie den Link aus Ihrer E-Mail erneut.');
      } else {
        setLead(l);
      }
      setLeadLoading(false);
    });
  }, []);

  const [applications, setApplications] = useState<Application[]>(MOCK_APPLICATIONS);
  const [nurseStatuses, setNurseStatuses] = useState<NurseStatuses>({});
  const [selectedNurse, setSelectedNurse] = useState<Nurse | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [nurseModalApp, setNurseModalApp] = useState<Application | null>(null);
  const [nurseMatchIdx, setNurseMatchIdx] = useState<number | null>(null);
  const [declineConfirmApp, setDeclineConfirmApp] = useState<Application | null>(null);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  const [showContactPopup, setShowContactPopup] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [patientSaved, setPatientSaved] = useState(false);
  const [showPatientReminder, setShowPatientReminder] = useState(false);
  const [triggerOpenPatient, setTriggerOpenPatient] = useState(false);
  const [firstInviteDone, setFirstInviteDone] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
  const acceptedApp = applications.find((a) => a.status === 'accepted') ?? null;
  const hasPending = pendingApps.length > 0;
  const matchesUnlocked = !hasPending;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const acceptApp = (id: string) => {
    setSelectedApp(null);
    animateThenProcess(id, () => {
      setApplications((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'accepted' } : a))
      );
      showToast('✓ Betreuungskraft akzeptiert — die Agentur wird benachrichtigt.');
    });
  };

  const declineApp = (id: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'declined' } : a))
    );
  };

  const undoApp = (id: string) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'new' } : a))
    );
  };

  const canInviteNurse = (idx: number): boolean => {
    if (!patientSaved && firstInviteDone) {
      setShowPatientReminder(true);
      return false;
    }
    return true;
  };

  const confirmInviteNurse = (idx: number, name: string) => {
    const nurseName = MATCHED_NURSES[idx]?.name ?? '';
    setNurseStatuses((prev) => ({ ...prev, [idx]: 'invited' }));
    // Mark matching application as invited (nurse applied after being invited)
    if (nurseName) {
      setApplications((prev) =>
        prev.map((a) => a.nurse.name === nurseName ? { ...a, isInvited: true } : a)
      );
    }
    showToast(`✓ ${name} wurde eingeladen!`);
    if (!patientSaved && !firstInviteDone) {
      setFirstInviteDone(true);
      setShowPatientReminder(true);
    }
  };

  // Used by modal (calls after own animation)
  const inviteNurse = (idx: number, name: string): boolean => {
    if (!canInviteNurse(idx)) return false;
    confirmInviteNurse(idx, name);
    return true;
  };

  const declineNurse = (idx: number) => {
    setNurseStatuses((prev) => ({ ...prev, [idx]: 'declined' }));
  };

  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (leadLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#9B1FA1] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-400">Ihr Angebot wird geladen…</p>
        </div>
      </div>
    );
  }

  if (leadError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-sm font-semibold text-gray-800">Link nicht mehr gültig</p>
          <p className="text-sm text-gray-500 leading-relaxed">{leadError}</p>
          <a href="tel:+4989200000830" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9B1FA1] border border-[#D8A9DC] bg-[#F5EDF6] rounded-xl px-4 py-2.5">
            <Phone className="w-4 h-4" /> 089 200 000 830
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
    <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{fontFamily: 'inherit'}}>
    <div className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
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
      <nav className="sticky top-0 z-40 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowContactPopup(true)}
              className="flex items-center gap-1.5 bg-[#F5EDF6] hover:bg-[#EDD9EF] text-[#9B1FA1] border border-[#D8A9DC] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Hilfe
            </button>
          </div>
        </div>
      </nav>

      {acceptedApp ? (
        <BookedScreen app={acceptedApp} onNurseClick={setSelectedNurse} />
      ) : (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

        {/* ── Intro ── */}
        <div className="px-1 pt-2">
          <h1 className="text-2xl font-bold text-gray-900 leading-snug mb-2">
            Unser Kundenportal.<br />Transparent. In Ihren Händen.
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Kein Rätselraten — Angebot ansehen, passende Betreuungskräfte einladen und Bewerbungen direkt annehmen.
          </p>
        </div>

        {/* ── Kombinierte Karte: Identität + Anfrage + Stepper ── */}
        <AngebotCard lead={lead} onPatientSaved={setPatientSaved} triggerOpenPatient={triggerOpenPatient} onTriggerHandled={() => setTriggerOpenPatient(false)} />

        {/* ── Bewerbungsstatus ── */}
        {!hasPending ? (
          <div className="bg-gray-50 rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800">Bewerbungen werden für Sie vorbereitet</p>
              <p className="text-xs text-gray-400 mt-0.5">Sie erhalten eine E-Mail sobald eine Pflegekraft sich bewirbt.</p>
              <div className="flex items-center gap-1.5 mt-1.5">
                <svg className="w-3 h-3 text-[#22A06B] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                <span className="text-xs font-medium text-[#22A06B]">graefinnorman@gmx.de</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[#F0FAF5] rounded-2xl px-5 py-4 flex items-center gap-4">
            <div className="w-9 h-9 rounded-full bg-white border border-[#B8E8D4] flex items-center justify-center flex-shrink-0 text-lg">
              🎉
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {pendingApps.length === 1 ? 'Eine Bewerbung aktiv!' : `${pendingApps.length} Bewerbungen aktiv!`}
              </p>
              <p className="text-sm text-[#1a7a4f] mt-0.5">
                Schauen Sie sich {pendingApps.length === 1 ? 'die Pflegekraft' : 'die Pflegekräfte'} in Ruhe an und entscheiden Sie, welches Angebot am besten passt.
              </p>
            </div>
          </div>
        )}

        {/* ── SECTION: Pending Applications ── */}
        {hasPending && (
          <div className="space-y-3">
            {pendingApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                exiting={exitingIds.has(app.id)}
                onReview={() => setSelectedApp(app)}
                onDecline={() => setDeclineConfirmApp(app)}
                onNurseClick={(n) => openNurseFromApp(n, app)}
              />
            ))}
          </div>
        )}

        {/* ── SECTION: Matched Nurses — pending + invited, nur wenn keine offenen Bewerbungen ── */}
        {!hasPending && (() => {
          const visibleNurses = MATCHED_NURSES.map((n, i) => ({ nurse: n, i, status: nurseStatuses[i] ?? 'pending' as NurseStatus }))
            .filter(({ status }) => status === 'pending' || status === 'invited')
            .sort((a, b) => (a.status === 'invited' ? 1 : 0) - (b.status === 'invited' ? 1 : 0));
          return (
            <>
              {visibleNurses.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-base font-bold text-gray-900">
                      Für Sie vorausgewählte Pflegekräfte
                      <span className="text-sm font-normal text-gray-400 ml-2">({visibleNurses.length})</span>
                    </h2>
                  </div>
                  <div className="space-y-3">
                    {visibleNurses.map(({ nurse, i, status }) => (
                      <MatchCard key={i} nurse={nurse} status={status} onNurseClick={() => openNurseFromMatch(nurse, i)} onInvite={() => canInviteNurse(i)} onInviteConfirm={() => confirmInviteNurse(i, displayName(nurse.name))} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── SECTION: Processed applications ── */}
              {doneApps.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
                  {doneApps.map((app) => (
                    <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* ── SECTION: Processed applications (mit pending) ── */}
        {hasPending && doneApps.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">Bereits bearbeitet</p>
            {doneApps.map((app) => (
              <AppCardDone key={app.id} app={app} onNurseClick={(n, a) => { setNurseModalApp(a); setSelectedNurse(n); }} onUndo={undoApp} />
            ))}
          </div>
        )}

        {/* ── SECTION: Was passiert nach der Annahme? ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Was passiert nach der Annahme?</p>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {[
              { n: '1', title: 'Vertragsbestätigung per E-Mail', desc: 'Sie erhalten sofort eine Bestätigung mit allen Details.' },
              { n: '2', title: 'Anreise & Betreuungsbeginn', desc: 'Die Pflegekraft reist zum vereinbarten Startdatum an und beginnt die Betreuung.' },
              { n: '3', title: 'Laufende Begleitung', desc: 'Ihr persönlicher Ansprechpartner ist jederzeit für Sie da — auch während des Einsatzes.' },
              { n: '4', title: 'Nächsten Einsatz planen', desc: 'Zur Mitte des laufenden Einsatzes starten wir die Planung der Nachfolge. Neue Pflegekräfte und alle Infos erscheinen direkt hier im Portal.' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-3 px-4 py-3">
                <div className="w-5 h-5 rounded-full bg-[#F5EDF6] text-[#9B1FA1] text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{s.n}</div>
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION: FAQ ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Häufige Fragen</p>
          </div>
          <div className="divide-y divide-gray-100 bg-white">
            {[
              { q: 'Was bedeutet "Einladen"?', a: 'Wenn Sie eine Pflegekraft einladen, erhält sie eine direkte Anfrage und kann sich offiziell bei Ihnen bewerben. Erst nach einer Bewerbung sehen Sie das konkrete Angebot und können annehmen oder ablehnen.' },
              { q: 'Kann ich kündigen, wenn es nicht passt?', a: 'Ja — Sie können täglich kündigen, sofern in Ihrem Angebot so vereinbart. Es entstehen keine weiteren Kosten nach Abreise der Pflegekraft.' },
              { q: 'Wie läuft die Zahlung ab?', a: 'Die Abrechnung erfolgt monatsgenau. Sie erhalten am Monatsende eine Rechnung für die tatsächlichen Betreuungstage.' },
              { q: 'Was passiert, wenn die Pflegekraft ausfällt?', a: 'Primundus organisiert schnellstmöglich eine Vertretung. Ihr Ansprechpartner informiert Sie proaktiv.' },
              { q: 'Kann ich eine andere Pflegekraft wählen?', a: 'Ja — Sie können Bewerbungen ablehnen und weitere Pflegekräfte einladen. Wir helfen Ihnen, die beste Lösung zu finden.' },
              { q: 'Wie werden Reisekosten abgerechnet?', a: 'Reisekosten fallen einmalig bei An- und Abreise an und sind im Angebot als Pauschale ausgewiesen.' },
            ].map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800 pr-4">{item.q}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-3">
                    <p className="text-sm text-gray-500 leading-relaxed">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
      )}

      {/* Angebot prüfen Modal */}
      {selectedApp && (
        <AngebotPruefenModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onAccept={acceptApp}
          onNurseClick={(n) => openNurseFromApp(n, selectedApp)}
        />
      )}

      {/* Nurse Detail Modal */}
      {selectedNurse && (
        <CustomerNurseModal
          nurse={selectedNurse}
          onClose={() => { setSelectedNurse(null); setNurseModalApp(null); setNurseMatchIdx(null); }}
          app={nurseModalApp ?? undefined}
          onReview={() => { setSelectedNurse(null); setSelectedApp(nurseModalApp); setNurseModalApp(null); }}
          onDecline={() => { setDeclineConfirmApp(nurseModalApp); setSelectedNurse(null); setNurseModalApp(null); }}
          onUndo={() => { if (nurseModalApp) undoApp(nurseModalApp.id); setNurseModalApp(null); }}
          isInvited={nurseMatchIdx !== null && nurseStatuses[nurseMatchIdx] === 'invited'}
          onInvite={nurseMatchIdx !== null ? () => {
            inviteNurse(nurseMatchIdx, displayName(selectedNurse.name));
            setSelectedNurse(null); setNurseMatchIdx(null);
          } : undefined}
          onDeclineMatch={nurseMatchIdx !== null ? () => {
            declineNurse(nurseMatchIdx);
            setSelectedNurse(null); setNurseMatchIdx(null);
          } : undefined}
        />
      )}

      {/* Info Popup */}
      {showInfoPopup && <InfoPopup onClose={() => setShowInfoPopup(false)} />}

      {/* Contact Popup */}
      {showContactPopup && <ContactPopup onClose={() => setShowContactPopup(false)} />}

      {/* Patient Reminder Popup */}
      {showPatientReminder && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]" onClick={() => setShowPatientReminder(false)} style={{ animation: 'fadeIn 0.2s ease-out' }} />
          <div className="fixed inset-0 z-[70] flex items-end justify-center pointer-events-none" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div className="bg-white w-full rounded-t-3xl pointer-events-auto shadow-2xl px-5 pt-5 pb-8 space-y-4" style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}>
              <div className="flex justify-center mb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 text-xl">⚠️</div>
                <div>
                  <p className="text-base font-bold text-gray-900">Patientendaten fehlen noch</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    Bevor Pflegekräfte eingeladen werden können, benötigen wir noch Angaben zum Patienten und Haushalt — damit sich alle Bewerberinnen optimal vorbereiten können.
                  </p>
                </div>
              </div>
              <div className="bg-[#FFF8E7] border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs text-amber-800 leading-relaxed">
                  Ohne vollständige Patientendaten können Pflegekräfte keine fundierte Bewerbung einreichen.
                </p>
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => { setShowPatientReminder(false); setTriggerOpenPatient(true); }}
                  className="w-full bg-[#9B1FA1] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#7B1A85] transition-colors"
                >
                  Jetzt Patientendaten ausfüllen
                </button>
                <button
                  onClick={() => setShowPatientReminder(false)}
                  className="w-full text-gray-500 font-semibold py-2.5 text-sm"
                >
                  Später erledigen
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
              declineApp(id);
              showToast('Bewerbung abgelehnt' + (msg ? ' — Nachricht wurde gesendet.' : '.'));
            });
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
  );
};

// ─── Booked Screen ────────────────────────────────────────────────────────────

const BookedScreen: FC<{ app: Application; onNurseClick: (n: Nurse) => void }> = ({ app, onNurseClick }) => {
  const { nurse, offer, agencyName } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
  const lvl = nurseLevel(nurse.history?.assignments ?? 0);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  const milestones = [
    {
      icon: '📄',
      title: 'Vertrag',
      desc: 'Ihr Betreuungsvertrag wird vorbereitet und steht bald zum Download bereit.',
      ready: false,
    },
    {
      icon: '✈️',
      title: 'Anreisedaten',
      desc: `Anreise am ${offer.anreisedatum} · Abreise am ${offer.abreisedatum}. Details folgen in Kürze.`,
      ready: false,
    },
    {
      icon: '🔄',
      title: 'Folge-Einsatz',
      desc: 'Zur Hälfte des Einsatzes öffnet sich automatisch ein neuer Suchlauf — Sie können dann wieder Pflegekräfte einladen und neue Bewerbungen erhalten.',
      ready: false,
    },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5" style={{ animation: 'fadeIn 0.4s ease-out' }}>

      {/* Success header */}
      <div className="text-center py-4">
        <div className="text-5xl mb-3">🎊</div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">Pflegekraft gebucht!</h1>
        <p className="text-sm text-gray-600">Alles ist bestätigt. Die Agentur wurde benachrichtigt.</p>
      </div>

      {/* Nurse + offer card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Nurse row */}
        <div
          className="flex items-center gap-3.5 px-4 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onNurseClick(nurse)}
        >
          <div className="relative flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-14 h-14 rounded-xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>{inits}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-gray-900">{name}</span>
              <span className={`flex items-center gap-0.5 text-xs font-bold pl-1 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                <span className="text-xs leading-none">{lvl.emoji}</span>{lvl.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {bars.map((f, i) => <div key={i} className={`w-2.5 h-[5px] rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />)}
              </div>
              <span className="text-xs text-gray-500">{nurse.language.level}</span>
              <span className="text-gray-300 text-xs">·</span>
              <span className="text-xs font-bold text-[#9B1FA1]">{nurse.experience}</span>
            </div>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">Profil →</span>
        </div>

        {/* Offer details */}
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {[
            { label: 'Mtl. Betreuungskosten', value: `${offer.monatlicheKosten.toLocaleString('de-DE')} €`, bold: true },
            { label: 'Anreise', value: offer.anreisedatum },
            { label: 'Abreise', value: offer.abreisedatum },
            { label: 'Reisekosten', value: `${offer.anreisekosten} € pro Fahrt` },
            { label: 'Kündigungsfrist', value: offer.kuendigungsfrist },
          ].map(row => (
            <div key={row.label} className="flex justify-between items-center px-4 py-2.5">
              <span className="text-xs text-gray-500">{row.label}</span>
              <span className={`text-xs ${row.bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Milestones */}
      <div className="space-y-2.5">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Als nächstes</p>
        {milestones.map((m) => (
          <div key={m.title} className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
              {m.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-gray-800">{m.title}</p>
                <span className="text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Folgt</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">{m.desc}</p>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
};

// ─── Custom Select ────────────────────────────────────────────────────────────

const CustomSelect: FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder = 'Bitte wählen' }) => {
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (btnRef.current && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const updatePos = () => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setDropdownStyle({ position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 });
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={e => { e.stopPropagation(); handleOpen(); }}
        className={`w-full border rounded-xl px-3 py-2.5 text-sm text-left flex items-center justify-between gap-2 transition-all bg-white ${
          open ? 'border-[#9B1FA1] ring-2 ring-[#9B1FA1]/10' : 'border-gray-200'
        } ${value ? 'text-gray-800' : 'text-gray-400'}`}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div style={dropdownStyle} className="bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto max-h-48">
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={e => { e.stopPropagation(); onChange(opt); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                opt === value
                  ? 'bg-[#F5EDF6] text-[#9B1FA1] font-semibold'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Angebot + Patientendaten Karte ──────────────────────────────────────────

interface PatientForm {
  anzahl: '1' | '2' | '';
  // Patient 1
  geschlecht: string; geburtsjahr: string; pflegegrad: string; gewicht: string; groesse: string;
  mobilitaet: string; heben: string; demenz: string; inkontinenz: string; nacht: string;
  // Patient 2
  p2_geschlecht: string; p2_geburtsjahr: string; p2_pflegegrad: string; p2_gewicht: string; p2_groesse: string;
  p2_mobilitaet: string; p2_heben: string; p2_demenz: string; p2_inkontinenz: string; p2_nacht: string;
  // Shared
  diagnosen: string;
  plz: string; ort: string; haushalt: string; wohnungstyp: string; urbanisierung: string;
  familieNahe: string; pflegedienst: string; internet: string;
  tiere: string; unterbringung: string; aufgaben: string;
  // PK-Wünsche
  wunschGeschlecht: string; rauchen: string; sonstigeWuensche: string;
}

const STEP_LABELS = ['Zur Person', 'Pflegebedarf', 'Wohnsituation', 'Wünsche zur PK'];

const AngebotCard: FC<{
  lead?: Lead | null;
  onPatientSaved?: (saved: boolean) => void;
  triggerOpenPatient?: boolean;
  onTriggerHandled?: () => void;
}> = ({ lead, onPatientSaved, triggerOpenPatient, onTriggerHandled }) => {
  // ─── Derive display values from lead (or fallback to demo data) ──────────────
  const kalk = lead?.kalkulation;
  const bruttopreis = kalk ? formatEuro(kalk.bruttopreis) : '3.050 €';
  const eigenanteil = kalk ? formatEuro(kalk.eigenanteil) : '2.075 €';
  const nachname = cap(lead?.nachname) || 'Von Norman';
  const displayAngebot = `${nachname} · ${bruttopreis}/Mo.`;
  const careStart = careStartLabel(lead?.care_start_timing ?? null);
  const angebotDatum = lead ? formatDate(lead.created_at) : '15.04.2026';
  const gueltigBis = lead ? addDays(lead.created_at, 30) : '15.05.2026';
  const kundenEmail = lead?.email ?? 'graefinnorman@gmx.de';
  const kundenName = lead ? leadDisplayName(lead) : 'Frau Von Norman';
  const greeting = lead ? leadGreeting(lead) : 'Sehr geehrte Frau Von Norman';
  const zuschüsse = kalk?.['zuschüsse']?.items?.filter(z => z.in_kalkulation) ?? [
    { label: 'Pflegegeld (Pflegegrad 2)', betrag_monatlich: 347 },
    { label: 'Entlastungsbudget (anteilig mt.)', betrag_monatlich: 295 },
    { label: 'Steuervorteile § 35a EStG', betrag_monatlich: 333 },
  ];
  const [angebotOpen, setAngebotOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [priceInfo, setPriceInfo] = useState<string|null>(null);

  // ─── localStorage key per lead/token ────────────────────────────────────────
  const storageKey = lead?.token ? `patient_${lead.token}` : null;

  // Load saved patient data from localStorage (or fall back to formularDaten prefill)
  const prefill = lead ? prefillPatientFromLead(lead) : {};
  const savedData: Partial<PatientForm> = storageKey
    ? (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })()
    : {};
  const hasSavedData = storageKey ? !!localStorage.getItem(storageKey) : false;

  const [saved, setSaved] = useState(hasSavedData);
  const [patient, setPatient] = useState<PatientForm>({
    anzahl: savedData.anzahl ?? prefill.anzahl ?? '1',
    geschlecht: savedData.geschlecht ?? '', geburtsjahr: savedData.geburtsjahr ?? '', pflegegrad: savedData.pflegegrad ?? prefill.pflegegrad ?? '', gewicht: savedData.gewicht ?? '', groesse: savedData.groesse ?? '',
    mobilitaet: savedData.mobilitaet ?? prefill.mobilitaet ?? 'Rollstuhlfähig', heben: savedData.heben ?? '', demenz: savedData.demenz ?? '', inkontinenz: savedData.inkontinenz ?? '', nacht: savedData.nacht ?? prefill.nacht ?? 'Nein',
    p2_geschlecht: savedData.p2_geschlecht ?? '', p2_geburtsjahr: savedData.p2_geburtsjahr ?? '', p2_pflegegrad: savedData.p2_pflegegrad ?? '', p2_gewicht: savedData.p2_gewicht ?? '', p2_groesse: savedData.p2_groesse ?? '',
    p2_mobilitaet: savedData.p2_mobilitaet ?? '', p2_heben: savedData.p2_heben ?? '', p2_demenz: savedData.p2_demenz ?? '', p2_inkontinenz: savedData.p2_inkontinenz ?? '', p2_nacht: savedData.p2_nacht ?? '',
    diagnosen: savedData.diagnosen ?? '',
    plz: savedData.plz ?? '', ort: savedData.ort ?? '', haushalt: savedData.haushalt ?? '', wohnungstyp: savedData.wohnungstyp ?? '', urbanisierung: savedData.urbanisierung ?? '', familieNahe: savedData.familieNahe ?? '', pflegedienst: savedData.pflegedienst ?? '', internet: savedData.internet ?? '',
    tiere: savedData.tiere ?? '', unterbringung: savedData.unterbringung ?? '', aufgaben: savedData.aufgaben ?? '',
    wunschGeschlecht: savedData.wunschGeschlecht ?? prefill.wunschGeschlecht ?? '', rauchen: savedData.rauchen ?? '', sonstigeWuensche: savedData.sonstigeWuensche ?? '',
  });

  const zwei = patient.anzahl === '2';

  const set = (f: keyof PatientForm) =>
    (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) =>
      setPatient(p => ({ ...p, [f]: e.target.value }));

  const stepComplete = (s: number): boolean => {
    if (s === 0) {
      if (!patient.anzahl) return false;
      const p1ok = patient.geschlecht !== '' && patient.geburtsjahr !== '' && patient.pflegegrad !== '';
      const p2ok = !zwei || (patient.p2_geschlecht !== '' && patient.p2_geburtsjahr !== '' && patient.p2_pflegegrad !== '');
      return p1ok && p2ok;
    }
    if (s === 1) {
      const p1ok = patient.mobilitaet !== '' && patient.heben !== '' && patient.demenz !== '' && patient.inkontinenz !== '' && patient.nacht !== '';
      const p2ok = !zwei || (patient.p2_mobilitaet !== '' && patient.p2_heben !== '' && patient.p2_demenz !== '' && patient.p2_inkontinenz !== '' && patient.p2_nacht !== '');
      return p1ok && p2ok;
    }
    if (s === 2) {
      return patient.plz !== '' && patient.ort !== '' && patient.haushalt !== ''
        && patient.wohnungstyp !== '' && patient.urbanisierung !== '' && patient.familieNahe !== ''
        && patient.pflegedienst !== '' && patient.internet !== '';
    }
    if (s === 3) {
      return patient.wunschGeschlecht !== '' && patient.rauchen !== '';
    }
    return false;
  };
  const allComplete = STEP_LABELS.every((_, i) => stepComplete(i));

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#9B1FA1] focus:ring-2 focus:ring-[#9B1FA1]/10 transition-all bg-white';
  const labelCls = 'block text-sm font-medium text-gray-500 mb-1.5';

  const downloadPdf = async () => {
    // Pre-load logo as base64 so html2canvas doesn't miss it
    const logoB64 = await fetch('/LOGO-PRIMUNDUS.png')
      .then(r => r.blob())
      .then(b => new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(b); }));

    const html = `<div style="width:794px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;background:#fff;">

  <!-- HEADER -->
  <div style="padding:32px 52px 24px;border-bottom:1px solid #e8e8e8;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:middle;width:55%;">
        <img src="${logoB64}" style="height:52px;display:block;" />
      </td>
      <td style="vertical-align:middle;text-align:right;">
        <div style="font-size:13px;color:#444;line-height:1.5;">089 200 000 830</div>
        <div style="font-size:12px;color:#888;line-height:1.5;">Ilka Wysocki · Mo–Sa 8–18 Uhr</div>
      </td>
    </tr></table>
  </div>

  <!-- ADDRESS + META -->
  <div style="padding:24px 52px 20px;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:top;">
        <div style="font-size:13px;font-weight:600;color:#1a1a1a;">${kundenName}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">${kundenEmail}</div>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="font-size:12px;color:#888;line-height:2.0;">
          <div>Angebotsdatum: <span style="color:#333;">${angebotDatum}</span></div>
          <div>Gültig bis: <span style="color:#333;">${gueltigBis}</span></div>
        </div>
      </td>
    </tr></table>
  </div>

  <!-- TITLE + BRIEF -->
  <div style="padding:32px 52px 28px;">
    <div style="font-size:19px;font-weight:700;color:#1a1a1a;margin-bottom:20px;line-height:1.35;">Ihr persönliches Angebot –<br/>24-Stunden-Betreuung zu Hause</div>
    <p style="font-size:13.5px;color:#333;margin:0 0 10px;">${greeting},</p>
    <p style="font-size:13.5px;color:#555;line-height:1.7;margin:0 0 10px;">vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <strong style="color:#1a1a1a;">innerhalb von 4–7 Werktagen</strong> beginnen.</p>
    <p style="font-size:13.5px;color:#555;line-height:1.7;margin:0 0 18px;">Unser nachfolgendes Angebot ist auf Ihre individuelle Situation zugeschnitten.</p>
    <div style="font-size:13px;color:#888;">Ihre Ilka Wysocki</div>
  </div>

  <!-- TRUST BAR -->
  <div style="padding:13px 52px;background:#f9f9f9;border-top:1px solid #f0f0f0;border-bottom:1px solid #f0f0f0;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="font-size:11px;color:#bbb;vertical-align:middle;width:80px;">Bekannt aus</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">DIE WELT</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">FAZ</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">ARD</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">NDR</td>
      <td style="font-size:12px;font-weight:700;color:#666;vertical-align:middle;letter-spacing:0.5px;padding:0 16px;">SAT.1</td>
    </tr></table>
  </div>

  <!-- KOSTEN -->
  <div style="padding:32px 52px 0;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">Kosten</div>
    <div style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;margin-bottom:10px;">
      <div style="padding:10px 22px;background:#f5f5f5;border-bottom:1px solid #e8e8e8;">
        <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.2px;text-transform:uppercase;">Monatssatz für die 24h-Betreuung</div>
      </div>
      <div style="padding:20px 22px 16px;">
        <div style="font-size:38px;font-weight:700;color:#1a1a1a;line-height:1;">${bruttopreis}</div>
        <div style="font-size:12px;color:#aaa;margin-top:6px;">Inkl. aller Steuern, Gebühren und Sozialabgaben</div>
      </div>
      <div style="border-top:1px solid #f0f0f0;">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td style="padding:12px 22px;border-right:1px solid #f0f0f0;width:50%;vertical-align:top;">
            <div style="font-size:10px;color:#bbb;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Zzgl. Anreisepauschale</div>
            <div style="font-size:13px;color:#555;">125 € pro Strecke</div>
          </td>
          <td style="padding:12px 22px;width:50%;vertical-align:top;">
            <div style="font-size:10px;color:#bbb;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">Zzgl. Kost &amp; Logis</div>
            <div style="font-size:13px;color:#555;">Eigenes Zimmer + Verpflegung</div>
          </td>
        </tr></table>
      </div>
    </div>
    <div style="padding:6px 0 28px;">
      <div style="font-size:12px;color:#888;border:1px solid #e0e0e0;border-radius:20px;padding:5px 14px;display:inline-block;">✓ Täglich kündbar &nbsp;·&nbsp; ✓ Tagesgenaue Abrechnung &nbsp;·&nbsp; ✓ Keine Kosten ohne Pflegekraft</div>
    </div>
  </div>

  <!-- ZUSCHÜSSE -->
  <div style="padding:0 52px 28px;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:14px;">Mögliche Zuschüsse der Pflegekasse</div>
    <div style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        ${zuschüsse.map((z: any) => `<tr><td style="padding:11px 22px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;background:#fafafa;">${z.label}</td><td style="padding:11px 22px;text-align:right;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;background:#fafafa;white-space:nowrap;">−${formatEuro(z.betrag_monatlich)}</td></tr>`).join('')}
        <tr><td style="padding:14px 22px;font-size:14px;font-weight:700;color:#1a1a1a;background:#fff;">Möglicher Eigenanteil</td><td style="padding:14px 22px;text-align:right;font-size:16px;font-weight:700;color:#1a1a1a;background:#fff;white-space:nowrap;">ab ${eigenanteil}/Monat</td></tr>
      </table>
    </div>
    <div style="font-size:11px;color:#ccc;margin-top:8px;font-style:italic;">Zuschüsse sind individuell und abhängig von Ihrer persönlichen Situation. Kein Vertragsbestandteil.</div>
  </div>

  <!-- NÄCHSTE SCHRITTE -->
  <div style="padding:24px 52px 32px;border-top:1px solid #f0f0f0;">
    <div style="font-size:10px;font-weight:700;color:#aaa;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:20px;">Was passiert nach der Annahme?</div>
    ${[
      ['1','Vertragsbestätigung per E-Mail','Sie erhalten sofort eine Bestätigung mit allen Details des Einsatzes.'],
      ['2','Anreise &amp; Betreuungsbeginn','Die Pflegekraft reist zum vereinbarten Datum an und beginnt die Betreuung.'],
      ['3','Laufende Begleitung','Ihr persönlicher Ansprechpartner ist 7 Tage die Woche für Sie erreichbar.'],
      ['4','Nächsten Einsatz planen','Zur Mitte des Einsatzes planen wir gemeinsam die Nachfolge — alles im Portal.'],
    ].map(([n,title,desc]) => `
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;"><tr>
      <td style="vertical-align:top;width:36px;padding-top:2px;">
        <div style="width:24px;height:24px;border:1.5px solid #ddd;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:700;color:#aaa;">${n}</div>
      </td>
      <td style="vertical-align:top;padding-left:14px;">
        <div style="font-size:13.5px;font-weight:700;color:#1a1a1a;">${title}</div>
        <div style="font-size:12.5px;color:#777;margin-top:3px;line-height:1.55;">${desc}</div>
      </td>
    </tr></table>`).join('')}
  </div>

  <!-- FOOTER -->
  <div style="padding:16px 52px;border-top:1px solid #f0f0f0;background:#f9f9f9;">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="font-size:11px;color:#bbb;">Primundus GmbH · primundus.de · info@primundus.de</td>
      <td style="text-align:right;font-size:11px;color:#bbb;">Vertrauliches Angebot · Nur für ${kundenName}</td>
    </tr></table>
  </div>

</div>`;

    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;pointer-events:none;';
    el.innerHTML = html;
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 300));

    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        width: 794,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const canvasH = (canvas.height / canvas.width) * pageW;

      if (canvasH <= pageH) {
        doc.addImage(imgData, 'PNG', 0, 0, pageW, canvasH);
      } else {
        const pxPerPage = (pageH / pageW) * canvas.width;
        let remainingH = canvas.height;
        let srcY = 0;
        let firstPage = true;
        while (remainingH > 0) {
          const sliceH = Math.min(pxPerPage, remainingH);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceH;
          sliceCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          if (!firstPage) doc.addPage();
          doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, (sliceH / canvas.width) * pageW);
          srcY += sliceH;
          remainingH -= sliceH;
          firstPage = false;
        }
      }

      doc.save('Primundus-Angebot.pdf');
    } finally {
      document.body.removeChild(el);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm divide-y divide-gray-100">

      {/* ── Row 1: Ihr Angebot ── */}
      <div>
        <button
          onClick={() => setAngebotOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-[#E3F7EF] flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-[#22A06B]" strokeWidth={3} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-500 mb-0.5">Ihr Angebot</p>
            <p className="text-sm font-bold text-gray-900">{displayAngebot}</p>
            <p className="text-sm text-gray-500 mt-0.5">{careStart}</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-[#F5EDF6] flex items-center justify-center flex-shrink-0">
            <ChevronDown className={`w-4 h-4 text-[#9B1FA1] transition-transform ${angebotOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {angebotOpen && (
          <div className="border-t border-gray-100 px-4 pt-5 pb-5 space-y-5">

            {/* ── Angebotsbrief ── */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-gray-800">{kundenName}</p>
                  <p className="text-sm text-gray-500">{kundenEmail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-gray-500">Angebotsdatum: {angebotDatum}</p>
                  <p className="text-xs text-gray-500">Gültig bis: {gueltigBis}</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2 mt-6">Ihr persönliches Angebot –<br />24-Stunden-Betreuung zu Hause</p>
                <p className="text-sm text-gray-600 mb-2">{greeting},</p>
                <p className="text-sm text-gray-600 leading-relaxed">vielen Dank für Ihre Anfrage. Gerne können wir die Betreuung übernehmen. Da unsere Betreuungskräfte direkt angestellt sind, kann die Betreuung bereits <span className="font-semibold">innerhalb von 4–7 Werktagen</span> beginnen.</p>
                <p className="text-sm text-gray-600 leading-relaxed mt-2">Nachfolgend finden Sie die Konditionen sowie bereits vorausgewählte Pflegekräfte. Melden Sie sich jederzeit bei Fragen.</p>
                <p className="text-sm text-gray-400 mt-3">Ihre Ilka Wysocki</p>
              </div>
            </div>

            {/* ── Konditionen & Kosten ── */}
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#F5EDF6]">
                  <span className="text-sm font-bold text-[#9B1FA1]">Ihre Konditionen</span>
                </div>
                {/* Kosten */}
                {[
                  { label: 'Mtl. Betreuungskosten', value: bruttopreis, bold: true, sub: 'Inkl. Steuern, Gebühren & Sozialabgaben' },
                  { label: 'Anreise', value: 'Zzgl. 125 € / Strecke', bold: false },
                  { label: 'Unterkunft', value: 'Zzgl. Kost & Logis', bold: false },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between px-4 py-2 bg-white gap-4">
                    <div>
                      <span className="text-sm text-gray-700">{r.label}</span>
                      {r.sub && <p className="text-sm text-gray-500 mt-0.5">{r.sub}</p>}
                    </div>
                    <span className={`text-sm text-right flex-shrink-0 ${r.bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{r.value}</span>
                  </div>
                ))}
                {/* Vertragskonditionen */}
                <div className="flex items-center justify-between px-4 py-2 bg-gray-50">
                  <span className="text-sm font-semibold text-gray-500">Vertragskonditionen</span>
                  <span className="text-xs font-semibold text-[#1a7a4f] bg-[#E3F7EF] border border-[#B8E8D4] px-2 py-0.5 rounded-full">100% Sorglos</span>
                </div>
                {[
                  'Täglich kündbar',
                  'Tagesgenaue Abrechnung',
                  'Kosten entstehen nur wenn Pflegekraft vor Ort ist',
                ].map(label => (
                  <div key={label} className="flex items-center gap-2.5 px-4 py-2 bg-gray-50">
                    <Check className="w-3 h-3 text-[#22A06B] flex-shrink-0" strokeWidth={3} />
                    <span className="text-sm text-gray-700">{label}</span>
                  </div>
                ))}
              </div>

              {/* Warum Primundus */}
              <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                <div className="px-4 py-2.5 bg-white">
                  <p className="text-sm font-bold text-gray-900">Warum Primundus…</p>
                </div>
                {[
                  { icon: <svg className="w-4 h-4 text-[#9B1FA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>, label: 'Über 20 Jahre Erfahrung' },
                  { icon: <svg className="w-4 h-4 text-[#9B1FA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>, label: 'Über 60.000+ Einsätze' },
                  { icon: <svg className="w-4 h-4 text-[#9B1FA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>, label: 'Persönlicher Ansprechpartner 7 Tage die Woche' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2 bg-white">
                    <span className="flex-shrink-0">{r.icon}</span>
                    <span className="text-sm text-gray-700">{r.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-3 px-4 py-2.5 bg-white">
                  <img src="/badge-testsieger.webp" alt="Testsieger" className="w-8 flex-shrink-0 rounded" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Testsieger bei DIE WELT</p>
                    <p className="text-sm text-gray-400 italic">„Beste Kombination aus Preis, Qualität und Kundenservice."</p>
                  </div>
                </div>
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs text-gray-400 mb-2">Bekannt aus</p>
                  <div className="flex items-center justify-center gap-x-5 gap-y-3 flex-wrap">
                    {[
                      { src: '/media-welt.webp', alt: 'Die Welt' },
                      { src: '/media-faz.webp', alt: 'FAZ' },
                      { src: '/media-ard.webp', alt: 'ARD' },
                      { src: '/media-ndr.webp', alt: 'NDR' },
                      { src: '/media-sat1.webp', alt: 'SAT.1' },
                    ].map(l => (
                      <img key={l.alt} src={l.src} alt={l.alt} className="h-3.5 object-contain" />
                    ))}
                  </div>
                </div>
              </div>

              {/* Zuschüsse — grüner Hinweisblock */}
              <div className="rounded-xl border border-[#B8E8D4] overflow-hidden divide-y divide-[#c8edd8]">
                <div className="px-4 py-2.5 bg-[#E3F7EF]">
                  <p className="text-xs font-bold text-[#1a7a4f]">Mögliche Zuschüsse der Pflegekasse</p>
                  <p className="text-xs text-[#2a9a6f] mt-0.5">Hinweis – kein Vertragsbestandteil</p>
                </div>
                {zuschüsse.map((z: any) => (
                  <div key={z.label || z.name} className="flex items-center justify-between px-4 py-2 bg-[#E3F7EF] gap-4">
                    <span className="text-xs text-[#1a7a4f]">{z.label}</span>
                    <span className="text-xs font-semibold text-[#1a7a4f] text-right">−{formatEuro(z.betrag_monatlich)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-[#d0f2e4] border-t border-[#a3d9c4] gap-4">
                  <span className="text-sm font-bold text-[#1a7a4f]">Möglicher Eigenanteil</span>
                  <span className="text-sm font-bold text-[#1a7a4f] text-right">ab {eigenanteil}/Monat</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                Zuschüsse sind individuell nutzbar und abhängig von Ihrer persönlichen Situation.
              </p>
            </div>

            {/* ── PDF Download ── */}
            <button onClick={downloadPdf} className="flex items-center gap-2 text-xs font-semibold text-[#9B1FA1] border border-[#D8A9DC] bg-[#F5EDF6] rounded-lg px-3 py-2 hover:bg-[#EDD9EF] transition-colors w-full justify-center">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Angebot als PDF herunterladen
            </button>

            {/* ── Wie geht es weiter? ── */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-sm font-bold text-gray-900">Wie geht es weiter?</p>
              </div>
              <div className="divide-y divide-gray-100">
                {/* Step 1 */}
                <button
                  onClick={() => { setAngebotOpen(false); setPatientOpen(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F5EDF6] transition-colors text-left group"
                >
                  <div className="w-6 h-6 rounded-full bg-[#9B1FA1] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">1</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#9B1FA1]">Profildaten vervollständigen</p>
                    <p className="text-xs text-gray-500">Angaben zum Patienten & Haushalt</p>
                  </div>
                  <ChevronDown className="w-4 h-4 text-[#9B1FA1] -rotate-90 flex-shrink-0" />
                </button>
                {/* Step 2 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">2</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Auswahl Ihrer Pflegekraft</p>
                    <p className="text-xs text-gray-500">Passende Betreuerin kennenlernen</p>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">3</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Anreise & Betreuungsbeginn</p>
                    <p className="text-xs text-gray-500">Pflegekraft kommt zu Ihnen nach Hause</p>
                  </div>
                </div>
                {/* Step 4 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-500 text-xs font-bold flex items-center justify-center flex-shrink-0">4</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-700">Laufende Betreuung</p>
                    <p className="text-xs text-gray-500">Ihr persönlicher Ansprechpartner begleitet Sie</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Row 2: Patientendaten ── */}
      <div>
        <button
          onClick={() => { setPatientOpen(o => !o); setSaved(false); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
        >
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${allComplete && saved ? 'bg-[#E3F7EF]' : 'bg-amber-50'}`}>
            {allComplete && saved
              ? <Check className="w-4 h-4 text-[#22A06B]" strokeWidth={3} />
              : <AlertCircle className="w-4 h-4 text-amber-500" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 mb-0.5">Patientendaten</p>
            {allComplete && saved ? (
              <p className="text-sm font-bold text-gray-900">Vollständig ausgefüllt</p>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-900">Unvollständig</p>
                <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Bitte ergänzen</span>
              </div>
            )}
          </div>
          <div className="w-7 h-7 rounded-full bg-[#F5EDF6] flex items-center justify-center flex-shrink-0">
            <ChevronDown className={`w-4 h-4 text-[#9B1FA1] transition-transform ${patientOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {patientOpen && (
          <div className="border-t border-gray-100 p-3 bg-gray-50">
          <div className="rounded-2xl border-2 border-[#9B1FA1] overflow-hidden shadow-[0_0_0_4px_rgba(155,31,161,0.07)] bg-gray-50">

            {/* Colored header banner */}
            <div className="bg-[#F5EDF6] px-4 py-3 flex items-center gap-2.5 rounded-t-2xl">
              <div className="w-7 h-7 rounded-lg bg-[#9B1FA1] flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-[#9B1FA1]">Patientendaten ausfüllen</p>
                <p className="text-xs text-[#9B1FA1]/70">Damit Pflegekräfte sich optimal vorbereiten können</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-3">
              <div className="flex gap-1 flex-1">
                {STEP_LABELS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setStep(i)}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      i < step ? 'bg-[#9B1FA1]' : i === step ? 'bg-[#9B1FA1]/30' : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-gray-600 flex-shrink-0 font-medium">
                {STEP_LABELS[step]} ({step + 1}/{STEP_LABELS.length})
              </span>
            </div>

            <div className="px-4 pb-5 space-y-3 bg-gray-50">

              {/* Step heading */}
              <div className="pt-1 pb-1 border-b border-gray-100">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {step === 0 && 'Angaben zur betreuten Person'}
                  {step === 1 && 'Pflegebedarf'}
                  {step === 2 && 'Wohnsituation'}
                </p>
              </div>

              {/* ── Step 1: Zur Person ── */}
              {step === 0 && (
                <>
                  {/* Anzahl Patienten toggle */}
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      Anzahl zu betreuender Personen
                      <button type="button" onClick={() => setPriceInfo(priceInfo === 'anzahl' ? null : 'anzahl')} className="flex-shrink-0 text-gray-400 hover:text-[#9B1FA1] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                      </button>
                    </label>
                    {priceInfo === 'anzahl' && (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                        <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                        <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                      </div>
                    )}
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">1 Person</div>
                  </div>

                  {/* Patient 1 */}
                  {patient.anzahl !== '' && (
                    <>
                      {zwei && (
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-1">Person 1</p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Geschlecht <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.geschlecht} onChange={v => setPatient(p=>({...p,geschlecht:v}))}
                            options={['Männlich','Weiblich']} />
                        </div>
                        <div>
                          <label className={labelCls}>Geburtsjahr <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.geburtsjahr} onChange={v => setPatient(p=>({...p,geburtsjahr:v}))}
                            options={Array.from({length:70},(_,i)=>String(1931+i))} />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Pflegegrad <span className="text-red-400">*</span></label>
                        <CustomSelect value={patient.pflegegrad} onChange={v => setPatient(p=>({...p,pflegegrad:v}))}
                          options={['Kein/e','Pflegegrad 1','Pflegegrad 2','Pflegegrad 3','Pflegegrad 4','Pflegegrad 5']} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={labelCls}>Gewicht <span className="font-normal text-gray-400">(optional)</span></label>
                          <CustomSelect value={patient.gewicht} onChange={v => setPatient(p=>({...p,gewicht:v}))}
                            options={['Unter 50 kg','50–70 kg','70–90 kg','90–110 kg','Über 110 kg']} />
                        </div>
                        <div>
                          <label className={labelCls}>Größe <span className="font-normal text-gray-400">(optional)</span></label>
                          <CustomSelect value={patient.groesse} onChange={v => setPatient(p=>({...p,groesse:v}))}
                            options={['Unter 155 cm','155–165 cm','165–175 cm','175–185 cm','Über 185 cm']} />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Patient 2 */}
                  {zwei && (
                    <>
                      <div className="border-t border-gray-100 pt-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Person 2</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>Geschlecht <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_geschlecht} onChange={v => setPatient(p=>({...p,p2_geschlecht:v}))}
                              options={['Männlich','Weiblich']} />
                          </div>
                          <div>
                            <label className={labelCls}>Geburtsjahr <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_geburtsjahr} onChange={v => setPatient(p=>({...p,p2_geburtsjahr:v}))}
                              options={Array.from({length:70},(_,i)=>String(1931+i))} />
                          </div>
                        </div>
                        <div className="mt-2">
                          <label className={labelCls}>Pflegegrad <span className="text-red-400">*</span></label>
                          <CustomSelect value={patient.p2_pflegegrad} onChange={v => setPatient(p=>({...p,p2_pflegegrad:v}))}
                            options={['Kein/e','Pflegegrad 1','Pflegegrad 2','Pflegegrad 3','Pflegegrad 4','Pflegegrad 5']} />
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div>
                            <label className={labelCls}>Gewicht <span className="font-normal text-gray-400">(optional)</span></label>
                            <CustomSelect value={patient.p2_gewicht} onChange={v => setPatient(p=>({...p,p2_gewicht:v}))}
                              options={['Unter 50 kg','50–70 kg','70–90 kg','90–110 kg','Über 110 kg']} />
                          </div>
                          <div>
                            <label className={labelCls}>Größe <span className="font-normal text-gray-400">(optional)</span></label>
                            <CustomSelect value={patient.p2_groesse} onChange={v => setPatient(p=>({...p,p2_groesse:v}))}
                              options={['Unter 155 cm','155–165 cm','165–175 cm','175–185 cm','Über 185 cm']} />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Step 2: Pflegebedarf ── */}
              {step === 1 && (
                <>
                  {zwei && (
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Person 1</p>
                  )}
                  <div>
                    <label className={`${labelCls} flex items-center gap-1.5`}>
                      Mobilität
                      <button type="button" onClick={() => setPriceInfo(priceInfo === 'mobilitaet' ? null : 'mobilitaet')} className="flex-shrink-0 text-gray-400 hover:text-[#9B1FA1] transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                      </button>
                    </label>
                    {priceInfo === 'mobilitaet' && (
                      <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                        <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                        <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                      </div>
                    )}
                    <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">{patient.mobilitaet}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Heben erforderlich? <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.heben} onChange={v => setPatient(p=>({...p,heben:v}))}
                        options={['Ja','Nein']} />
                    </div>
                    <div>
                      <label className={labelCls}>Demenz <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.demenz} onChange={v => setPatient(p=>({...p,demenz:v}))}
                        options={['Nein','Leichtgradig','Mittelgradig','Schwer']} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Inkontinenz <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.inkontinenz} onChange={v => setPatient(p=>({...p,inkontinenz:v}))}
                        options={['Nein','Harninkontinenz','Stuhlinkontinenz','Beides']} />
                    </div>
                    <div>
                      <label className={`${labelCls} flex items-center gap-1.5`}>
                        Nachteinsätze
                        <button type="button" onClick={() => setPriceInfo(priceInfo === 'nacht' ? null : 'nacht')} className="flex-shrink-0 text-gray-400 hover:text-[#9B1FA1] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                        </button>
                      </label>
                      {priceInfo === 'nacht' && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                          <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                          <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                        </div>
                      )}
                      <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">{patient.nacht}</div>
                    </div>
                  </div>

                  {/* Patient 2 Pflegebedarf */}
                  {zwei && (
                    <div className="border-t border-gray-100 pt-3">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Person 2</p>
                      <div className="space-y-3">
                        <div>
                          <label className={`${labelCls} flex items-center gap-1.5`}>Mobilität <span className="text-red-400">*</span><svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg></label>
                          <CustomSelect value={patient.p2_mobilitaet} onChange={v => setPatient(p=>({...p,p2_mobilitaet:v}))}
                            options={['Vollständig mobil','Am Gehstock','Rollatorfähig','Rollstuhlfähig','Bettlägerig']} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>Heben erforderlich? <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_heben} onChange={v => setPatient(p=>({...p,p2_heben:v}))}
                              options={['Ja','Nein']} />
                          </div>
                          <div>
                            <label className={labelCls}>Demenz <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_demenz} onChange={v => setPatient(p=>({...p,p2_demenz:v}))}
                              options={['Nein','Leichtgradig','Mittelgradig','Schwer']} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className={labelCls}>Inkontinenz <span className="text-red-400">*</span></label>
                            <CustomSelect value={patient.p2_inkontinenz} onChange={v => setPatient(p=>({...p,p2_inkontinenz:v}))}
                              options={['Nein','Harninkontinenz','Stuhlinkontinenz','Beides']} />
                          </div>
                          <div>
                            <label className={`${labelCls} flex items-center gap-1.5`}>Nachteinsätze <span className="text-red-400">*</span><svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg></label>
                            <CustomSelect value={patient.p2_nacht} onChange={v => setPatient(p=>({...p,p2_nacht:v}))}
                              options={['Nein','Bis zu 1 Mal','1–2 Mal','Mehr als 2']} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className={labelCls}>Weitere Diagnosen <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.diagnosen} onChange={set('diagnosen')}
                      placeholder="z.B. Parkinson, Herzinsuffizienz, Diabetes…"
                      rows={2} className={`${inputCls} resize-none`} />
                  </div>
                </>
              )}

              {/* ── Step 3: Wohnsituation ── */}
              {step === 2 && (
                <>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="col-span-2">
                      <label className={labelCls}>PLZ <span className="text-red-400">*</span></label>
                      <input value={patient.plz} onChange={set('plz')} placeholder="80331" maxLength={5} className={inputCls} />
                    </div>
                    <div className="col-span-3">
                      <label className={labelCls}>Ort <span className="text-red-400">*</span></label>
                      <input value={patient.ort} onChange={set('ort')} placeholder="München" className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Weitere Personen im Haushalt <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.haushalt} onChange={v => setPatient(p=>({...p,haushalt:v}))}
                      options={['Alleine lebend','Ehepartner/in','Kind/er','Andere Familienangehörige','Weitere Personen']} />
                  </div>
                  <div>
                    <label className={labelCls}>Familie in der Nähe (bis 20 km) <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.familieNahe} onChange={v => setPatient(p=>({...p,familieNahe:v}))}
                      options={['Ja','Nein']} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Urbanisation <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.urbanisierung} onChange={v => setPatient(p=>({...p,urbanisierung:v}))}
                        options={['Großstadt','Kleinstadt','Dorf/Land']} />
                    </div>
                    <div>
                      <label className={labelCls}>Wohnungstyp <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.wohnungstyp} onChange={v => setPatient(p=>({...p,wohnungstyp:v}))}
                        options={['Einfamilienhaus','Wohnung in Mehrfamilienhaus','Andere']} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Unterbringung der PK</label>
                      <CustomSelect value={patient.unterbringung} onChange={v => setPatient(p=>({...p,unterbringung:v}))}
                        options={['Zimmer in den Räumlichkeiten','Gesamter Bereich','Zimmer extern','Bereich extern']} />
                    </div>
                    <div>
                      <label className={labelCls}>Internet vorhanden? <span className="text-red-400">*</span></label>
                      <CustomSelect value={patient.internet} onChange={v => setPatient(p=>({...p,internet:v}))}
                        options={['Ja','Nein']} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Haustiere <span className="font-normal text-gray-400">(opt.)</span></label>
                    <CustomSelect value={patient.tiere} onChange={v => setPatient(p=>({...p,tiere:v}))}
                      options={['Keine','Hund','Katze','Andere']} placeholder="Keine" />
                  </div>
                  <div>
                    <label className={labelCls}>Pflegedienst kommt? <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.pflegedienst} onChange={v => setPatient(p=>({...p,pflegedienst:v}))}
                      options={['Ja','Nein','Geplant']} />
                  </div>
                </>
              )}

              {/* ── Step 4: Wünsche zur PK ── */}
              {step === 3 && (
                <>
                  <div>
                    <label className={labelCls}>Gewünschtes Geschlecht der PK <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.wunschGeschlecht} onChange={v => setPatient(p=>({...p,wunschGeschlecht:v}))}
                      options={['Egal','Weiblich','Männlich']} />
                  </div>

                  {/* Preisrelevante Felder – read-only */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                        Sprachniveau
                        <button type="button" onClick={() => setPriceInfo(priceInfo === 'sprache' ? null : 'sprache')} className="flex-shrink-0 text-gray-400 hover:text-[#9B1FA1] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                        </button>
                      </label>
                      {priceInfo === 'sprache' && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                          <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                          <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                        </div>
                      )}
                      <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">mind. B1</div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-600 mb-1.5 flex items-center gap-1.5">
                        Führerschein
                        <button type="button" onClick={() => setPriceInfo(priceInfo === 'fuehrerschein' ? null : 'fuehrerschein')} className="flex-shrink-0 text-gray-400 hover:text-[#9B1FA1] transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4m0-4h.01"/></svg>
                        </button>
                      </label>
                      {priceInfo === 'fuehrerschein' && (
                        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 leading-relaxed flex items-start gap-2 mb-1">
                          <span>Dieser Wert basiert auf Ihrem Angebot und beeinflusst den Preis. Für Änderungen wenden Sie sich bitte an Ihren Berater.</span>
                          <button type="button" onClick={() => setPriceInfo(null)} className="text-gray-400 flex-shrink-0 font-bold">✕</button>
                        </div>
                      )}
                      <div className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-gray-50 cursor-not-allowed">Nicht erforderlich</div>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Darf die Betreuungsperson rauchen? <span className="text-red-400">*</span></label>
                    <CustomSelect value={patient.rauchen} onChange={v => setPatient(p=>({...p,rauchen:v}))}
                      options={['Ja','Nein']} />
                  </div>
                  <div>
                    <label className={labelCls}>Aufgaben der Pflegekraft <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.aufgaben} onChange={set('aufgaben')}
                      placeholder="z.B. Körperpflege, Mahlzeiten, Arztbegleitung, Einkäufe…"
                      rows={3} className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className={labelCls}>Sonstige Wünsche <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea value={patient.sonstigeWuensche} onChange={set('sonstigeWuensche')}
                      placeholder="z.B. Erfahrung mit Demenz, ruhige Person, tierlieb…"
                      rows={2} className={`${inputCls} resize-none`} />
                  </div>
                </>
              )}

              {/* Nav buttons */}
              <div className={`flex gap-2 pt-1 ${step > 0 ? 'justify-between' : 'justify-end'}`}>
                {step > 0 && (
                  <button
                    onClick={() => setStep(s => s - 1)}
                    className="px-4 py-2.5 text-sm font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    ← Zurück
                  </button>
                )}
                {step < STEP_LABELS.length - 1 ? (
                  <button
                    onClick={() => stepComplete(step) && setStep(s => s + 1)}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                      stepComplete(step)
                        ? 'bg-[#9B1FA1] hover:bg-[#7B1A85] text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Weiter →
                  </button>
                ) : (
                  <button
                    onClick={() => { if (allComplete) { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(patient)); setSaved(true); setPatientOpen(false); onPatientSaved?.(true); }}}
                    className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${
                      allComplete
                        ? 'bg-[#9B1FA1] hover:bg-[#7B1A85] text-white'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {allComplete ? '✓ Daten speichern' : 'Bitte alle Pflichtfelder ausfüllen'}
                  </button>
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>

    </div>
  );
};

// ─── Shared Nurse Row ─────────────────────────────────────────────────────────

const NurseRow: FC<{ nurse: Nurse }> = ({ nurse }) => {
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);
  const avgDur = nurse.history?.avgDurationMonths ?? 0;

  return (
    <div className="flex gap-3.5 items-start">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {nurse.image ? (
          <img
            src={nurse.image}
            alt={nurse.name}
            className="w-[68px] h-[68px] rounded-2xl object-cover"
          />
        ) : (
          <div
            className="w-[68px] h-[68px] rounded-2xl flex items-center justify-center text-xl font-bold text-white"
            style={{ backgroundColor: nurse.color }}
          >
            {inits}
          </div>
        )}
        {nurse.isLive && (
          <div className="absolute -top-1 -right-1 bg-[#22A06B] text-white text-xs font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
            </span>
            Live
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Row 1: Name + Age (left) | Availability badge (right) */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-[15px] font-bold text-gray-900 leading-tight truncate">
              {name}
            </span>
            <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
              {nurse.age} J.
            </span>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full border flex-shrink-0 ${
              nurse.availableSoon
                ? 'bg-[#E3F7EF] text-[#22A06B] border-[#B8E8D4]'
                : 'bg-[#FEF3E2] text-[#B45309] border-[#F9D99A]'
            }`}
          >
            {nurse.availability}
          </span>
        </div>

        {/* Row 2: Language bars + level */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs text-gray-500 whitespace-nowrap">Deutsch</span>
          <div className="flex gap-0.5 flex-shrink-0">
            {bars.map((f, i) => (
              <div
                key={i}
                className={`w-2.5 h-[5px] rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <span className="text-xs font-semibold text-gray-500 flex-shrink-0">
            {nurse.language.level}
          </span>
        </div>

        {/* Row 3: Experience · history */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-[#9B1FA1] whitespace-nowrap">
            {nurse.experience}
          </span>
          {nurse.history && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {nurse.history.assignments} Einsätze · Ø {avgDur.toFixed(1).replace('.', ',')} Mon.
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Application Card (pending) ───────────────────────────────────────────────

const AppCard: FC<{
  app: Application;
  exiting?: boolean;
  onReview: () => void;
  onDecline: (id: string) => void;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, exiting, onReview, onDecline, onNurseClick }) => {
  const { nurse, agencyName, appliedAt, message } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  return (
    <div
      className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
      style={exiting ? { animation: 'exitCard 0.32s ease-in forwards' } : undefined}
    >
      {/* Header band — always visible */}
      <div className="flex items-center justify-between px-5 py-2 bg-[#F5EDF6] border-b border-[#EDD9EF]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#9B1FA1]">Bewerbung</span>
          {app.status === 'new' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#E3F7EF] text-[#22A06B] border border-[#B8E8D4]">Neu</span>
          )}
          {app.isInvited && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EDD9EF] text-[#9B1FA1] border border-[#D8A9DC]">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Eingeladen
            </span>
          )}
        </div>
        <span className="text-[10px] text-[#9B1FA1]">{app.appliedAt}</span>
      </div>

      {/* Clickable nurse row → opens profile */}
      {/* Nurse info — clickable */}
      <div className="px-5 pt-5 pb-5 cursor-pointer active:bg-gray-50" onClick={() => onNurseClick(nurse)}>
        <div className="flex items-center gap-4">
          {/* Photo */}
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold text-white"
                style={{ backgroundColor: nurse.color }}>
                {inits}
              </div>
            )}
          </div>

          {/* Name + details */}
          <div className="flex-1 min-w-0">
            {/* Zeile 1: Name + Alter | Level-Badge */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <p className="text-base font-bold text-gray-900 leading-tight">{name}</p>
                <span className="text-sm text-gray-400 flex-shrink-0">{nurse.age} J.</span>
              </div>
              {(() => { const lvl = nurseLevel(nurse.history?.assignments ?? 0); return (
                <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2.5 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                  <span className="text-sm leading-none">{lvl.emoji}</span>
                  {lvl.label}
                </span>
              ); })()}
            </div>
            {/* Zeile 2: Sprache */}
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {bars.map((f, i) => (
                  <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />
                ))}
              </div>
              <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
            </div>
            {/* Zeile 3: Erfahrung + Einsätze in einer Zeile */}
            <p className="text-sm text-gray-500 truncate">
              <span className="font-semibold text-[#9B1FA1]">{nurse.experience}</span>
              {nurse.history && <span> · {nurse.history.assignments} Eins. · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Cost + Message — Teil der Bewerbung, zusammen */}
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="bg-[#F5EDF6] rounded-xl px-4 py-3 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{app.offer.anreisedatum} – {app.offer.abreisedatum}</p>
              <p className="text-xs text-gray-500">Reisekosten á {app.offer.anreisekosten} €</p>
              <p className="text-xs text-gray-500">{app.offer.kuendigungsfrist}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[10px] text-gray-500 mb-0.5">Mtl. Betreuungskosten</p>
              <p className="text-xl font-bold text-[#9B1FA1]">{app.offer.monatlicheKosten.toLocaleString('de-DE')} €</p>
            </div>
          </div>
        </div>
        {message && (
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 border-l-2 border-[#D8A9DC] pl-3">„{message}"</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-5 pb-5 pt-1">
        <button
          onClick={() => onDecline(app.id)}
          className="text-sm text-gray-400 hover:text-gray-600 font-medium transition-colors"
        >
          Ablehnen
        </button>
        <button
          onClick={onReview}
          className="bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-2xl px-6 py-3 text-sm font-semibold transition-all"
        >
          Angebot prüfen →
        </button>
      </div>
    </div>
  );
};

// ─── Application Card (done / compact) ───────────────────────────────────────

const AppCardDone: FC<{
  app: Application;
  onNurseClick: (n: Nurse, app: Application) => void;
  onUndo: (id: string) => void;
}> = ({ app, onNurseClick, onUndo }) => {
  const { nurse, status } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {app.isInvited && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5EDF6] border-b border-[#E8D0EA]">
          <svg className="w-3 h-3 text-[#9B1FA1] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-[#9B1FA1]">Von Ihnen eingeladen</span>
        </div>
      )}
      <div
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => onNurseClick(nurse, app)}
      >
        {nurse.image ? (
          <img src={nurse.image} alt={nurse.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
            style={{ backgroundColor: nurse.color }}>
            {inits}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <span className="font-semibold text-sm text-gray-700">{name}</span>
        </div>
        {status === 'accepted' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] px-3 py-1.5 rounded-full border border-[#B8E8D4] flex-shrink-0">
            <Check className="w-3 h-3" /> Angenommen
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-3 py-1.5 rounded-full border border-gray-200 flex-shrink-0">
            <X className="w-3 h-3" /> Abgelehnt
          </span>
        )}
      </div>

      {status === 'declined' && (
        <div className="border-t border-gray-100 px-4 py-2 flex justify-end">
          <button
            onClick={() => onUndo(app.id)}
            className="text-xs font-semibold text-[#9B1FA1] hover:underline"
          >
            ↩ Ablehnung rückgängig machen
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Match Card ───────────────────────────────────────────────────────────────

const MatchCard: FC<{
  nurse: Nurse;
  status: NurseStatus;
  onNurseClick: () => void;
  onInvite?: () => boolean;
  onInviteConfirm?: () => void;
}> = ({ nurse, status, onNurseClick, onInvite, onInviteConfirm }) => {
  const [invitePhase, setInvitePhase] = useState<'idle'|'sending'|'done'>('idle');
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);

  const handleInvite = () => {
    const allowed = onInvite ? onInvite() : true;
    if (!allowed) return;
    setInvitePhase('sending');
    setTimeout(() => {
      setInvitePhase('done');
      setTimeout(() => {
        onInviteConfirm?.();
        setInvitePhase('idle');
      }, 2000);
    }, 2000);
  };

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all ${
        status === 'declined'
          ? 'opacity-40 border-gray-200'
          : status === 'invited'
          ? 'border-gray-200'
          : 'border-gray-200 hover:border-[#9B1FA1] hover:shadow-[0_4px_16px_rgba(155,31,161,0.12)]'
      }`}
    >
      {/* Clickable nurse info */}
      <div className="px-4 pt-4 pb-3 cursor-pointer active:bg-gray-50" onClick={onNurseClick}>
        <div className="flex items-center gap-3">
          {/* Photo */}
          <div className="flex-shrink-0">
            {nurse.image ? (
              <img src={nurse.image} alt={nurse.name} className="w-14 h-14 rounded-2xl object-cover" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                style={{ backgroundColor: nurse.color }}>
                {inits}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Zeile 1: Name + Alter | Level-Badge */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="font-bold text-gray-900 leading-tight">{name}</span>
                <span className="text-sm text-gray-400 flex-shrink-0">{nurse.age} J.</span>
              </div>
              {(() => { const lvl = nurseLevel(nurse.history?.assignments ?? 0); return (
                <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2.5 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                  <span className="text-sm leading-none">{lvl.emoji}</span>
                  {lvl.label}
                </span>
              ); })()}
            </div>
            {/* Zeile 2: Sprache */}
            <div className="flex items-center gap-2 mb-1">
              <div className="flex gap-0.5">
                {bars.map((f, i) => (
                  <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />
                ))}
              </div>
              <span className="text-sm text-gray-500">Deutsch {nurse.language.level}</span>
            </div>
            {/* Zeile 3: Erfahrung + Einsätze in einer Zeile */}
            <p className="text-sm text-gray-500 truncate">
              <span className="font-semibold text-[#9B1FA1]">{nurse.experience}</span>
              {nurse.history && <span> · {nurse.history.assignments} Eins. · Ø {Math.round(nurse.history.avgDurationMonths * 4.3)} Wo.</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between">
        <button
          onClick={onNurseClick}
          className="text-sm font-semibold text-[#9B1FA1] flex items-center gap-1 hover:underline"
        >
          Details <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
        </button>
        {status === 'invited' ? (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <Check className="w-3.5 h-3.5 text-[#22A06B]" /> Einladung gesendet
          </span>
        ) : invitePhase === 'sending' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#9B1FA1] bg-[#F5EDF6] border border-[#D8A9DC] px-4 py-1.5 rounded-full">
            <svg className="w-3 h-3 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            wird eingeladen…
          </span>
        ) : invitePhase === 'done' ? (
          <span className="flex items-center gap-1.5 text-xs font-bold text-[#22A06B] bg-[#E3F7EF] border border-[#B8E8D4] px-4 py-1.5 rounded-full">
            <Check className="w-3 h-3 flex-shrink-0" /> wurde eingeladen!
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); handleInvite(); }}
            className="text-xs font-bold bg-[#F5EDF6] text-[#9B1FA1] border border-[#D8A9DC] px-4 py-1.5 rounded-full hover:bg-[#EDD9EF] transition-colors active:scale-95"
          >
            Einladen
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Info Popup ───────────────────────────────────────────────────────────────

const InfoPopup: FC<{ onClose: () => void }> = ({ onClose }) => (
  <>
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease-out' }} />
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
      style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
        style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pt-4 pb-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Wie funktioniert das Einladen?</h2>
              <p className="text-xs text-gray-600 mt-0.5">Alles Wichtige auf einen Blick</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          {/* Unverbindlich */}
          <div className="bg-[#E3F7EF] border border-[#B8E8D4] rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl flex-shrink-0">✅</span>
            <p className="text-sm font-semibold text-[#1a7a4f]">
              Völlig unverbindlich — Sie gehen keinerlei Verpflichtung ein.
            </p>
          </div>

          {/* Benefits list */}
          <div className="space-y-3.5">
            {[
              { emoji: '🔍', title: 'Vorausgewählte Pflegekräfte', text: 'Wir haben Pflegekräfte bereits auf Basis Ihrer Anfrage gefiltert — nur passende Profile werden Ihnen vorgeschlagen.' },
              { emoji: '📩', title: 'Sofortige Benachrichtigung auf dem Handy', text: 'Die Pflegekraft erhält Ihre Einladung direkt als Nachricht auf ihr Handy und kann sofort reagieren und sich offiziell bewerben.' },
            ].map(item => (
              <div key={item.title} className="flex gap-3">
                <span className="text-xl flex-shrink-0 mt-0.5">{item.emoji}</span>
                <div>
                  <p className="text-sm font-bold text-gray-800 mb-0.5">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.text}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onClose}
            className="w-full bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-xl py-3 text-sm font-bold transition-colors"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  </>
);

// ─── Contact Popup ────────────────────────────────────────────────────────────

const MEDIA_LOGOS = [
  { src: '/media-welt.webp',      alt: 'Die Welt' },
  { src: '/media-bildderfau.webp', alt: 'Bild der Frau' },
  { src: '/media-faz.webp',       alt: 'FAZ' },
  { src: '/media-ard.webp',       alt: 'ARD' },
  { src: '/media-ndr.webp',       alt: 'NDR' },
  { src: '/media-sat1.webp',      alt: 'SAT.1' },
];

const ContactPopup: FC<{ onClose: () => void }> = ({ onClose }) => (
  <>
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    />
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
      style={{ animation: 'fadeIn 0.15s ease-out' }}
    >
      <div
        className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl overflow-hidden"
        style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-9 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="px-5 pt-4 pb-6 space-y-5">

          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Ihre Beraterin</p>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Advisor row */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <img
                src="/ilka.webp"
                alt="Ilka Wysocki"
                className="w-[72px] h-[72px] rounded-2xl object-cover object-top"
                style={{ border: '1.5px solid #F0C4B4' }}
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
              <p className="text-xs text-gray-500 mb-2.5">Pflegeberaterin · Primundus</p>
              <a
                href="tel:089200000830"
                className="inline-flex items-center gap-1.5 text-[#9B1FA1] font-bold text-sm hover:opacity-80 transition-opacity"
              >
                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                089 200 000 830
              </a>
              <p className="text-xs text-gray-500 mt-0.5">Mo–So, 8:00–18:00 Uhr</p>
            </div>
          </div>

          {/* Trust row */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
              <img src="/badge-testsieger.webp" alt="Testsieger" className="h-8 w-auto mx-auto mb-1.5 object-contain" />
              <p className="text-xs font-semibold text-gray-500 leading-tight">Testsieger<br/>Die Welt</p>
            </div>
            <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
              <div className="flex justify-center mb-1.5">
                <svg className="w-6 h-6 text-[#9B1FA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-gray-500 leading-tight">20+ Jahre<br/>Erfahrung</p>
            </div>
            <div className="text-center bg-gray-50 rounded-xl py-3 px-1 border border-gray-100">
              <div className="flex justify-center mb-1.5">
                <svg className="w-6 h-6 text-[#9B1FA1]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-xs font-semibold text-gray-500 leading-tight">60.000+<br/>Einsätze</p>
            </div>
          </div>

          {/* Media logos */}
          <div>
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider text-center mb-2.5">Bekannt aus</p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {MEDIA_LOGOS.map(logo => (
                <img
                  key={logo.alt}
                  src={logo.src}
                  alt={logo.alt}
                  title={logo.alt}
                  className="h-4 w-auto object-contain opacity-50 grayscale"
                />
              ))}
            </div>
          </div>

          {/* CTA */}
          <a
            href="tel:089200000830"
            className="flex items-center justify-center gap-2 w-full bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-xl py-3 text-sm font-bold transition-colors"
          >
            <Phone className="w-4 h-4" />
            Jetzt anrufen
          </a>
        </div>
      </div>
    </div>
  </>
);

// ─── Decline Confirm Modal ────────────────────────────────────────────────────

const DeclineConfirmModal: FC<{
  app: Application;
  onCancel: () => void;
  onConfirm: (message: string) => void;
}> = ({ app, onCancel, onConfirm }) => {
  const [message, setMessage] = useState('');
  const { nurse } = app;
  const name = displayName(nurse.name);
  const inits = initials(nurse.name);
  const lvl = nurseLevel(nurse.history?.assignments ?? 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]" onClick={onCancel}
        style={{ animation: 'fadeIn 0.15s ease-out' }} />
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.15s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl pointer-events-auto shadow-2xl"
          style={{ animation: 'slideSheet 0.25s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          <div className="px-5 pt-4 pb-5 space-y-4">
            {/* Header */}
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bewerbung ablehnen</h2>
              <p className="text-sm text-gray-600 mt-0.5">Die Agentur wird über die Absage informiert.</p>
            </div>

            {/* Nurse card */}
            <div className="flex items-center gap-3.5 bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-200">
              <div className="flex-shrink-0">
                {nurse.image ? (
                  <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-bold text-white"
                    style={{ backgroundColor: nurse.color }}>
                    {inits}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-bold text-base text-gray-900">{name}</span>
                  <span className="text-sm text-gray-500">{nurse.age} J.</span>
                  <span className={`flex items-center gap-0.5 text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                    <span className="text-xs leading-none">{lvl.emoji}</span>{lvl.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{nurse.experience}</p>
              </div>
            </div>

            {/* Optional message */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nachricht an die Agentur <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="z.B. Die Pflegekraft passt leider nicht zu unserem Patienten…"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#9B1FA1] focus:ring-2 focus:ring-[#9B1FA1]/10 transition-all resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 border-2 border-gray-200 text-gray-700 rounded-xl py-3 text-base font-semibold hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
              <button
                onClick={() => onConfirm(message)}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl py-3 text-base font-bold transition-colors"
              >
                Ablehnen
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Angebot Prüfen Modal (2-step) ───────────────────────────────────────────

const AngebotPruefenModal: FC<{
  app: Application;
  onClose: () => void;
  onAccept: (id: string) => void;
  onNurseClick: (n: Nurse) => void;
}> = ({ app, onClose, onAccept, onNurseClick }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const { nurse, agencyName, offer } = app;
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);

  // Step 2 form state
  const [anrede, setAnrede] = useState('Frau');
  const [vorname, setVorname] = useState('Hildegard');
  const [nachname, setNachname] = useState('Müller');
  const [strasse, setStrasse] = useState('Rosenstraße 12');
  const [einsatzort, setEinsatzort] = useState('80331, München');
  const [telefon, setTelefon] = useState('');
  const [email, setEmail] = useState('');
  const [kpAnrede, setKpAnrede] = useState('');
  const [kpVorname, setKpVorname] = useState('');
  const [kpNachname, setKpNachname] = useState('');
  const [kpTelefon, setKpTelefon] = useState('');
  const [kpEmail, setKpEmail] = useState('');
  const [agbChecked, setAgbChecked] = useState(false);
  const canAccept = vorname.trim() !== '' && nachname.trim() !== '' && einsatzort.trim() !== ''
    && kpVorname.trim() !== '' && kpNachname.trim() !== '' && kpTelefon.trim() !== '' && agbChecked;

  // Monthly summary data (mock, based on offer)
  const tagessatz = Math.round(offer.monatlicheKosten / 30);
  const summary = [
    { monat: 'Mai 2026', betrag: offer.monatlicheKosten, details: [`${tagessatz} €/Tag × 31 Tage`, `+ ${offer.anreisekosten} € Anreise`] },
    { monat: 'Juni 2026', betrag: offer.monatlicheKosten, details: [`${tagessatz} €/Tag × 30 Tage`] },
    { monat: 'Juli 2026', betrag: Math.round(tagessatz * 12 + offer.abreisekosten), details: [`${tagessatz} €/Tag × 12 Tage`, `+ ${offer.abreisekosten} € Abreise`] },
  ];
  const gesamt = summary.reduce((s, m) => s + m.betrag, 0);

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm text-gray-800 focus:outline-none focus:border-[#9B1FA1] focus:ring-2 focus:ring-[#9B1FA1]/10 transition-all bg-white';
  const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5';

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Header */}
          <div className="px-5 pt-5 pb-0 flex-shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {step === 1 ? 'Angebot prüfen' : 'Betreuungskraft auswählen'}
                </h2>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors flex-shrink-0 mt-0.5">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Step tabs */}
            <div className="flex border-b border-gray-100 mt-1">
              <button
                onClick={() => setStep(1)}
                className={`flex items-center gap-1.5 px-1 pb-2.5 text-xs font-semibold mr-5 border-b-2 transition-colors ${step === 1 ? 'border-[#9B1FA1] text-[#9B1FA1]' : 'border-transparent text-gray-400'}`}
              >
                {step === 2 && <Check className="w-3 h-3 text-[#22A06B]" />}
                1 · Angebot
              </button>
              <button
                className={`flex items-center gap-1.5 px-1 pb-2.5 text-xs font-semibold border-b-2 transition-colors ${step === 2 ? 'border-[#9B1FA1] text-[#9B1FA1]' : 'border-transparent text-gray-400'}`}
              >
                2 · Vertrag &amp; Bestätigung
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto flex-1">

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <div className="p-5 space-y-5">
                {/* Nurse mini-card */}
                <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                  <div className="w-12 h-12 rounded-xl flex-shrink-0 overflow-hidden">
                    {nurse.image ? (
                      <img src={nurse.image} alt={nurse.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>
                        {inits}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900">{name}</p>
                    <p className="text-sm text-gray-500">{nurse.age} J. · {nurse.experience} · Deutsch {nurse.language.level}</p>
                  </div>
                  <button onClick={() => onNurseClick(nurse)} className="text-sm font-semibold text-[#9B1FA1] hover:underline flex-shrink-0">
                    Profil →
                  </button>
                </div>

                {/* Bewerbungstext — prominent */}
                {app.message && (
                  <div>
                    <p className="text-sm font-bold text-gray-700 mb-2">Nachricht der Agentur</p>
                    <div className="border-l-4 border-[#9B1FA1] pl-4 py-1">
                      <p className="text-sm text-gray-600 leading-relaxed">„{app.message}"</p>
                    </div>
                  </div>
                )}

                {/* Konditionen */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-700">Konditionen</p>
                    <p className="text-xs text-gray-400">{offer.submittedAt}</p>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    {[
                      { label: 'Mtl. Betreuungskosten', value: `${offer.monatlicheKosten.toLocaleString('de-DE')} €`, bold: true },
                      { label: 'Anreisedatum', value: offer.anreisedatum },
                      { label: 'Abreisedatum', value: `Vorauss. ${offer.abreisedatum}` },
                      { label: 'Anreisekosten', value: `${offer.anreisekosten} €` },
                      { label: 'Abreisekosten', value: `${offer.abreisekosten} €` },
                      { label: 'Reisetage', value: offer.reisetage },
                      { label: 'Feiertagszuschlag', value: offer.feiertagszuschlag === 0 ? '0 €' : `${offer.feiertagszuschlag} €/Tag` },
                      { label: 'Kündigungsfrist', value: offer.kuendigungsfrist },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between px-4 py-2.5 bg-white">
                        <span className="text-sm text-gray-500">{row.label}</span>
                        <span className={`text-sm ${(row as any).bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
              <div className="p-5 space-y-5">
                {/* Hauptpatient */}
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-3">Hauptpatient (Vertragspartner)</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Anrede</label>
                        <select value={anrede} onChange={e => setAnrede(e.target.value)} className={inputCls}>
                          <option>Frau</option><option>Herr</option><option>Divers</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Titel</label>
                        <select className={inputCls}>
                          <option>Kein Titel</option><option>Dr.</option><option>Prof.</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Vorname *</label>
                        <input value={vorname} onChange={e => setVorname(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Nachname *</label>
                        <input value={nachname} onChange={e => setNachname(e.target.value)} className={inputCls} />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Straße und Hausnummer</label>
                      <input value={strasse} onChange={e => setStrasse(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Einsatzort *</label>
                      <input value={einsatzort} onChange={e => setEinsatzort(e.target.value)} className={inputCls} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Telefon</label>
                        <input value={telefon} onChange={e => setTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>E-Mail</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Kontaktperson */}
                <div>
                  <p className="text-sm font-bold text-gray-700 mb-0.5">Kontaktperson <span className="text-gray-400 font-normal">(in Notfällen)</span></p>
                  <p className="text-sm text-gray-400 mb-3">Wen sollen wir bei Notfällen kontaktieren?</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Anrede</label>
                        <select value={kpAnrede} onChange={e => setKpAnrede(e.target.value)} className={inputCls}>
                          <option value="">Bitte wählen</option>
                          <option>Frau</option><option>Herr</option><option>Divers</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Vorname *</label>
                        <input value={kpVorname} onChange={e => setKpVorname(e.target.value)} placeholder="Vorname" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Nachname *</label>
                        <input value={kpNachname} onChange={e => setKpNachname(e.target.value)} placeholder="Nachname" className={inputCls} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={labelCls}>Telefon *</label>
                        <input value={kpTelefon} onChange={e => setKpTelefon(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>E-Mail</label>
                        <input value={kpEmail} onChange={e => setKpEmail(e.target.value)} placeholder="Bitte eingeben" className={inputCls} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                {/* Summary box */}
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden">
                      {nurse.image ? (
                        <img src={nurse.image} alt={nurse.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: nurse.color }}>{inits}</div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-700">Zusammenfassung</p>
                      <p className="text-sm text-gray-500">{name}</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-100">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <span className="text-sm text-gray-500">Anreise</span>
                      <span className="text-sm font-semibold text-gray-700">{offer.anreisedatum}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-2.5 bg-white">
                      <span className="text-sm text-gray-500">Abreise</span>
                      <span className="text-sm font-semibold text-gray-700">{offer.abreisedatum}</span>
                    </div>
                    {summary.map(m => (
                      <div key={m.monat} className="px-4 py-2.5 bg-white">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">{m.monat}</span>
                          <span className="text-sm font-bold text-gray-900">{m.betrag.toLocaleString('de-DE')} €</span>
                        </div>
                        {m.details.map(d => (
                          <p key={d} className="text-xs text-gray-400 text-right mt-0.5">{d}</p>
                        ))}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2 px-1">Reisekosten werden nach <em>halben Tag</em> berechnet. Provision ist im Monatspreis enthalten.</p>
                </div>

                {/* AGB Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer p-4 bg-gray-50 border border-gray-200 rounded-xl" onClick={() => setAgbChecked(v => !v)}>
                  <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-all ${agbChecked ? 'bg-[#9B1FA1] border-[#9B1FA1]' : 'border-gray-300 bg-white'}`}>
                    {agbChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                  </div>
                  <span className="text-sm text-gray-600 leading-relaxed">
                    Ich akzeptiere das Angebot verbindlich und bestätige, dass alle Angaben korrekt sind. Der Vertrag wird direkt mit der Agentur geschlossen.
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`flex gap-2.5 px-5 py-4 border-t border-gray-100 flex-shrink-0 ${step === 2 ? 'flex-row' : 'flex-col'}`}>
            {step === 1 ? (
              <button
                onClick={() => setStep(2)}
                className="w-full bg-[#9B1FA1] hover:bg-[#7B1A85] text-white rounded-xl py-3.5 text-sm font-bold transition-all"
              >
                Weiter →
              </button>
            ) : (
              <>
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 px-4 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-all flex-shrink-0"
                >
                  ← Zurück
                </button>
                <button
                  onClick={() => canAccept && onAccept(app.id)}
                  disabled={!canAccept}
                  className={`flex-1 rounded-xl py-3 text-sm font-bold transition-all ${canAccept ? 'bg-[#9B1FA1] hover:bg-[#7B1A85] text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  Betreuungskraft akzeptieren
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Offer Modal ──────────────────────────────────────────────────────────────

const OfferModal: FC<{ onClose: () => void }> = ({ onClose }) => (
  <>
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    />
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 pointer-events-none"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full pointer-events-auto shadow-2xl"
        style={{ animation: 'slideUp 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Meine Anfrage</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Startdatum', value: '01.05.2026' },
              { label: 'Ort', value: '80331 München' },
              { label: 'Patient', value: '1 Person · 78 Jahre' },
              { label: 'Mobilität', value: 'Rollstuhlfahrer' },
              { label: 'Laufzeit', value: 'Unbegrenzt' },
              { label: 'Sprachkenntnisse', value: 'mind. B1' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-3.5">
                <div className="text-xs text-gray-600 mb-0.5">{item.label}</div>
                <div className="font-semibold text-gray-900 text-sm">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="bg-[#F5EDF6] rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
            Mein Vater (78 J.) benötigt Unterstützung bei der täglichen Körperpflege, den
            Mahlzeiten und der Mobilität. Er sitzt im Rollstuhl und benötigt Begleitung bei
            Arztbesuchen. Erfahrung mit Demenz ist von Vorteil.
          </div>
          <div className="flex items-center gap-3 pt-1">
            <div className="w-10 h-10 rounded-xl bg-[#9B1FA1] text-white flex items-center justify-center font-bold flex-shrink-0">
              M
            </div>
            <div>
              <div className="font-bold text-gray-900 text-sm">Michael Müller</div>
              <div className="text-xs text-gray-500">
                michael.mueller@example.de · +49 89 12345678
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <style>{`
      @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
    `}</style>
  </>
);

// ─── Nurse Detail Modal (bottom sheet) ───────────────────────────────────────

// Deterministic mock profile data per nurse (seeded by name)
function seed(name: string) { return name.split('').reduce((a, c) => a + c.charCodeAt(0), 0); }

function mockProfile(nurse: Nurse) {
  const s = seed(nurse.name);
  const hobbysPool = ['Kochen', 'Spazierengehen', 'Musik', 'Lesen', 'Gartenarbeit', 'Yoga', 'Handarbeiten', 'Backen'];
  const persPool = ['fürsorglich', 'geduldig', 'empathisch', 'zuverlässig', 'herzlich', 'ruhig', 'humorvoll', 'strukturiert'];
  const sprachenPool = [['Englisch'], ['Englisch', 'Russisch'], ['Ukrainisch'], ['Englisch', 'Ukrainisch'], ['Russisch']];
  const schwerpunktePool = [
    ['24h-Betreuung', 'Körperpflege', 'Demenzpflege', 'Medikamentengabe'],
    ['24h-Betreuung', 'Mobilisierung', 'Wundversorgung', 'Sturzprophylaxe'],
    ['24h-Betreuung', 'Palliativpflege', 'Ernährungsberatung', 'Körperpflege'],
    ['24h-Betreuung', 'Demenzpflege', 'Gedächtnisübungen', 'Beschäftigungstherapie'],
  ];
  const mobPool = [
    ['Mobil', 'Rollstuhl', 'Gehhilfe', 'Bettlägerig'],
    ['Mobil', 'Rollstuhl', 'Bettlägerig'],
    ['Mobil', 'Gehhilfe'],
    ['Alle'],
  ];
  const demenzPool = ['Keine', 'Leichtgradig', 'Mittelgradig', 'Leichtgradig'];
  const nachtPool = ['Ja', 'Gelegentlich', 'Nein', 'Unwichtig'];
  const unterbringungPool = ['Eigenes Zimmer', 'Eigenes Zimmer', 'Eigenes Bad', 'Eigenes Zimmer'];
  const urbanPool = ['Großstadt', 'Kleinstadt', 'Unwichtig', 'Großstadt'];
  const gewichtPool = ['51–60 kg', '61–70 kg', '61–70 kg', '71–80 kg', '51–60 kg'];
  const groessePool = ['151–160 cm', '161–170 cm', '161–170 cm', '161–170 cm', '151–160 cm'];

  return {
    schwerpunkte: schwerpunktePool[s % schwerpunktePool.length],
    nationalitaet: 'Polnisch',
    geburtsjahr: String(2026 - nurse.age),
    gewicht: gewichtPool[s % gewichtPool.length],
    groesse: groessePool[s % groessePool.length],
    hobbys: [hobbysPool[s % hobbysPool.length], hobbysPool[(s + 2) % hobbysPool.length], hobbysPool[(s + 4) % hobbysPool.length]],
    persoenlichkeit: [persPool[s % persPool.length], persPool[(s + 1) % persPool.length], persPool[(s + 3) % persPool.length], persPool[(s + 5) % persPool.length]],
    fuehrerschein: s % 3 !== 0,
    raucher: s % 4 === 0 ? 'Ja, draußen' : 'Nein',
    pflegeberuf: s % 2 === 0,
    krankenpflegeJahre: `${(s % 5) + 1} Jahre`,
    andereSpachen: sprachenPool[s % sprachenPool.length],
    mobilitaet: mobPool[s % mobPool.length],
    demenz: demenzPool[s % demenzPool.length],
    nacht: nachtPool[s % nachtPool.length],
    tiere: s % 3 === 0 ? 'Nein' : 'Unwichtig',
    unterbringung: unterbringungPool[s % unterbringungPool.length],
    urbanisierung: urbanPool[s % urbanPool.length],
    patienten: s % 3 === 0 ? '1 Patient' : 'Unwichtig',
    heben: s % 2 === 0,
  };
}

const CustomerNurseModal: FC<{
  nurse: Nurse;
  onClose: () => void;
  app?: Application;
  onReview?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  onInvite?: () => void;
  onDeclineMatch?: () => void;
  isInvited?: boolean;
}> = ({ nurse, onClose, app, onReview, onDecline, onUndo, onInvite, onDeclineMatch, isInvited = false }) => {
  const [invited, setInvited] = useState(isInvited);
  const [invitePhaseModal, setInvitePhaseModal] = useState<'idle'|'sending'|'done'>('idle');

  const handleModalInvite = () => {
    setInvitePhaseModal('sending');
    setTimeout(() => {
      setInvitePhaseModal('done');
      setTimeout(() => {
        setInvited(true);
        onInvite?.();
        setInvitePhaseModal('idle');
      }, 2000);
    }, 2000);
  };
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 5 }, (_, i) => i < nurse.language.bars);
  const avgWo = nurse.history ? Math.round(nurse.history.avgDurationMonths * 4.3) : 0;
  const p = mockProfile(nurse);
  const lvl = nurseLevel(nurse.history?.assignments ?? 0);

  // Reusable row: emoji + label (gray) + value below (bold)
  const InfoRow = ({ emoji, label, value, chips }: { emoji: string; label: string; value?: string; chips?: string[] }) => (
    <div className="flex gap-3.5 py-3 border-b border-gray-100 last:border-0">
      <span className="text-xl w-7 flex-shrink-0 text-center leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        {value && <p className="text-sm font-bold text-gray-800">{value}</p>}
        {chips && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.map(c => <span key={c} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{c}</span>)}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }} />

      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[92dvh] overflow-hidden pointer-events-auto shadow-2xl flex flex-col"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Header: avatar + name + close */}
          <div className="px-5 pb-4 flex-shrink-0" style={{ backgroundColor: `${nurse.color}12` }}>
            <div className="flex items-start justify-between gap-3 pt-2">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {nurse.image ? (
                  <img src={nurse.image} alt={nurse.name} className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white border-2 border-white shadow"
                    style={{ backgroundColor: nurse.color }}>
                    {inits}
                  </div>
                )}
              </div>
              {/* Name + meta */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900 leading-tight">{name}</h2>
                  <span className={`flex items-center gap-1 text-xs font-bold pl-1.5 pr-2 py-0.5 rounded-full border flex-shrink-0 ${lvl.cls}`}>
                    <span className="text-sm leading-none">{lvl.emoji}</span>{lvl.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{nurse.age} Jahre</p>
                <span className={`inline-block mt-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                  nurse.availableSoon ? 'bg-[#E3F7EF] text-[#22A06B] border-[#B8E8D4]' : 'bg-[#FEF3E2] text-[#B45309] border-[#F9D99A]'
                }`}>
                  {nurse.availability}
                </span>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0 mt-1">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* 2 stat boxes: Erfahrung + Deutschkenntnisse */}
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Erfahrung</p>
                <p className="text-sm font-bold text-[#9B1FA1]">{nurse.experience}</p>
              </div>
              <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <p className="text-xs text-gray-600 mb-1">Deutschkenntnisse</p>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    {bars.map((f, i) => <div key={i} className={`w-3 h-1.5 rounded-full ${f ? 'bg-[#9B1FA1]' : 'bg-gray-200'}`} />)}
                  </div>
                  <span className="text-xs font-bold text-gray-700">{nurse.language.level}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">

            {/* Über die Pflegekraft */}
            <div className="px-5 pt-4 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-2">Über die Pflegekraft</h3>
              <div className="bg-[#F5EDF6] rounded-xl p-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  {name} verfügt über {nurse.experience} in der 24h-Betreuung älterer Menschen
                  und spricht Deutsch auf {nurse.language.level}-Niveau.
                  {nurse.history && ` Mit ${nurse.history.assignments} erfolgreich abgeschlossenen Einsätzen bringt sie bewährte Praxiserfahrung mit.`}
                  {' '}Sie ist {p.persoenlichkeit.slice(0, 2).join(' und ')} und legt großen Wert auf eine vertrauensvolle Beziehung zu Patient und Familie.
                </p>
              </div>
            </div>

            {/* Letzte Einsätze */}
            {nurse.detailedAssignments && nurse.detailedAssignments.length > 0 && (
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900">Letzte Einsätze</h3>
                  {nurse.history && (
                    <span className="text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-0.5 rounded-full">
                      {nurse.history.assignments} Einsätze · Ø {avgWo} Wo.
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {nurse.detailedAssignments.map((a, i) => (
                    <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Zeitraum</p><p className="text-xs font-semibold text-gray-800">{a.startDate} – {a.endDate}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Ort</p><p className="text-xs font-semibold text-gray-800">{a.postalCode} {a.city}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Patienten</p><p className="text-xs font-semibold text-gray-800">{a.patientCount} {a.patientCount === 1 ? 'Patient' : 'Patienten'}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Mobilität</p><p className="text-xs font-semibold text-gray-800">{a.mobility}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Über mich */}
            <div className="px-5 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Über mich</h3>
              <div className="divide-y divide-gray-100">
                <InfoRow emoji="👤" label="Geschlecht" value={nurse.gender === 'female' ? 'Weiblich' : 'Männlich'} />
                <InfoRow emoji="🌍" label="Nationalität" value={p.nationalitaet} />
                <InfoRow emoji="🎂" label="Geburtsjahr" value={p.geburtsjahr} />
                <InfoRow emoji="⚖️" label="Gewicht" value={p.gewicht} />
                <InfoRow emoji="📏" label="Größe" value={p.groesse} />
                <InfoRow emoji="🧠" label="Persönlichkeit" chips={p.persoenlichkeit} />
                <InfoRow emoji="🎯" label="Hobbys" chips={p.hobbys} />
              </div>
            </div>

            {/* Besondere Merkmale */}
            <div className="px-5 pb-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Besondere Merkmale</h3>
              <div className="divide-y divide-gray-100">
                <InfoRow emoji="🚗" label="Führerschein" value={p.fuehrerschein ? 'Ja' : 'Nein'} />
                <InfoRow emoji="🚬" label="Raucher" value={p.raucher} />
                <InfoRow emoji="🎓" label="Pflegeberuf erlernt" value={p.pflegeberuf ? 'Ja' : 'Nein'} />
                <InfoRow emoji="🏥" label="Erfahrung Krankenpflege" value={p.krankenpflegeJahre} />
                <InfoRow emoji="🌐" label="Andere Sprachkenntnisse" chips={p.andereSpachen} />
              </div>
            </div>

            {/* Berufliche Anforderungen */}
            <div className="px-5 pb-6">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Berufliche Anforderungen</h3>
              <div className="divide-y divide-gray-100">
                <InfoRow emoji="👥" label="Anzahl Patienten" value={p.patienten} />
                <InfoRow emoji="🦽" label="Akzeptierte Mobilität" chips={p.mobilitaet} />
                <InfoRow emoji="💪" label="Heben & Lagern" value={p.heben ? 'Ja' : 'Nein'} />
                <InfoRow emoji="🧩" label="Demenzausprägung" value={p.demenz} />
                <InfoRow emoji="🌙" label="Nachteinsätze" value={p.nacht} />
                <InfoRow emoji="🐾" label="Tiere im Haushalt" value={p.tiere} />
                <InfoRow emoji="🏠" label="Unterbringung" value={p.unterbringung} />
                <InfoRow emoji="🏙️" label="Urbanisierung" value={p.urbanisierung} />
              </div>
            </div>

          </div>

          {/* Footer — context-aware */}
          <div className="px-5 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
            {app ? (
              // Opened from application
              app.status === 'declined' ? (
                <button
                  onClick={() => { onUndo?.(); onClose(); }}
                  className="flex-1 bg-[#F5EDF6] text-[#9B1FA1] border border-[#D8A9DC] rounded-xl py-3 font-bold text-sm hover:bg-[#EDD9EF] transition-colors flex items-center justify-center gap-2"
                >
                  ↩ Ablehnung rückgängig machen
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onDecline?.()}
                    className="flex-1 border-2 border-red-100 bg-red-50 text-red-500 rounded-xl py-3 font-semibold text-sm hover:bg-red-100 transition-colors"
                  >
                    Ablehnen
                  </button>
                  <button
                    onClick={onReview}
                    className="flex-[2] bg-[#9B1FA1] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#7B1A85] transition-colors"
                  >
                    Angebot prüfen
                  </button>
                </>
              )
            ) : (
              // Opened from matches
              <>
                {!invited ? (
                  <>
                    <button
                      onClick={() => { onDeclineMatch?.(); }}
                      className="flex-1 border-2 border-gray-200 text-gray-500 rounded-xl py-3 font-semibold text-sm hover:bg-gray-50 transition-colors"
                    >
                      Nein danke
                    </button>
                    {invitePhaseModal === 'sending' ? (
                      <div className="flex-[2] bg-[#F5EDF6] text-[#9B1FA1] rounded-xl py-3 font-bold text-sm border border-[#D8A9DC] flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                        Pflegekraft wird eingeladen…
                      </div>
                    ) : invitePhaseModal === 'done' ? (
                      <div className="flex-[2] bg-[#E3F7EF] text-[#22A06B] rounded-xl py-3 font-bold text-sm border border-[#B8E8D4] flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" /> Pflegekraft wurde eingeladen!
                      </div>
                    ) : (
                      <button
                        onClick={handleModalInvite}
                        className="flex-[2] bg-[#9B1FA1] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#7B1A85] transition-colors flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" /> Einladen
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 bg-[#F5EDF6] text-[#9B1FA1] rounded-xl py-3 font-bold text-sm border border-[#D8A9DC] flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Eingeladen — warten auf Bewerbung
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideSheet { from { opacity: 0; transform: translateY(60px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </>
  );
};

export default CustomerPortalPage;
