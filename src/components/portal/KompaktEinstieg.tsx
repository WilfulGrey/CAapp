// Kompakter Einstieg ins Portal: der Zustand VOR dem ersten Absenden der Pflegesituation
// (Vorschlag 03.10.2026 für Martin: „ganz kompakt auf Angebot und passende Pflegekräfte … das ist
// erledigt, das ist das Angebot, das ist der nächste Schritt, hier sind die Pflegekräfte").
//
// Reihenfolge auf der Seite (CustomerPortalPage, `kompakt`):
//   Kopf: Begrüßung, „Ihr persönliches Angebot", Sterne-Zeile, Fortschritt in EINER Zeile
//   → Kostenkarte (kompakt, Details im Aufklapper) → Kasten „Ihr nächster Schritt" mit dem
//   bestehenden 4-Schritte-Formular (AngebotCard) → Pflegekräfte als Zeilen ohne Knöpfe.
// Alle anderen Zustände (abgesendet, Bewerbung, gebucht …) bleiben unverändert.
//
// Schrift in diesem Zustand: Fließtext 16 px, kleine Schrift 14 px. Ausnahme ist die
// Fortschrittszeile: Sie muss bei 360 px in eine Zeile passen, deshalb dort kleiner.
import { useEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { displayName, initials, nurseLevel } from './shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EYEBROW, H2 } from '../ui/SectionHeader';

/**
 * Sterne-Zeile unter der Überschrift und Fortschritt. Die Sterne kommen aus demselben Lader wie
 * im Marta-Kasten (`useSterneStand`); ohne Stand keine Zeile. Die Höhe ist reserviert, damit
 * nichts darunter springt, wenn der Stand erst nach dem ersten Bild eintrifft (Sprungziel
 * `goto=anfragen` liegt darunter).
 */
export function KompaktKopf({ sterne }: { sterne: SterneStand | null }) {
  return (
    <>
      <div className="mt-1 h-7 flex items-center">
        <BewertungsZeile stand={sterne} className="-my-2" />
      </div>
      <Fortschritt />
    </>
  );
}

/**
 * „✓ Angebot erstellt · 2 Pflegesituation · 3 Pflegekräfte einladen": leicht, kein Bestell-Stepper.
 * Die drei Wörter sind fest (Wortlaut freigegeben) und brauchen in Inter bei 12 px schon 306 px —
 * mehr, als bei 390 px neben den Symbolen Platz ist. Deshalb kleine Schrift, mit der Breite
 * gestaffelt (10,5 / 11 / 11,5 px), Symbole und Abstände in em: Die Zeile schrumpft als Ganzes und
 * bricht nie um. Gemessen in WebKit bei 360 und 390 px (scrollWidth = clientWidth).
 */
export function Fortschritt() {
  return (
    <ol
      aria-label="Ihr Fortschritt"
      className="mt-2.5 flex items-center justify-between whitespace-nowrap leading-none text-[10.5px] min-[375px]:text-[11px] min-[390px]:text-[11.5px]"
    >
      <li className="flex items-center gap-[0.3em] font-semibold text-pm-green-deep">
        <Check className="h-[1.05em] w-[1.05em] flex-none" strokeWidth={3} aria-hidden="true" />
        Angebot erstellt
      </li>
      <Trenner />
      <li aria-current="step" className="flex items-center gap-[0.3em] font-bold text-pm-ink">
        <span className="flex h-[1.4em] w-[1.4em] flex-none items-center justify-center rounded-full bg-pm-coral text-[0.85em] text-white" aria-hidden="true">2</span>
        Pflegesituation
      </li>
      <Trenner />
      <li className="flex items-center gap-[0.25em] font-semibold text-pm-mute">
        <span className="flex-none" aria-hidden="true">3</span>
        Pflegekräfte einladen
      </li>
    </ol>
  );
}

function Trenner() {
  return <li aria-hidden="true" className="h-[1.1em] w-px flex-none bg-pm-chip" />;
}

/**
 * Kasten „Ihr nächster Schritt". Der Knopf öffnet das bestehende Formular IM Kasten (kein
 * Sprung); `children` ist die eingebettete AngebotCard. `aktiv=false` (alle anderen Zustände):
 * nur ein neutraler Rahmen wie bisher, damit Kopf und Formular dort unverändert bleiben.
 * `onImBlick`: Kasten im Bild ja/nein — die schwebende Rückmeldung legt sich nicht über das
 * Formular (Regel aus Registry #102), und im Kompakt-Einstieg ist der Kasten das Formular.
 */
export function NaechsterSchritt({ aktiv, offen, onOeffnen, onImBlick, children }: {
  aktiv: boolean;
  offen: boolean;
  onOeffnen: () => void;
  onImBlick?: (imBlick: boolean) => void;
  children: ReactNode;
}) {
  const kasten = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = kasten.current;
    if (!aktiv || !el || !onImBlick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => onImBlick(e.some((x) => x.isIntersecting)));
    io.observe(el);
    return () => { io.disconnect(); onImBlick(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);
  if (!aktiv) return <div>{children}</div>;
  return (
    // id = Sprungziel aller Wege ins Formular (`zurPflegesituation`, Mail-Link `goto=anfragen`).
    <section
      ref={kasten}
      id="patientendaten"
      aria-labelledby="naechster-schritt-titel"
      className="scroll-mt-16 rounded-card border-2 border-pm-taupe bg-white px-5 pb-4 pt-[18px] shadow-lift"
    >
      <p className={EYEBROW}>Ihr nächster Schritt</p>
      {/* 20 px passt erst ab 390 px in eine Zeile (gemessen: 311 px bei 318 px Platz). */}
      <h2 id="naechster-schritt-titel" className="mt-1 text-[18px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink min-[390px]:text-[20px]">
        Pflegesituation vervollständigen
      </h2>
      <p className="mt-1.5 text-[16px] leading-[1.5] text-pm-muted">
        Dauert etwa 2 Minuten, vieles ist schon ausgefüllt. Danach laden Sie die Pflegekräfte ein, die Ihnen gefallen.
      </p>
      {!offen && (
        <Button breit onClick={onOeffnen} className="mt-4 whitespace-nowrap">
          Jetzt vervollständigen →
        </Button>
      )}
      {children}
    </section>
  );
}

/**
 * Passende Pflegekräfte als Zeilen: Foto, Name und Alter, Deutsch und Erfahrung, Einsätze bei uns.
 * Keine Knöpfe — die ganze Zeile öffnet das Profil (wie „Profil ansehen"). Einladen geht dort,
 * sobald die Pflegesituation vollständig ist; vorher führt „Einladen" im Profil ins Formular.
 */
export function KompaktePflegekraefte({ eintraege, laedt, alleBearbeitet, keineVorschlaege, onProfil, telefonHref }: {
  /** Sichtbare Vorschläge in Anzeige-Reihenfolge (Empfehlung zuerst); `i` = Index für `openNurseFromMatch`. */
  eintraege: { nurse: Nurse; i: number }[];
  laedt: boolean;
  /** Alle Vorschläge abgelehnt, nichts Frisches mehr im Pool. */
  alleBearbeitet: boolean;
  /** Matchings geladen, aber keine passende Pflegekraft (z. B. strenger Deutsch-Filter). */
  keineVorschlaege: boolean;
  onProfil: (nurse: Nurse, i: number) => void;
  telefonHref: string;
}) {
  const n = laedt ? 0 : eintraege.length;
  const titel = n === 0 ? 'Passende Pflegekräfte' : `${n} passende ${n === 1 ? 'Pflegekraft' : 'Pflegekräfte'}`;
  return (
    <section aria-labelledby="pflegekraefte-titel">
      {/* id = Sprungziel des Mail-Links `goto=matches` (scrollt, sobald die Liste steht). */}
      <div id="pflegekraefte" className="px-1" style={{ scrollMarginTop: 96 }}>
        <p className={EYEBROW}>Für Sie ausgewählt</p>
        <h2 id="pflegekraefte-titel" className={`mt-1.5 ${H2}`}>{titel}</h2>
        {n > 0 && (
          <p className="mt-2 text-[16px] leading-[1.5] text-pm-muted">
            Einladen können Sie sie, sobald die Pflegesituation vollständig ist.
          </p>
        )}
      </div>

      {laedt ? (
        <Card className="mt-4 px-5 py-8 text-center">
          <div className="mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-pm-chip border-t-transparent" />
          <p className="text-[16px] font-semibold text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
        </Card>
      ) : n > 0 ? (
        <Card className="mt-4 divide-y divide-pm-line-soft overflow-hidden">
          {eintraege.map(({ nurse, i }, pos) => (
            <PflegekraftZeile key={nurse.caregiverId ?? i} nurse={nurse} empfohlen={pos === 0} onClick={() => onProfil(nurse, i)} />
          ))}
        </Card>
      ) : alleBearbeitet ? (
        <Card className="mt-4 px-5 py-5 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">
            Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
          </p>
        </Card>
      ) : keineVorschlaege ? (
        <Card className="mt-4 px-5 py-6 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Gerade keine weiteren Vorschläge</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Neue passende Pflegekräfte erscheinen hier.</p>
          <a
            href={telefonHref}
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border-[1.5px] border-pm-chip px-5 text-[15px] font-bold text-pm-taupe-ink hover:border-pm-taupe"
          >
            Mit Marta sprechen
          </a>
        </Card>
      ) : null}
    </section>
  );
}

/** Eine Zeile: dieselben Daten wie das Profil auf der Karte (PflegekraftProfil), fehlende Teile entfallen. */
export function PflegekraftZeile({ nurse, empfohlen, onClick }: { nurse: Nurse; empfohlen: boolean; onClick: () => void }) {
  const name = displayName(nurse.name);
  const einsaetze = nurse.history?.assignments ?? 0;
  const jahre = nurse.experienceYears ?? 0;
  // Stern nur bei den Stufen, die ihn heute im Profil tragen.
  const stufe = nurseLevel(jahre, einsaetze).label;
  const stern = stufe === 'Elite' || stufe === 'Stammkraft';
  const deutsch = nurse.language?.level && nurse.language.level !== '—' ? `Deutsch ${nurse.language.level.toLowerCase()}` : null;
  const erfahrung = jahre > 0 ? `${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'} Erfahrung` : null;
  const zweiteZeile = [deutsch, erfahrung].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Profil von ${name} ansehen`}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-pm-paper active:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe"
    >
      {nurse.image ? (
        <img src={nurse.image} alt="" className="h-14 w-14 flex-none rounded-[12px] object-cover" />
      ) : (
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-[12px] text-[18px] font-bold text-white" style={{ backgroundColor: nurse.color }} aria-hidden="true">
          {initials(nurse.name)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        {empfohlen && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-pm-shell px-2 py-[3px] text-[12.5px] font-bold leading-none text-pm-taupe-ink">
            <Sparkles className="h-3 w-3 flex-none" aria-hidden="true" />
            Unsere Empfehlung
          </span>
        )}
        <span className="block text-[17px] font-bold leading-snug text-pm-ink">
          {name}
          {nurse.age ? <span className="font-normal text-pm-mute">, {nurse.age}</span> : null}
        </span>
        {/* Kleine Schrift 14 px; bei 360 px 13 px, damit „Deutsch mittel · 12 Jahre Erfahrung"
            (längste Kombination, 215 px) neben Foto und Pfeil noch in eine Zeile passt. */}
        {zweiteZeile && (
          <span className="mt-0.5 block text-[13px] leading-snug text-pm-muted min-[375px]:text-[14px]">{zweiteZeile}</span>
        )}
        {einsaetze > 0 && (
          <span className="mt-0.5 block text-[14px] leading-snug text-pm-muted">
            {stern && <span className="text-pm-stern" aria-hidden="true">★&nbsp;</span>}
            {einsaetze} {einsaetze === 1 ? 'Einsatz' : 'Einsätze'} bei uns
          </span>
        )}
      </span>
      <ChevronRight className="-ml-1.5 h-[18px] w-[18px] flex-none text-pm-mute" aria-hidden="true" />
    </button>
  );
}
