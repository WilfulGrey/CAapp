// Live-Preview für Multi-Job-Übersicht im Kundenportal.
// Aktivieren via ?preview=jobs auf kundenportal.primundus.de.
//
// Übersicht-Modus (kein Job ausgewählt): brauner Hero + Karten-Liste.
// Detail-Modus (Klick auf Karte): EXAKT das heutige Portal-Verhalten —
// state-aware Hero je nach Status, Inhalte wie heute. Nur der "Zurück
// zur Übersicht"-Pfeil in der Navbar ist neu.

import { useState, type FC } from 'react';
import { Phone, Check, ArrowLeft } from 'lucide-react';

type JobStatus = 'laufend' | 'geplant' | 'abgeschlossen';

interface JobMock {
  id: string;
  status: JobStatus;
  anreise: string;
  abreise?: string;
  pflegekraft?: string;
  bewerbungen?: number;
}

const MOCK_JOBS: JobMock[] = [
  { id: 'job-001', status: 'laufend', anreise: '01.07.2026', abreise: '12.08.2026', pflegekraft: 'Marianne Dachs' },
  { id: 'job-002', status: 'geplant', anreise: '15.10.2026', abreise: '30.11.2026', bewerbungen: 2 },
  { id: 'job-003', status: 'geplant', anreise: '15.01.2027', bewerbungen: 0 },
  { id: 'job-004', status: 'abgeschlossen', anreise: '01.05.2026', abreise: '18.06.2026', pflegekraft: 'Maria Lopez' },
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

// ─── Job-Karte (Übersicht) ─────────────────────────────────────────────
const JobCard: FC<{ job: JobMock; onClick: () => void }> = ({ job, onClick }) => {
  const s = STATUS_STYLE[job.status];
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border border-gray-200 border-l-4 ${s.accentCls} rounded-r-2xl rounded-l-md px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors flex items-center gap-3 shadow-sm`}
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
      <span className="text-gray-400 flex-shrink-0 text-lg">›</span>
    </button>
  );
};

// ─── Brauner Hero (Portal-Standard) ─────────────────────────────────────
// Wortlaut + Optik 1:1 aus CustomerPortalPage übernommen, damit kein
// "Plötzlich-anders"-Gefühl beim Reingehen in einen Job entsteht.
const BraunerHero: FC<{ anrede: string; title: string; subtitle: string; pill: string }> = ({ anrede, title, subtitle, pill }) => (
  <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)' }}>
    <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
      <p className="text-[15px] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.8)' }}>{anrede}</p>
      <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">{title}</h1>
      <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>{subtitle}</p>
      <div className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
        <Check className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={3} style={{ color: 'rgba(255,255,255,0.9)' }} />
        <span className="text-[14px] font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>{pill}</span>
      </div>
    </div>
    <svg viewBox="0 0 390 28" className="w-full block" style={{ marginBottom: '-1px' }} preserveAspectRatio="none">
      <path d="M0,14 C100,28 290,0 390,14 L390,28 L0,28 Z" fill="#F8F7F5" />
    </svg>
  </div>
);

// ─── Detail: Laufend (= gebucht) — kein brauner Hero, BookedScreen-Look ──
const DetailLaufend: FC<{ job: JobMock }> = ({ job }) => (
  <div className="max-w-3xl mx-auto px-4 py-6 space-y-5" style={{ animation: 'fadeIn 0.4s ease-out' }}>
    <div className="text-center py-4">
      <div className="text-5xl mb-3">🎊</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Vielen Dank — Pflegekraft gebucht!</h1>
      <p className="text-sm text-gray-600 leading-relaxed">
        Ihr Vertrag ist unterschrieben. Jemand aus dem Primundus-Team meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu organisieren.
      </p>
    </div>

    {/* Pflegekraft-Karte */}
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3.5 px-4 py-4">
        <div className="w-14 h-14 rounded-xl bg-[#9B1FA1] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {job.pflegekraft!.split(' ').map(s => s[0]).join('').slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900">{job.pflegekraft}</p>
          <p className="text-xs text-gray-500">Pflegekraft</p>
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">Profil →</span>
      </div>
    </div>

    {/* Eckdaten (wie MonatsAufstellung) */}
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden divide-y divide-gray-100">
      <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-gray-500">Anreise</span><span className="font-semibold text-gray-800">{job.anreise}</span></div>
      <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-gray-500">Abreise</span><span className="font-semibold text-gray-800">{job.abreise ?? 'offen'}</span></div>
      <div className="flex justify-between px-4 py-2.5 text-sm"><span className="text-gray-500">Tagessatz</span><span className="font-semibold text-gray-800">83 € / Tag</span></div>
    </div>

    {/* Als-nächstes */}
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Als nächstes</p>
      <div className="bg-white border border-[#2A9D5C]/40 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 text-lg">✅</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-bold text-gray-800">Vertrag</p>
            <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Unterschrieben</span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed mb-1.5">Ihr unterschriebener Dienstleistungsvertrag. Eine Kopie haben Sie auch per E-Mail erhalten.</p>
          <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f7a45] hover:underline">📄 Vertrag</a>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">✈️</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-gray-800">Anreisedaten</p>
            <span className="text-xs font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">Folgt</span>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">Anreise am {job.anreise} · Abreise am {job.abreise ?? 'offen'}. Details folgen in Kürze.</p>
        </div>
      </div>
    </div>
  </div>
);

// ─── Detail: Geplant + Bewerbungen ──────────────────────────────────────
const DetailBewerbungen: FC<{ job: JobMock }> = ({ job }) => {
  const n = job.bewerbungen ?? 0;
  return (
    <>
      <BraunerHero
        anrede="Guten Tag, Frau Dachs."
        title={n > 1 ? `Sie haben ${n} neue Bewerbungen. 📨` : 'Sie haben eine neue Bewerbung. 📨'}
        subtitle={n > 1 ? 'Schauen Sie sich die Pflegekräfte in Ruhe an und entscheiden Sie, welche am besten passt.' : 'Schauen Sie sich die Bewerbung in Ruhe an und entscheiden Sie, ob die Pflegekraft passt.'}
        pill={n > 1 ? `${n} Bewerbungen aktiv` : '1 Bewerbung aktiv'}
      />
      <div style={{ background: '#F8F7F5' }}>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Ihre Bewerbungen · {formatZeitraum(job)}</p>
          {Array.from({ length: n }).map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center gap-3.5 px-4 py-4">
                <div className="w-14 h-14 rounded-xl bg-[#9B1FA1] flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                  {['AK', 'JN'][i] ?? 'PK'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900">{['Anna K.', 'Joanna N.'][i] ?? 'Pflegekraft'}</p>
                  <p className="text-xs text-gray-500">Erfahrene Betreuungskraft · spricht Deutsch</p>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">Profil →</span>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex gap-2">
                <button className="flex-1 rounded-xl bg-[#2A9D5C] hover:bg-[#248a50] text-white text-sm font-bold py-2.5">Angebot prüfen</button>
                <button className="rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-bold px-4 py-2.5">Nein danke</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

// ─── Detail: Geplant + 0 Bewerbungen (warten) ──────────────────────────
const DetailWartet: FC<{ job: JobMock }> = ({ job }) => (
  <>
    <BraunerHero
      anrede="Guten Tag, Frau Dachs."
      title="Profil vollständig. Bewerbungen werden für Sie vorbereitet. ✨"
      subtitle="Sobald sich Pflegekräfte bewerben, erscheinen die Angebote hier. Laden Sie in der Zwischenzeit weitere Pflegekräfte ein, sich bei Ihnen zu bewerben."
      pill="Profil vollständig"
    />
    <div style={{ background: '#F8F7F5' }}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Einsatz · {formatZeitraum(job)}</p>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-6 text-center">
          <div className="text-4xl mb-2">🔍</div>
          <p className="font-bold text-gray-800 mb-1">Suchlauf läuft</p>
          <p className="text-sm text-gray-500">Wir suchen passende Pflegekräfte für diesen Einsatz. Sie werden informiert, sobald die ersten Bewerbungen vorliegen.</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-4">
          <p className="font-bold text-gray-800 mb-1">Wunsch-Pflegekraft einladen</p>
          <p className="text-sm text-gray-500 mb-3">Sie haben jemanden im Blick? Laden Sie sie direkt zur Bewerbung ein.</p>
          <button className="w-full rounded-xl bg-[#9B1FA1] hover:bg-[#7B1A85] text-white text-sm font-bold py-2.5">Pflegekraft einladen</button>
        </div>
      </div>
    </div>
  </>
);

// ─── Detail: Abgeschlossen ──────────────────────────────────────────────
const DetailBeendet: FC<{ job: JobMock }> = ({ job }) => (
  <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
    <div className="text-center py-4">
      <div className="text-5xl mb-3">📋</div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1.5">Einsatz beendet</h1>
      <p className="text-sm text-gray-600 leading-relaxed">{formatZeitraum(job)} · Ihre Unterlagen bleiben jederzeit zugänglich.</p>
    </div>

    {job.pflegekraft && (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3.5 px-4 py-4">
          <div className="w-14 h-14 rounded-xl bg-gray-300 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {job.pflegekraft.split(' ').map(s => s[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900">{job.pflegekraft}</p>
            <p className="text-xs text-gray-500">Pflegekraft</p>
          </div>
        </div>
      </div>
    )}

    <div className="space-y-2.5">
      <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Unterlagen</p>
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">📄</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 mb-1">Vertrag</p>
          <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1f7a45] hover:underline">📄 Vertrag</a>
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3.5 flex items-start gap-3.5 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">🧾</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-gray-800 mb-1">Abrechnungen</p>
          <p className="text-sm text-gray-500">Monatliche Rechnungen zum Download.</p>
        </div>
      </div>
    </div>
  </div>
);

// ─── Page ───────────────────────────────────────────────────────────────
export const JobsPreviewPage: FC = () => {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const jobs = sortJobs(MOCK_JOBS);
  const openJob = openJobId ? jobs.find(j => j.id === openJobId) ?? null : null;

  return (
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
      <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{ fontFamily: 'inherit' }}>
        <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
          {/* Navbar — im Detail-Modus mit "Zurück"-Pfeil links statt Logo */}
          <nav className="sticky top-0 z-40" style={{ background: 'white', boxShadow: '0 1px 0 #E5E3DF, 0 2px 8px rgba(0,0,0,0.06)' }}>
            <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {openJob ? (
                  <button
                    onClick={() => setOpenJobId(null)}
                    className="flex items-center gap-1.5 text-[#8B7355] hover:text-[#6B5444] text-sm font-semibold"
                  >
                    <ArrowLeft className="w-4 h-4" /> Meine Einsätze
                  </button>
                ) : (
                  <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 bg-white hover:bg-[#F8F7F5] text-[#8B7355] border border-[#E5E3DF] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                  Hilfe
                </button>
              </div>
            </div>
          </nav>

          {/* Banner: Vorschau-Hinweis (oben über allem) */}
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[12px] text-amber-800 text-center">
            <strong>Live-Vorschau</strong> · Mock-Daten · keine echte Buchung
          </div>

          {openJob ? (
            // Detail-Modus: state-aware Hero + Inhalt wie heute im Portal
            <>
              {openJob.status === 'laufend' && <DetailLaufend job={openJob} />}
              {openJob.status === 'geplant' && (openJob.bewerbungen ?? 0) > 0 && <DetailBewerbungen job={openJob} />}
              {openJob.status === 'geplant' && (openJob.bewerbungen ?? 0) === 0 && <DetailWartet job={openJob} />}
              {openJob.status === 'abgeschlossen' && <DetailBeendet job={openJob} />}
            </>
          ) : (
            // Übersicht-Modus: brauner Multi-Job-Hero + Karten-Liste
            <>
              <BraunerHero
                anrede="Guten Tag, Frau Dachs."
                title="Ihre Einsätze auf einen Blick"
                subtitle="Ihr laufender Einsatz, geplante Folge-Einsätze und Ihre Historie — alles an einem Ort."
                pill={`${jobs.filter(j => j.status === 'laufend').length} laufend · ${jobs.filter(j => j.status === 'geplant').length} geplant`}
              />
              <div style={{ background: '#F8F7F5' }}>
                <div className="max-w-3xl mx-auto px-4 py-6">
                  <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1 mb-2">Ihre Einsätze</p>
                  <div className="space-y-2">
                    {jobs.map(j => (
                      <JobCard key={j.id} job={j} onClick={() => setOpenJobId(j.id)} />
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobsPreviewPage;
