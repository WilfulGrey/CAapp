// Kompakter Einstieg ins Portal: der Zustand VOR dem ersten Absenden der Pflegesituation
// (Vorschlag 03.10.2026 für Martin: „ganz kompakt auf Angebot und passende Pflegekräfte … das ist
// erledigt, das ist das Angebot, das ist der nächste Schritt, hier sind die Pflegekräfte").
//
// Reihenfolge auf der Seite (CustomerPortalPage, `kompakt`), Runde 6:
//   Kopf: Begrüßung und „Ihr Angebot zur 24-Stunden-Betreuung"
//   → Angebotskarte: Preis, kleine Zeile, Eigenanteil (EigenanteilZeile; „So rechnen wir ›" öffnet
//     die Aufstellung), „Wir kümmern uns um alles" mit sieben Häkchen (WirKuemmernUns), Sterne
//   → Karte „N Pflegekräfte sind schon für Sie ausgewählt" (PflegekraefteKarte): Fotos, was zum
//     Einladen fehlt, Knopf ins Formular; das bestehende 4-Schritte-Formular (AngebotCard) klappt
//     darin auf
//   → die Profile als Zeilen ohne Knöpfe (KompaktePflegekraefte).
// Alle anderen Zustände (abgesendet, Bewerbung, gebucht …) bleiben unverändert.
//
// Schrift: Fließtext 16 px, kleine Schrift 14 px. Ausnahme 13 px für die dritte Zeile der
// Pflegekräfte — so bleibt sie bei 390 px einzeilig.
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import type { Nurse } from '../../types';
import { DeutschPunkte } from './PflegekraftProfil';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EYEBROW } from '../ui/SectionHeader';

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
 * Die sieben Häkchen unter „Wir kümmern uns um alles" (Wortlaut der Geschäftsführung; Runde 7:
 * „Keine Vermittlungsgebühr" gehört zu den USPs, die immer zu sehen sein müssen).
 */
export const KUEMMERN_PUNKTE = [
  'Anreise ab 3 Tagen möglich',
  'Wechsel und Ersatz geregelt',
  'Täglich kündbar',
  'Keine Vermittlungsgebühr',
  'Bestpreisgarantie',
  'Über 20 Jahre Erfahrung',
  '6× Testsieger DIE WELT',
] as const;

/**
 * Vertrauen in der Angebotskarte (Runde 6): dünne Linie, kleine fette Überschrift mit dem
 * Testsieger-Siegel rechts, darunter sieben kurze Häkchen in der Schrift der früheren vier Punkte.
 * Eine Spalte auf dem Handy: Die längsten Punkte brauchen mit Haken je 212 px, zwei Spalten
 * bräuchten 437 px (bei 360 px sind 290 frei) — zwei Spalten erst ab 640 px.
 * „Bestpreisgarantie" öffnet das bestehende Pop-up, leise unterstrichen.
 */
export function WirKuemmernUns({ onBestpreis }: { onBestpreis: () => void }) {
  return (
    <div className="mt-3.5 border-t border-pm-line-soft pt-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold leading-snug text-pm-ink">Wir kümmern uns um alles</h2>
        {/* Nur das Bild: „6× Testsieger DIE WELT" steht als Punkt darunter in Worten. */}
        <img src="/badge-testsieger.webp" alt="" className="h-9 w-auto flex-none object-contain" />
      </div>
      <ul className="mt-1.5 grid grid-cols-1 gap-y-1 sm:grid-cols-2 sm:gap-x-4">
        {KUEMMERN_PUNKTE.map((punkt) => (
          <li
            key={punkt}
            className="flex items-center gap-1.5 text-[14px] leading-snug text-pm-ink min-[375px]:text-[14.5px] min-[390px]:gap-2 min-[390px]:text-[15px]"
          >
            <Check className="h-[17px] w-[17px] flex-none text-pm-coral" strokeWidth={2.5} aria-hidden="true" />
            {punkt === 'Bestpreisgarantie' ? (
              <button
                type="button"
                onClick={onBestpreis}
                className="-my-3 inline-flex min-h-[44px] items-center text-left underline decoration-pm-taupe/40 underline-offset-[3px]"
              >
                {punkt}
              </button>
            ) : (
              punkt
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Fotos der Vorschläge übereinander wie im Kostenrechner (Kontakt-Schritt und Preisseite:
 * runde Fotos mit weißem Rand, je 10 px überlappend), hier 40 px groß. Ohne Foto: Initialen.
 */
export function FotoStapel({ nurses }: { nurses: Nurse[] }) {
  return (
    <div className="flex flex-none" aria-hidden="true">
      {nurses.map((nurse, i) => (
        <span
          key={nurse.caregiverId ?? i}
          className={`relative h-10 w-10 flex-none overflow-hidden rounded-full border-2 border-white ${i > 0 ? '-ml-2.5' : ''}`}
        >
          {nurse.image ? (
            <img src={nurse.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold text-white" style={{ backgroundColor: nurse.color }}>
              {initials(nurse.name)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Karte „N Pflegekräfte sind schon für Sie ausgewählt" (Runde 6) direkt nach der Angebotskarte —
 * die Hauptaktion der Seite: Fotos der Vorschläge, was zum Einladen fehlt, Knopf ins Formular.
 * Der Knopf öffnet das bestehende Formular IN der Karte (`children` = eingebettete AngebotCard;
 * die mitlaufende Knopfleiste reicht wie bisher von Rand zu Rand, darum px-5). id = Sprungziel
 * aller Wege ins Formular (`zurPflegesituation`, Mail-Link `goto=anfragen`).
 * `aktiv=false` (alle anderen Zustände): nur ein neutraler Rahmen um das Formular wie bisher.
 * `onImBlick`: Karte im Bild ja/nein — die schwebende Frage legt sich nicht über das Formular
 * (Regel aus Registry #102).
 */
export function PflegekraefteKarte({ aktiv, nurses, laedt, offen, onOeffnen, onProfile, onImBlick, children }: {
  aktiv: boolean;
  /** Sichtbare Vorschläge in Anzeige-Reihenfolge (dieselben wie die Zeilen darunter). */
  nurses: Nurse[];
  laedt: boolean;
  offen: boolean;
  onOeffnen: () => void;
  /** „Alle N Profile ansehen ↓": zu den Zeilen. */
  onProfile: () => void;
  onImBlick?: (imBlick: boolean) => void;
  children: ReactNode;
}) {
  const karte = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = karte.current;
    if (!aktiv || !el || !onImBlick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((e) => onImBlick(e.some((x) => x.isIntersecting)));
    io.observe(el);
    return () => { io.disconnect(); onImBlick(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv]);
  if (!aktiv) return <div>{children}</div>;
  const n = laedt ? 0 : nurses.length;
  // Ohne geladene Vorschläge keine Zahl und keine Fotos — nie eine Auswahl behaupten, die nicht da ist.
  // „für Sie ausgewählt" bleibt zusammen, sonst stand bei 390 px „ausgewählt" allein in Zeile 2.
  const titel: ReactNode = n === 0 ? 'Passende Pflegekräfte' : (
    <>
      {n === 1 ? '1 Pflegekraft ist schon' : `${n} Pflegekräfte sind schon`}{' '}
      <span className="whitespace-nowrap">für Sie ausgewählt</span>
    </>
  );
  return (
    <section
      ref={karte}
      id="patientendaten"
      aria-labelledby="pflegekraefte-karte-titel"
      className="scroll-mt-16 rounded-card border-2 border-pm-taupe bg-white px-5 pb-5 pt-4 shadow-lift"
    >
      <h2 id="pflegekraefte-karte-titel" className="text-[20px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink">
        {titel}
      </h2>
      {n > 0 && (
        // Text neben den Fotos, solange daneben 140 px frei sind (390 px); schmaler darunter.
        <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <FotoStapel nurses={nurses} />
          <p className="min-w-[140px] flex-1 text-[14px] leading-snug text-pm-muted">Fotos, Namen und Profile liegen bereit.</p>
        </div>
      )}
      <p className="mt-3 text-[16px] leading-[1.45] text-pm-muted">
        Zum Einladen fehlt nur noch Ihre Pflegesituation: etwa 2 Minuten, vieles ist schon ausgefüllt.
      </p>
      {offen ? (
        children
      ) : (
        <>
          {/* Gestaffelte Schrift: Der Knopftext braucht bei 17 px 291 px, bei 360 px sind 272 frei. */}
          <Button breit onClick={onOeffnen} className="mt-3.5 !px-2">
            <span className="whitespace-nowrap text-[15.5px] min-[375px]:text-[16px] min-[390px]:text-[17px]">
              Pflegesituation vervollständigen →
            </span>
          </Button>
          <p className="mt-3 text-[14px] leading-snug text-pm-muted">
            {/* Das letzte Wortpaar bleibt zusammen (bei 360 px stand sonst „entscheiden." allein). */}
            Unverbindlich: Ein Vertrag entsteht erst, wenn Sie sich für eine{' '}
            <span className="whitespace-nowrap">Pflegekraft entscheiden.</span>
          </p>
          {n > 0 && (
            <button
              type="button"
              onClick={onProfile}
              className="mt-1 inline-flex min-h-[44px] items-center text-[15px] font-semibold text-pm-taupe-ink underline decoration-pm-taupe/40 underline-offset-[3px]"
            >
              {n === 1 ? 'Profil ansehen ↓' : `Alle ${n} Profile ansehen ↓`}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Die Profile als Zeilen: Foto, Name und Alter, Deutsch mit Punkten, Erfahrung und Einsätze bei uns.
 * Keine Knöpfe — die ganze Zeile öffnet das Profil (wie „Profil ansehen"). Nur eine kleine
 * Überschrift („Die Profile"): Anzahl und was zum Einladen fehlt, sagt die Karte darüber (Runde 6).
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
    <section aria-labelledby="pflegekraefte-titel">
      {/* id = Sprungziel von „Alle N Profile ansehen ↓" und des Mail-Links `goto=matches`. */}
      <div id="pflegekraefte" className="px-1" style={{ scrollMarginTop: 96 }}>
        <h2 id="pflegekraefte-titel" className={EYEBROW}>Die Profile</h2>
      </div>

      {laedt ? (
        <Card className="mt-3 px-5 py-8 text-center">
          <div className="mb-3 inline-block h-6 w-6 animate-spin rounded-full border-2 border-pm-chip border-t-transparent" />
          <p className="text-[16px] font-semibold text-pm-ink">Wir laden Ihre Pflegekräfte …</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">Einen Moment bitte — gleich sehen Sie Ihre persönlichen Vorschläge.</p>
        </Card>
      ) : n > 0 ? (
        <Card className="mt-3 divide-y divide-pm-line-soft overflow-hidden">
          {eintraege.map(({ nurse, i }, pos) => (
            <PflegekraftZeile key={nurse.caregiverId ?? i} nurse={nurse} empfohlen={pos === 0} onClick={() => onProfil(nurse, i)} />
          ))}
        </Card>
      ) : alleBearbeitet ? (
        <Card className="mt-3 px-5 py-5 text-center">
          <p className="text-[16px] font-bold text-pm-ink">Alle aktuellen Vorschläge bearbeitet</p>
          <p className="mt-1 text-[14px] leading-relaxed text-pm-muted">
            Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor &mdash; Sie hören von uns.
          </p>
        </Card>
      ) : keineVorschlaege ? (
        <Card className="mt-3 px-5 py-6 text-center">
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
