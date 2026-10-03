// Kompakter Einstieg ins Portal: der Zustand VOR dem ersten Absenden der Pflegesituation
// (Vorschlag 03.10.2026 für Martin: „ganz kompakt auf Angebot und passende Pflegekräfte … das ist
// erledigt, das ist das Angebot, das ist der nächste Schritt, hier sind die Pflegekräfte").
//
// Reihenfolge auf der Seite (CustomerPortalPage, `kompakt`):
//   Kopf: Begrüßung, „Ihr Angebot zur 24-Stunden-Betreuung" und eine kurze Einleitung (KompaktEinleitung)
//   → Kostenkarte: Preis, kleine Zeile, Eigenanteil (EigenanteilZeile), die vier Punkte,
//     Testsieger (KompaktTestsieger) und Sterne, Aufklapper
//   → Kasten „So geht es weiter" mit drei Schritten; das bestehende 4-Schritte-Formular
//     (AngebotCard) klappt unter Schritt 2 auf
//   → Pflegekräfte als Zeilen ohne Knöpfe.
// Alle anderen Zustände (abgesendet, Bewerbung, gebucht …) bleiben unverändert.
//
// Schrift: Fließtext 16 px, kleine Schrift 14 px. Ausnahme 13 px für die dritte Zeile der
// Pflegekräfte und den Hinweis unter ihrer Überschrift — so bleiben beide bei 390 px einzeilig.
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronRight, Lock, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EYEBROW, H2 } from '../ui/SectionHeader';

/**
 * Einleitung der Seite direkt unter dem Titel (Runde 5): Dank für die Anfrage und was die Seite zeigt.
 * Fließtext wie die Unterzeilen der anderen Zustände (16 px, gedämpft) — kein Kasten, kein Hinweis-Ton.
 */
export function KompaktEinleitung() {
  return (
    <p className="mt-3 text-[16px] leading-[1.55] text-pm-muted">
      {/* „zu Hause" und das letzte Wortpaar bleiben zusammen — sonst stand bei 390 px „passen."
          allein in der letzten Zeile. */}
      Vielen Dank für Ihre Anfrage. Hier sehen Sie, was eine bei uns angestellte Betreuungskraft bei
      Ihnen <span className="whitespace-nowrap">zu Hause</span> kostet, wie es weitergeht und welche
      Pflegekräfte zu Ihren <span className="whitespace-nowrap">Angaben passen.</span>
    </p>
  );
}

/**
 * Testsieger in der Kostenkarte (Runde 5): Siegel, „6× Testsieger DIE WELT", darunter Erfahrung und
 * Einsätze. Im Marta-Kasten weiter unten steht der Block unverändert („DIE WELT · Preis & Qualität").
 */
export function KompaktTestsieger() {
  return (
    <div className="flex items-center gap-3">
      <img src="/badge-testsieger.webp" alt="Testsieger DIE WELT" className="h-12 w-auto flex-none object-contain" />
      <p className="text-[14px] leading-snug text-pm-muted">
        <b className="text-[16px] text-pm-ink">
          6× Testsieger <span className="whitespace-nowrap">DIE WELT</span>
        </b>
        <br />
        {/* Zu schmal für eine Zeile (Handy): Umbruch nach „·", beide Hälften bleiben ganz. */}
        <span className="whitespace-nowrap">Über 20 Jahre Erfahrung</span>{'\u00A0'}·{' '}
        <span className="whitespace-nowrap">über 60.000 Einsätze</span>
      </p>
    </div>
  );
}

/** Kurzname eines Zuschusses für „nach …"; unbekannte Posten wie im Aufklapper (Label ohne Klammer). */
const KURZNAME: Record<string, string> = {
  pflegegeld: 'Pflegegeld',
  entlastungsbudget_neu: 'Entlastungsbudget',
  steuervorteil: 'Steuerersparnis',
};
export function zuschussKurzname(posten: { name: string; label: string }): string {
  return KURZNAME[posten.name] ?? posten.label.replace(/\s*\([^)]*\)\s*$/, '');
}

/** „A", „A und B", „A, B und C". */
export function aufzaehlung(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? '';
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`;
}

/**
 * Eigenanteil direkt unter dem Preis (Runde 4), leicht grün hinterlegt. Gerechnet wird hier
 * NICHTS: Betrag und Posten kommen aus derselben Rechnung wie „Alle Kosten im Überblick → Was
 * bleibt für Sie übrig → Ihr Eigenanteil" (CustomerPortalPage `eigenanteil`/`zuschussPosten`).
 * Genannt werden nur Posten, die den Betrag wirklich senken; „So rechnen wir ›" öffnet die
 * Aufstellung.
 */
export function EigenanteilZeile({ betrag, posten, onRechnung }: {
  /** Fertig formatiert wie in der Aufstellung, z. B. „1.622 €". */
  betrag: string;
  posten: { name: string; label: string }[];
  onRechnung: () => void;
}) {
  return (
    <div className="mt-3 rounded-[14px] bg-pm-mint px-3 py-2.5">
      <p className="text-[16px] leading-snug text-pm-ink">
        {/* Zu schmal (360 px): Umbruch nach „Ihr Eigenanteil:", der Betrag bleibt zusammen. */}
        Ihr Eigenanteil:{' '}
        <span className="whitespace-nowrap"><b className="font-bold tabular-nums">ca. {betrag}</b> im Monat</span>
      </p>
      <p className="mt-0.5 text-[14px] leading-snug text-pm-muted">
        nach {aufzaehlung(posten.map(zuschussKurzname))}{'\u00A0'}·{' '}
        <button
          type="button"
          onClick={onRechnung}
          className="inline-flex min-h-[44px] -my-3 items-center whitespace-nowrap font-semibold text-pm-green-deep underline underline-offset-[3px]"
        >
          So rechnen wir ›
        </button>
      </p>
    </div>
  );
}

/**
 * Kasten „So geht es weiter": drei Schritte untereinander als leichte Zeitleiste —
 * 1 erledigt (Angebot erstellt), 2 jetzt (Pflegesituation, Knopf), 3 später und gesperrt.
 * Der Knopf öffnet das bestehende Formular IM Kasten unter Schritt 2 (kein Sprung); `children`
 * ist die eingebettete AngebotCard, über die volle Breite des Kastens (die mitlaufende
 * Knopfleiste reicht von Rand zu Rand). `aktiv=false` (alle anderen Zustände): nur ein neutraler
 * Rahmen wie bisher, damit Kopf und Formular dort unverändert bleiben.
 * `onImBlick`: Kasten im Bild ja/nein — die schwebende Frage legt sich nicht über das Formular
 * (Regel aus Registry #102), und im Kompakt-Einstieg ist dieser Kasten das Formular.
 */
export function SchritteKasten({ aktiv, offen, onOeffnen, onImBlick, children }: {
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
      aria-labelledby="so-geht-es-weiter-titel"
      className="scroll-mt-16 rounded-card border-2 border-pm-taupe bg-white px-5 pb-5 pt-4 shadow-lift"
    >
      <h2 id="so-geht-es-weiter-titel" className="text-[20px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">
        So geht es weiter
      </h2>
      <ol className="mt-4">
        <li className="relative flex gap-2.5 pb-5">
          <Verbindung />
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-pm-mint text-pm-green-deep" aria-hidden="true">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <p className="pt-[2px] text-[16px] font-semibold leading-snug text-pm-mute">
            <span className="sr-only">Erledigt: </span>Angebot erstellt
          </p>
        </li>
        <li aria-current="step" className="relative flex gap-2.5 pb-5">
          {/* Offen steht das Formular über die volle Breite, die Linie hört dann hier auf. */}
          {!offen && <Verbindung />}
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-pm-coral text-[14px] font-bold text-white" aria-hidden="true">
            2
          </span>
          <div className="min-w-0 flex-1">
            {/* Gestaffelt, damit der Titel neben dem Kreis einzeilig bleibt (bei 360 px 246 von 252 px). */}
            <p className="pt-[2px] text-[15.5px] font-bold leading-snug text-pm-ink min-[375px]:text-[16px] min-[390px]:text-[17px]">
              Pflegesituation vervollständigen
            </p>
            <p className="mt-0.5 text-[16px] leading-[1.45] text-pm-muted">
              Dauert etwa 2 Minuten, vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst,
              wenn Sie sich für eine Pflegekraft entscheiden.
            </p>
            {offen ? (
              // Volle Kastenbreite: 26 px Kreis + 10 px Abstand zurück nach links.
              <div className="-ml-9 w-[calc(100%+2.25rem)]">{children}</div>
            ) : (
              <Button breit onClick={onOeffnen} className="mt-3 px-2 whitespace-nowrap">
                Jetzt vervollständigen →
              </Button>
            )}
          </div>
        </li>
        <li className="flex gap-2.5">
          {/* Später und noch gesperrt: grau, Schloss statt Zahl — darf nicht nach „geht schon" aussehen. */}
          <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full border border-pm-chip bg-white text-pm-mute" aria-hidden="true">
            <Lock className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="pt-[2px] text-[16px] font-semibold leading-snug text-pm-mute">
              <span className="sr-only">Danach: </span>Pflegekräfte einladen und Bewerbungen erhalten
            </p>
            <p className="mt-0.5 text-[14px] leading-[1.45] text-pm-mute">
              Passende Pflegekräfte bewerben sich bei Ihnen mit Foto, Erfahrung, Anreisedatum und Preis.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}

/** Senkrechte Linie zum nächsten Schritt, mittig unter dem 26-px-Kreis. */
function Verbindung() {
  return <span aria-hidden="true" className="absolute bottom-1 left-3 top-[30px] w-0.5 rounded-full bg-pm-line" />;
}

/**
 * Passende Pflegekräfte als Zeilen: Foto, Name und Alter, Deutsch mit Punkten, Erfahrung und
 * Einsätze bei uns. Keine Knöpfe — die ganze Zeile öffnet das Profil (wie „Profil ansehen").
 * Unter der Überschrift ein leiser Hinweis mit Schloss: Einladen geht erst mit vollständiger
 * Pflegesituation; der Tipp öffnet das Formular im Kasten „So geht es weiter".
 */
export function KompaktePflegekraefte({ eintraege, laedt, alleBearbeitet, keineVorschlaege, onProfil, onVervollstaendigen, telefonHref }: {
  /** Sichtbare Vorschläge in Anzeige-Reihenfolge (Empfehlung zuerst); `i` = Index für `openNurseFromMatch`. */
  eintraege: { nurse: Nurse; i: number }[];
  laedt: boolean;
  /** Alle Vorschläge abgelehnt, nichts Frisches mehr im Pool. */
  alleBearbeitet: boolean;
  /** Matchings geladen, aber keine passende Pflegekraft (z. B. strenger Deutsch-Filter). */
  keineVorschlaege: boolean;
  onProfil: (nurse: Nurse, i: number) => void;
  /** Hinweis „Vor dem Einladen: Pflegesituation vervollständigen →". */
  onVervollstaendigen: () => void;
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
          // Zu schmal für eine Zeile (unter 390 px): Umbruch nach „Vor dem Einladen:", nie mittendrin.
          <button
            type="button"
            onClick={onVervollstaendigen}
            className="-mb-2 mt-0.5 flex min-h-[44px] items-center gap-1.5 text-left text-[13px] font-medium leading-snug text-pm-taupe-ink"
          >
            <Lock className="h-3.5 w-3.5 flex-none" aria-hidden="true" />
            <span>
              <span className="whitespace-nowrap">Vor dem Einladen:</span>{' '}
              <span className="whitespace-nowrap underline decoration-pm-taupe/40 underline-offset-[3px]">Pflegesituation vervollständigen →</span>
            </span>
          </button>
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

/**
 * Eine Zeile: dieselben Daten wie das Profil (PflegekraftProfil), fehlende Teile entfallen.
 * Keine Sterne: Wir haben keine Bewertungen je Pflegekraft.
 */
export function PflegekraftZeile({ nurse, empfohlen, onClick }: { nurse: Nurse; empfohlen: boolean; onClick: () => void }) {
  const name = displayName(nurse.name);
  const einsaetze = nurse.history?.assignments ?? 0;
  const jahre = nurse.experienceYears ?? 0;
  const deutsch = nurse.language?.level && nurse.language.level !== '—' ? nurse.language.level : null;
  const punkte = nurse.language?.bars ?? 0;
  const erfahrung = [
    jahre > 0 ? `${jahre} ${jahre === 1 ? 'Jahr' : 'Jahre'} Erfahrung` : null,
    einsaetze > 0 ? `${einsaetze} ${einsaetze === 1 ? 'Einsatz' : 'Einsätze'} bei uns` : null,
  ].filter((t): t is string => t !== null);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Profil von ${name} ansehen`}
      className="flex w-full items-center gap-2.5 px-3 py-3 text-left transition-colors hover:bg-pm-paper active:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe"
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
        {deutsch && (
          <span className="mt-0.5 flex items-center gap-1.5 text-[14px] leading-snug text-pm-muted">
            {punkte > 0 && <DeutschPunkte punkte={punkte} />}
            Deutsch {deutsch.toLowerCase()}
          </span>
        )}
        {erfahrung.length > 0 && (
          // Bricht es um (unter 390 px), dann am „·", das beim ersten Teil bleibt.
          <span className="mt-0.5 block text-[13px] leading-snug text-pm-muted">
            {erfahrung.map((teil, k) => (
              <Fragment key={teil}>
                {k > 0 && ' · '}
                <span className="whitespace-nowrap">{teil}</span>
              </Fragment>
            ))}
          </span>
        )}
      </span>
      {/* Schmal gehalten (16 px, eng am Text): Zeile 3 braucht bei 390 px bis zu 246 von 252 px. */}
      <ChevronRight className="-ml-2 h-4 w-4 flex-none text-pm-mute" aria-hidden="true" />
    </button>
  );
}
