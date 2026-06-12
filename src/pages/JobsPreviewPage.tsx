// Live-Preview für die Multi-Job-Übersicht (Karten-Liste).
// Aktivieren via ?preview=jobs auf kundenportal.primundus.de.
//
// Klick auf eine Karte navigiert zum entsprechenden existierenden Portal-
// Preview-Modus mit `?preview=<mode>&back=jobs`. So sieht der Kunde im
// Detail-View das ECHTE Portal (state-aware Hero + Inhalt wie heute) —
// nicht ein Mock-Nachbau:
//
//   Laufend                 → ?preview=gebucht&back=jobs
//   Geplant + Bewerbungen   → ?preview=bewerbung&back=jobs
//   Geplant + 0 Bewerbungen → ?preview=wartet&back=jobs
//   Abgeschlossen           → noch kein Preview-Mode (Klick deaktiviert)
//
// Sub-Nav "← Alle meine Einsätze" wird von CustomerPortalPage automatisch
// gerendert, wenn ?back=jobs im URL-Query steht. Logo bleibt sichtbar.

import { type FC } from 'react';
import { Phone, Check } from 'lucide-react';

type JobStatus = 'laufend' | 'geplant' | 'abgeschlossen';

interface JobMock {
  id: string;
  status: JobStatus;
  anreise: string;
  abreise?: string;
  pflegekraft?: string;
  bewerbungen?: number;
  // Ziel-Preview-Mode für den Klick (None = nicht klickbar).
  previewMode?: 'gebucht' | 'bewerbung' | 'wartet';
}

const MOCK_JOBS: JobMock[] = [
  {
    id: 'job-001',
    status: 'laufend',
    anreise: '01.07.2026',
    abreise: '12.08.2026',
    pflegekraft: 'Marianne Dachs',
    previewMode: 'gebucht',
  },
  {
    id: 'job-002',
    status: 'geplant',
    anreise: '15.10.2026',
    abreise: '30.11.2026',
    bewerbungen: 2,
    previewMode: 'bewerbung',
  },
  {
    id: 'job-003',
    status: 'geplant',
    anreise: '15.01.2027',
    bewerbungen: 0,
    previewMode: 'wartet',
  },
  {
    id: 'job-004',
    status: 'abgeschlossen',
    anreise: '01.05.2026',
    abreise: '18.06.2026',
    pflegekraft: 'Maria Lopez',
    // Noch kein Preview-Mode für abgeschlossene Einsätze → nicht klickbar.
  },
];

const STATUS_ORDER: Record<JobStatus, number> = { laufend: 0, geplant: 1, abgeschlossen: 2 };

function sortJobs(jobs: JobMock[]): JobMock[] {
  return [...jobs].sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    return a.anreise.localeCompare(b.anreise);
  });
}

const STATUS_STYLE: Record<JobStatus, { label: string; badgeCls: string; accentCls: string }> = {
  laufend: { label: 'Laufend', badgeCls: 'bg-green-50 text-green-700 border-green-200', accentCls: 'border-l-green-500' },
  geplant: { label: 'Geplant', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200', accentCls: 'border-l-blue-500' },
  abgeschlossen: { label: 'Abgeschlossen', badgeCls: 'bg-gray-100 text-gray-500 border-gray-200', accentCls: 'border-l-gray-300' },
};

function formatZeitraum(j: JobMock): string {
  if (j.abreise) return `${j.anreise} – ${j.abreise}`;
  return `ab ${j.anreise}`;
}

const JobCard: FC<{ job: JobMock }> = ({ job }) => {
  const s = STATUS_STYLE[job.status];
  const onClick = () => {
    if (!job.previewMode) return;
    window.location.href = `/?preview=${job.previewMode}&back=jobs`;
  };
  const disabled = !job.previewMode;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full bg-white border border-gray-200 border-l-4 ${s.accentCls} rounded-r-2xl rounded-l-md px-4 py-3.5 text-left transition-colors flex items-center gap-3 shadow-sm ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50 active:bg-gray-100'
      }`}
    >
      <div className="flex-1 min-w-0">
        <span className={`inline-block text-[11px] font-bold border px-2 py-0.5 rounded-full ${s.badgeCls} mb-1.5`}>{s.label}</span>
        <p className="text-[15px] font-bold text-gray-900">{formatZeitraum(job)}</p>
        {job.pflegekraft ? (
          <p className="text-sm text-gray-600 mt-0.5">{job.pflegekraft}</p>
        ) : job.bewerbungen !== undefined ? (
          <p className="text-sm text-gray-500 mt-0.5">
            {job.bewerbungen > 0
              ? `${job.bewerbungen} ${job.bewerbungen === 1 ? 'Bewerbung' : 'Bewerbungen'}`
              : 'Suchlauf läuft — noch keine Bewerbungen'}
          </p>
        ) : null}
      </div>
      {!disabled && <span className="text-gray-400 flex-shrink-0 text-lg">›</span>}
    </button>
  );
};

export const JobsPreviewPage: FC = () => {
  const jobs = sortJobs(MOCK_JOBS);

  return (
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
      <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{ fontFamily: 'inherit' }}>
        <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
          {/* Navbar — Logo bleibt, "Hilfe" rechts. Kein Back-Pfeil — wir
              SIND auf der Übersichts-Seite. */}
          <nav className="sticky top-0 z-40" style={{ background: 'white', boxShadow: '0 1px 0 #E5E3DF, 0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 bg-white hover:bg-[#F8F7F5] text-[#8B7355] border border-[#E5E3DF] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                  Hilfe
                </button>
              </div>
            </div>
          </nav>

          {/* Vorschau-Banner */}
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[12px] text-amber-800 text-center">
            <strong>Live-Vorschau</strong> · Mock-Daten · keine echte Buchung
          </div>

          {/* Brauner Hero (Portal-Standard) */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)' }}>
            <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
              <p className="text-[15px] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.8)' }}>Guten Tag, Frau Dachs.</p>
              <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">Ihre Einsätze auf einen Blick</h1>
              <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Ihr laufender Einsatz, geplante Folge-Einsätze und Ihre Historie — alles an einem Ort.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
                <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} style={{ color: 'rgba(255,255,255,0.9)' }} />
                <span className="text-[14px] font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>
                  {jobs.filter(j => j.status === 'laufend').length} laufend · {jobs.filter(j => j.status === 'geplant').length} geplant
                </span>
              </div>
            </div>
            <svg viewBox="0 0 390 28" className="w-full block" style={{ marginBottom: '-1px' }} preserveAspectRatio="none">
              <path d="M0,14 C100,28 290,0 390,14 L390,28 L0,28 Z" fill="#F8F7F5" />
            </svg>
          </div>

          {/* Content */}
          <div style={{ background: '#F8F7F5' }}>
            <div className="max-w-3xl mx-auto px-4 py-6">
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1 mb-2">Ihre Einsätze</p>
              <div className="space-y-2">
                {jobs.map(j => <JobCard key={j.id} job={j} />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobsPreviewPage;
