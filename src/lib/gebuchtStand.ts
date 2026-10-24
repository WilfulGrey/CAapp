// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau ?preview=gebucht): Zustandslogik als reine Funktionen.
//
// Grundlage: seo-reports/analysen/gebucht-seite-2026-10-15/spezifikation.md, Abschnitte 5 und 7, und texte_final.md,
// Nachtrag 3 (Karte B mit Schritten, Martin 15.10. abends: „finde ich super"). Drei unabhängige Merkmale bestimmen die
// Seite: Vertrag, Zeit, Folgeeinsatz. Etikett, Spalten und Schritte werden aus diesen Merkmalen gerechnet, nicht aus dem
// Zustandskürzel (N3.11: VV mit Anreise-Eintrag rechnet als AD, Schritt 1 heißt trotzdem „Vertrag in Vorbereitung").
// Der Tag ist der Berliner Kalendertag (wie `berlinJetzt` im Cron detect-caregiver-events) — nicht die Ortszeit des
// Browsers.
//
// Święta zasada 1: Hier wird nichts erfunden. Uhrzeit, Verkehrsmittel und Adresse kommen NUR aus einem gültigen
// Anreise-Datensatz (Ereignis `caregiver_arrival_scheduled`, Feldliste wie die Anreise-Mail, nie die Notiz der Agentur).
// Fehlt er, zeigt die Seite das Datum aus dem Job mit „geplant". Fehlt ein Datum, entfällt die Angabe.
import { formatJobDate } from './mamamia/leadJobs';
import {
  GEBUCHT_TEXTE as T,
  VERKEHRSMITTEL,
  anreiseZeit,
  datumKurz,
  einsatzTag,
  nameFest,
  type EinsatzTag,
} from './gebuchtTexte';

/** Entscheidung 9 (Empfehlung): „endet bald" ab 14 Tagen vor der Abreise. */
export const ENDET_BALD_TAGE = 14;
/** Folgeeinsatz = nächster Job, dessen Anreise frühestens 3 Tage vor der Abreise dieses Einsatzes liegt (Spez. 5.4). */
export const FOLGE_FENSTER_TAGE = 3;

export type VertragStand =
  /** Vertrag dieser Pflegekraft unterschrieben (signedForm oder Annahme-Zeile mit contract_snapshot). */
  | 'unterschrieben'
  /** Agentur hat im Panel gebucht, der Kunde holt den Vertrag nach (`canCompleteContract`). */
  | 'offen'
  /** Entscheidung 5 = B: Der Lead hat einen Vertrag, aber keinen zu dieser Pflegekraft. Gilt als unterschrieben, ohne Kosten. */
  | 'anderer'
  /** Weder Vertrag noch Nachhol-Knopf (Randfall). */
  | 'vorbereitung';

export type Zeitstand = 'vor' | 'anreisetag' | 'im-einsatz' | 'endet-bald' | 'beendet';

/** Kürzel wie in der Spezifikation (Abschnitt 5.5). */
export type GebuchtZustand = 'B' | 'VO' | 'AT' | 'AD' | 'AF' | 'VV' | 'EB' | 'L';

/** Anreise-Datensatz: genau die Felder der Anreise-Mail (Registry #119), sonst nichts. */
export interface AnreiseDatensatz {
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM */
  von: string;
  /** HH:MM oder null (dann „ab 14 Uhr") */
  bis: string | null;
  /** Rohwert aus mamamia: „Minibus" | „Sindbad" | „Own transport" | Unbekanntes */
  verkehrsmittel: string;
  strasse: string | null;
  plzOrt: string | null;
}

/** Eine Zeile aus `lead_jobs` (Teilmenge von LeadJobRow). */
export interface EinsatzZeile {
  id: string;
  status: string;
  anreise: string | null;
  abreise: string | null;
  pflegekraft: string | null;
  bewerbungen: number | null;
}

/** Ereignis aus `GET /api/lead-event` (Brücke). */
export interface AnreiseEreignis {
  event_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface GebuchtEingabe {
  /** Berliner Kalendertag YYYY-MM-DD (`berlinTag()`). */
  heute: string;
  /** Der Einsatz dieser Seite (lead_jobs-Zeile bzw. Job des Portals). */
  einsatz: { id: string | null; status: string | null; anreise: string | null; abreise: string | null };
  /** Gültiger Anreise-Datensatz (`anreiseAusEreignissen`) oder null. */
  anreise: AnreiseDatensatz | null;
  vertrag: VertragStand;
}

export interface GebuchtStand {
  zustand: GebuchtZustand;
  zeit: Zeitstand;
  /** Angezeigtes Anreisedatum: Datensatz vor Job (Spez. 5.1, Befund 1). */
  anreiseDatum: string | null;
  abreiseDatum: string | null;
  /** true = Ankunft/Verkehrsmittel/Adresse stehen in der Karte (nur vor bzw. am Anreisetag). */
  mitAnreiseDaten: boolean;
}

// ─── Tage ──────────────────────────────────────────────────────────────────────

/** Berliner Kalendertag „YYYY-MM-DD" (unabhängig von der Zeitzone des Geräts). */
export function berlinTag(jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(jetzt);
  const wert = (typ: string) => teile.find((t) => t.type === typ)?.value ?? '';
  return `${wert('year')}-${wert('month')}-${wert('day')}`;
}

/**
 * Kalendertag eines Vertragsdatums als „YYYY-MM-DD", Berliner Tag (Regel aus Registry #20: Europe/Berlin, nie der UTC-Tag
 * eines Zeitstempels). Nimmt die zwei Formen, in denen das Datum ankommt: `contract_snapshot.datum` ist schon
 * „dd.mm.yyyy" (VertragSignieren), `accepted_at` ist ein ISO-Zeitstempel („2026-10-12T22:30:00Z" = 13.10. in Berlin).
 * Ein reiner Kalendertag „2026-10-12" bleibt, wie er ist. Alles andere → null.
 */
export function vertragTag(wert: string | null | undefined): string | null {
  const roh = (wert ?? '').trim();
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(roh);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(roh)) return roh;
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(roh)) return null;
  const d = new Date(roh.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : berlinTag(d);
}

/** „2026-10-19T…" / „2026-10-19" → „2026-10-19"; alles andere → null. */
export function isoTag(wert: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(wert ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function utc(iso: string): number {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, m - 1, t);
}

/** Kalendertage von `von` bis `bis` (bis − von). */
export function tageBis(von: string, bis: string): number {
  return Math.round((utc(bis) - utc(von)) / 86_400_000);
}

/** Kalendertag + n Tage. */
export function plusTage(iso: string, n: number): string {
  return new Date(utc(iso) + n * 86_400_000).toISOString().slice(0, 10);
}

// ─── Anreise-Datensatz (Paket 1: über die Brücke) ─────────────────────────────

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT = /^\d{2}:\d{2}$/;

function text(wert: unknown): string | null {
  return typeof wert === 'string' && wert.trim() ? wert.trim() : null;
}

/**
 * Gültiger Datensatz (Spez. 7, Regel 2): Ereignis `caregiver_arrival_scheduled` zu DIESEM Job, nicht `test: true`, das
 * neueste je Job (bei „Geänderte Anreisedaten" kommt ein neues), Job-Status `gebucht`. Liest nur die Felder der Mail
 * (Datum, Uhrzeiten, Verkehrsmittel, Straße, PLZ/Ort) — `hinweis` und alles andere bleibt draußen. Ist das neueste
 * Ereignis unvollständig (Datum, Beginn oder Verkehrsmittel fehlt), gilt kein Datensatz: kein älterer Stand, nichts geraten.
 */
export function anreiseAusEreignissen(
  ereignisse: readonly AnreiseEreignis[] | null | undefined,
  jobOfferId: number | null,
  jobStatus: string | null,
): AnreiseDatensatz | null {
  if (!ereignisse || jobOfferId === null || jobStatus !== 'gebucht') return null;
  const passend = ereignisse
    .filter((e) => e.event_type === 'caregiver_arrival_scheduled' && e.metadata)
    .filter((e) => Number(e.metadata?.mamamia_job_offer_id) === jobOfferId && e.metadata?.test !== true)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const m = passend[0]?.metadata;
  if (!m) return null;
  const datum = text(m.anreise_datum);
  const von = text(m.anreise_von);
  const bis = text(m.anreise_bis);
  const verkehrsmittel = text(m.verkehrsmittel);
  if (!datum || !DATUM.test(datum) || !von || !ZEIT.test(von) || !verkehrsmittel) return null;
  return {
    datum,
    von,
    bis: bis && ZEIT.test(bis) ? bis : null,
    verkehrsmittel,
    strasse: text(m.einsatzort_strasse),
    plzOrt: text(m.einsatzort_plz_ort),
  };
}

// ─── Zeit und Zustand ──────────────────────────────────────────────────────────

/** Spez. 5.3. Die Datumsregel gewinnt gegen einen veralteten Spiegel; ein Signal „angekommen" gibt es nicht. */
export function zeitstand(heute: string, anreise: string | null, abreise: string | null, status: string | null): Zeitstand {
  if (status === 'abgeschlossen') return 'beendet';
  if (abreise && heute > abreise) return 'beendet';
  if (!anreise || heute < anreise) return 'vor';
  if (heute === anreise) return 'anreisetag';
  if (abreise && tageBis(heute, abreise) <= ENDET_BALD_TAGE) return 'endet-bald';
  return 'im-einsatz';
}

/** Spez. 5.5: erste passende Zeile gewinnt — B, VO, AT, AD, AF/VV, EB, L. */
export function gebuchtStand(e: GebuchtEingabe): GebuchtStand {
  const anreiseDatum = e.anreise?.datum ?? isoTag(e.einsatz.anreise);
  const abreiseDatum = isoTag(e.einsatz.abreise);
  const zeit = zeitstand(e.heute, anreiseDatum, abreiseDatum, e.einsatz.status);
  const mitAnreiseDaten = !!e.anreise && (zeit === 'vor' || zeit === 'anreisetag');
  let zustand: GebuchtZustand;
  if (zeit === 'beendet') zustand = 'B';
  else if (e.vertrag === 'offen') zustand = 'VO';
  else if (zeit === 'anreisetag') zustand = 'AT';
  else if (zeit === 'vor') zustand = e.anreise ? 'AD' : e.vertrag === 'vorbereitung' ? 'VV' : 'AF';
  else if (zeit === 'endet-bald') zustand = 'EB';
  else zustand = 'L';
  return { zustand, zeit, anreiseDatum, abreiseDatum, mitAnreiseDaten };
}

// ─── Folgeeinsatz und andere Einsätze ─────────────────────────────────────────

/**
 * Spez. 5.4: nächster Eintrag desselben Leads mit Status `gebucht` oder `geplant`, dessen Anreise frühestens 3 Tage vor
 * dem Abreisetag dieses Einsatzes liegt. Geplante Jobs ohne Anreisedatum erscheinen nur in der Einsatzübersicht.
 */
export function findeFolgeeinsatz(jobs: readonly EinsatzZeile[] | null | undefined, aktuelleId: string | null, abreise: string | null): EinsatzZeile | null {
  const ab = isoTag(abreise);
  if (!jobs || !ab) return null;
  const grenze = plusTage(ab, -FOLGE_FENSTER_TAGE);
  const kandidaten = jobs
    .filter((j) => j.id !== aktuelleId && (j.status === 'gebucht' || j.status === 'geplant'))
    .filter((j) => { const an = isoTag(j.anreise); return !!an && an >= grenze; })
    .sort((a, b) => (isoTag(a.anreise)! < isoTag(b.anreise)! ? -1 : 1));
  return kandidaten[0] ?? null;
}

export type AndererEinsatz = { art: 'aktuell' | 'naechster'; job: EinsatzZeile };

/**
 * Für „Einsatz beendet": der laufende Einsatz desselben Leads („Ihr aktueller Einsatz"), sonst der nächste gebuchte
 * oder geplante mit Anreisedatum („Ihr nächster Einsatz"). Gibt es keinen, entfällt der Abschnitt.
 */
export function findeAnderenEinsatz(jobs: readonly EinsatzZeile[] | null | undefined, aktuelleId: string | null, heute: string): AndererEinsatz | null {
  if (!jobs) return null;
  const andere = jobs.filter((j) => j.id !== aktuelleId);
  const laufend = andere.find((j) => {
    if (j.status !== 'gebucht') return false;
    const z = zeitstand(heute, isoTag(j.anreise), isoTag(j.abreise), j.status);
    return z === 'anreisetag' || z === 'im-einsatz' || z === 'endet-bald';
  });
  if (laufend) return { art: 'aktuell', job: laufend };
  const naechster = andere
    .filter((j) => (j.status === 'gebucht' || j.status === 'geplant') && !!isoTag(j.anreise) && isoTag(j.anreise)! >= heute)
    .sort((a, b) => (isoTag(a.anreise)! < isoTag(b.anreise)! ? -1 : 1))[0];
  return naechster ? { art: 'naechster', job: naechster } : null;
}

/** Pille einer Einsatz-Zeile, Wörter wie in der Einsatzübersicht (live). */
export function einsatzPille(job: EinsatzZeile, heute: string): 'Laufend' | 'Gebucht' | 'Geplant' | null {
  if (job.status === 'geplant') return 'Geplant';
  if (job.status !== 'gebucht') return null;
  const z = zeitstand(heute, isoTag(job.anreise), isoTag(job.abreise), job.status);
  return z === 'anreisetag' || z === 'im-einsatz' || z === 'endet-bald' ? 'Laufend' : z === 'vor' ? 'Gebucht' : null;
}


/**
 * Vertragsdatum für „am …" und „unterschrieben am …": „12.10.2026", Berliner Tag (`vertragTag`, Registry #20).
 * `contract_snapshot.datum` kommt schon als „dd.mm.yyyy", `accepted_at` als Zeitstempel. Unlesbar ⇒ null (dann entfällt
 * das Datum, nichts geraten).
 */
export function vertragDatum(wert: string | null | undefined): string | null {
  const tag = vertragTag(wert);
  return tag ? formatJobDate(tag) : null;
}

// ─── Karte: Etikett, Spalten, Kosten (Nachtrag 3, N3.2 und N3.3) ─────────────

/** N3.2, Regel 4: Das Jahr steht, sobald eines der Daten nicht im laufenden Berliner Jahr liegt — dann an allen. */
export function jahrNoetig(daten: ReadonlyArray<string | null | undefined>, heute: string): boolean {
  return daten.some((d) => !!d && d.slice(0, 4) !== heute.slice(0, 4));
}

export type EtikettTon = 'warnung' | 'neutral';
export interface Etikett { text: string; ton: EtikettTon }

/**
 * N3.3: Etikett nach der Zeit, nicht nach dem Vertrag. Vor der Anreise „Gebucht", am Anreisetag „Anreise heute geplant",
 * im Einsatz keins, ab 14 Tagen vor der Abreise „Endet bald" (am Abreisetag „Endet heute"), danach „Beendet" (neutral).
 * Ohne Abreisedatum gibt es nie „Endet bald" (zeitstand kennt die Abreise dann nicht).
 */
export function einsatzEtikett(stand: GebuchtStand, heute: string): Etikett | null {
  switch (stand.zeit) {
    case 'vor': return { text: T.etikett.gebucht, ton: 'warnung' };
    case 'anreisetag': return { text: T.etikett.heuteGeplant, ton: 'warnung' };
    case 'im-einsatz': return null;
    case 'endet-bald': return { text: stand.abreiseDatum === heute ? T.etikett.endetHeute : T.etikett.endetBald, ton: 'warnung' };
    case 'beendet': return { text: T.etikett.beendet, ton: 'neutral' };
  }
}

export interface EinsatzZeitraum {
  an: EinsatzTag;
  /** „geplant" unter ANREISE: kein gültiger Anreise-Eintrag und Zeit vor oder am Anreisetag. */
  anGeplant: boolean;
  /** null = kein Abreisedatum, dann nur die Spalte ANREISE (ohne Pfeil). */
  ab: EinsatzTag | null;
  /** „geplant" unter ABREISE: immer außer im beendeten Einsatz. */
  abGeplant: boolean;
}

/** N3.2, Regel 3: Spalten der Karte. Ohne Anreisedatum entfallen sie ganz (null). */
export function einsatzZeitraum(stand: GebuchtStand, heute: string): EinsatzZeitraum | null {
  const an = stand.anreiseDatum;
  if (!an) return null;
  const ab = stand.abreiseDatum;
  const mitJahr = jahrNoetig([an, ab], heute);
  const vorOderAm = stand.zeit === 'vor' || stand.zeit === 'anreisetag';
  return {
    an: einsatzTag(an, mitJahr),
    anGeplant: vorOderAm && !stand.mitAnreiseDaten,
    ab: ab ? einsatzTag(ab, mitJahr) : null,
    abGeplant: stand.zeit !== 'beendet',
  };
}

export interface KostenZeile {
  tagessatz: number;
  /** Daten für die Monatsaufstellung („19.10.2026"), null = ohne „Kostenübersicht ›". */
  uebersicht: { anreise: string; abreise: string } | null;
}

/**
 * N3.2, Regel 5: Kostenzeile nur mit unterschriebenem Vertrag DIESER Pflegekraft und belegtem Tagessatz (nie VO, VV,
 * anderer Vertrag). „Kostenübersicht ›" nur, wenn beide Daten da sind.
 */
export function kostenZeile(stand: GebuchtStand, vertrag: VertragStand, tagessatz: number | null): KostenZeile | null {
  if (vertrag !== 'unterschrieben' || tagessatz === null) return null;
  const an = stand.anreiseDatum;
  const ab = stand.abreiseDatum;
  return { tagessatz, uebersicht: an && ab ? { anreise: datumKurz(an), abreise: datumKurz(ab) } : null };
}

// ─── Schritte „So geht es weiter" (Nachtrag 3, N3.4) ─────────────────────────

export type SchrittId = 'vertrag' | 'anreise' | 'nach' | 'folge';
/** fertig = grüner Kreis mit Haken; jetzt = erster offener Schritt (Nummer, taupe Rand); spaeter = weitere offene. */
export type SchrittArt = 'fertig' | 'jetzt' | 'spaeter';

/** Ein Teil eines Werts; `fest` = bricht nicht in sich um. Text der Zeile = Teile mit Leerzeichen verbunden. */
export interface WertTeil { text: string; fest: boolean }

export interface SchrittZeile {
  id: 'ankunft' | 'verkehrsmittel' | 'adresse';
  label: string;
  wert: WertTeil[];
  /** kleiner Satz unter dem Wert („Hierhin wird Maria gebracht.") */
  zusatz: string | null;
  /** Adresse: für Clarity maskieren */
  maske: boolean;
}

export type SchrittLink =
  /** „Vertrag als PDF" (neues Fenster); `inline` = hinter dem Text der Zeile, nach dem Trenner „ · ". */
  | { ziel: 'pdf'; text: string; aria: string; inline: boolean }
  /** Rückfall ohne PDF-Link: „Unterschriebenen Vertrag ansehen →" (öffnet den Vertrag im Portal). */
  | { ziel: 'vertragAnsehen'; text: string }
  /** Seite eines anderen Einsatzes (`?token=…&job=<id>`). */
  | { ziel: 'einsatz'; text: string; jobId: string };

export interface Schritt {
  id: SchrittId;
  art: SchrittArt;
  /** Stelle in der sichtbaren Liste (1-basiert), wie im Bild: ✓, ✓, 3, 4. */
  nummer: number;
  titel: string;
  /** Satz bzw. Zeile unter dem Titel („am 12.10.2026", vvSatz, …); null = keiner. */
  text: string | null;
  link: SchrittLink | null;
  /** Ankunft, Verkehrsmittel, Adresse (nur mit gültigem Anreise-Eintrag). */
  zeilen: SchrittZeile[];
  /** kleine Zeile unter Text bzw. Zeilen (Hinweis „Stimmt eine Angabe nicht …" oder Wartezeile). */
  klein: string | null;
  /** Knopf „Vertrag jetzt abschließen →" (nur mit Nachhol-Weg). */
  knopf: string | null;
}

export interface SchritteAbschnitt {
  /** „So geht es weiter", wenn mindestens ein Schritt offen ist; sonst „Ihre Unterlagen" (N3.2, Regel 8). */
  titel: string;
  liste: Schritt[];
}

export interface SchritteEingabe {
  stand: GebuchtStand;
  heute: string;
  /** Gültiger Anreise-Datensatz oder null. Zeilen nur, solange `stand.mitAnreiseDaten`. */
  anreise: AnreiseDatensatz | null;
  vertrag: {
    stand: VertragStand;
    /** contract_snapshot.datum („dd.mm.yyyy") oder accepted_at (Zeitstempel). */
    datum: string | null;
    /** Es gibt einen PDF-Link für diesen Einsatz. */
    pdf: boolean;
    /** Rückfall ohne PDF: Der Vertrag lässt sich im Portal öffnen. */
    ansehen: boolean;
    /** Nachhol-Weg für den offenen Vertrag (sonst kein toter Knopf). */
    knopf: boolean;
  };
  /** Die Brücke hat in diesem Seitenaufruf geantwortet — nur dann steht die Wartezeile (Spez. 7, Regel 4). */
  brueckeOk: boolean;
  /** Lead bekommt die Anreise-Mail (E-Mail vorhanden, kein Vermittler). */
  bekommtMail: boolean;
  /** Folgeeinsatz F (`findeFolgeeinsatz`), null = keiner. Nie im beendeten Einsatz. */
  folge: EinsatzZeile | null;
  /** Vorname der jetzigen Pflegekraft (für „Hierhin wird Maria gebracht."), null = ohne Zusatz. */
  pflegekraftVorname: string | null;
}

type Entwurf = Omit<Schritt, 'art' | 'nummer'> & { erledigt: boolean };

function entwurf(id: SchrittId, erledigt: boolean, titel: string, teil: Partial<Pick<Schritt, 'text' | 'link' | 'zeilen' | 'klein' | 'knopf'>> = {}): Entwurf {
  return { id, erledigt, titel, text: teil.text ?? null, link: teil.link ?? null, zeilen: teil.zeilen ?? [], klein: teil.klein ?? null, knopf: teil.knopf ?? null };
}

function vertragSchritt(e: SchritteEingabe): Entwurf | null {
  const v = e.vertrag;
  if (v.stand === 'offen') return entwurf('vertrag', false, T.vertragUnterschreiben, { knopf: v.knopf ? T.vertragKnopf : null });
  if (v.stand === 'vorbereitung') return entwurf('vertrag', false, T.vertragVorbereitung, { text: T.vvSatz });
  // unterschrieben oder Vertrag einer früheren Buchung (Entscheidung 5 = B)
  const datum = vertragDatum(v.datum);
  const tag = vertragTag(v.datum);
  const frueher = v.stand === 'anderer' && !!tag && !!e.stand.anreiseDatum && tag < e.stand.anreiseDatum;
  const text = datum ? (frueher ? T.unterschriebenAm(datum) : T.vertragAm(datum)) : null;
  const link: SchrittLink | null = v.pdf
    ? { ziel: 'pdf', text: T.vertragPdf, aria: T.vertragPdfAria, inline: !!text }
    : v.ansehen ? { ziel: 'vertragAnsehen', text: T.vertragRueckfall } : null;
  return entwurf('vertrag', true, frueher ? T.vertragFrueher : T.vertragUnterschrieben, { text, link });
}

function anreiseZeilen(a: AnreiseDatensatz, mitJahr: boolean, vorname: string | null): SchrittZeile[] {
  const tag = einsatzTag(a.datum, mitJahr);
  const zeilen: SchrittZeile[] = [
    {
      id: 'ankunft',
      label: T.ankunft,
      // „Montag, 19.10., 14–16 Uhr": bricht höchstens zwischen den Teilen um.
      wert: [{ text: `${tag.wochentag},`, fest: true }, { text: `${tag.datum}${tag.jahr ?? ''},`, fest: true }, { text: anreiseZeit(a.von, a.bis), fest: true }],
      zusatz: null,
      maske: false,
    },
    { id: 'verkehrsmittel', label: T.verkehrsmittel, wert: [{ text: VERKEHRSMITTEL[a.verkehrsmittel] ?? a.verkehrsmittel, fest: false }], zusatz: null, maske: false },
  ];
  if (a.strasse) {
    // Entscheidung 8: bei Sindbad bis zur Klärung kein „Hierhin …"-Satz; ohne Vornamen kein Zusatz.
    const zusatz = vorname && a.verkehrsmittel !== 'Sindbad'
      ? (a.verkehrsmittel === 'Own transport' ? T.hierhinSelbst(vorname) : T.hierhinGebracht(vorname))
      : null;
    zeilen.push({
      id: 'adresse',
      label: T.adresse,
      wert: a.plzOrt ? [{ text: `${a.strasse},`, fest: false }, { text: a.plzOrt, fest: true }] : [{ text: a.strasse, fest: false }],
      zusatz,
      maske: true,
    });
  }
  return zeilen;
}

function anreiseSchritt(e: SchritteEingabe): Entwurf | null {
  const { stand } = e;
  if (stand.zeit !== 'vor' && stand.zeit !== 'anreisetag') return null;
  if (stand.mitAnreiseDaten && e.anreise) {
    const mitJahr = jahrNoetig([stand.anreiseDatum, stand.abreiseDatum], e.heute);
    return entwurf('anreise', true, T.anreiseOrganisiert, { zeilen: anreiseZeilen(e.anreise, mitJahr, e.pflegekraftVorname), klein: T.stimmtNicht });
  }
  if (stand.zeit === 'anreisetag') return entwurf('anreise', false, T.anreisedaten, { text: T.anreiseHeuteOffen });
  // Vor dem Anreisetag ohne Eintrag. Beim Vertrag in Vorbereitung steht der Anruf schon in Schritt 1.
  const warte = e.brueckeOk ? (e.bekommtMail ? `${T.warteSatz1} ${T.warteSatz2}` : T.warteSatz1) : null;
  return entwurf('anreise', false, T.anreiseAbgestimmt, {
    text: e.vertrag.stand === 'vorbereitung' ? null : T.anreiseBesprechen,
    klein: warte,
  });
}

/**
 * Martin 24.10.: Solange kein Folgeeinsatz angelegt ist, steht der Schritt ohne Datum und ohne Link mit dem Satz, wann wir
 * ihn anlegen (nur mit Abreisedatum: ohne Ende gibt es keinen Folgeeinsatz); ab „endet bald" stattdessen die Bitte, sich zu
 * melden. Ist er angelegt, steht er mit Datum und führt in diesen Einsatz.
 */
function folgeSchritt(e: SchritteEingabe): Entwurf | null {
  if (e.stand.zeit === 'beendet') return null;
  const f = e.folge;
  if (!f) {
    if (!e.stand.abreiseDatum) return null;
    return entwurf('folge', false, T.folgeTitel, { text: e.stand.zeit === 'endet-bald' ? T.folgeBaldOhne : T.folgeNochNicht });
  }
  const an = isoTag(f.anreise);
  if (!an) return null;
  const tag = an === e.heute ? T.heute : einsatzTag(an, jahrNoetig([an], e.heute)).text;
  const gebucht = f.status === 'gebucht';
  const bewerbungen = f.bewerbungen ?? 0;
  const text = gebucht ? (f.pflegekraft ? T.folgeGebucht(nameFest(f.pflegekraft)) : T.folgeGebuchtOhneName) : T.folgeSucht;
  const linkText = !gebucht && bewerbungen > 0 ? T.bewerbungenAnsehen(bewerbungen) : T.zumFolgeeinsatz;
  return entwurf('folge', false, T.folgeAb(tag), { text, link: { ziel: 'einsatz', text: linkText, jobId: f.id } });
}

/**
 * N3.2, Regeln 6–8, und N3.4: Schritte in fester Reihenfolge (Vertrag, Anreise, Nach der Anreise, Folgeeinsatz), jeder
 * nur unter seiner Bedingung. Der erste offene Schritt ist `jetzt`, alle weiteren offenen `spaeter`; die Nummer ist die
 * Stelle in der Liste. Ohne Schritt (beendet ohne Vertrag) ⇒ null, der Abschnitt entfällt.
 */
export function schritte(e: SchritteEingabe): SchritteAbschnitt | null {
  const beendet = e.stand.zeit === 'beendet';
  const vorOderAm = e.stand.zeit === 'vor' || e.stand.zeit === 'anreisetag';
  const mitVertrag = e.vertrag.stand === 'unterschrieben' || e.vertrag.stand === 'anderer';
  const entwuerfe = [
    beendet && !mitVertrag ? null : vertragSchritt(e),
    anreiseSchritt(e),
    vorOderAm ? entwurf('nach', false, T.nachDerAnreise, { text: T.nachSatz }) : null,
    folgeSchritt(e),
  ].filter((s): s is Entwurf => s !== null);
  if (entwuerfe.length === 0) return null;
  let jetztVergeben = false;
  const liste: Schritt[] = entwuerfe.map(({ erledigt, ...s }, i) => {
    let art: SchrittArt = 'fertig';
    if (!erledigt) { art = jetztVergeben ? 'spaeter' : 'jetzt'; jetztVergeben = true; }
    return { ...s, art, nummer: i + 1 };
  });
  return { titel: jetztVergeben ? T.soGehtEsWeiter : T.ihreUnterlagen, liste };
}

/** Text einer Schritt-Zeile wie auf der Seite (Teile mit Leerzeichen verbunden). */
export function zeilenText(z: SchrittZeile): string {
  return z.wert.map((w) => w.text).join(' ');
}

// ─── Reihenfolge der Bausteine (N3.2, Regel 1) ─────────────────────────────────

export type Baustein = 'gruss' | 'einsatz' | 'andererEinsatz' | 'schritte' | 'kontakt' | 'ende';

/**
 * Eine Reihenfolge für alle Zustände: Begrüßung · Einsatz-Karte · [nur B: „Ihr aktueller" bzw. „Ihr nächster Einsatz"] ·
 * Schritte · Kontakt · Siegel. Keine Ausnahme (Martin 15.10.: „nur einen vollständigen screen statt alles so komplex").
 */
export function reihenfolge(o: { anderer: boolean; schritte: boolean; ende: boolean }): Baustein[] {
  return [
    'gruss',
    'einsatz',
    ...(o.anderer ? ['andererEinsatz' as const] : []),
    ...(o.schritte ? ['schritte' as const] : []),
    'kontakt',
    ...(o.ende ? ['ende' as const] : []),
  ];
}
