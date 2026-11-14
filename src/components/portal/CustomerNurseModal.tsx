import { useEffect, useState } from 'react';
import type { FC, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Check, X, UserPlus, ArrowDown, Undo2 } from 'lucide-react';
import type { Nurse } from '../../types';
import type { Application } from './shared';
import { displayName, initials } from './shared';
import { MOBILITAETS_GRUENDE, passtGruende, weitereQualifikationen, type KundenBedarf } from '../../lib/passtZuIhnen';

// Profil der Pflegekraft als Blatt von unten. Neu gebaut nach dem freigegebenen Bild vom 14.11.2026 (Runde 5, Richtung A
// „Eine Symbolsprache“, seo-reports/analysen/pk-karten-einheitlich-2026-11-14/runde5/a_icons_v3): EIN weißes Blatt, Kopf
// mit rundem Foto, „Vorname, Alter“, Erfahrung und Deutsch; der Kasten „Warum … zu Ihnen passt“ ist das einzige hinterlegte
// Element; jede Angabe in derselben Zeilenform (beiger Kreis mit dünnem Symbol, graue Zeile, dunkler Wert); Abschnitte nur
// durch Weißraum getrennt. Martin 14.11.2026: keine Stufen („Elite“, „Unsere Erfahrungsstufen“), keine Verfügbarkeit, kein
// Geschlecht, Geburtsjahr, Gewicht, Größe, „Weitere Interessen“ und keine „Akzeptierte Mobilität“ („betreut … das hat da
// oben nichts zu suchen“), keine Emojis.

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

const LANGUAGE_LEVELS_INTRO =
  'Eine grobe Orientierung — kein Sprach-Zertifikat. Die genaue Kommunikation hängt immer auch vom Tempo, der Mundart und der Geduld beider Seiten ab.';

// Dünne Liniensymbole wie im freigegebenen Bild (Pfade aus Lucide, ISC). Inline statt aus lucide-react: Die installierte
// Fassung kennt „briefcase-medical“ und das neue „house“ noch nicht, und so stimmen alle Symbole mit dem Bild überein.
const SYMBOLE = {
  flagge: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  person: <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
  herz: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  spross: <><path d="M7 20h10" /><path d="M10 20c5.5-2.5.8-6.4 3-10" /><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" /><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" /></>,
  rauchfrei: <><path d="M12 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h13" /><path d="M18 8c0-2.5-2-2.5-2-5" /><path d="m2 2 20 20" /><path d="M21 12a1 1 0 0 1 1 1v2a1 1 0 0 1-.5.866" /><path d="M22 8c0-2.5-2-2.5-2-5" /><path d="M7 12v4" /></>,
  rauchen: <><path d="M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14" /><path d="M18 8c0-2.5-2-2.5-2-5" /><path d="M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M22 8c0-2.5-2-2.5-2-5" /><path d="M7 12v4" /></>,
  auto: <><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" /></>,
  hut: <><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><path d="M22 10v6" /><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>,
  koffer: <><path d="M12 11v4" /><path d="M14 13h-4" /><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><rect width="20" height="14" x="2" y="6" rx="2" /></>,
  haus: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  datei: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" /></>,
} as const;
type SymbolName = keyof typeof SYMBOLE;

/** Runder Kreis 40 px mit Symbol: beige mit Taupe (Angaben) oder weiß mit grünem Haken (Kasten „Warum … passt“). */
const Kreis: FC<{ symbol?: SymbolName; haken?: boolean; laedt?: boolean }> = ({ symbol, haken = false, laedt = false }) => (
  <span
    className={`flex h-10 w-10 flex-none items-center justify-center rounded-full ${haken ? 'bg-white text-pm-green' : 'bg-pm-shell text-pm-taupe'} ${laedt ? 'animate-pulse' : ''}`}
    aria-hidden="true"
  >
    {(symbol || haken) && (
      <svg
        viewBox="0 0 24 24"
        className={haken ? 'h-[18px] w-[18px]' : 'h-5 w-5'}
        fill="none"
        stroke="currentColor"
        strokeWidth={haken ? 2.6 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {haken ? <path d="M20 6 9 17l-5-5" /> : SYMBOLE[symbol!]}
      </svg>
    )}
  </span>
);

/** Die eine Zeilenform: Kreis links, rechts graue Zeile oben (optional) und dunkler Wert darunter. */
const Zeile: FC<{ symbol: SymbolName; label?: string; wert: ReactNode }> = ({ symbol, label, wert }) => (
  <div className="flex items-start gap-3">
    <Kreis symbol={symbol} />
    <div className="flex min-h-[40px] min-w-0 flex-col justify-center">
      {label && <p className="text-[15px] leading-5 text-pm-muted">{label}</p>}
      <p className={`text-[16px] font-medium leading-[22px] tracking-[-0.01em] text-pm-ink ${label ? 'mt-px' : ''}`}>{wert}</p>
    </div>
  </div>
);

/** Platzhalter einer Zeile, solange das volle Profil lädt. */
const ZeileLaedt: FC = () => (
  <div className="flex items-start gap-3">
    <Kreis laedt />
    <div className="flex min-h-[40px] flex-1 animate-pulse flex-col justify-center gap-2">
      <div className="h-2.5 w-20 rounded bg-pm-line-soft" />
      <div className="h-3 w-40 rounded bg-pm-line-soft" />
    </div>
  </div>
);

const Kreisel: FC<{ className?: string }> = ({ className = '' }) => (
  <svg className={`animate-spin flex-shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

const ueberschriftCls = 'text-[19px] font-semibold leading-[26px] tracking-[-0.01em] text-pm-ink';
// Fuß: Hauptknopf Koralle, Nebenaktion als Textlink in Taupe (Regeln Martin, 14.11.2026).
const knopfCoralCls = 'flex min-h-[52px] flex-1 items-center justify-center gap-[9px] rounded-[14px] bg-pm-coral px-4 text-[17px] font-semibold tracking-[-0.005em] text-white transition-colors hover:bg-pm-coral-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-coral';
const textlinkCls = 'flex min-h-[48px] items-center whitespace-nowrap pr-1 text-[16px] font-semibold text-pm-taupe-ink underline decoration-pm-taupe/40 decoration-[1.5px] underline-offset-4 hover:decoration-pm-taupe';
const zustandCls = 'flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-pm-line bg-pm-paper px-4 text-[16px] font-semibold text-pm-taupe-ink';

/** „10.01. bis 20.03.2026“; über den Jahreswechsel mit beiden Jahren („15.12.2025 bis 20.02.2026“). */
function zeitraum(start: string, ende: string): string {
  const s = start.split('.');
  const e = ende.split('.');
  const gleichesJahr = s.length === 3 && e.length === 3 && s[2] === e[2];
  return `${gleichesJahr ? `${s[0]}.${s[1]}.` : start} bis ${ende}`;
}

const grossAnfang = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export const CustomerNurseModal: FC<{
  nurse: Nurse;
  /** True while the full Caregiver profile is in flight. The header and
   *  basic nurse data render immediately from the matching/application
   *  card; the deep "Über …" rows wait on GET_CAREGIVER (~1.7-3.1s on beta).
   *  When this is true we render a shimmer skeleton for those rows instead
   *  of empty ones. */
  profileLoading?: boolean;
  /** True while the AI-generated "Über die Pflegekraft" introduction is in
   *  flight. Decoupled from profileLoading because the basic profile lands
   *  fast (often cached) but the AI text takes ~3-5s. Without this prop
   *  the about-section briefly flashes Mamamia's raw motivation text, then
   *  swaps to AI — ugly. With it: we show a friendly loader until AI
   *  resolves, then either the AI text (success) or the Mamamia fallback
   *  (failure / null). */
  aboutLoading?: boolean;
  /** Bedarf des Kunden für „Warum {Vorname} zu Ihnen passt“ (Martin 14.11.2026: „was der Kunde wünscht“): vor dem ersten
   *  Speichern aus dem Rechner, danach aus der gespeicherten Pflegesituation (lib/passtZuIhnen.ts). Ohne Bedarf entfällt
   *  der Kasten. */
  kundenBedarf?: KundenBedarf | null;
  onClose: () => void;
  app?: Application;
  onReview?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  /** Performs the actual backend mutation. Spinner stays up until the
   *  promise resolves; on rejection modal rolls back to idle and the
   *  parent surfaces the error (CLAUDE.md §1 — no fake animation). */
  onInvite?: () => Promise<void>;
  /** Registry #163, 14.11.2026 (Martin: „wenn man ein Profil öffnet, dann muss dort nicht Button mit vervollständigen sein, sondern
   *  einladen zur Bewerbung … Dann Popup, wenn Daten noch fehlen“): vor dem Speichern EIN Knopf „Zur Bewerbung einladen“
   *  statt „Nein danke“ und „Einladen“; das Portal merkt vor und öffnet „{Name} einladen“ (Logik #145). Seit dem neuen Profil
   *  in Koralle (Martin 14.11.2026: Grün nur für Knöpfe, die zu „Pflegesituation vervollständigen“ führen). */
  einladenVorSpeichern?: () => void;
  /** 13.11.2026 (#162): vor dem Speichern EIN grüner Knopf ins Formular. Seit #163 nur noch für Profile, die das Portal vor dem
   *  Speichern nicht einladen kann (nicht in der offenen Liste); `einladenVorSpeichern` hat Vorrang. */
  zumFormular?: () => void;
  onDeclineMatch?: () => void;
  /** Nur ansehen, keine Aktionen (gebuchte Pflegekraft, Vertrag offen). */
  nurProfil?: boolean;
  /** Öffnet den (übersetzten) Chat mit der Pflegekraft. */
  onChat?: () => void;
  isInvited?: boolean;
  /** Wenn true, hat die Pflegekraft in Mamamia Interesse signalisiert.
   *  Modal zeigt dann unter dem Kopf einen Hinweis, dass eine Einladung
   *  ihre offizielle Bewerbung ermöglicht. */
  hasInterest?: boolean;
}> = ({ nurse, profileLoading = false, aboutLoading = false, kundenBedarf = null, onClose, app, onReview, onDecline, onUndo, onInvite, onDeclineMatch, onChat, isInvited = false, hasInterest = false, nurProfil = false, einladenVorSpeichern, zumFormular }) => {
  const [invited, setInvited] = useState(isInvited);
  const [invitePhaseModal, setInvitePhaseModal] = useState<'idle' | 'sending' | 'done'>('idle');
  // Erklärung der Sprachstufe klappt unter dem Kopf auf, zweiter Tipp schließt (Entwurf mockup_profil_v3, 14.11.2026).
  const [sprachInfoOffen, setSprachInfoOffen] = useState(false);
  const [refDownloading, setRefDownloading] = useState(false);

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

  // Aktionen nur, wenn es wirklich eine gibt (Review 25.09.): Aus dem
  // Gebucht-Bildschirm, dem Vertrag und den erledigten Karten kommt das Profil
  // ohne onInvite. Vorher stand dort trotzdem „Einladen" und meldete
  // „Pflegekraft wurde eingeladen!", ohne dass etwas gesendet wurde.
  const zeigeAktionen = !nurProfil && (!!app || !!onInvite || invited || !!einladenVorSpeichern || !!zumFormular);

  const handleModalInvite = async () => {
    if (!onInvite) return;
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

  const vorname = nurse.name.split(' ')[0] || nurse.name;
  const p = nurse.profile;
  // Volles Profil noch unterwegs: Zeilen als Platzhalter, Mobilitäts-Zeile im Kasten erst danach (sonst stünde sie kurz
  // da und verschwände wieder, wenn die Pflegekraft die Stufe nicht annimmt).
  const laedt = profileLoading && !p;

  const jahre = nurse.experienceYears ?? 0;
  const erfahrung = jahre > 0 ? (jahre === 1 ? '1 Jahr Erfahrung' : `${jahre} Jahre Erfahrung`) : null;
  const stufe = nurse.language?.level && nurse.language.level !== '—' ? nurse.language.level : null;
  const stufenText = LANGUAGE_LEVELS.find((l) => l.label === stufe);

  const alleGruende = passtGruende(kundenBedarf, p);
  const gruende = laedt ? alleGruende.filter((g) => !MOBILITAETS_GRUENDE.includes(g)) : alleGruende;

  // „Über …“: nur echte Angaben (CLAUDE.md §1). Ohne Text von mamamia kein erfundener Ersatzsatz mehr: Erfahrung und Deutsch
  // stehen schon im Kopf.
  const ueberText = p?.aboutDe || p?.motivation || '';
  const rauchen = !p?.smoking ? null
    : p.smoking === 'no' ? (nurse.gender === 'male' ? 'Nichtraucher' : 'Nichtraucherin')
    : `${nurse.gender === 'male' ? 'Raucher' : 'Raucherin'}${p.smoking === 'yes_outside' ? ' (nur draußen)' : ''}`;
  const qualifikationen = weitereQualifikationen(p?.qualifications, alleGruende);
  // Reihenfolge fest (Martin 14.11.2026, Bild a_icons_v3); fehlende Angaben entfallen.
  const angaben: Array<{ symbol: SymbolName; label?: string; wert: string }> = [];
  if (p?.nationality) angaben.push({ symbol: 'flagge', label: 'Nationalität', wert: p.nationality });
  if (p?.maritalStatus) angaben.push({ symbol: 'person', label: 'Familienstand', wert: p.maritalStatus });
  if (p && p.personalities.length > 0) angaben.push({ symbol: 'herz', label: 'Persönlichkeit', wert: grossAnfang(p.personalities.join(', ')) });
  if (p && p.hobbies.length > 0) angaben.push({ symbol: 'spross', label: 'Hobbys', wert: grossAnfang(p.hobbies.join(', ')) });
  if (rauchen) angaben.push({ symbol: p?.smoking === 'no' ? 'rauchfrei' : 'rauchen', wert: rauchen });
  if (p?.drivingLicense != null) {
    angaben.push({ symbol: 'auto', label: 'Führerschein', wert: p.drivingLicense ? `Ja${p.drivingLicenseGearbox ? ` (${p.drivingLicenseGearbox})` : ''}` : 'Nein' });
  }
  if (p?.isNurse != null) angaben.push({ symbol: 'hut', label: 'Pflegeberuf erlernt', wert: p.isNurse ? 'Ja' : 'Nein' });
  if (qualifikationen.length > 0) angaben.push({ symbol: 'koffer', label: 'Weitere Qualifikationen', wert: qualifikationen.join(', ') });
  const zeigeUeber = laedt || aboutLoading || !!ueberText || angaben.length > 0;

  const einsaetze = nurse.detailedAssignments ?? [];
  // Kein Hinweis „Derzeit im Einsatz bei einem anderen Kunden“ mehr: Martin 14.11.2026, keine Verfügbarkeit im Profil.
  // Überschrift „Letzte Einsätze“ nur, wenn es Einsätze (oder den Fehler der Abfrage) gibt; die Referenzen allein stehen
  // ohne Überschrift an derselben Stelle.
  const zeigeEinsaetze = einsaetze.length > 0 || !!nurse.einsaetzeError;

  // Satz über den Knöpfen, nur wenn es ums Einladen geht (nicht bei Bewerbungen, nicht nach der Einladung). Nicht neben dem
  // Interesse-Kasten: Der sagt schon „Laden Sie … ein“.
  const zeigeHinweis = zeigeAktionen && !app && !invited && !hasInterest && (!!einladenVorSpeichern || (!zumFormular && !!onInvite));

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/45" onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }} />

      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4 pointer-events-none"
        style={{ animation: 'fadeIn 0.2s ease-out' }}>
        <div
          className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-white font-pm text-pm-ink shadow-2xl pointer-events-auto sm:max-w-lg sm:rounded-[24px]"
          style={{ animation: 'slideSheet 0.3s cubic-bezier(0.32,0.72,0,1)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Griff mit schmalem weißen Rand darunter, damit gescrollter Text nicht direkt am Griff klebt. */}
          <div className="flex-shrink-0 pb-1.5 pt-2.5 sm:hidden">
            <div className="mx-auto h-[5px] w-10 rounded-[3px] bg-pm-chip" />
          </div>
          {/* Schließen: 44-px-Fläche, bleibt beim Scrollen oben rechts. */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-[14px] z-10 flex h-11 w-11 items-center justify-center"
            aria-label="Schließen"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pm-shell text-pm-taupe-ink">
              <X className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
            </span>
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-11">
            {/* Kopf: Foto, „Vorname, Alter“, Erfahrung, Deutsch mit Erklärung */}
            <div className="flex items-center gap-[18px] pr-11 pt-4 sm:pt-[22px]">
              {nurse.image ? (
                <img
                  src={nurse.image}
                  alt={`Foto von ${vorname}`}
                  className="h-[92px] w-[92px] flex-none rounded-full bg-pm-shell object-cover ring-1 ring-pm-line ring-offset-4 ring-offset-white"
                />
              ) : (
                <div
                  className="flex h-[92px] w-[92px] flex-none items-center justify-center rounded-full bg-pm-shell text-[28px] font-semibold text-pm-taupe-ink ring-1 ring-pm-line ring-offset-4 ring-offset-white"
                  aria-hidden="true"
                >
                  {initials(nurse.name)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-[24px] font-semibold leading-[30px] tracking-[-0.015em] text-pm-ink">
                  {vorname}{nurse.age ? <span className="font-normal text-pm-muted">, {nurse.age}</span> : null}
                </h2>
                {erfahrung && <p className="mt-1 text-[16px] leading-[22px] text-pm-ink">{erfahrung}</p>}
                {stufe && (
                  <p className="mt-1 flex items-center gap-0.5 text-[16px] leading-[22px] text-pm-ink">
                    Deutsch {stufe}
                    <button
                      type="button"
                      onClick={() => setSprachInfoOffen((offen) => !offen)}
                      className="-my-[11px] -ml-[9px] -mr-[13px] flex h-11 w-11 flex-none items-center justify-center text-pm-taupe"
                      aria-label={`Was bedeutet Deutsch ${stufe}?`}
                      aria-expanded={sprachInfoOffen}
                      // Nur auf ein Ziel zeigen, das es gibt: Die Erklärung steht erst im geöffneten Zustand im DOM.
                      aria-controls={sprachInfoOffen ? 'profil-sprachstufe' : undefined}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
                      </svg>
                    </button>
                  </p>
                )}
              </div>
            </div>

            {/* Erklärung der Sprachstufe: Standardtexte wie in den Häufigen Fragen. */}
            {stufe && sprachInfoOffen && (
              <div id="profil-sprachstufe" className="mt-5 rounded-[14px] border border-pm-line-soft bg-pm-paper px-4 py-3.5" data-sprachstufe>
                {stufenText && (
                  <>
                    <p className="flex items-center gap-2 text-[16px] font-semibold leading-[22px] text-pm-ink">
                      <span className="inline-flex gap-[3px]" aria-hidden="true">
                        {LANGUAGE_LEVELS.map((l) => (
                          <span key={l.bars} className={`block h-[9px] w-[9px] rounded-full ${l.bars <= stufenText.bars ? 'bg-pm-taupe' : 'bg-pm-chip'}`} />
                        ))}
                      </span>
                      Deutsch {stufenText.label}
                    </p>
                    <p className="mt-1.5 text-[15px] leading-[22px] text-pm-ink">{stufenText.desc}</p>
                  </>
                )}
                <p className={`${stufenText ? 'mt-2' : ''} text-[14px] leading-5 text-pm-muted`}>{LANGUAGE_LEVELS_INTRO}</p>
              </div>
            )}

            {/* "Hat Interesse"-Hinweis — nur wenn die Pflegekraft in Mamamia
                proaktiv Interesse signalisiert hat (z.B. via Like). Seit 14.11.2026
                ohne Koralle-Fläche (Regel Martin: keine roten Flächen). */}
            {hasInterest && (
              <div className="mt-5 rounded-[16px] border border-pm-line bg-pm-paper px-4 py-3.5">
                <p className="flex items-center gap-2 text-[16px] font-semibold leading-[22px] text-pm-ink">
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none text-pm-taupe" fill="currentColor" aria-hidden="true">{SYMBOLE.herz}</svg>
                  {vorname} hat Interesse signalisiert
                </p>
                <p className="mt-1 text-[15px] leading-[22px] text-pm-muted">
                  Sie hat Ihre Anfrage gesehen und würde sich gerne bei Ihnen bewerben. Laden Sie {vorname} ein, damit wir ihre offizielle Bewerbung anstoßen können.
                </p>
              </div>
            )}

            {/* Der eine hervorgehobene Kasten. Kreise auf denselben Kanten wie alle anderen (−10 px Rand, 10 px Innenabstand). */}
            {gruende.length > 0 && (
              <section className="-mx-2.5 mt-7 rounded-[20px] bg-pm-shell px-2.5 py-5" data-passt-gruende>
                <h3 className={`${ueberschriftCls} mb-3.5`}>Warum {vorname} zu Ihnen passt</h3>
                <ul className="grid gap-2.5">
                  {gruende.map((g) => (
                    <li key={g} className="flex items-start gap-3">
                      <Kreis haken />
                      <span className="flex min-h-[40px] items-center text-[16px] font-medium leading-[22px] tracking-[-0.01em] text-pm-ink">{g}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {zeigeUeber && (
              <section className="mt-10">
                <h3 className={`${ueberschriftCls} mb-4`}>Über {vorname}</h3>
                {laedt ? (
                  <div className="mb-[22px] animate-pulse space-y-2.5" aria-hidden="true">
                    <div className="h-3 w-full rounded bg-pm-line-soft" />
                    <div className="h-3 w-11/12 rounded bg-pm-line-soft" />
                    <div className="h-3 w-9/12 rounded bg-pm-line-soft" />
                  </div>
                ) : aboutLoading ? (
                  <div className="mb-[22px] flex items-start gap-3">
                    <Kreisel className="mt-0.5 h-5 w-5 text-pm-taupe" />
                    <p className="text-[16px] italic leading-[26px] text-pm-muted">
                      Wir bereiten Ihnen gerade eine persönliche Vorstellung von {vorname} vor…
                    </p>
                  </div>
                ) : ueberText ? (
                  <p className="mb-[22px] whitespace-pre-line text-[16px] leading-[26px] text-pm-ink">{ueberText}</p>
                ) : null}
                {laedt ? (
                  <div className="grid gap-[18px]">
                    <ZeileLaedt /><ZeileLaedt /><ZeileLaedt /><ZeileLaedt />
                  </div>
                ) : angaben.length > 0 && (
                  <div className="grid gap-[18px]">
                    {angaben.map((a) => <Zeile key={a.symbol} symbol={a.symbol} label={a.label} wert={a.wert} />)}
                  </div>
                )}
              </section>
            )}

            {/* Letzte Einsätze — CaregiverDeparturesWithPagination (Registry #126). Je Einsatz eine Zeile: Zeitraum und Dauer
                grau, Ort dunkel. Fehler der Abfrage sichtbar; die Referenzen früherer Familien als letzte Zeile, ohne
                Einsätze ohne die Überschrift. */}
            {(zeigeEinsaetze || !!nurse.referencePdfUrl) && (
              <section className="mt-10" data-einsaetze>
                {zeigeEinsaetze && <h3 className={`${ueberschriftCls} mb-4`}>Letzte Einsätze</h3>}
                <div className="grid gap-[18px]">
                  {einsaetze.map((a, i) => {
                    const ort = a.city || a.postalCode;
                    const zeile = [zeitraum(a.startDate, a.endDate), a.duration].filter(Boolean).join(' · ');
                    return <Zeile key={i} symbol="haus" label={ort ? zeile : undefined} wert={ort || zeile} />;
                  })}
                  {nurse.einsaetzeError && (
                    <p className="text-[16px] leading-[22px] text-pm-muted">Die Einsätze können wir gerade nicht abrufen.</p>
                  )}
                  {/* Referenz-PDF: Klick lädt die PDF herunter (siehe handleReferenceDownload) statt den langen
                      vorsignierten S3-Link im Tab zu zeigen. Das href bleibt gesetzt, damit „Link speichern unter" /
                      Fallback weiterhin funktionieren. */}
                  {nurse.referencePdfUrl && (
                    <a href={nurse.referencePdfUrl} onClick={handleReferenceDownload} download className="flex items-start gap-3">
                      <Kreis symbol="datei" />
                      <span className="flex min-h-[40px] min-w-0 flex-col justify-center">
                        <span className="text-[15px] leading-5 text-pm-muted">Referenzen</span>
                        <span className="mt-px flex items-center gap-2 text-[16px] font-medium leading-[22px] tracking-[-0.01em] text-pm-taupe-ink underline decoration-pm-taupe/40 underline-offset-4">
                          {refDownloading ? 'Wird heruntergeladen…' : 'Empfehlungen früherer Familien'}
                          {refDownloading && <Kreisel className="h-4 w-4 text-pm-taupe" />}
                        </span>
                      </span>
                    </a>
                  )}
                </div>
              </section>
            )}
          </div>

          {(onChat || zeigeAktionen) && (
          <div className="flex-shrink-0 space-y-3 border-t border-pm-line bg-white px-5 pb-[max(26px,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-10px_28px_rgba(40,30,20,0.06)]">
            {onChat && (
              <button
                type="button"
                onClick={onChat}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border border-pm-line bg-white text-[16px] font-semibold text-pm-taupe-ink transition-colors hover:bg-pm-paper"
              >
                <svg className="h-[18px] w-[18px] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l.8-3.2A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Frage an {vorname} stellen
              </button>
            )}
            {zeigeAktionen && (
            <div>
            {zeigeHinweis && (
              <p className="mb-2.5 text-center text-[15px] leading-[21px] text-pm-muted">Laden Sie {vorname} ein, sich zu bewerben.</p>
            )}
            <div className="flex items-center gap-4">
            {!app && einladenVorSpeichern ? (
              <button
                type="button"
                onClick={einladenVorSpeichern}
                className={`${knopfCoralCls} w-full max-[339px]:text-[15px]`}
                data-profil-einladen
              >
                <UserPlus className="h-[19px] w-[19px] flex-none max-[339px]:hidden" strokeWidth={2.2} aria-hidden="true" />
                <span className="whitespace-nowrap">Zur Bewerbung einladen</span>
              </button>
            ) : !app && zumFormular ? (
              <button
                type="button"
                onClick={zumFormular}
                className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[12px] bg-pm-green px-3 text-[16px] font-bold text-white hover:bg-pm-green-deep max-[339px]:text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pm-green"
                data-profil-zum-formular
              >
                <span className="whitespace-nowrap">Pflegesituation vervollständigen</span>
                <ArrowDown className="h-[18px] w-[18px] flex-none max-[339px]:hidden" strokeWidth={2.5} aria-hidden="true" />
              </button>
            ) : app ? (
              app.status === 'declined' ? (
                <button
                  type="button"
                  onClick={() => { onUndo?.(); onClose(); }}
                  className={`${zustandCls} transition-colors hover:bg-pm-shell`}
                >
                  <Undo2 className="h-[18px] w-[18px]" aria-hidden="true" /> Ablehnung rückgängig machen
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => onDecline?.()} className={textlinkCls}>
                    Ablehnen
                  </button>
                  <button type="button" onClick={onReview} className={knopfCoralCls}>
                    Angebot prüfen
                  </button>
                </>
              )
            ) : (
              <>
                {!invited ? (
                  <>
                    {onDeclineMatch && (
                    <button type="button" onClick={() => { onDeclineMatch(); }} className={textlinkCls}>
                      Nein danke
                    </button>
                    )}
                    {invitePhaseModal === 'sending' ? (
                      <div className={zustandCls}>
                        <Kreisel className="h-4 w-4" />
                        Pflegekraft wird eingeladen…
                      </div>
                    ) : invitePhaseModal === 'done' ? (
                      <div className={`${zustandCls} text-pm-ink`}>
                        <Check className="h-[18px] w-[18px] text-pm-green" aria-hidden="true" /> Pflegekraft wurde eingeladen!
                      </div>
                    ) : (
                      <button type="button" onClick={handleModalInvite} className={knopfCoralCls}>
                        <UserPlus className="h-[19px] w-[19px] flex-none" strokeWidth={2.2} aria-hidden="true" /> Einladen
                      </button>
                    )}
                  </>
                ) : (
                  <div className={zustandCls}>
                    <Check className="h-[18px] w-[18px]" aria-hidden="true" /> Eingeladen — warten auf Bewerbung
                  </div>
                )}
              </>
            )}
            </div>
            </div>
            )}
          </div>
          )}
        </div>
      </div>
    </>
  );
};
