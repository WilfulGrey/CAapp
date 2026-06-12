// Multi-Job (Variant A) — REAL "Alle meine Einsätze" overview.
// Activated via `?token=<lead.token>&view=jobs`. Unlike the design mock
// (?preview=jobs → JobsPreviewPage), this onboards the lead and renders the
// live lead_jobs list from the `listLeadJobs` proxy action. Clicking a card
// deep-links into the portal scoped to that job: `/?token=...&job=<id>`,
// which re-onboards the session to that job's job_offer_id.

import { type FC, useMemo } from 'react';
import { Phone } from 'lucide-react';
import { useMamamiaSession } from '../hooks/useMamamiaSession';
import { useLeadJobs } from '../lib/mamamia/hooks';
import type { LeadJobRow, LeadJobDisplayStatus } from '../lib/mamamia/types';
import { deriveJobDisplayStatus, sortLeadJobs, formatJobZeitraum } from '../lib/mamamia/leadJobs';

const STATUS_STYLE: Record<LeadJobDisplayStatus, { label: string; badgeCls: string; accentCls: string }> = {
  laufend: { label: 'Laufend', badgeCls: 'bg-green-50 text-green-700 border-green-200', accentCls: 'border-l-green-500' },
  gebucht: { label: 'Gebucht', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200', accentCls: 'border-l-amber-500' },
  geplant: { label: 'Geplant', badgeCls: 'bg-blue-50 text-blue-700 border-blue-200', accentCls: 'border-l-blue-500' },
  abgeschlossen: { label: 'Abgeschlossen', badgeCls: 'bg-gray-100 text-gray-500 border-gray-200', accentCls: 'border-l-gray-300' },
  storniert: { label: 'Storniert', badgeCls: 'bg-gray-100 text-gray-400 border-gray-200', accentCls: 'border-l-gray-200' },
};

function jobHref(token: string, job: LeadJobRow): string {
  const params = new URLSearchParams({ token, job: job.id });
  return `/?${params.toString()}`;
}

const Frame: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
    <div
      className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative"
      style={{ fontFamily: 'inherit' }}
    >
      <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
        <nav className="sticky top-0 z-40" style={{ background: 'white', boxShadow: '0 1px 0 #E5E3DF, 0 2px 8px rgba(0,0,0,0.06)' }}>
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <img src="/LOGO-PRIMUNDUS.webp" alt="Primundus" className="h-6" />
            <button className="flex items-center gap-1.5 bg-white hover:bg-[#F8F7F5] text-[#8B7355] border border-[#E5E3DF] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors">
              <Phone className="w-3.5 h-3.5" />
              Hilfe
            </button>
          </div>
        </nav>
        {children}
      </div>
    </div>
  </div>
);

const Hero: FC<{ laufend: number; geplant: number }> = ({ laufend, geplant }) => (
  <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #6B5444 0%, #8B7355 55%, #A18973 100%)' }}>
    <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }} />
    <div className="relative max-w-3xl mx-auto px-5 pt-8 pb-3">
      <h1 className="text-[1.65rem] font-bold text-white leading-tight mb-2">Ihre Einsätze auf einen Blick</h1>
      <p className="text-[14px] leading-relaxed mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>
        Ihr laufender Einsatz, geplante Folge-Einsätze und Ihre Historie — alles an einem Ort.
      </p>
      <div className="inline-flex items-center gap-2 rounded-full px-4 py-2" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)' }}>
        <span className="text-[14px] font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>
          {laufend} laufend · {geplant} geplant
        </span>
      </div>
    </div>
    <svg viewBox="0 0 390 28" className="w-full block" style={{ marginBottom: '-1px' }} preserveAspectRatio="none">
      <path d="M0,14 C100,28 290,0 390,14 L390,28 L0,28 Z" fill="#F8F7F5" />
    </svg>
  </div>
);

const JobCard: FC<{ token: string; job: LeadJobRow }> = ({ token, job }) => {
  const display = deriveJobDisplayStatus(job);
  const s = STATUS_STYLE[display];
  return (
    <a
      href={jobHref(token, job)}
      className={`block w-full bg-white border border-gray-200 border-l-4 ${s.accentCls} rounded-r-2xl rounded-l-md px-4 py-3.5 text-left transition-colors flex items-center gap-3 shadow-sm hover:bg-gray-50 active:bg-gray-100`}
    >
      <div className="flex-1 min-w-0">
        <span className={`inline-block text-[11px] font-bold border px-2 py-0.5 rounded-full ${s.badgeCls} mb-1.5`}>{s.label}</span>
        <p className="text-[15px] font-bold text-gray-900">{formatJobZeitraum(job)}</p>
      </div>
      <span className="text-gray-400 flex-shrink-0 text-lg">›</span>
    </a>
  );
};

const Centered: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ background: '#F8F7F5' }} className="min-h-[60vh] md:min-h-[600px]">
    <div className="max-w-3xl mx-auto px-6 py-16 text-center text-gray-600 text-[15px]">{children}</div>
  </div>
);

export const JobsOverviewPage: FC = () => {
  const token = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') : null;
  const { ready, loading, expired, error } = useMamamiaSession(token);
  const { data: jobs, loading: jobsLoading, error: jobsError } = useLeadJobs(ready);

  const sorted = useMemo(() => (jobs ? sortLeadJobs(jobs) : []), [jobs]);
  const laufendCount = sorted.filter((j) => deriveJobDisplayStatus(j) === 'laufend').length;
  const geplantCount = sorted.filter((j) => {
    const d = deriveJobDisplayStatus(j);
    return d === 'gebucht' || d === 'geplant';
  }).length;

  if (!token) {
    return (
      <Frame>
        <Centered>
          Ihr persönlicher Link fehlt. Bitte öffnen Sie die E-Mail erneut und klicken Sie auf den Link.
        </Centered>
      </Frame>
    );
  }

  if (expired) {
    return (
      <Frame>
        <Centered>Ihr Link ist nicht mehr gültig. Bitte fordern Sie über Ihre E-Mail einen neuen Link an.</Centered>
      </Frame>
    );
  }

  const isLoading = loading || (ready && jobsLoading && jobs === null);
  if (isLoading) {
    return (
      <Frame>
        <Centered>Ihre Einsätze werden geladen …</Centered>
      </Frame>
    );
  }

  if (error || jobsError) {
    return (
      <Frame>
        <Centered>Ihre Einsätze konnten nicht geladen werden. Bitte laden Sie die Seite neu.</Centered>
      </Frame>
    );
  }

  return (
    <Frame>
      <Hero laufend={laufendCount} geplant={geplantCount} />
      <div style={{ background: '#F8F7F5' }}>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1 mb-2">Ihre Einsätze</p>
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-500 px-1 py-8 text-center">Aktuell sind keine Einsätze hinterlegt.</p>
          ) : (
            <div className="space-y-2">
              {sorted.map((j) => (
                <JobCard key={j.id} token={token} job={j} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Frame>
  );
};

export default JobsOverviewPage;
