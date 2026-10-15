// Gebucht-Seite neu — PROTOTYP 15.10.2026, NUR in der Vorschau ?preview=gebucht. Echte Kunden sehen weiter BookedScreen.
//
// Martin 15.10.2026 abends: „ich finde B glaube ich besser, aber die einzelnen dinge könnten mehr als aufgaben dargestellt
// werden - passe an aber nur einen vollständigen screen statt alles so komplex" und „oben einfach den einsatz zeigen von
// wann bis wann und wer kommt. und dann die restlichen dinge". Zum Bild scratchpad/ueberschriften/aufgaben_390.png
// (Zustand AD): „finde ich super". Wortlaut und Regeln für alle übrigen Zustände: texte_final.md, Nachtrag 3.
//
// Aufbau in allen Zuständen gleich (`reihenfolge()` in lib/gebuchtStand.ts): Begrüßung · Einsatz-Karte (Kopfleiste
// „Ihr Einsatz" mit Etikett, Pflegekraft, ANREISE → ABREISE, Tagessatz mit „Kostenübersicht ›") · [nur beendet: „Ihr
// aktueller" bzw. „Ihr nächster Einsatz"] · Schritte („So geht es weiter" bzw. „Ihre Unterlagen") · Kontakt mit
// Notfallfeld · Siegel. Was in welchem Zustand steht, rechnen die reinen Funktionen in lib/gebuchtStand.ts; diese Datei
// zeichnet nur.
//
// Święta zasada 1: Die Seite zeigt nur Belegtes. Fehlt der Anreise-Eintrag, steht das Datum aus dem Job mit „geplant";
// Uhrzeit, Verkehrsmittel und Adresse nie geraten, die Notiz der Agentur nie. Kosten nur mit belegter Quelle (Vertrag
// dieser Pflegekraft). Die Notfallnummer kommt als Prop (in der Vorschau aus &notfall=, nur localhost), nie aus dem Code.
// Look: pm-Tokens wie im Bild (Karte rounded-card, Kopfleiste pm-shell, Etikett = StatusBadge, Abschnitt h2 22 px),
// Tippflächen ≥ 44 px, keine Überbreite bei 360 px.
import { useState, type ReactNode } from 'react';
import { ArrowRight, Calendar, Check, ChevronRight, UserRound } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import {
  einsatzEtikett,
  einsatzPille,
  einsatzZeitraum,
  findeAnderenEinsatz,
  findeFolgeeinsatz,
  gebuchtStand,
  isoTag,
  kostenZeile,
  reihenfolge,
  schritte as schritteAus,
  type AndererEinsatz,
  type AnreiseDatensatz,
  type Baustein,
  type EinsatzZeile,
  type EinsatzZeitraum,
  type Etikett,
  type GebuchtStand,
  type KostenZeile,
  type Schritt,
  type SchritteAbschnitt,
  type SchrittArt,
  type SchrittLink,
  type VertragStand,
} from '../../lib/gebuchtStand';
import { GEBUCHT_TEXTE as T, nameFest, type EinsatzTag } from '../../lib/gebuchtTexte';
import { formatJobZeitraum } from '../../lib/mamamia/leadJobs';
import type { LeadJobRow } from '../../lib/mamamia/types';
import { AngebotPerson } from './KompaktEinstieg';
import { GebuchtKontaktKarte, type KontaktTitel } from './GebuchtKontakt';
import { MartaBox } from './MartaBox';
import { MonatsZeilen } from './MonatsAufstellung';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/StatusBadge';
import { EYEBROW } from '../ui/SectionHeader';

export type Seitenende = 'a' | 'b';

export interface GebuchtSeiteDaten {
  /** Berliner Kalendertag YYYY-MM-DD. */
  heute: string;
  kopf: { name: string | null; kuerzel: string | null };
  /** Der Einsatz dieser Seite (lead_jobs-Zeile). */
  einsatz: { id: string | null; status: string | null; anreise: string | null; abreise: string | null };
  /** Gebuchte Pflegekraft dieses Einsatzes (Foto, Name, Geschlecht); null = unbekannt. */
  pflegekraft: Nurse | null;
  /** Gültiger Anreise-Datensatz (anreiseAusEreignissen) oder null. */
  anreise: AnreiseDatensatz | null;
  /** Die Brücke hat in diesem Seitenaufruf geantwortet — nur dann steht die Wartezeile (Spezifikation 7, Regel 4). */
  brueckeOk: boolean;
  /** Lead bekommt Anreise-Mail und Mail C (E-Mail vorhanden, kein Vermittler). */
  bekommtMail: boolean;
  vertrag: {
    stand: VertragStand;
    /**
     * „am …": contract_snapshot.datum (schon „dd.mm.yyyy"), sonst accepted_at (ISO-Zeitstempel). Angezeigt als Berliner
     * Tag (`vertragDatum`), nie als UTC-Tag.
     */
    datum: string | null;
    /** PDF dieses Einsatzes (/api/contract-pdf/…&application_id=…); null = Rückfall-Link, falls onVertragAnsehen. */
    pdfHref: string | null;
  };
  /** Tagessatz aus belegter Quelle (Vertrag dieser Pflegekraft); null = Kostenzeile entfällt. */
  tagessatz: number | null;
  /** Alle Einsätze des Leads (lead_jobs), inkl. diesem. */
  jobs: EinsatzZeile[];
  /** Notfallnummer vom Server (in der Vorschau aus der URL); null/ungültig = kein Notfallfeld. */
  notfallTelefon: string | null;
}

export interface GebuchtSeiteProps {
  daten: GebuchtSeiteDaten;
  kontaktTitel: KontaktTitel;
  seitenende: Seitenende;
  sterne: SterneStand | null;
  onPflegekraft?: () => void;
  /** Vertragsformular (`contractOnly`); fehlt es, steht kein Knopf (kein toter Knopf). */
  onVertragAbschliessen?: () => void;
  /** Vertrag im Portal ansehen (Rückfall ohne PDF-Link). */
  onVertragAnsehen?: () => void;
  /** Link auf einen anderen Einsatz (`?token=…&job=<id>`); fehlt er, ruft der Link `onEinsatz` (Vorschau). */
  einsatzHref?: (jobId: string) => string;
  onEinsatz?: (jobId: string) => void;
}

const H2 = 'text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink';
const KARTE = 'rounded-card border border-pm-line bg-white';
const INNEN = 'px-5 max-[374px]:px-4';
/** Textlink in einem Schritt (Bild: 40 px hoch, 14,5 px); die unsichtbare Fläche davor/danach hebt ihn auf 44 px. */
const SCHRITT_LINK =
  "relative inline-flex min-h-[40px] items-center gap-1.5 text-left text-[14.5px] font-semibold text-pm-taupe-ink hover:text-pm-ink before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-['']";

/** Der berechnete Stand der Seite — EINE Stelle für die Seite und das Hilfe-Blatt (CustomerPortalPage). */
export function gebuchtStandAusDaten(daten: GebuchtSeiteDaten): GebuchtStand {
  return gebuchtStand({ heute: daten.heute, einsatz: daten.einsatz, anreise: daten.anreise, vertrag: daten.vertrag.stand });
}

/** Notfallfeld nur, solange der Einsatz nicht beendet ist — am berechneten Zustand, nie am Vorschau-Etikett. */
export function notfallImHilfeBlatt(daten: GebuchtSeiteDaten): boolean {
  return gebuchtStandAusDaten(daten).zustand !== 'B';
}

// ─── Einsatz-Karte ─────────────────────────────────────────────────────────────

/** Wer kommt: Foto, Name, „Ihre Pflegekraft", tippbar zum Profil (Bild: Foto 64 px, Name 19 px fett). */
function PflegekraftZeile({ nurse, onClick }: { nurse: Nurse | null; onClick?: () => void }) {
  const name = nurse?.name?.trim() ? displayName(nurse.name.trim()) : null;
  const foto = nurse?.image ? (
    <img src={nurse.image} alt="" className="h-16 w-16 flex-none rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-pm-taupe text-[20px] font-semibold text-white"
      style={nurse?.color ? { backgroundColor: nurse.color } : undefined}
    >
      {name && nurse ? initials(nurse.name.trim()).slice(0, 2).toUpperCase() : <UserRound className="h-7 w-7" strokeWidth={2} />}
    </span>
  );
  const text = (
    <span className="min-w-0 flex-1">
      {name ? (
        <>
          <span className="block text-[19px] font-bold leading-[1.3] text-pm-ink">{nameFest(name)}</span>{' '}
          <span className="block text-[15px] leading-[1.35] text-pm-muted">{T.ihrePflegekraft}</span>
        </>
      ) : (
        <span className="block text-[19px] font-bold leading-[1.3] text-pm-ink">{T.ihrePflegekraft}</span>
      )}
    </span>
  );
  const klasse = `flex w-full min-h-[44px] items-center gap-4 ${INNEN} py-3 text-left`;
  if (!onClick || !nurse) return <div className={klasse} data-teil="pflegekraft">{foto}{text}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name ? T.profilAria(name) : T.profilAriaOhneName}
      className={`${klasse} transition-colors hover:bg-pm-paper active:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe`}
      data-teil="pflegekraft"
    >
      {foto}
      {text}
      <ChevronRight className="h-5 w-5 flex-none text-pm-mute" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

/** Eine Spalte „ANREISE / Montag / 19.10. / geplant". Zeilenhöhe der Versalienzeile wie im Bild (normal). */
function ZeitraumSpalte({ label, tag, geplant, teil }: { label: string; tag: EinsatzTag; geplant: boolean; teil: 'anreise' | 'abreise' }) {
  return (
    <dl className="min-w-0" data-spalte={teil}>
      <dt className={`${EYEBROW} leading-[normal]`}>{label}</dt>
      <dd>
        <span className="mt-1.5 block text-[15px] leading-[1.3] text-pm-body">{tag.wochentag}</span>{' '}
        <span className="block whitespace-nowrap text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] tabular-nums text-pm-ink">
          {tag.datum}
          {tag.jahr && <span className="text-[15px] font-bold tracking-normal text-pm-body">{tag.jahr}</span>}
        </span>
        {geplant && <>{' '}<span className="mt-0.5 block text-[14px] leading-[1.4] text-pm-muted">{T.geplant}</span></>}
      </dd>
    </dl>
  );
}

function Zeitraum({ z }: { z: EinsatzZeitraum }) {
  return (
    <div
      className={`grid ${z.ab ? 'grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)]' : 'grid-cols-1'} gap-x-2.5 border-t border-pm-line-soft ${INNEN} pb-3 pt-3.5`}
      data-teil="zeitraum"
    >
      <ZeitraumSpalte label={T.anreise} tag={z.an} geplant={z.anGeplant} teil="anreise" />
      {z.ab && (
        <>
          <ArrowRight className="mt-[42px] h-4 w-4 text-pm-mute" strokeWidth={2} aria-hidden="true" />
          <ZeitraumSpalte label={T.abreise} tag={z.ab} geplant={z.abGeplant} teil="abreise" />
        </>
      )}
    </div>
  );
}

/** „Tagessatz 95 € / Tag" mit „Kostenübersicht ›"; aufgeklappt Pfeil nach unten, darunter Grundlage und Monatszeilen. */
function KostenTeil({ kosten }: { kosten: KostenZeile }) {
  const [offen, setOffen] = useState(false);
  return (
    <>
      <div className={`flex min-h-[52px] items-center justify-between gap-3 border-t border-pm-line-soft ${INNEN}`} data-teil="kosten">
        <p className="min-w-0">
          <span className="text-[14.5px] text-pm-muted">{T.tagessatz}</span>{' '}
          <span className="text-[16px] font-bold tabular-nums text-pm-ink">
            {kosten.tagessatz}&nbsp;€<span className="font-medium text-pm-muted">{T.proTag}</span>
          </span>
        </p>
        {kosten.uebersicht && (
          <button
            type="button"
            onClick={() => setOffen(!offen)}
            aria-expanded={offen}
            aria-controls={offen ? 'kostenuebersicht' : undefined}
            className="inline-flex min-h-[44px] flex-none items-center gap-0.5 whitespace-nowrap text-[14.5px] font-semibold text-pm-taupe-ink hover:text-pm-ink"
            data-teil="kostenuebersicht-knopf"
          >
            {T.kostenuebersicht}
            <ChevronRight className={`h-[18px] w-[18px] transition-transform duration-200 ${offen ? 'rotate-90' : ''}`} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
      {kosten.uebersicht && offen && (
        <div id="kostenuebersicht" className={`${INNEN} pb-4`} data-teil="kostenuebersicht">
          <MonatsZeilen
            anreise={kosten.uebersicht.anreise}
            abreise={kosten.uebersicht.abreise}
            tagessatz={kosten.tagessatz}
            grundlage={T.kostenGrundlage}
          />
        </div>
      )}
    </>
  );
}

function EinsatzKarte({ etikett, zeitraum, kosten, nurse, onPflegekraft }: {
  etikett: Etikett | null;
  zeitraum: EinsatzZeitraum | null;
  kosten: KostenZeile | null;
  nurse: Nurse | null;
  onPflegekraft?: () => void;
}) {
  return (
    <section aria-labelledby="einsatz-titel" className={`mt-6 overflow-hidden ${KARTE}`} data-baustein="einsatz">
      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-pm-shell ${INNEN} py-2.5`} data-teil="kopfleiste">
        <h1 id="einsatz-titel" className="flex items-center gap-2 whitespace-nowrap text-[15px] font-extrabold leading-[1.3] text-pm-taupe-ink">
          <Calendar className="h-4 w-4 flex-none" strokeWidth={2} aria-hidden="true" />
          {T.ihrEinsatz}
        </h1>
        {etikett && (
          <span className="flex flex-none" data-teil="etikett" data-ton={etikett.ton}>
            <StatusBadge ton={etikett.ton}>{etikett.text}</StatusBadge>
          </span>
        )}
      </div>
      <PflegekraftZeile nurse={nurse} onClick={onPflegekraft} />
      {zeitraum && <Zeitraum z={zeitraum} />}
      {kosten && <KostenTeil kosten={kosten} />}
    </section>
  );
}

// ─── Schritte ──────────────────────────────────────────────────────────────────

const KREIS: Record<SchrittArt, string> = {
  fertig: 'bg-pm-green-deep text-white',
  jetzt: 'bg-white text-pm-taupe-ink ring-2 ring-inset ring-pm-taupe',
  spaeter: 'bg-white text-pm-mute ring-2 ring-inset ring-pm-line',
};

interface SchrittZiele {
  pdfHref: string | null;
  onVertragAbschliessen?: () => void;
  onVertragAnsehen?: () => void;
  einsatzHref?: (jobId: string) => string;
  onEinsatz?: (jobId: string) => void;
}

/** „Vertrag als PDF" hinter dem Datum: bricht nicht in sich um, Tippfläche nach oben und unten auf 44 px erweitert. */
function PdfLink({ link, href }: { link: Extract<SchrittLink, { ziel: 'pdf' }>; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={link.aria}
      className="relative whitespace-nowrap font-semibold text-pm-taupe-ink hover:text-pm-ink before:absolute before:-inset-y-3 before:inset-x-0 before:content-['']"
    >
      {link.text}
    </a>
  );
}

/** Link unter dem Schritt: Folgeeinsatz oder Rückfall zum Vertrag. Ohne Ziel kein toter Link. */
function SchrittLinkBlock({ link, ziele }: { link: SchrittLink; ziele: SchrittZiele }) {
  if (link.ziel === 'einsatz') {
    const { jobId } = link;
    if (ziele.einsatzHref) return <a href={ziele.einsatzHref(jobId)} className={SCHRITT_LINK}>{link.text}</a>;
    if (ziele.onEinsatz) return <button type="button" onClick={() => ziele.onEinsatz?.(jobId)} className={SCHRITT_LINK}>{link.text}</button>;
    return null;
  }
  if (link.ziel === 'vertragAnsehen' && ziele.onVertragAnsehen) {
    return <button type="button" onClick={ziele.onVertragAnsehen} className={SCHRITT_LINK}>{link.text}</button>;
  }
  return null;
}

function SchrittEintrag({ s, letzter, ziele }: { s: Schritt; letzter: boolean; ziele: SchrittZiele }) {
  const pdf = s.link?.ziel === 'pdf' && ziele.pdfHref ? s.link : null;
  const blockLink = s.link && s.link.ziel !== 'pdf' ? s.link : null;
  return (
    <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-3.5 pb-5" data-schritt={s.id} data-art={s.art}>
      {!letzter && (
        <span
          aria-hidden="true"
          className={`absolute bottom-0.5 left-[15px] top-[34px] w-0.5 ${s.art === 'fertig' ? 'bg-pm-green/[.33]' : 'bg-pm-line'}`}
          data-teil="linie"
        />
      )}
      <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-bold ${KREIS[s.art]}`} data-teil="kreis">
        {s.art === 'fertig' ? <Check className="h-4 w-4" strokeWidth={3} /> : s.nummer}
      </span>
      <div className="min-w-0 pt-1">
        <h3 className={`text-[16.5px] font-bold leading-[1.35] ${s.art === 'spaeter' ? 'text-pm-body' : 'text-pm-ink'}`}>{s.titel}</h3>
        {(s.text || pdf) && (
          <p className="mt-0.5 text-pretty text-[14.5px] leading-[1.45] text-pm-muted" data-zeile="text">
            {s.text}
            {pdf && ziele.pdfHref && <>{s.text && T.trenner}<PdfLink link={pdf} href={ziele.pdfHref} /></>}
          </p>
        )}
        {s.zeilen.length > 0 && (
          <dl className="mt-1.5">
            {s.zeilen.map((z) => (
              <div key={z.id} className="grid grid-cols-[104px_minmax(0,1fr)] gap-2 py-1.5" data-zeile={z.id} data-clarity-mask={z.maske ? 'true' : undefined}>
                <dt className="text-[13.5px] leading-[1.45] text-pm-muted">{z.label}</dt>
                <dd className="min-w-0 text-[14.5px] font-bold leading-[1.45] text-pm-ink [overflow-wrap:anywhere]">
                  {z.wert.map((w, i) => (
                    <span key={i}>{i > 0 && ' '}{w.fest ? <span className="whitespace-nowrap">{w.text}</span> : w.text}</span>
                  ))}
                  {z.zusatz && <>{' '}<span className="block text-[13.5px] font-normal leading-[1.4] text-pm-muted">{z.zusatz}</span></>}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {s.klein && (
          // Unter den Anreise-Zeilen der Hinweis (mt-2, normaler Umbruch wie im Bild), sonst die Wartezeile (mt-1.5, ausgewogen).
          <p className={`${s.zeilen.length > 0 ? 'mt-2' : 'mt-1.5 text-pretty'} text-[13.5px] leading-[1.45] text-pm-muted`} data-zeile="klein">
            {s.klein}
          </p>
        )}
        {s.knopf && ziele.onVertragAbschliessen && (
          // Knopf wie im Bild (48 px, 15,5 px, ohne Innenabstand an den Seiten), damit er in der Spalte bei 360 px einzeilig bleibt.
          <div className="pb-0.5 pt-1.5 [&>button]:mt-1.5 [&>button]:min-h-[48px] [&>button]:px-2 [&>button]:text-[15.5px]" data-zeile="knopf">
            <Button breit groesse="sm" onClick={ziele.onVertragAbschliessen}>{s.knopf}</Button>
          </div>
        )}
        {blockLink && <SchrittLinkBlock link={blockLink} ziele={ziele} />}
      </div>
    </li>
  );
}

function SchritteKarte({ abschnitt, ziele }: { abschnitt: SchritteAbschnitt; ziele: SchrittZiele }) {
  return (
    <section aria-labelledby="schritte-titel" className="mt-8" data-baustein="schritte">
      <h2 id="schritte-titel" className={H2}>{abschnitt.titel}</h2>
      <ol className={`mt-4 ${KARTE} px-5 pb-1.5 pt-[18px] max-[374px]:px-4 max-[374px]:pb-2 max-[374px]:pt-5`}>
        {abschnitt.liste.map((s, i) => (
          <SchrittEintrag key={s.id} s={s} letzter={i === abschnitt.liste.length - 1} ziele={ziele} />
        ))}
      </ol>
    </section>
  );
}

// ─── Nur beendet: der neuere Einsatz (Einsatz-Zeile wie in der Einsatzübersicht) ──────────────────────────────────────

const PILLE: Record<'Laufend' | 'Gebucht' | 'Geplant', string> = {
  Laufend: 'bg-pm-mint text-pm-green-deep',
  Gebucht: 'bg-pm-amber-tint text-pm-amber-ink',
  Geplant: 'bg-pm-shell text-pm-taupe-ink',
};

function zweiteZeile(job: EinsatzZeile): string | null {
  if (job.pflegekraft) return job.pflegekraft;
  if (job.status !== 'geplant') return null;
  return (job.bewerbungen ?? 0) > 0 ? T.bewerbungen(job.bewerbungen ?? 0) : T.sucheOhneBewerbung;
}

function AndererEinsatzAbschnitt({ anderer, heute, ziele }: { anderer: AndererEinsatz; heute: string; ziele: SchrittZiele }) {
  const { job } = anderer;
  const pille = einsatzPille(job, heute);
  const zweite = zweiteZeile(job);
  const inhalt = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {pille && <span className={`rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${PILLE[pille]}`}>{pille}</span>}
          <span className="whitespace-nowrap text-[16px] font-semibold tabular-nums text-pm-ink">{formatJobZeitraum(job as LeadJobRow)}</span>
        </span>
        {zweite && <span className="mt-1 block text-[14.5px] leading-snug text-pm-muted">{zweite}</span>}
      </span>
      <ChevronRight className="h-5 w-5 flex-none text-pm-mute" strokeWidth={1.75} aria-hidden="true" />
    </>
  );
  const klasse = `flex min-h-[64px] w-full items-center gap-3 ${INNEN} py-4 text-left rounded-card transition-colors hover:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe`;
  return (
    <section aria-labelledby="anderer-einsatz" className="mt-10" data-baustein="andererEinsatz">
      <h2 id="anderer-einsatz" className={H2}>{anderer.art === 'aktuell' ? T.aktuellerEinsatz : T.naechsterEinsatz}</h2>
      <div className={`mt-4 ${KARTE}`}>
        {ziele.einsatzHref ? (
          <a href={ziele.einsatzHref(job.id)} className={klasse}>{inhalt}</a>
        ) : (
          <button type="button" onClick={() => ziele.onEinsatz?.(job.id)} className={klasse}>{inhalt}</button>
        )}
      </div>
    </section>
  );
}

// ─── Seite ─────────────────────────────────────────────────────────────────────

export function GebuchtSeite(props: GebuchtSeiteProps) {
  const { daten, kontaktTitel, seitenende, sterne } = props;
  const stand = gebuchtStandAusDaten(daten);
  const beendet = stand.zeit === 'beendet';
  const folge = beendet ? null : findeFolgeeinsatz(daten.jobs, daten.einsatz.id, isoTag(daten.einsatz.abreise));
  const anderer = beendet ? findeAnderenEinsatz(daten.jobs, daten.einsatz.id, daten.heute) : null;
  const abschnitt = schritteAus({
    stand,
    heute: daten.heute,
    anreise: daten.anreise,
    vertrag: {
      stand: daten.vertrag.stand,
      datum: daten.vertrag.datum,
      pdf: !!daten.vertrag.pdfHref,
      ansehen: !!props.onVertragAnsehen,
      knopf: !!props.onVertragAbschliessen,
    },
    brueckeOk: daten.brueckeOk,
    bekommtMail: daten.bekommtMail,
    folge,
    pflegekraftVorname: daten.pflegekraft?.name?.trim().split(/\s+/)[0] || null,
  });
  const bausteine = reihenfolge({ anderer: !!anderer, schritte: !!abschnitt, ende: seitenende === 'b' });
  const ziele: SchrittZiele = {
    pdfHref: daten.vertrag.pdfHref,
    onVertragAbschliessen: props.onVertragAbschliessen,
    onVertragAnsehen: props.onVertragAnsehen,
    einsatzHref: props.einsatzHref,
    onEinsatz: props.onEinsatz,
  };

  const teile: Record<Baustein, () => ReactNode> = {
    gruss: () => (
      <div key="gruss" data-baustein="gruss">
        <AngebotPerson name={daten.kopf.name} kuerzel={daten.kopf.kuerzel} />
      </div>
    ),
    einsatz: () => (
      <EinsatzKarte
        key="einsatz"
        etikett={einsatzEtikett(stand, daten.heute)}
        zeitraum={einsatzZeitraum(stand, daten.heute)}
        kosten={kostenZeile(stand, daten.vertrag.stand, daten.tagessatz)}
        nurse={daten.pflegekraft}
        onPflegekraft={props.onPflegekraft}
      />
    ),
    andererEinsatz: () => anderer ? <AndererEinsatzAbschnitt key="andererEinsatz" anderer={anderer} heute={daten.heute} ziele={ziele} /> : null,
    schritte: () => abschnitt ? <SchritteKarte key="schritte" abschnitt={abschnitt} ziele={ziele} /> : null,
    kontakt: () => (
      <GebuchtKontaktKarte key="kontakt" titel={kontaktTitel} notfallTelefon={daten.notfallTelefon} mitNotfall={!beendet} className="mt-10" />
    ),
    ende: () => (
      <div key="ende" className="mt-10" data-baustein="ende">
        <MartaBox sterne={sterne} nurVertrauen />
      </div>
    ),
  };

  return (
    <div
      className="mx-auto max-w-3xl px-5 pb-12 pt-6"
      data-gebucht-seite=""
      data-zustand={stand.zustand}
      data-zeit={stand.zeit}
      style={{ animation: 'fadeIn 0.4s ease-out' }}
    >
      {bausteine.map((b) => teile[b]())}
    </div>
  );
}
