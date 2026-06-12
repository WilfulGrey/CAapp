// Live-Preview für Multi-Job-Übersicht im Kundenportal.
// Aktivieren via ?preview=jobs auf kundenportal.primundus.de.
//
// Eingebettet im echten Portal-Chrome (iPhone-Frame auf Desktop, gleicher
// Hintergrund, gleiche Navbar) — damit die Optik im Kontext bewertet
// werden kann (User-Spec: "im design des aktuellen kundenportals").
//
// Drei Layout-Varianten als Toggle oben (nur Preview-Tool, fliegt nach
// Entscheidung raus). Mock-Daten identisch, nur das Layout unterscheidet
// sich.

import { useState, type FC } from 'react';
import { Phone } from 'lucide-react';

type JobStatus = 'laufend' | 'kuenftig' | 'abgeschlossen';

interface JobMock {
  id: string;
  status: JobStatus;
  titel: string;
  anreise?: string; // "01.07.2026"
  abreise?: string; // "12.08.2026"
  // Optional informativ — nur für künftige Jobs ohne fixes Datum
  zeitraum?: string; // "Januar 2027 (in Planung)"
}

const MOCK_JOBS: JobMock[] = [
  {
    id: 'job-001',
    status: 'laufend',
    titel: 'Folge-Einsatz Sommer',
    anreise: '01.07.2026',
    abreise: '12.08.2026',
  },
  {
    id: 'job-002',
    status: 'kuenftig',
    titel: 'Herbst-Rotation',
    anreise: '15.10.2026',
    abreise: '30.11.2026',
  },
  {
    id: 'job-003',
    status: 'kuenftig',
    titel: 'Winter-Einsatz',
    zeitraum: 'Januar 2027 (in Planung)',
  },
  {
    id: 'job-004',
    status: 'abgeschlossen',
    titel: 'Erster Einsatz',
    anreise: '01.05.2026',
    abreise: '18.06.2026',
  },
];

// Sortierung: laufend → künftig → abgeschlossen (User-Spec).
// Innerhalb: nach Anreise-Datum chronologisch.
const STATUS_ORDER: Record<JobStatus, number> = {
  laufend: 0,
  kuenftig: 1,
  abgeschlossen: 2,
};

function sortJobs(jobs: JobMock[]): JobMock[] {
  return [...jobs].sort((a, b) => {
    const orderDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    return (a.anreise ?? a.zeitraum ?? '').localeCompare(b.anreise ?? b.zeitraum ?? '');
  });
}

const STATUS_BADGE: Record<JobStatus, { label: string; cls: string }> = {
  laufend: { label: 'Laufend', cls: 'bg-green-50 text-green-700 border-green-200' },
  kuenftig: { label: 'Geplant', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  abgeschlossen: { label: 'Abgeschlossen', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

function formatZeitraum(j: JobMock): string {
  if (j.anreise && j.abreise) return `${j.anreise} – ${j.abreise}`;
  if (j.zeitraum) return j.zeitraum;
  return '—';
}

// ─── Variante 1: Akkordeon-Liste ────────────────────────────────────────
const VariantAkkordeon: FC<{ jobs: JobMock[] }> = ({ jobs }) => {
  const [openId, setOpenId] = useState<string | null>(
    jobs.find((j) => j.status === 'laufend')?.id ?? null,
  );
  return (
    <div className="space-y-2">
      {jobs.map((j) => {
        const badge = STATUS_BADGE[j.status];
        const isOpen = openId === j.id;
        return (
          <div key={j.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              onClick={() => setOpenId(isOpen ? null : j.id)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[15px] font-bold text-gray-900">{j.titel}</p>
                  <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{formatZeitraum(j)}</p>
              </div>
              <span className="text-gray-400 flex-shrink-0">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="px-4 py-4 border-t border-gray-100 bg-gray-50 text-sm text-gray-600">
                <p className="italic">[Detail-Bereich — heutiger Portal-Inhalt: BookedScreen / Applications / Vertrag]</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Variante 2: Tabs oben ──────────────────────────────────────────────
const VariantTabs: FC<{ jobs: JobMock[] }> = ({ jobs }) => {
  const groups: Record<JobStatus, JobMock[]> = {
    laufend: jobs.filter((j) => j.status === 'laufend'),
    kuenftig: jobs.filter((j) => j.status === 'kuenftig'),
    abgeschlossen: jobs.filter((j) => j.status === 'abgeschlossen'),
  };
  const [tab, setTab] = useState<JobStatus>('laufend');
  const tabs: { key: JobStatus; label: string; count: number }[] = [
    { key: 'laufend', label: 'Laufend', count: groups.laufend.length },
    { key: 'kuenftig', label: 'Geplant', count: groups.kuenftig.length },
    { key: 'abgeschlossen', label: 'Vergangen', count: groups.abgeschlossen.length },
  ];
  return (
    <div>
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-bold transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`ml-1.5 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-600'}`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {groups[tab].length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center py-8">— keine Einsätze in dieser Kategorie —</p>
        ) : (
          groups[tab].map((j) => (
            <div key={j.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-4 shadow-sm">
              <p className="text-[15px] font-bold text-gray-900">{j.titel}</p>
              <p className="text-sm text-gray-600 mt-0.5">{formatZeitraum(j)}</p>
              <button className="mt-3 text-sm font-semibold text-[#1f7a45] hover:underline">
                Öffnen →
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── Variante 3: Karten mit farbigem Akzent ────────────────────────────
const VariantKarten: FC<{ jobs: JobMock[] }> = ({ jobs }) => (
  <div className="space-y-2">
    {jobs.map((j) => {
      const badge = STATUS_BADGE[j.status];
      const accent =
        j.status === 'laufend'
          ? 'border-l-green-500'
          : j.status === 'kuenftig'
            ? 'border-l-blue-500'
            : 'border-l-gray-300';
      return (
        <button
          key={j.id}
          className={`w-full bg-white border border-gray-200 border-l-4 ${accent} rounded-r-2xl rounded-l-md px-4 py-3.5 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 shadow-sm`}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[15px] font-bold text-gray-900">{j.titel}</p>
              <span className={`text-[11px] font-bold border px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">{formatZeitraum(j)}</p>
          </div>
          <span className="text-gray-400 flex-shrink-0 text-lg">→</span>
        </button>
      );
    })}
  </div>
);

// ─── Preview-Page mit echtem Portal-Chrome ─────────────────────────────
type Variant = 'akkordeon' | 'tabs' | 'karten';

export const JobsPreviewPage: FC = () => {
  const [variant, setVariant] = useState<Variant>('akkordeon');
  const jobs = sortJobs(MOCK_JOBS);

  return (
    // Outer-Wrapper exakt aus CustomerPortalPage kopiert: iPhone-Frame auf
    // Desktop (md:w-[390px], gerundete Ecken, Schatten, "Bezel"-Look),
    // mobile durchgängige Bahn.
    <div className="min-h-screen bg-gray-100 md:flex md:items-start md:justify-center md:py-10">
      <div className="min-h-screen md:min-h-0 bg-white w-full md:w-[390px] md:min-h-[844px] md:rounded-[48px] md:shadow-2xl md:overflow-hidden md:border-[8px] md:border-gray-800 md:ring-4 md:ring-gray-900/10 relative" style={{ fontFamily: 'inherit' }}>
        <div id="portal-scroll-container" className="md:h-[844px] md:overflow-y-auto md:overflow-x-hidden">
          {/* Navbar — identisch zum echten Portal */}
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

          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {/* Preview-Hinweis (nur in der Vorschau) */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              <strong>Live-Vorschau</strong> · 4 Mock-Einsätze · keine echte Buchung
            </div>

            {/* Variant-Toggle */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2 px-1">Layout-Variante</p>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {(
                  [
                    { key: 'akkordeon', label: '1 · Akkordeon' },
                    { key: 'tabs', label: '2 · Tabs' },
                    { key: 'karten', label: '3 · Karten' },
                  ] as { key: Variant; label: string }[]
                ).map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setVariant(v.key)}
                    className={`flex-1 py-2 px-2 rounded-lg text-[12px] font-bold transition-colors ${
                      variant === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Section-Header wie im echten Portal */}
            <p className="text-xs font-bold text-gray-600 uppercase tracking-wider px-1">Ihre Einsätze</p>

            {/* Variant-Body */}
            {variant === 'akkordeon' && <VariantAkkordeon jobs={jobs} />}
            {variant === 'tabs' && <VariantTabs jobs={jobs} />}
            {variant === 'karten' && <VariantKarten jobs={jobs} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobsPreviewPage;
