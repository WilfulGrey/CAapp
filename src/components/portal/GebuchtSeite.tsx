// Gebucht-Seite neu — PROTOTYP 15.10.2026, NUR in der Vorschau ?preview=gebucht. Echte Kunden sehen weiter BookedScreen.
//
// Martin 15.10.2026: „Die Seite muss an unseren neuen Look und Stil angepasst werden. Bei der Pflegekraft reicht mir das Bild,
// ‚Maria K., Ihre Pflegekraft', und dann Einsatzzeitraum und Kosten … Kontakt … schöner … gebuchte Informationen, die
// Pflegekraft, die Notfallrufnummer, den Kontakt, aber auch Anreisedaten, Abreisedaten, der Folgeeinsatz."
// Aufbau „Status zuerst" (Jury-Sieger, seo-reports/analysen/gebucht-seite-2026-10-15/spezifikation.md), Wortlaut
// texte_final.md. Oben ein Satz mit Datum je Stand, darunter EINE Karte (Pflegekraft, Anreise/Ankunft, Abreise, Kosten),
// dann Kontakt mit Notfallfeld, Folgeeinsatz, Unterlagen. Reihenfolge je Zustand: `reihenfolge()` in lib/gebuchtStand.ts.
//
// Święta zasada 1: Die Seite zeigt nur Belegtes. Fehlt der Anreise-Eintrag, steht das Datum aus dem Job mit „geplant";
// Uhrzeit, Verkehrsmittel und Adresse nie geraten. Kosten nur mit belegter Quelle (Vertrag dieser Pflegekraft). Die
// Notfallnummer kommt als Prop (in der Vorschau aus &notfall=), nie aus dem Code; ohne gültige Nummer kein Notfallfeld.
// Look: pm-Tokens, Abschnitt = h2 22 px + weiße Karte (wie AngebotAbschnitt), Kopf AngebotPerson, Knöpfe ui/Button,
// Tippflächen ≥ 44 px, keine Überbreite bei 360 px.
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, FileText, UserRound } from 'lucide-react';
import type { Nurse } from '../../types';
import type { SterneStand } from '../../lib/sterne';
import {
  findeAnderenEinsatz,
  findeFolgeeinsatz,
  einsatzPille,
  gebuchtStand,
  folgeOben as folgeObenPruefen,
  isoTag,
  reihenfolge,
  type AnreiseDatensatz,
  type Baustein,
  type EinsatzZeile,
  type GebuchtStand,
  type VertragStand,
} from '../../lib/gebuchtStand';
import {
  GEBUCHT_TEXTE as T,
  VERKEHRSMITTEL,
  anreiseDatum,
  anreiseZeit,
  datumKurz,
  nameFest,
  statusTexte,
} from '../../lib/gebuchtTexte';
import { formatJobZeitraum } from '../../lib/mamamia/leadJobs';
import type { LeadJobRow } from '../../lib/mamamia/types';
import { AngebotPerson } from './KompaktEinstieg';
import { GebuchtKontaktKarte, type KontaktTitel } from './GebuchtKontakt';
import { MartaBox } from './MartaBox';
import { MonatsZeilen } from './MonatsAufstellung';
import { displayName, initials } from './shared';
import { Button } from '../ui/Button';

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
    /** „Unterschrieben am": contract_snapshot.datum, sonst accepted_at (ISO). */
    datum: string | null;
    /** PDF dieses Einsatzes (/api/contract-pdf/…&application_id=…); null = Rückfall-Knopf, falls onVertragAnsehen. */
    pdfHref: string | null;
  };
  /** Tagessatz aus belegter Quelle (Vertrag dieser Pflegekraft); null = Kostenteil entfällt. */
  tagessatz: number | null;
  /** Alle Einsätze des Leads (lead_jobs), inkl. diesem. */
  jobs: EinsatzZeile[];
  /** Notfallnummer vom Server (in der Vorschau aus der URL); null/ungültig = kein Notfallfeld. */
  notfallTelefon: string | null;
}

export interface GebuchtSeiteProps {
  daten: GebuchtSeiteDaten;
  kontaktTitel: KontaktTitel;
  /** Entscheidung 4 (Empfehlung ja): im laufenden Einsatz Kontakt über der Karte. */
  kontaktObenImEinsatz: boolean;
  seitenende: Seitenende;
  sterne: SterneStand | null;
  onPflegekraft?: () => void;
  onVertragAbschliessen?: () => void;
  onVertragAnsehen?: () => void;
  /** Link auf einen anderen Einsatz (`?token=…&job=<id>`); fehlt er, ruft die Zeile `onEinsatz` (Vorschau). */
  einsatzHref?: (jobId: string) => string;
  onEinsatz?: (jobId: string) => void;
  alleEinsaetzeHref: string;
}

const H2 = 'text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-pm-ink';
const KARTE = 'rounded-card border border-pm-line bg-white';
const INNEN = 'px-5 max-[374px]:px-4';
const LINK = 'inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-semibold text-pm-taupe-ink hover:text-pm-ink';

/** Ohne Umbruch innerhalb eines Teils; zwischen den Teilen darf umbrochen werden. */
function Teile({ teile }: { teile: string[] }) {
  return <>{teile.map((t, i) => <span key={i}>{i > 0 && ' '}<span className="whitespace-nowrap">{t}</span></span>)}</>;
}

/** „Montag, 19.10.2026" bricht höchstens nach dem Wochentag um. */
function DatumMitJahr({ iso, komma = false }: { iso: string; komma?: boolean }) {
  const [wochentag, datum] = anreiseDatum(iso).split(', ');
  return <Teile teile={[`${wochentag},`, `${datum}${komma ? ',' : ''}`]} />;
}

function Zeile({ label, children, zusatz, testid, maske = false }: { label: string; children: ReactNode; zusatz?: ReactNode; testid?: string; maske?: boolean }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 border-t border-pm-line-soft py-3" data-zeile={testid} data-clarity-mask={maske ? 'true' : undefined}>
      <dt className="text-[14.5px] leading-[1.45] text-pm-muted">{label}</dt>
      <dd className="min-w-0 text-[15.5px] font-bold leading-[1.45] text-pm-ink [overflow-wrap:anywhere]">
        {children}
        {zusatz && <span className="block text-[14px] font-normal leading-[1.4] text-pm-muted">{zusatz}</span>}
      </dd>
    </div>
  );
}

function PflegekraftKopf({ nurse, onClick }: { nurse: Nurse | null; onClick?: () => void }) {
  const name = nurse?.name?.trim() ? displayName(nurse.name.trim()) : null;
  const foto = nurse?.image ? (
    <img src={nurse.image} alt="" className="h-14 w-14 flex-none rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-pm-taupe text-[18px] font-semibold text-white"
      style={nurse?.color ? { backgroundColor: nurse.color } : undefined}
    >
      {name && nurse ? initials(nurse.name.trim()).slice(0, 2).toUpperCase() : <UserRound className="h-6 w-6" strokeWidth={2} />}
    </span>
  );
  const text = (
    <span className="min-w-0 flex-1">
      {name ? (
        <>
          <span className="block text-[17px] font-semibold leading-snug text-pm-ink">{nameFest(name)}</span>
          <span className="block text-[14.5px] leading-snug text-pm-muted">{T.ihrePflegekraft}</span>
        </>
      ) : (
        <span className="block text-[17px] font-semibold leading-snug text-pm-ink">{T.ihrePflegekraft}</span>
      )}
    </span>
  );
  const klasse = `flex w-full items-center gap-3.5 ${INNEN} py-4 text-left`;
  if (!onClick || !nurse) return <div className={klasse} data-zeile="pflegekraft">{foto}{text}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name ? T.profilAria(name) : T.profilAriaOhneName}
      className={`${klasse} min-h-[44px] rounded-t-card transition-colors hover:bg-pm-paper active:bg-pm-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pm-taupe`}
      data-zeile="pflegekraft"
    >
      {foto}
      {text}
      <ChevronRight className="h-5 w-5 flex-none text-pm-mute" strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

function EinsatzKarte({ stand, daten, onPflegekraft, wartezeile, mitKosten }: {
  stand: GebuchtStand;
  daten: GebuchtSeiteDaten;
  onPflegekraft?: () => void;
  wartezeile: { satz2: boolean } | null;
  mitKosten: boolean;
}) {
  const [kostenOffen, setKostenOffen] = useState(false);
  const vorAnreise = stand.zeit === 'vor' || stand.zeit === 'anreisetag';
  const a = stand.mitAnreiseDaten ? daten.anreise : null;
  const vorname = daten.pflegekraft?.name?.trim().split(/\s+/)[0] || null;
  const mittel = a ? (VERKEHRSMITTEL[a.verkehrsmittel] ?? a.verkehrsmittel) : null;
  // Entscheidung 8: bei Sindbad bis zur Klärung kein „Hierhin …"-Satz.
  const hierhin = a && a.strasse && vorname && a.verkehrsmittel !== 'Sindbad'
    ? (a.verkehrsmittel === 'Own transport' ? T.hierhinSelbst(vorname) : T.hierhinGebracht(vorname))
    : null;
  const an = stand.anreiseDatum;
  const ab = stand.abreiseDatum;
  const tagessatz = mitKosten ? daten.tagessatz : null;

  return (
    <section aria-label={T.kartenAria} className={KARTE} data-baustein="karte">
      <PflegekraftKopf nurse={daten.pflegekraft} onClick={onPflegekraft} />
      <dl className={INNEN}>
        {a ? (
          <>
            <Zeile label={T.ankunft} testid="ankunft">
              <DatumMitJahr iso={a.datum} komma /> <span className="whitespace-nowrap">{anreiseZeit(a.von, a.bis)}</span>
            </Zeile>
            <Zeile label={T.verkehrsmittel} testid="verkehrsmittel">{mittel}</Zeile>
            {a.strasse && (
              <Zeile label={T.adresse} testid="adresse" zusatz={hierhin} maske>
                {a.strasse}
                {a.plzOrt && <><br />{a.plzOrt}</>}
              </Zeile>
            )}
          </>
        ) : an ? (
          <Zeile label={T.anreise} testid="anreise" zusatz={vorAnreise ? T.geplant : null}>
            <DatumMitJahr iso={an} />
          </Zeile>
        ) : null}
        {wartezeile && (
          <p className="border-t border-pm-line-soft py-3 text-pretty text-[15px] leading-[1.5] text-pm-muted" data-zeile="warten">
            {T.warteSatz1}{wartezeile.satz2 && <> {T.warteSatz2}</>}
          </p>
        )}
        {ab && (
          <Zeile label={T.abreise} testid="abreise" zusatz={stand.zustand !== 'B' ? T.geplant : null}>
            <DatumMitJahr iso={ab} />
          </Zeile>
        )}
        {tagessatz !== null && (
          <Zeile label={T.tagessatz} testid="tagessatz">
            <span className="tabular-nums">{tagessatz}&nbsp;€</span><span className="font-medium text-pm-muted">{T.proTag}</span>
          </Zeile>
        )}
      </dl>
      {tagessatz !== null && (
        <div className={`${INNEN} pb-2`} data-zeile="kosten">
          <p className="text-[14px] leading-[1.45] text-pm-muted">{T.reisekosten}</p>
          {daten.vertrag.datum && <p className="text-[14px] leading-[1.45] text-pm-muted">{T.kostenQuelle(datumKurz(daten.vertrag.datum))}</p>}
          {an && ab && (
            <>
              <button
                type="button"
                onClick={() => setKostenOffen(!kostenOffen)}
                aria-expanded={kostenOffen}
                className="mt-2 flex min-h-[48px] w-full items-center justify-between gap-2 border-t border-pm-line-soft pt-1 text-[15px] font-semibold text-pm-taupe-ink"
              >
                {kostenOffen ? T.kostenZu : T.kostenAuf}
                <ChevronDown className={`h-5 w-5 text-pm-taupe transition-transform duration-200 ${kostenOffen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {kostenOffen && (
                <div className="pb-3">
                  <MonatsZeilen anreise={datumKurz(an)} abreise={datumKurz(ab)} tagessatz={tagessatz} />
                </div>
              )}
            </>
          )}
        </div>
      )}
      {tagessatz === null && <div className="h-1" aria-hidden="true" />}
    </section>
  );
}

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

/** Eine Einsatz-Zeile wie in der Einsatzübersicht (Pille, Zeitraum, Name oder Bewerbungen), ganze Zeile tippbar. */
function EinsatzZeileKarte({ job, heute, href, onClick, mitHandlung }: {
  job: EinsatzZeile;
  heute: string;
  href?: string;
  onClick?: () => void;
  mitHandlung: boolean;
}) {
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
  const geplant = job.status === 'geplant';
  const bewerbungen = job.bewerbungen ?? 0;
  return (
    <div className={KARTE}>
      {href ? <a href={href} className={klasse}>{inhalt}</a> : <button type="button" onClick={onClick} className={klasse}>{inhalt}</button>}
      {mitHandlung && geplant && bewerbungen > 0 && (
        <div className={`${INNEN} pb-5`}>
          {href
            ? <Button href={href} breit>{T.bewerbungenAnsehen}</Button>
            : <Button onClick={onClick} breit>{T.bewerbungenAnsehen}</Button>}
        </div>
      )}
      {mitHandlung && geplant && bewerbungen === 0 && (
        <div className={`${INNEN} pb-2`}>
          {href ? <a href={href} className={LINK}>{T.einladen}</a> : <button type="button" onClick={onClick} className={LINK}>{T.einladen}</button>}
        </div>
      )}
    </div>
  );
}

export function GebuchtSeite(props: GebuchtSeiteProps) {
  const { daten, kontaktTitel, kontaktObenImEinsatz, seitenende, sterne } = props;
  const stand = gebuchtStand({ heute: daten.heute, einsatz: daten.einsatz, anreise: daten.anreise, vertrag: daten.vertrag.stand });
  const { zustand } = stand;
  const pflegekraftName = daten.pflegekraft?.name?.trim() ? displayName(daten.pflegekraft.name.trim()) : null;
  const folge = zustand === 'B' ? null : findeFolgeeinsatz(daten.jobs, daten.einsatz.id, isoTag(daten.einsatz.abreise));
  const anderer = zustand === 'B' ? findeAnderenEinsatz(daten.jobs, daten.einsatz.id, daten.heute) : null;
  const vertragBelegt = daten.vertrag.stand === 'unterschrieben' || daten.vertrag.stand === 'anderer';
  const bausteine = reihenfolge(stand, {
    folge,
    anderer,
    mehrereEinsaetze: daten.jobs.length > 1,
    unterlagen: vertragBelegt && zustand !== 'VO' && zustand !== 'VV',
    kontaktObenImEinsatz,
  });
  const { h1, satz } = statusTexte({
    stand,
    heute: daten.heute,
    pflegekraft: pflegekraftName,
    pflegekraftMaennlich: daten.pflegekraft?.gender === 'male',
    folge,
  });
  // Kosten nur mit dem Vertrag DIESER Pflegekraft (nie VO, VV, „anderer Vertrag").
  const mitKosten = daten.vertrag.stand === 'unterschrieben' && zustand !== 'VO' && zustand !== 'VV';
  const wartezeile = !stand.mitAnreiseDaten && stand.zeit === 'vor' && (zustand === 'VO' || zustand === 'VV' || zustand === 'AF') && daten.brueckeOk
    ? { satz2: daten.bekommtMail }
    : null;
  const oben = folgeObenPruefen(zustand, folge);
  const einsatzZiel = (id: string) => (props.einsatzHref
    ? { href: props.einsatzHref(id) }
    : { onClick: () => props.onEinsatz?.(id) });

  const teile: Record<Baustein, (i: number) => ReactNode> = {
    status: () => (
      <div key="status" data-baustein="status">
        <AngebotPerson name={daten.kopf.name} kuerzel={daten.kopf.kuerzel} />
        {h1 ? (
          <h1 className="mt-6 text-balance text-[28px] font-extrabold leading-[1.1] tracking-[-0.035em] text-pm-ink min-[376px]:text-[31px]">{h1}</h1>
        ) : (
          <h1 className="sr-only">{T.kartenAria}</h1>
        )}
        {satz && <p className="mt-4 text-pretty text-[17px] leading-[1.55] text-pm-body">{satz}</p>}
      </div>
    ),
    vertragsknopf: () => props.onVertragAbschliessen ? (
      <div key="vertragsknopf" className="mt-6" data-baustein="vertragsknopf">
        <Button breit onClick={props.onVertragAbschliessen}>{T.vertragKnopf}</Button>
      </div>
    ) : null,
    karte: (i) => (
      <div key="karte" className={i === 1 ? 'mt-8' : 'mt-10'}>
        <EinsatzKarte stand={stand} daten={daten} onPflegekraft={props.onPflegekraft} wartezeile={wartezeile} mitKosten={mitKosten} />
      </div>
    ),
    unterKarte: () => (
      <p key="unterKarte" className="mt-4 text-pretty text-[15px] leading-[1.5] text-pm-muted" data-baustein="unterKarte">{T.unterKarte}</p>
    ),
    kontakt: (i) => (
      <GebuchtKontaktKarte
        key="kontakt"
        titel={kontaktTitel}
        notfallTelefon={daten.notfallTelefon}
        mitNotfall={zustand !== 'B'}
        className={i === 1 ? 'mt-8' : 'mt-10'}
      />
    ),
    folge: (i) => folge ? (
      <section key="folge" aria-labelledby="folgeeinsatz" className={i === 1 ? 'mt-8' : 'mt-10'} data-baustein="folge">
        <h2 id="folgeeinsatz" className={H2}>{T.folgeeinsatz}</h2>
        <div className="mt-4">
          <EinsatzZeileKarte job={folge} heute={daten.heute} mitHandlung {...einsatzZiel(folge.id)} />
        </div>
      </section>
    ) : null,
    andererEinsatz: () => anderer ? (
      <section key="andererEinsatz" aria-labelledby="anderer-einsatz" className="mt-10" data-baustein="andererEinsatz">
        <h2 id="anderer-einsatz" className={H2}>{anderer.art === 'aktuell' ? T.aktuellerEinsatz : T.naechsterEinsatz}</h2>
        <div className="mt-4">
          <EinsatzZeileKarte job={anderer.job} heute={daten.heute} mitHandlung={false} {...einsatzZiel(anderer.job.id)} />
        </div>
      </section>
    ) : null,
    unterlagen: () => (
      <section key="unterlagen" aria-labelledby="unterlagen" className="mt-10" data-baustein="unterlagen">
        <h2 id="unterlagen" className={H2}>{T.unterlagen}</h2>
        <div className={`mt-4 ${KARTE} ${INNEN} pb-3 pt-4`}>
          <div className="flex items-start gap-3.5">
            <span aria-hidden="true" className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-pm-shell text-pm-taupe-ink">
              <FileText className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold leading-snug text-pm-ink">{T.dokument}</p>
              {daten.vertrag.datum && <p className="text-[14.5px] leading-snug text-pm-muted">{T.unterschriebenAm(datumKurz(daten.vertrag.datum))}</p>}
              {daten.vertrag.pdfHref ? (
                <a href={daten.vertrag.pdfHref} target="_blank" rel="noopener noreferrer" aria-label={T.vertragPdfAria} className={LINK}>
                  {T.vertragPdf}
                </a>
              ) : props.onVertragAnsehen ? (
                <button type="button" onClick={props.onVertragAnsehen} className={LINK}>{T.vertragRueckfall}</button>
              ) : null}
              {daten.bekommtMail && <p className="pb-1 text-[14px] leading-[1.45] text-pm-muted">{T.kopieMail}</p>}
            </div>
          </div>
        </div>
      </section>
    ),
    alleEinsaetze: () => (
      <div key="alleEinsaetze" className="mt-8" data-baustein="alleEinsaetze">
        <a href={props.alleEinsaetzeHref} className={LINK}>{T.alleEinsaetze}</a>
      </div>
    ),
    ende: () => seitenende === 'b' ? (
      <div key="ende" className="mt-10" data-baustein="ende">
        <MartaBox sterne={sterne} nurVertrauen />
      </div>
    ) : null,
  };

  return (
    <div
      className="mx-auto max-w-3xl px-5 pb-12 pt-6"
      data-gebucht-seite=""
      data-zustand={zustand}
      data-zeit={stand.zeit}
      data-folge-oben={oben ? '1' : undefined}
      style={{ animation: 'fadeIn 0.4s ease-out' }}
    >
      {bausteine.map((b, i) => teile[b](i))}
    </div>
  );
}
