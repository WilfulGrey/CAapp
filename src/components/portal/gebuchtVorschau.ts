// Vorschau-Daten der neuen Gebucht-Seite — NUR für ?preview=gebucht (wie die übrigen Preview-Mocks in
// CustomerPortalPage). Echte Kunden erreichen diesen Code nie: CustomerPortalPage ruft ihn nur im Vorschau-Zweig auf.
// Alle Daten liegen relativ zu heute (Berliner Tag), damit jeder Zustand an jedem Tag stimmt. „Frau Müller", „Maria K.",
// „Anna B.", „Małgorzata W.", „Bogumiła S.", „Musterstraße 1" sind Vorschau-Werte. Die Notfallnummer kommt nur zur
// Laufzeit aus &notfall= und nur auf localhost/127.0.0.1/::1 (notfallAusVorschauUrl); sonst der Platzhalter.
//
// Schalter (alle optional), Zustände wie texte_final.md, Nachtrag 3 (N3.5):
//   &zustand=vertrag-offen|vorbereitung|unterschrieben|anreise-offen|anreise-da|anreisetag|anreisetag-offen|im-einsatz|
//            endet-bald|endet-heute|beendet|folgeeinsatz   (Kürzel vo|vv|af|ad|at|l|eb|b gehen auch; ohne: anreise-da)
//   &folge=keiner|geplant|bewerbungen|gebucht  Folgeeinsatz (bei „beendet": der andere Einsatz; ohne: je Zustand, vor der
//                                              Anreise „keiner" = noch nicht angelegt)
//   &eintrag=ja|nein                           Anreise-Eintrag erzwingen/weglassen (z. B. VO oder VV mit Eintrag)
//   &verkehr=minibus|sindbad|eigen             Verkehrsmittel im Anreise-Eintrag
//   &ohne=abreise|anreise                      ohne Abreise- bzw. Anreisedatum (Randfälle)
//   &jahr=wechsel                              Jahreswechsel: vor der Anreise 31.12. → 24.02., beendet 03.12. → 04.02.
//   &kontakt=a|b                               Entscheidung 2 (ohne: A, Martins Wortlaut)
//   &ende=a|b                                  Entscheidung 7 (ohne: B, Siegel und Sterne)
//   &vertrag=anderer|offen                     Entscheidung 5 = B: Vertrag einer früheren Buchung; offen = nie nachgeholt
//   &bruecke=aus                               Brücke hat nicht geantwortet ⇒ keine Wartezeile
//   &mail=nein                                 Lead ohne E-Mail / Vermittler ⇒ Wartezeile ohne E-Mail-Satz
//   &foto=nein, &name=nein                     Pflegekraft ohne Foto bzw. ohne Namen
//   &name=lang                                 lange Namen: „Małgorzata W.", Folgekraft „Bogumiła S."
//   &notfall=…                                 Notfallnummer (nie im Code), nur auf localhost; sonst sichtbarer Platzhalter
//   &seite=alt                                 die heutige Seite (BookedScreen) zum Vergleich
import type { Nurse } from '../../types';
import { plusTage, type AnreiseDatensatz, type EinsatzZeile, type VertragStand } from '../../lib/gebuchtStand';
import type { GebuchtSeiteDaten, Seitenende } from './GebuchtSeite';
import { kontaktTitelAusUrl, notfallAusVorschauUrl, type KontaktTitel } from './GebuchtKontakt';

export type VorschauZustand =
  | 'vertrag-offen'
  | 'vorbereitung'
  | 'anreise-offen'
  | 'anreise-da'
  | 'anreisetag'
  | 'anreisetag-offen'
  | 'im-einsatz'
  | 'endet-bald'
  | 'endet-heute'
  | 'beendet'
  | 'folgeeinsatz';

const ALIAS: Record<string, VorschauZustand> = {
  'vertrag-offen': 'vertrag-offen', vo: 'vertrag-offen',
  vorbereitung: 'vorbereitung', vv: 'vorbereitung',
  unterschrieben: 'anreise-offen', 'anreise-offen': 'anreise-offen', af: 'anreise-offen',
  'anreise-da': 'anreise-da', ad: 'anreise-da',
  anreisetag: 'anreisetag', at: 'anreisetag',
  'anreisetag-offen': 'anreisetag-offen',
  'im-einsatz': 'im-einsatz', l: 'im-einsatz',
  'endet-bald': 'endet-bald', eb: 'endet-bald',
  'endet-heute': 'endet-heute',
  beendet: 'beendet', b: 'beendet',
  folgeeinsatz: 'folgeeinsatz',
};

export const VORSCHAU_STANDARD: VorschauZustand = 'anreise-da';

export function vorschauZustandAusUrl(search: string): VorschauZustand {
  return ALIAS[(new URLSearchParams(search).get('zustand') ?? '').toLowerCase()] ?? VORSCHAU_STANDARD;
}

/** `&seite=alt` zeigt die heutige Seite. */
export function vorschauAlteSeite(search: string): boolean {
  return new URLSearchParams(search).get('seite') === 'alt';
}

type Folge = 'keiner' | 'geplant' | 'bewerbungen' | 'gebucht' | 'laufend';

const VERKEHR: Record<string, string> = { minibus: 'Minibus', sindbad: 'Sindbad', eigen: 'Own transport' };

/** `&name=lang`: lange Namen mit polnischen Zeichen für die H1-Messung bei 360/390 px. */
const LANG = { pflegekraft: 'Małgorzata Wiśniewska', pflegekraftKurz: 'Małgorzata W.', folgekraft: 'Bogumiła S.' } as const;

export interface GebuchtVorschau {
  zustand: VorschauZustand;
  daten: GebuchtSeiteDaten;
  kontaktTitel: KontaktTitel;
  seitenende: Seitenende;
}

/**
 * Baut die Eingaben der Seite für einen Vorschau-Zustand. `nurse` = Vorschau-Pflegekraft der Seite (PREVIEW_APPLICATION),
 * `heute` = Berliner Kalendertag.
 */
export function gebuchtVorschau({ search, heute, nurse, kopf, hostname }: {
  search: string;
  heute: string;
  nurse: Nurse;
  kopf: GebuchtSeiteDaten['kopf'];
  /** Nur für Tests; sonst window.location.hostname (Notfallnummer nur auf localhost). */
  hostname?: string;
}): GebuchtVorschau {
  const q = new URLSearchParams(search);
  const langeNamen = q.get('name') === 'lang';
  const zustand = vorschauZustandAusUrl(search);
  const t = (n: number) => plusTage(heute, n);

  // Zeitraum dieses Einsatzes je Zustand.
  const zeitraum: Record<VorschauZustand, [number, number]> = {
    'vertrag-offen': [4, 45],
    vorbereitung: [4, 45],
    'anreise-offen': [4, 45],
    'anreise-da': [4, 45],
    anreisetag: [0, 41],
    'anreisetag-offen': [0, 41],
    'im-einsatz': [-14, 45],
    'endet-bald': [-40, 11],
    'endet-heute': [-40, 0],
    folgeeinsatz: [-14, 45],
    beendet: [-100, -40],
  };
  const [vonTag, bisTag] = zeitraum[zustand];
  const beendet = zustand === 'beendet';
  const ohne = q.get('ohne');
  let anreise: string | null = t(vonTag);
  let abreise: string | null = t(bisTag);
  if (q.get('jahr') === 'wechsel') {
    // N3.5 „Jahreswechsel": vor der Anreise 31.12. → 24.02. des Folgejahrs; beendet im Vorjahr 03.12. → 04.02.
    const jahr = Number(heute.slice(0, 4));
    if (beendet) { anreise = `${jahr - 1}-12-03`; abreise = `${jahr}-02-04`; }
    else if (vonTag > 0) { anreise = `${jahr}-12-31`; abreise = plusTage(anreise, 55); }
  }
  if (ohne === 'abreise') abreise = null;
  if (ohne === 'anreise') anreise = null;

  let vertrag: VertragStand = zustand === 'vertrag-offen' ? 'offen' : zustand === 'vorbereitung' ? 'vorbereitung' : 'unterschrieben';
  const vertragParam = q.get('vertrag');
  if (vertragParam === 'anderer' && vertrag === 'unterschrieben') vertrag = 'anderer';
  if (vertragParam === 'offen' && !beendet) vertrag = 'offen';
  // „anderer" = Vertrag einer früheren Buchung: lange vor dieser Anreise unterschrieben.
  const unterschriebenAm = vertrag === 'unterschrieben' ? t(Math.min(vonTag, 0) - 3) : vertrag === 'anderer' ? t(vonTag - 80) : null;

  const eintragParam = q.get('eintrag');
  const vorOderAm = vonTag >= 0 && !beendet;
  const mitDatensatz = !!anreise && vorOderAm && (eintragParam === 'ja' || (eintragParam !== 'nein' && (zustand === 'anreise-da' || zustand === 'anreisetag')));
  const anreiseEintrag: AnreiseDatensatz | null = mitDatensatz && anreise
    ? {
        datum: anreise,
        von: '14:00',
        bis: '16:00',
        verkehrsmittel: VERKEHR[(q.get('verkehr') ?? '').toLowerCase()] ?? 'Minibus',
        strasse: 'Musterstraße 1',
        plzOrt: '12345 Musterstadt',
      }
    : null;

  const folgeParam = q.get('folge') as Folge | null;
  // Standard je Zustand: vor der Anreise ist der Folgeeinsatz noch nicht angelegt (Martin 24.10.; angelegt wird er meist
  // etwa einen Monat vor dem Ende), „endet bald" mit gebuchter Folgekraft, „folgeeinsatz" mit 2 Bewerbungen.
  const folgeStandard: Folge = zustand === 'endet-bald' || zustand === 'endet-heute' ? 'gebucht'
    : zustand === 'folgeeinsatz' ? 'bewerbungen'
    : beendet ? 'laufend' : 'keiner';
  const folgeArt: Folge = folgeParam && ['keiner', 'geplant', 'bewerbungen', 'gebucht', 'laufend'].includes(folgeParam) ? folgeParam : folgeStandard;

  const dieser: EinsatzZeile = {
    id: 'vorschau-einsatz-1',
    status: beendet ? 'abgeschlossen' : 'gebucht',
    anreise,
    abreise,
    pflegekraft: langeNamen ? LANG.pflegekraftKurz : 'Maria K.',
    bewerbungen: null,
  };
  const jobs: EinsatzZeile[] = [dieser];
  if (folgeArt !== 'keiner' && (beendet || abreise)) {
    // Beim beendeten Einsatz ist der andere Einsatz der laufende (Standard) oder der nächste; sonst der Folgeeinsatz ab Abreise.
    const fVon = beendet ? (folgeArt === 'laufend' ? t(-40) : t(10)) : abreise!;
    const fBis = plusTage(fVon, folgeArt === 'laufend' ? 60 : 42);
    jobs.push({
      id: 'vorschau-einsatz-2',
      status: folgeArt === 'gebucht' || folgeArt === 'laufend' ? 'gebucht' : 'geplant',
      anreise: fVon,
      abreise: fBis,
      pflegekraft: folgeArt === 'gebucht' || folgeArt === 'laufend' ? (langeNamen ? LANG.folgekraft : 'Anna B.') : null,
      bewerbungen: folgeArt === 'bewerbungen' ? 2 : folgeArt === 'geplant' ? 0 : null,
    });
  }

  const pflegekraft: Nurse = {
    ...nurse,
    name: q.get('name') === 'nein' ? '' : langeNamen ? LANG.pflegekraft : nurse.name,
    image: q.get('foto') === 'nein' ? undefined : nurse.image,
  };

  return {
    zustand,
    kontaktTitel: kontaktTitelAusUrl(search),
    seitenende: q.get('ende') === 'a' ? 'a' : 'b',
    daten: {
      heute,
      kopf,
      einsatz: { id: dieser.id, status: dieser.status, anreise, abreise },
      pflegekraft,
      anreise: anreiseEintrag,
      brueckeOk: q.get('bruecke') !== 'aus',
      bekommtMail: q.get('mail') !== 'nein',
      vertrag: {
        stand: vertrag,
        datum: unterschriebenAm,
        // Vorschau: das öffentliche Muster statt eines echten Vertrags (kein Lead, kein Token).
        pdfHref: unterschriebenAm ? '/primundus-mustervertrag.pdf' : null,
      },
      tagessatz: vertrag === 'unterschrieben' ? 95 : null,
      jobs,
      notfallTelefon: notfallAusVorschauUrl(search, hostname),
    },
  };
}
