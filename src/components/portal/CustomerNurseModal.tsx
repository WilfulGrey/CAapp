import { useEffect, useRef, useState } from 'react';
import type { FC, MouseEvent as ReactMouseEvent } from 'react';
import { Check, X, UserPlus, Heart, FileText, Download } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { nurseLevel, displayName, initials, einsaetzeText } from './shared';
import { SprachBalken } from './SprachBalken';

// Erklärung der Stufe. Die Labels MÜSSEN mit `nurseLevel`
// (components/portal/shared.ts) und den Schwellen in lib/mamamia/badge.ts
// übereinstimmen. Hier standen bis 12.08. noch „⭐ Starter / 🥉 Bronze /
// 🥈 Silber / 🥇 Gold / 🏆 Platin" — Ränge, die es im Portal seit dem 11.08.
// nirgends mehr gibt; die Zeile „Aktuell" markierte deshalb nie etwas.
// Reihenfolge: niedrigste Stufe zuerst.
const EXPERIENCE_LEVELS = [
  { label: 'Bekannt', desc: 'Ein Einsatz über uns' },
  { label: 'Bewährt', desc: '2 bis 5 Einsätze — sie kam wieder' },
  { label: 'Stammkraft', desc: '6 bis 11 Einsätze — fest bei uns im Einsatz' },
  { label: 'Elite', desc: '12 Einsätze und mehr — die erfahrensten Kräfte in unserem Bestand' },
];

// Customer-facing explanation der drei Sprach-Stufen.
// Wortlaut 1:1 aus der bereits existierenden FAQ im CustomerPortalPage
// übernommen (Eintrag „Was bedeuten die Deutsch-Niveaus (Grund, Mittel,
// Gut)?"), damit die Erwartung im ganzen Portal konsistent bleibt — der
// Kunde liest im Popup das Gleiche wie im FAQ-Akkordeon. Falls die FAQ
// dort geändert wird, hier ebenfalls anpassen (kleine Code-Doppelung,
// kein Refactor wert — bewusste Single-Source-Verletzung).
const LANGUAGE_LEVELS = [
  {
    bars: 1, label: 'Grund',
    desc: 'Einzelne Wörter und einfache Sätze. Für eine Verständigung im Alltag braucht es Geduld, Gesten und etwas Vorbereitung; differenzierte Gespräche sind in der Regel nicht möglich.',
  },
  {
    bars: 2, label: 'Mittel',
    desc: 'Einfache Alltagsthemen lassen sich besprechen, gängige Anweisungen werden meist verstanden. Bei komplexeren Themen (Diagnosen, Behörden, Telefonate) kann es zu Rückfragen oder Missverständnissen kommen.',
  },
  {
    bars: 3, label: 'Gut',
    desc: 'Die Verständigung im Alltag und in der Pflege funktioniert in der Regel zuverlässig. Auch ausführlichere Gespräche sind möglich; sehr seltene Fachbegriffe, schnelles Sprechen oder Dialekt können dennoch Nachfragen erfordern.',
  },
];

// Gemeinsame Klassen für den Design-Durchgang vom 11./12.08.: abgesetzte
// Kästen (Fläche #F5F5F6, Rand #D4D4D8) statt randloser Grauflächen,
// Fließtext 16 px, Abschnittsköpfe eine Stufe über dem Fließtext.
const boxCls = 'rounded-2xl p-4 border border-[#D4D4D8] bg-[#F5F5F6]';
const sectionHeadCls = 'text-[1.05rem] font-bold text-[#18181B] mb-2';
const assignLabelCls = 'text-[12px] uppercase tracking-wide mb-0.5 text-[#A1A1AA]';
const assignValueCls = 'text-[15px] font-semibold text-[#18181B]';

const LANGUAGE_LEVELS_INTRO =
  'Eine grobe Orientierung — kein Sprach-Zertifikat. Die genaue Kommunikation hängt immer auch vom Tempo, der Mundart und der Geduld beider Seiten ab.';

const LANGUAGE_LEVELS_FOOTER =
  'Wenn Sprachsicherheit besonders wichtig ist (z. B. Demenz, schwerhörige oder spracheingeschränkte Patienten), sprechen Sie uns gerne an — wir helfen bei der Einordnung.';

export const CustomerNurseModal: FC<{
  nurse: Nurse;
  /** True while the full Caregiver profile is in flight. The header and
   *  basic nurse data render immediately from the matching/application
   *  card; the deep "Über mich" / "Besondere Merkmale" sections wait on
   *  GET_CAREGIVER (~1.7-3.1s on beta). When this is true we render a
   *  shimmer skeleton for those sections instead of empty rows. */
  profileLoading?: boolean;
  /** True while the AI-generated "Über die Pflegekraft" introduction is in
   *  flight. Decoupled from profileLoading because the basic profile lands
   *  fast (often cached) but the AI text takes ~3-5s. Without this prop
   *  the about-section briefly flashes Mamamia's raw motivation text, then
   *  swaps to AI — ugly. With it: we show a friendly loader until AI
   *  resolves, then either the AI text (success) or the Mamamia fallback
   *  (failure / null). */
  aboutLoading?: boolean;
  onClose: () => void;
  app?: Application;
  onReview?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  /** Performs the actual backend mutation. Spinner stays up until the
   *  promise resolves; on rejection modal rolls back to idle and the
   *  parent surfaces the error (CLAUDE.md §1 — no fake animation). */
  onInvite?: () => Promise<void>;
  onDeclineMatch?: () => void;
  /** Öffnet den (übersetzten) Chat mit der Pflegekraft. */
  onChat?: () => void;
  isInvited?: boolean;
  /** Wenn true, hat die Pflegekraft in Mamamia Interesse signalisiert.
   *  Modal zeigt dann oben einen Hinweis-Block (warmer Coral-Ton mit
   *  Heart-Icon), der erklärt, dass eine Einladung ihre offizielle
   *  Bewerbung ermöglicht. */
  hasInterest?: boolean;
}> = ({ nurse, profileLoading = false, aboutLoading = false, onClose, app, onReview, onDecline, onUndo, onInvite, onDeclineMatch, onChat, isInvited = false, hasInterest = false }) => {
  const [invited, setInvited] = useState(isInvited);
  const [invitePhaseModal, setInvitePhaseModal] = useState<'idle' | 'sending' | 'done'>('idle');
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [showLanguageInfo, setShowLanguageInfo] = useState(false);
  const [refDownloading, setRefDownloading] = useState(false);

  // Header kollabiert beim Scrollen — wie bei modernen App-Profilen. Im
  // kollabierten Zustand wird das Bild kleiner und Verfügbarkeits-Chip
  // ausgeblendet, sodass mehr vom scrollbaren Inhalt sichtbar bleibt.
  // Schwellwert: 40px — knapp genug, damit selbst kleine Daumen-Scrolls
  // die kompakte Variante triggern.
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [headerCompact, setHeaderCompact] = useState(false);
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => setHeaderCompact(el.scrollTop > 40);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Body-Scroll-Lock solange das Modal offen ist. Ohne diesen Lock
  // propagiert ein Scroll-Versuch im Modal-Body auf das darunter liegende
  // <body> und scrollt die Portal-Seite statt das Profil. Stellt den
  // ursprünglichen overflow-Wert beim Unmount wieder her, damit andere
  // Seiten / Routen nicht in einem gelockten State landen.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Referenz-PDF herunterladen statt im Tab öffnen. Der aws_url ist ein
  // langer, vorsignierter S3-Link (mamamia-aws-bucket…?X-Amz-Signature=…) —
  // den soll der Kunde nicht zu Gesicht bekommen. Wir holen die Datei per
  // fetch (der S3-Bucket schickt Access-Control-Allow-Origin:*, fetch ist
  // also erlaubt), bauen daraus eine Blob-URL und triggern einen Download mit
  // sauberem Dateinamen. Schlägt der Fetch fehl (Presign abgelaufen, offline),
  // öffnen wir als Fallback den Original-Link im neuen Tab — besser ein
  // sichtbarer Link als ein toter Klick.
  const handleReferenceDownload = async (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const url = nurse.referencePdfUrl;
    if (!url || refDownloading) return;
    setRefDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      // displayName endet auf einem Punkt ("Maria K.") — Buchstaben/Ziffern
      // behalten (Unicode, damit ł/ä erhalten bleiben), Rest zu _ und Rand-_
      // strippen, sonst entsteht "Maria_K..pdf".
      const safeName = displayName(nurse.name).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '');
      a.download = `Referenzen-${safeName || 'Pflegekraft'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setRefDownloading(false);
    }
  };

  const handleModalInvite = async () => {
    setInvitePhaseModal('sending');
    try {
      await onInvite?.();
      setInvitePhaseModal('done');
      setTimeout(() => { setInvited(true); setInvitePhaseModal('idle'); }, 1200);
    } catch {
      // Parent already shows the error toast.
      setInvitePhaseModal('idle');
    }
  };
  const inits = initials(nurse.name);
  const name = displayName(nurse.name);
  const bars = Array.from({ length: 3 }, (_, i) => i < nurse.language.bars);
  const lvl = nurseLevel(nurse.experienceYears ?? 0, nurse.history?.assignments ?? 0);
  const p = nurse.profile;
  const dash = '—';
  const yesNo = (v: boolean | undefined): string => v == null ? dash : v ? 'Ja' : 'Nein';
  const smokingLabel: Record<string, string> = {
    no: 'Nein',
    yes: 'Ja',
    yes_outside: 'Ja, draußen',
  };
  // "Über die Pflegekraft" prose — built from real fields only. If the
  // backend hasn't filled them in we show a neutral placeholder rather
  // than fabricating personality traits (CLAUDE.md §1).
  const aboutSentence = p?.aboutDe
    ? p.aboutDe
    : p?.motivation
    ? p.motivation
    : `${name} verfügt über ${nurse.experience} in der 24h-Betreuung und spricht Deutsch auf ${
        nurse.language.level === 'Grund' ? 'Grundniveau'
        : nurse.language.level === 'Mittel' ? 'mittlerem Niveau'
        : nurse.language.level === 'Gut' ? 'gutem Niveau'
        : `${nurse.language.level}-Niveau`
      }.${
        nurse.history ? ` Mit ${nurse.history.assignments} erfolgreich abgeschlossenen Einsätzen bringt sie bewährte Praxiserfahrung mit.` : ''
      }`;

  const InfoRow = ({ emoji, label, value, chips }: { emoji: string; label: string; value?: string; chips?: string[] }) => (
    <div className="flex gap-3.5 py-3 border-b border-gray-100 last:border-0">
      <span className="text-xl w-7 flex-shrink-0 text-center leading-none mt-0.5">{emoji}</span>
      <div className="min-w-0">
        <p className="text-[13px] mb-0.5" style={{ color: '#71717A' }}>{label}</p>
        {value && <p className="text-[16px] font-semibold" style={{ color: '#18181B' }}>{value}</p>}
        {chips && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {chips.map(c => (
              <span key={c} className="text-[13px] px-2.5 py-1 rounded-full"
                style={{ background: '#F5F5F6', border: '1px solid #D4D4D8', color: '#52525B' }}>{c}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Shimmer placeholder for profile sections while GET_CAREGIVER is in flight.
  const SkeletonRow = ({ chips = false }: { chips?: boolean }) => (
    <div className="flex gap-3.5 py-3 border-b border-gray-100 last:border-0 animate-pulse">
      <div className="w-7 h-7 rounded bg-gray-200 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="h-2 w-20 bg-gray-200 rounded mb-2" />
        {chips ? (
          <div className="flex gap-1.5 mt-1">
            <div className="h-5 w-14 bg-gray-200 rounded-full" />
            <div className="h-5 w-20 bg-gray-200 rounded-full" />
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
          </div>
        ) : (
          <div className="h-3 w-32 bg-gray-200 rounded" />
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
          <div className="flex justify-center pt-3 pb-2 sm:hidden flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>

          {/* Sticky header — nur Bild + Name + Badges, KEINE Detail-Cards.
              Schrumpft beim Scrollen (kleineres Bild, Verfügbarkeits-Chip
              klappt weg), sodass mehr Inhalt sichtbar bleibt. */}
          <div
            className="px-5 flex-shrink-0 transition-all duration-200"
            style={{ backgroundColor: `${nurse.color}12`, paddingTop: headerCompact ? '0.75rem' : '1.25rem', paddingBottom: headerCompact ? '0.5rem' : '1rem' }}
          >
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                {nurse.image ? (
                  <img
                    src={nurse.image}
                    alt={nurse.name}
                    className={`rounded-2xl object-cover border-2 border-white shadow transition-all duration-200 ${headerCompact ? 'w-12 h-12' : 'w-20 h-20'}`}
                  />
                ) : (
                  <div
                    className={`rounded-2xl flex items-center justify-center font-bold text-white border-2 border-white shadow transition-all duration-200 ${headerCompact ? 'w-12 h-12 text-base' : 'w-20 h-20 text-2xl'}`}
                    style={{ backgroundColor: nurse.color }}
                  >
                    {inits}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {/* 14.06.: Verfügbarkeits-Chip in dieselbe flex-wrap-Zeile
                    wie Name/Alter/Badge gezogen (war vorher mt-1.5 + eigene
                    Zeile, was 3-zeilig wirkte). flex-wrap erlaubt umbruch,
                    falls Mobile-Breite knapp wird. Header-Compact-Modus
                    blendet ihn weiterhin aus. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`font-bold text-gray-900 leading-tight transition-all duration-200 ${headerCompact ? 'text-base' : 'text-xl'}`}>{name}</h2>
                  {nurse.age ? (
                    <span className="text-sm text-gray-400 flex-shrink-0">{nurse.age} J.</span>
                  ) : null}
                  {/* Ohne Stufe (keine Jahre, keine Einsätze) KEIN Chip —
                      vorher rendete `nurseLevel` dort ein leeres Label und
                      der Kunde sah eine leere Pille mit Rahmen. */}
                  {lvl.label && (
                  <button
                    type="button"
                    onClick={() => setShowLevelInfo(true)}
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 cursor-pointer transition-transform active:scale-95 hover:brightness-95 ${lvl.cls}`}
                    aria-label="Erfahrungs-Level erklären"
                  >
                    {lvl.label}
                  </button>
                  )}
                  {!headerCompact && (
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${
                      nurse.availableSoon ? 'bg-[#E3F7EF] text-[#22A06B] border-[#B8E8D4]' : 'bg-[#FEF3E2] text-[#B45309] border-[#F9D99A]'
                    }`}>
                      {nurse.availability}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow-sm flex-shrink-0">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
            {/* Erfahrung / Deutschkenntnisse Cards — vorher im sticky Header,
                jetzt im scrollbaren Bereich. Spart Vertikalraum + erlaubt
                den (i)-Button für die Sprach-FAQ direkt am Niveau. */}
            <div className="px-5 pt-4 pb-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl px-3 py-2.5 border" style={{ background: '#FFFFFF', borderColor: '#D4D4D8' }}>
                  <p className="text-[13px] mb-1" style={{ color: '#71717A' }}>Erfahrung</p>
                  <p className="text-[16px] font-bold text-[#8B7355]">{nurse.experience}</p>
                </div>
                <div className="rounded-xl px-3 py-2.5 border" style={{ background: '#FFFFFF', borderColor: '#D4D4D8' }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[13px]" style={{ color: '#71717A' }}>Deutschkenntnisse</p>
                    {/* Sauberer Brand-Kreis mit "i" — weiß auf Brand-Braun,
                        passt zur Farbpalette und ist groß genug zum Tippen
                        ohne aufdringlich zu wirken. */}
                    <button
                      type="button"
                      onClick={() => setShowLanguageInfo(true)}
                      className="w-5 h-5 rounded-full bg-[#8B7355]/15 hover:bg-[#8B7355]/25 text-[#8B7355] transition-colors flex items-center justify-center flex-shrink-0"
                      aria-label="Sprach-Stufen erklären"
                    >
                      <span className="text-[11px] font-bold leading-none" style={{ fontFamily: 'Georgia, serif' }}>i</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <SprachBalken balken={bars.filter(Boolean).length} gesamt={bars.length} />
                    <span className="text-[16px] font-bold" style={{ color: '#18181B' }}>{nurse.language.level}</span>
                  </div>
                </div>
              </div>
            </div>
            {/* "Hat Interesse"-Hinweis — nur wenn die Pflegekraft in Mamamia
                proaktiv Interesse signalisiert hat (z.B. via Like). Erklärt
                kurz, dass eine Einladung die offizielle Bewerbung ermöglicht. */}
            {hasInterest && (
              <div className="mx-5 mt-4 rounded-xl border px-4 py-3"
                   style={{ background: 'linear-gradient(135deg, #FFF1EC 0%, #FFE5DE 100%)', borderColor: '#F0B0A4' }}>
                <div className="flex items-start gap-2.5">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#FFCFC4' }}>
                    <Heart className="w-3.5 h-3.5" fill="currentColor" style={{ color: '#C04A40' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: '#C04A40' }}>
                      {nurse.name.split(' ')[0]} hat Interesse signalisiert
                    </p>
                    <p className="text-[13px] text-gray-700 mt-0.5 leading-relaxed">
                      Sie hat Ihre Anfrage gesehen und würde sich gerne bei Ihnen bewerben. Laden Sie {nurse.name.split(' ')[0]} ein, damit wir ihre offizielle Bewerbung anstoßen können.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Design-Angleichung 12.08.: Der Rest des Portals wurde am
                11.08. auf abgesetzte Kästen (#F5F5F6 + Rand #D4D4D8) und
                16-px-Fließtext umgestellt — das Profil hatte nur die Farben
                mitbekommen und stand noch auf 14 px in randlosen Flächen. */}
            <div className="px-5 pt-4 pb-5">
              <h3 className={sectionHeadCls}>Über {nurse.name.split(' ')[0]}</h3>
              {profileLoading && !p ? (
                <div className={boxCls + ' animate-pulse'}>
                  <div className="h-3 w-full bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-11/12 bg-gray-200 rounded mb-2" />
                  <div className="h-3 w-9/12 bg-gray-200 rounded" />
                </div>
              ) : aboutLoading ? (
                <div className={boxCls + ' flex items-start gap-3'}>
                  <svg
                    className="w-5 h-5 animate-spin text-[#8B7355] flex-shrink-0 mt-0.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <p className="text-[16px] italic leading-relaxed" style={{ color: '#71717A' }}>
                    Wir bereiten Ihnen gerade eine persönliche Vorstellung von {nurse.name.split(' ')[0]} vor…
                  </p>
                </div>
              ) : (
                <div className={boxCls}>
                  <p className="text-[16px] leading-relaxed whitespace-pre-line" style={{ color: '#18181B' }}>{aboutSentence}</p>
                </div>
              )}
            </div>

            {/* Referenz-PDF — wird direkt VOR den letzten Einsätzen
                gerendert (starkes Vertrauenssignal aus erster Hand). Klick
                lädt die PDF herunter (siehe handleReferenceDownload) statt
                den langen vorsignierten S3-Link im Tab zu zeigen. Das href
                bleibt gesetzt, damit „Link speichern unter" / Fallback
                weiterhin funktionieren. */}
            {nurse.referencePdfUrl && (
              <div className="px-5 pb-5">
                <a
                  href={nurse.referencePdfUrl}
                  onClick={handleReferenceDownload}
                  download
                  className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-[#F5F5F6] hover:bg-[#EBE2D5] px-4 py-3 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 border border-[#E9E9EB]">
                    <FileText className="w-5 h-5 text-[#8B7355]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#3D2B1F] leading-tight">
                      Referenzen
                    </p>
                    <p className="text-[12px] text-gray-500 leading-tight mt-0.5">
                      {refDownloading ? 'Wird heruntergeladen…' : 'Empfehlungen früherer Familien'}
                    </p>
                  </div>
                  {refDownloading ? (
                    <svg className="w-4 h-4 animate-spin text-[#8B7355] flex-shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : (
                    <Download className="w-4 h-4 text-[#8B7355] flex-shrink-0" />
                  )}
                </a>
              </div>
            )}

            {nurse.detailedAssignments && nurse.detailedAssignments.length > 0 && (nurse.history?.assignments ?? 0) > 0 && (
              <div className="px-5 pb-5">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className={sectionHeadCls + ' mb-0'}>Letzte Einsätze</h3>
                  {nurse.history && (
                    <span className="text-[13px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: '#71717A', background: '#F5F5F6', border: '1px solid #D4D4D8' }}>
                      {/* Gleicher Wortlaut wie die Karte, ohne Ø-Dauer (Martin, 03.09.). */}
                      {einsaetzeText(nurse.history.assignments)}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {nurse.detailedAssignments.map((a, i) => (
                    <div key={i} className={boxCls}>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <div><p className={assignLabelCls}>Zeitraum</p><p className={assignValueCls}>{a.startDate} – {a.endDate}</p></div>
                        <div><p className={assignLabelCls}>Ort</p><p className={assignValueCls}>{a.postalCode} {a.city}</p></div>
                        <div><p className={assignLabelCls}>Patienten</p><p className={assignValueCls}>{a.patientCount} {a.patientCount === 1 ? 'Patient' : 'Patienten'}</p></div>
                        <div><p className={assignLabelCls}>Dauer</p><p className={assignValueCls}>{a.duration}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pb-5">
              <h3 className={sectionHeadCls + ' mb-3'}>Über mich</h3>
              {profileLoading ? (
                <div className="divide-y divide-gray-100">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow chips />
                  <SkeletonRow chips />
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  <InfoRow emoji="👤" label="Geschlecht" value={nurse.gender === 'female' ? 'Weiblich' : 'Männlich'} />
                  {p?.nationality && (
                    <InfoRow emoji="🌍" label="Nationalität" value={p.nationality} />
                  )}
                  {p?.yearOfBirth && (
                    <InfoRow emoji="🎂" label="Geburtsjahr" value={String(p.yearOfBirth)} />
                  )}
                  {p?.weight && (
                    <InfoRow emoji="⚖️" label="Gewicht" value={p.weight} />
                  )}
                  {p?.height && (
                    <InfoRow emoji="📏" label="Größe" value={p.height} />
                  )}
                  {p?.maritalStatus && (
                    <InfoRow emoji="💍" label="Familienstand" value={p.maritalStatus} />
                  )}
                  {p && p.personalities.length > 0 && (
                    <InfoRow emoji="🧠" label="Persönlichkeit" chips={p.personalities} />
                  )}
                  {p && p.hobbies.length > 0 && (
                    <InfoRow emoji="🎯" label="Hobbys" chips={p.hobbies} />
                  )}
                  {p?.furtherHobbies && (
                    <InfoRow emoji="✨" label="Weitere Interessen" value={p.furtherHobbies} />
                  )}
                </div>
              )}
            </div>

            {(() => {
              // Hide whole "Besondere Merkmale" section when post-load every
              // row would be empty. During loading we show skeletons —
              // can't know yet which rows have data.
              const smokingValue = p?.smoking ? smokingLabel[p.smoking] : '';
              const hasDrivingLicense = p?.drivingLicense != null;
              const hasSmoking = !!smokingValue;
              const hasIsNurse = p?.isNurse != null;
              const hasQualifications = !!p?.qualifications;
              const hasEducation = !!p?.education;
              // "Andere Sprachkenntnisse" (Muttersprache, z. B. Polski) bewusst
              // NICHT zeigen: für den Kunden zählt immer das DEUTSCH-Niveau, und
              // das steht prominent oben (Karte) + im 3-Stufen-Block weiter unten.
              const showSpecial = profileLoading
                || hasDrivingLicense || hasSmoking || hasIsNurse
                || hasQualifications || hasEducation;
              if (!showSpecial) return null;
              return (
                <div className="px-5 pb-5">
                  <h3 className={sectionHeadCls + ' mb-3'}>Besondere Merkmale</h3>
                  {profileLoading ? (
                    <div className="divide-y divide-gray-100">
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow />
                      <SkeletonRow chips />
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {hasDrivingLicense && (
                        <InfoRow
                          emoji="🚗"
                          label="Führerschein"
                          value={`${yesNo(p!.drivingLicense)}${p!.drivingLicenseGearbox ? ` (${p!.drivingLicenseGearbox})` : ''}`}
                        />
                      )}
                      {hasSmoking && (
                        <InfoRow emoji="🚬" label="Raucher" value={smokingValue} />
                      )}
                      {hasIsNurse && (
                        <InfoRow emoji="🎓" label="Pflegeberuf erlernt" value={yesNo(p!.isNurse)} />
                      )}
                      {hasQualifications && (
                        <InfoRow emoji="🏥" label="Qualifikationen" value={p!.qualifications} />
                      )}
                      {hasEducation && (
                        <InfoRow emoji="📚" label="Ausbildung" value={p!.education} />
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {profileLoading ? (
              <div className="px-5 pb-6">
                <h3 className={sectionHeadCls + ' mb-3'}>Berufliche Anforderungen</h3>
                <div className="divide-y divide-gray-100">
                  <SkeletonRow chips />
                </div>
              </div>
            ) : (p && p.acceptedMobilities.length > 0 && (
              <div className="px-5 pb-6">
                <h3 className={sectionHeadCls + ' mb-3'}>Berufliche Anforderungen</h3>
                <div className="divide-y divide-gray-100">
                  <InfoRow emoji="🦽" label="Akzeptierte Mobilität" chips={p.acceptedMobilities} />
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 space-y-3">
            {onChat && (
              <button
                onClick={onChat}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#8B7355]/30 bg-white hover:bg-[#F5F5F6] text-[#6B5444] text-sm font-semibold py-3 transition-colors"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l.8-3.2A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Frage an {nurse.name.split(' ')[0]} stellen
              </button>
            )}
            <div className="flex gap-3">
            {app ? (
              app.status === 'declined' ? (
                <button
                  onClick={() => { onUndo?.(); onClose(); }}
                  className="flex-1 bg-[#F5F5F6] text-[#8B7355] border border-[#E9E9EB] rounded-xl py-3 font-bold text-sm hover:bg-[#EBE2D5] transition-colors flex items-center justify-center gap-2"
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
                    className="flex-[2] bg-[#E76F63] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#D65E52] shadow-sm transition-colors"
                  >
                    Angebot prüfen
                  </button>
                </>
              )
            ) : (
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
                      <div className="flex-[2] bg-[#F5F5F6] text-[#8B7355] rounded-xl py-3 font-bold text-sm border border-[#E9E9EB] flex items-center justify-center gap-2">
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
                        className="flex-[2] bg-[#E76F63] text-white rounded-xl py-3 font-bold text-sm hover:bg-[#D65E52] shadow-sm transition-colors flex items-center justify-center gap-2"
                      >
                        <UserPlus className="w-4 h-4" /> Einladen
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex-1 bg-[#F5F5F6] text-[#8B7355] rounded-xl py-3 font-bold text-sm border border-[#E9E9EB] flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> Eingeladen — warten auf Bewerbung
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Experience-level explanation — opened by tapping the badge */}
      {showLevelInfo && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]"
            onClick={() => setShowLevelInfo(false)}
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          />
          <div
            className="fixed z-[70] inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          >
            <div
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl pointer-events-auto shadow-2xl"
              style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="px-5 pt-3 pb-5">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h3 className="text-[1.05rem] font-bold" style={{ color: '#18181B' }}>Erfahrungsstufe</h3>
                  <button
                    onClick={() => setShowLevelInfo(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
                    aria-label="Schließen"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-[15px] leading-relaxed mb-4" style={{ color: '#71717A' }}>
                  Die Stufe zeigt, wie oft eine Pflegekraft schon über uns im
                  Einsatz war — gezählt werden nur abgeschlossene Einsätze.
                  Wer wiederkommt, hat sich bei Familien vor Ihnen bewährt.
                </p>
                <div className="space-y-1.5">
                  {EXPERIENCE_LEVELS.map(level => {
                    const isCurrent = level.label === lvl.label;
                    return (
                      <div
                        key={level.label}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 border"
                        style={
                          isCurrent
                            ? { background: '#FFFFFF', borderColor: '#8B7355' }
                            : { background: '#F5F5F6', borderColor: '#E4E4E7' }
                        }
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-bold" style={{ color: '#18181B' }}>{level.label}</p>
                          <p className="text-[13px]" style={{ color: '#71717A' }}>{level.desc}</p>
                        </div>
                        {isCurrent && (
                          <span className="text-[12px] font-bold flex-shrink-0" style={{ color: '#8B7355' }}>Aktuell</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sprach-Stufen-Erklärung — geöffnet vom (i)-Button im
          Deutschkenntnisse-Block. Hebt aktuell zutreffende Stufe optisch
          hervor, damit der Kunde direkt sieht, was die Bars für DIESE
          Pflegekraft bedeuten. */}
      {showLanguageInfo && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70]"
            onClick={() => setShowLanguageInfo(false)}
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          />
          <div
            className="fixed z-[70] inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          >
            <div
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-3xl pointer-events-auto shadow-2xl"
              style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center pt-3 pb-1 sm:hidden">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="px-5 pt-3 pb-5">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <h3 className="text-base font-bold text-gray-900">Deutschkenntnisse</h3>
                  <button
                    onClick={() => setShowLanguageInfo(false)}
                    className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
                    aria-label="Schließen"
                  >
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  {LANGUAGE_LEVELS_INTRO}
                </p>
                <div className="space-y-1.5">
                  {LANGUAGE_LEVELS.map(level => {
                    const isCurrent = level.bars === nurse.language.bars;
                    return (
                      <div
                        key={level.label}
                        className={`flex items-start gap-3 rounded-xl px-3 py-2.5 border ${
                          isCurrent ? 'bg-[#F5F5F6] border-zinc-200' : 'bg-gray-50 border-gray-100'
                        }`}
                      >
                        <div className="flex gap-0.5 pt-1 flex-shrink-0">
                          {Array.from({ length: 3 }, (_, i) => (
                            <div key={i} className={`w-3 h-1.5 rounded-full ${i < level.bars ? 'bg-[#8B7355]' : 'bg-gray-200'}`} />
                          ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-bold ${isCurrent ? 'text-[#3D2B1F]' : 'text-gray-800'}`}>{level.label}</p>
                            {isCurrent && (
                              <span className="text-[10px] font-bold text-[#8B7355] bg-white border border-zinc-200 px-2 py-0.5 rounded-full">
                                Aktuell
                              </span>
                            )}
                          </div>
                          <p className={`text-xs mt-0.5 leading-relaxed ${isCurrent ? 'text-gray-700' : 'text-gray-500'}`}>{level.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-4">
                  {LANGUAGE_LEVELS_FOOTER}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
