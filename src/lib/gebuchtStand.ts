// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau ?preview=gebucht): Zustandslogik als reine Funktionen.
//
// Grundlage: seo-reports/analysen/gebucht-seite-2026-10-15/spezifikation.md, Abschnitte 5 und 7 (Jury-Sieger
// „Status zuerst"), Endwortlaut in texte_final.md. Drei unabhängige Merkmale bestimmen die Seite: Vertrag, Zeit,
// Folgeeinsatz. Der Tag ist der Berliner Kalendertag (wie `berlinJetzt` im Cron detect-caregiver-events) — nicht die
// Ortszeit des Browsers.
//
// Święta zasada 1: Hier wird nichts erfunden. Uhrzeit, Verkehrsmittel und Adresse kommen NUR aus einem gültigen
// Anreise-Datensatz (Ereignis `caregiver_arrival_scheduled`, Feldliste wie die Anreise-Mail, nie `hinweis`). Fehlt er,
// zeigt die Seite das Datum aus dem Job mit „geplant". Fehlt ein Datum, entfällt die Angabe.

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

// ─── Reihenfolge der Bausteine (Spez. 4.2 mit texte_final Befund 1) ───────────

export type Baustein =
  | 'status'
  | 'folgeHinweis'
  | 'vertragsknopf'
  | 'karte'
  | 'unterKarte'
  | 'kontakt'
  | 'folge'
  | 'andererEinsatz'
  | 'unterlagen'
  | 'alleEinsaetze'
  | 'ende';

export interface ReihenfolgeOptionen {
  folge: EinsatzZeile | null;
  anderer: AndererEinsatz | null;
  mehrereEinsaetze: boolean;
  /** Unterlagen nur mit unterschriebenem bzw. anderem Vertrag (nie VO, VV). */
  unterlagen: boolean;
  /**
   * Entscheidung 4, nur L und EB. Standard false = Martins Reihenfolge (15.10.: erst Bild, Name, Zeitraum und Kosten,
   * dann der Kontakt). true = Alternative „Kontakt über der Karte" (Vorschau `&kontaktoben=ja`).
   */
  kontaktObenImEinsatz: boolean;
}

/**
 * Hinweiszeile T5 („Folgeeinsatz: 2 Bewerbungen ansehen ›") direkt unter dem Status: nur L und EB, Folgeeinsatz
 * „geplant" mit mindestens einer Bewerbung. Der Abschnitt Folgeeinsatz selbst steht nie über dem Kontakt (Notfallnummer
 * im ersten Bildschirm, Gegenprüfung 15.10.); die Zeile hält die Bewerbungen trotzdem oben sichtbar.
 */
export function folgeHinweis(zustand: GebuchtZustand, folge: EinsatzZeile | null): boolean {
  return !!folge && folge.status === 'geplant' && (folge.bewerbungen ?? 0) > 0 && (zustand === 'L' || zustand === 'EB');
}

export function reihenfolge(stand: GebuchtStand, o: ReihenfolgeOptionen): Baustein[] {
  const { zustand } = stand;
  // Folgeeinsatz immer unter dem Kontakt (in jedem Zustand mit Kontakt davor).
  const folgeUnten: Baustein[] = o.folge ? ['folge'] : [];
  const alle: Baustein[] = o.mehrereEinsaetze ? ['alleEinsaetze'] : [];
  const unterlagen: Baustein[] = o.unterlagen ? ['unterlagen'] : [];
  const start: Baustein[] = folgeHinweis(zustand, o.folge) ? ['status', 'folgeHinweis'] : ['status'];

  switch (zustand) {
    case 'VO':
      return ['status', 'vertragsknopf', 'karte', 'kontakt', ...folgeUnten, ...alle];
    case 'VV':
      return ['status', 'karte', 'kontakt', ...folgeUnten, ...alle];
    case 'AF':
      return [...start, 'karte', 'kontakt', ...folgeUnten, ...unterlagen, ...alle, 'ende'];
    case 'AD':
      return [...start, 'karte', 'unterKarte', 'kontakt', ...folgeUnten, ...unterlagen, ...alle, 'ende'];
    case 'AT':
      return stand.mitAnreiseDaten
        ? [...start, 'karte', 'unterKarte', 'kontakt', ...folgeUnten, ...unterlagen, ...alle, 'ende']
        : [...start, 'kontakt', 'karte', ...folgeUnten, ...unterlagen, ...alle, 'ende'];
    case 'L':
    case 'EB':
      return o.kontaktObenImEinsatz
        ? [...start, 'kontakt', 'karte', ...folgeUnten, ...unterlagen, ...alle, 'ende']
        : [...start, 'karte', 'kontakt', ...folgeUnten, ...unterlagen, ...alle, 'ende'];
    case 'B':
      return ['status', 'karte', ...(o.anderer ? ['andererEinsatz' as const] : []), ...unterlagen, 'kontakt', ...alle, 'ende'];
  }
}
