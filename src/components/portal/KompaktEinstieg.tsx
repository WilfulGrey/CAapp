// Kompakter Einstieg ins Portal: der Zustand VOR dem ersten Absenden der Pflegesituation
// (Vorschlag 03.10.2026 für Martin: „ganz kompakt auf Angebot und passende Pflegekräfte … das ist
// erledigt, das ist das Angebot, das ist der nächste Schritt, hier sind die Pflegekräfte").
//
// Reihenfolge auf der Seite (CustomerPortalPage, `kompakt`), Runde 8 (Geschäftsführung: „Wir haben
// doch echte Pflegekräfte, daher brauchen wir keine Fake-Box … kurze, schöne und sichere Einleitung
// zum Angebot, dann Kosten und dann Pflegekräfte. Wenn die Pflegesituation unvollständig ist, dann
// ein Hinweis."):
//   Kopf: Begrüßung, „Ihr Angebot zur 24-Stunden-Betreuung", Einleitung (KompaktEinleitung) und eine
//     Zeile Fakten (KompaktFakten)
//   → Kostenkarte: Preis, kleine Zeile, Eigenanteil (EigenanteilZeile; „So rechnen wir ›" öffnet die
//     Aufstellung), die vier Punkte der Startseite, unten Testsieger-Siegel und Sterne (KompaktVertrauen)
//   → „Für Sie ausgewählt / Ihre passenden Pflegekräfte" (KompaktPflegekraefteBereich) mit dem
//     Hinweis „Noch 2 Minuten bis zum Einladen" (hebt sich ab: Koralle-Ton, Koralle-Rand; das
//     4-Schritte-Formular klappt darin auf einer weißen Fläche auf), darunter die echten Profile als
//     Zeilen ohne Knöpfe (KompaktePflegekraefte).
// Alle anderen Zustände (abgesendet, Bewerbung, gebucht …) bleiben unverändert.
//
// Schrift: Fließtext 16 px, kleine Schrift 14 px. Ausnahme 13 px für die dritte Zeile der
// Pflegekräfte — so bleibt sie bei 390 px einzeilig.
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import { BewertungsZeile } from './BewertungsZeile';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SectionHeader } from '../ui/SectionHeader';

/**
 * Einleitung unter dem Titel (Runde 12, Wortlaut der Geschäftsführung): was das Angebot umfasst.
 * Fließtext wie die Unterzeilen der anderen Zustände — kein Kasten.
 */
export function KompaktEinleitung() {
  return (
    <p className="mt-3 text-[16px] leading-[1.55] text-pm-muted">
      Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte Betreuungskräfte.
    </p>
  );
}

/** Die Fakten unter der Einleitung (Runde 12, Wortlaut der Geschäftsführung). */
export const FAKTEN = ['Über 20 Jahre Erfahrung', 'Täglich kündbar', '6× in Folge Testsieger DIE WELT'] as const;

/**
 * EINE Zeile Fakten unter der Einleitung (Runde 12): nicht klein (15 px, halbfett, Taupe), jeder
 * Punkt bleibt ganz, umbrochen wird nur zwischen den Punkten. Der Trenner „·" sitzt VOR jedem Punkt
 * im Abstand davor; am Zeilenanfang liegt er links außerhalb und wird abgeschnitten — so steht nie
 * ein „·" am Zeilenende oder -anfang. Bei 360–390 px: „Über 20 Jahre Erfahrung · Täglich kündbar" /
 * „6× in Folge Testsieger DIE WELT".
 */
export function KompaktFakten() {
  return (
    <div className="mt-2.5 overflow-hidden">
      <ul className="-ml-5 flex flex-wrap gap-y-0.5 text-[15px] font-semibold leading-snug text-pm-taupe-ink">
        {FAKTEN.map((fakt) => (
          <li
            key={fakt}
            className="relative whitespace-nowrap pl-5 before:absolute before:left-[7px] before:font-normal before:text-pm-taupe before:content-['·']"
          >
            {fakt}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Unten in der Kostenkarte (Runde 12): eine ruhige Zeile mit dem kleinen Testsieger-Siegel und den
 * Sternen wie auf der Startseite. Höhe reserviert, damit nichts springt, wenn der Stand später kommt;
 * ohne Stand bleibt nur das Siegel.
 */
export function KompaktVertrauen({ sterne }: { sterne: SterneStand | null }) {
  return (
    <div className="mt-3.5 border-t border-pm-line-soft pt-3">
      <div className="flex h-7 items-center gap-2">
        <img src="/badge-testsieger.webp" alt="" className="h-7 w-auto flex-none object-contain" />
        <BewertungsZeile stand={sterne} klein className="-my-2" />
      </div>
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
 * NICHTS: Betrag und Posten kommen aus derselben Rechnung wie die Aufstellung „Was bleibt für Sie
 * übrig → Ihr Eigenanteil" (CustomerPortalPage `eigenanteil`/`zuschussPosten`). Genannt werden nur
 * Posten, die den Betrag wirklich senken; „So rechnen wir ›" öffnet die Aufstellung.
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
 * Pflegekräfte-Bereich (Runde 8): Kopf „Für Sie ausgewählt / Ihre passenden Pflegekräfte", darunter
 * der schmale Hinweis „Noch 2 Minuten bis zum Einladen" — im Kompakt-Einstieg ist die Pflegesituation
 * per Definition noch nicht abgeschickt, also steht er hier immer — dann die echten Profile (`liste`).
 * Der Knopf öffnet das bestehende 4-Schritte-Formular IM Hinweis (`children` = eingebettete
 * AngebotCard; px-5, weil die mitlaufende Knopfleiste von Rand zu Rand reicht). id des Hinweises =
 * Sprungziel aller Wege ins Formular (`zurPflegesituation`, Mail-Link `goto=anfragen`, „Einladen" im
 * Profil). `aktiv=false` (alle anderen Zustände): nur ein neutraler Rahmen um das Formular wie bisher.
 * `onImBlick`: Hinweis im Bild ja/nein — die schwebende Frage legt sich nicht über das Formular.
 */
export function KompaktPflegekraefteBereich({ aktiv, offen, onOeffnen, onImBlick, liste, children }: {
  aktiv: boolean;
  offen: boolean;
  onOeffnen: () => void;
  onImBlick?: (imBlick: boolean) => void;
  liste: ReactNode;
  children: ReactNode;
}) {
  const hinweis = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = hinweis.current;
    if (!aktiv || !el || !onImBlick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => onImBlick(e.some((x) => x.isIntersecting)));
    io.observe(el);
    return () => { io.disconnect(); onImBlick(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);
  if (!aktiv) return <div>{children}</div>;
  return (
    <section aria-labelledby="pflegekraefte-titel">
      {/* id = Sprungziel des Mail-Links `goto=matches` (scrollt, sobald die Liste steht). */}
      <div id="pflegekraefte" className="px-1" style={{ scrollMarginTop: 72 }}>
        <SectionHeader
          id="pflegekraefte-titel"
          eyebrow="Für Sie ausgewählt"
          titel="Ihre passenden Pflegekräfte"
          // Bei 360 px zweizeilig: „Ihren Angaben." bleibt zusammen.
          zeile={<>Echte Profile, ausgewählt nach <span className="whitespace-nowrap">Ihren Angaben.</span></>}
        />
      </div>
      {/* Hülle trägt id und Ref. Look A (Runde 12, „Text und Formularkasten ist gleich"): hebt sich klar
          vom Seitentext ab — Koralle-Ton, 2 px Koralle-Rand, Schatten; offen liegt das Formular auf einer
          weißen Innenfläche (px-5, damit die mitlaufende Knopfleiste bündig bleibt). */}
      <div ref={hinweis} id="patientendaten" className="mt-4 scroll-mt-16">
      <div className="rounded-card border-2 border-pm-coral bg-pm-coral-tint px-5 pb-4 pt-4 shadow-lift">
        <p className="text-[17.5px] font-extrabold leading-[1.25] text-pm-ink">Noch 2 Minuten bis zum Einladen</p>
        <p className="mt-1.5 text-[14.5px] leading-[1.5] text-pm-muted">
          Vervollständigen Sie kurz Ihre Pflegesituation, vieles ist schon ausgefüllt. Danach laden Sie Ihre
          Favoriten ein und erhalten Bewerbungen mit Foto, Erfahrung, Anreisedatum und Preis.
        </p>
        {offen ? (
          <div className="-mx-3 mt-4 rounded-[16px] bg-white px-5">{children}</div>
        ) : (
          <>
            <Button breit onClick={onOeffnen} className="mt-3.5 !px-2 whitespace-nowrap">
              Jetzt vervollständigen →
            </Button>
            <p className="mt-2.5 text-[13px] leading-snug text-pm-muted">
              Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot{' '}
              <span className="whitespace-nowrap">ausdrücklich annehmen.</span>
            </p>
          </>
        )}
      </div>
      </div>
      <div className="mt-4">{liste}</div>
    </section>
  );
}

/**
 * Die echten Profile als Zeilen: Foto, Name und Alter, Deutsch mit Punkten, Erfahrung und Einsätze
 * bei uns. Keine Knöpfe — die ganze Zeile öffnet das Profil (wie „Profil ansehen"). Ohne eigene
 * Überschrift: Der Kopf „Ihre passenden Pflegekräfte" steht im Bereich darüber (Runde 8).
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
  return (
    <>
      {laedt ? (
        <Card className="px-5 py-8 text-center">
          <div className="mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-pm-chip border-t-transparent" />
          <p className="text-[16px] font-semibold text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
        </Card>
      ) : n > 0 ? (
        <Card className="divide-y divide-pm-line-soft overflow-hidden">
          {eintraege.map(({ nurse, i }, pos) => (
            <PflegekraftZeile key={nurse.caregiverId ?? i} nurse={nurse} empfohlen={pos === 0} onClick={() => onProfil(nurse, i)} />
          ))}
        </Card>
      ) : alleBearbeitet ? (
        <Card className="px-5 py-5 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">
            Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
          </p>
        </Card>
      ) : keineVorschlaege ? (
        <Card className="px-5 py-6 text-center">
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
    </>
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
