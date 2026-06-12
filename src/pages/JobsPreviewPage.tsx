// Live-Preview für Multi-Job-Übersicht im Kundenportal.
// Aktivieren via ?preview=jobs auf kundenportal.primundus.de.
//
// User-Entscheidung (12.06.): Karten-Layout, mit echtem Portal-Hero
// (brauner Gradient), nur Status + Datum + Pflegekraft pro Karte
// (keine fantasievollen Titel wie "Herbst-Rotation"). Klick auf eine
// Karte öffnet die Detail-Ansicht (= das "drin in einem Einsatz"-View),
// hier vereinfacht gemockt.

import { useState, type FC } from 'react';
import { Phone, Check, ArrowLeft } from 'lucide-react';

type JobStatus = 'laufend' | 'geplant' | 'abgeschlossen';

interface JobMock {
  id: string;
  status: JobStatus;
  anreise?: string;  // "01.07.2026"
  abreise?: string;  // "12.08.2026"
  zeitraum?: string; // Fallback "Januar 2027 (in Planung)"
  pflegekraft?: string;
  pflegekraftHerkunft?: string;
  bewerbungen?: number;
}

const MOCK_JOBS: JobMock[] = [
  {
    id: 'job-001',
    status: 'laufend',
    anreise: '01.07.2026',
    abreise: '12.08.2026',
    pflegekraft: 'Marianne Dachs',
    pflegekraftHerkunft: 'Polen',
  },
  {
    id: 'job-002',
    status: 'geplant',
    anreise: '15.10.2026',
    abreise: '30.11.2026',
    bewerbungen: 2,
  },
  {
    id: 'job-003',
    status: 'geplant',
    zeitraum: 'ab Januar 2027',
    bewerbungen: 0,
  },
  {
    id: 'job-004',
    status: 'abgeschlossen',
    anreise: '01.05.2026',
    abreise: '18.06.2026',
    pflegekraft: 'Maria Lopez',
    pflegekraftHerkunft: 'Polen',
  },
];

// Sortierung: laufend → geplant → abgeschlossen, innerhalb chronologisch.
const STATUS_ORDER: Record<JobStatus, number> = {
  laufend: 0,
  geplant: 1,
  abgeschlossen: 2,
};

function sortJobs(jobs: JobMock[]): JobMock[] {
  return [...jobs].sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    return (a.anreise ?? a.zeitraum ?? '').localeCompare(b.anreise ?? b.zeitraum ?? '');
  });
}

const STATUS_STYLE: Record<JobStatus, {
  label: string;
  badgeCls: string;
  accentCls: string;
}> = {
  laufend: {
    label: 'Laufend',
    badgeCls: 'bg-green-50 text-green-700 border-green-200',
    accentCls: 'border-l-green-500',
  },
  geplant: {
    label: 'Geplant',
    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
    accentCls: 'border-l-blue-500',
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    badgeCls: 'bg-gray-100 text-gray-500 border-gray-200',
    accentCls: 'border-l-gray-300',
  },
};

function formatZeitraum(j: JobMock): string {
  if (j.anreise && j.abreise) return `${j.anreise} – ${j.abreise}`;
  return j.zeitraum ?? '—';
}

// ─── Job-Karte (Klick öffnet Detail) ───────────────────────────────────
const JobCard: FC<{ job: JobMock; onClick: () => void }> = ({ job, onClick }) => {
  const s = STATUS_STYLE[job.status];
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border border-gray-200 border-l-4 ${s.accentCls} rounded-r-2xl rounded-l-md px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center gap-3 shadow-sm`}
    >
      <div className="flex-1 min-w-0">
        <span className={`inline-block text-[11px] font-bold border px-2 py-0.5 rounded-full ${s.badgeCls} mb-1.5`}>
          {s.label}
        </span>
        <p className="text-[15px] font-bold text-gray-900">{formatZeitraum(job)}</p>
        {job.pflegekraft ? (
          <p className="text-sm text-gray-600 mt-0.5">
            {job.pflegekraft}
            {job.pflegekraftHerkunft && <span className="text-gray-400"> · {job.pflegekraftHerkunft}</span>}
          </p>
        ) : job.bewerbungen !== undefined ? (
          <p className="text-sm text-gray-500 mt-0.5">
            {job.bewerbungen > 0
              ? `${job.bewerbungen} ${job.bewerbungen === 1 ? 'Bewerbung' : 'Bewerbungen'}`
              : 'Suchlauf läuft — noch keine Bewerbungen'}
          </p>
        ) : null}
      </div>
      <span className="text-gray-400 flex-shrink-0 text-lg">›</span>
    </button>
  );
};

// ─── Detail-Ansicht (vereinfachter Mock des "in einem Einsatz drin"-Views) ──
const JobDetail: FC<{ job: JobMock; onBack: () => void }> = ({ job, onBack }) => {
  const s = STATUS_STYLE[job.status];
  return (
    <div className="space-y-4">
      {/* Back-Pfeil */}
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8B7355] hover:text-[#6B5444]">
        <ArrowLeft className="w-4 h-4" /> Zurück zur Übersicht
      </button>

      {/* Eckdaten-Card */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <span className={`inline-block text-[11px] font-bold border px-2 py-0.5 rounded-full ${s.badgeCls}`}>
            {s.label}
          </span>
          <p className="text-[18px] font-bold text-gray-900 mt-1.5">{formatZeitraum(job)}</p>
        </div>
        {job.pflegekraft && (
          <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-100">
            <div className="w-12 h-12 rounded-xl bg-[#9B1FA1] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
              {job.pflegekraft.split(' ').map(s => s[0]).join('').slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900">{job.pflegekraft}</p>
              <p className="text-xs text-gray-500">{job.pflegekraftHerkunft} · Pflegekraft</p>
            </div>
          </div>
        )}
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Anreise</span><span className="font-semibold text-gray-800">{job.anreise ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Abreise</span><span className="font-semibold text-gray-800">{job.abreise ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Tagessatz</span><span className="font-semibold text-gray-800">83 € / Tag</span></div>
        </div>
      </div>

      {/* Als-nächstes (kompakt) */}
      <div>
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1 mb-2">Als nächstes</p>
        <div className="space-y-2">
          {job.status === 'laufend' && (
            <>
              <div className="bg-white border border-[#2A9D5C]/40 rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">✅</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-gray-800">Vertrag</p>
                    <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Unterschrieben</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Ihr unterschriebener Dienstleistungsvertrag.</p>
                  <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f7a45] hover:underline mt-1">📄 Vertrag</a>
                </div>
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">✈️</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-800">Anreisedaten</p>
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Folgt</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Details zur Anreise folgen in Kürze.</p>
                </div>
              </div>
            </>
          )}
          {job.status === 'geplant' && (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">🔍</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-800">Suchlauf</p>
                    <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">Läuft</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {job.bewerbungen && job.bewerbungen > 0
                      ? `${job.bewerbungen} ${job.bewerbungen === 1 ? 'Bewerbung wartet' : 'Bewerbungen warten'} auf Ihre Prüfung.`
                      : 'Wir suchen passende Pflegekräfte. Sie werden informiert, sobald Bewerbungen vorliegen.'}
                  </p>
                </div>
              </div>
            </>
          )}
          {job.status === 'abgeschlossen' && (
            <>
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3 shadow-sm">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">📄</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-800">Vertrag &amp; Abrechnungen</p>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">Unterlagen jederzeit verfügbar.</p>
                  <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f7a45] hover:underline mt-1">📄 Vertrag</a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────
export const JobsPreviewPage: FC = () => {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const jobs = sortJobs(MOCK_JOBS);
  const openJob = openJobId ? jobs.find(j => j.id === openJobId) ?? null : null;

  return (
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
      <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{ fontFamily: 'inherit' }}>
        <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
          {/* Navbar */}
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

          {/* Hero — exakt der gleiche braune Gradient + Wellen-Abschluss wie das echte Portal */}
          <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)' }}>
            <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
              <p className="text-[15px] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Guten Tag, Frau Dachs.
              </p>
              <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">
                {openJob ? 'Ihr Einsatz im Detail' : 'Ihre Einsätze auf einen Blick'}
              </h1>
              <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>
                {openJob
                  ? 'Hier sehen Sie alle Eckdaten zu diesem Einsatz und die nächsten Schritte.'
                  : 'Ihr laufender Einsatz, geplante Folge-Einsätze und Ihre Historie — alles an einem Ort.'}
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
              {/* Preview-Hinweis */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 mb-4">
                <strong>Live-Vorschau</strong> · Mock-Daten · keine echte Buchung
              </div>

              {openJob ? (
                <JobDetail job={openJob} onBack={() => setOpenJobId(null)} />
              ) : (
                <>
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1 mb-2">Ihre Einsätze</p>
                  <div className="space-y-2">
                    {jobs.map(j => (
                      <JobCard key={j.id} job={j} onClick={() => setOpenJobId(j.id)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobsPreviewPage;
