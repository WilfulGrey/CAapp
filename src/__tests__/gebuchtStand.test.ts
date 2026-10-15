// Gebucht-Seite neu (PROTOTYP 15.10.2026): Zustandslogik. Spezifikation gebucht-seite-2026-10-15, Abschnitte 5 und 7.
// Alle Daten sind Fantasie-Werte; „heute" ist Donnerstag, 15.10.2026.
import { describe, it, expect } from 'vitest';
import {
  ENDET_BALD_TAGE,
  anreiseAusEreignissen,
  berlinTag,
  einsatzPille,
  findeAnderenEinsatz,
  findeFolgeeinsatz,
  folgeHinweis,
  gebuchtStand,
  plusTage,
  reihenfolge,
  tageBis,
  vertragTag,
  zeitstand,
  type AnreiseEreignis,
  type Baustein,
  type EinsatzZeile,
  type GebuchtEingabe,
  type GebuchtZustand,
} from '../lib/gebuchtStand';

const HEUTE = '2026-10-15';

function eingabe(over: Partial<GebuchtEingabe> & { anreise?: GebuchtEingabe['anreise'] } = {}): GebuchtEingabe {
  return {
    heute: HEUTE,
    einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-19', abreise: '2026-11-29' },
    anreise: null,
    vertrag: 'unterschrieben',
    ...over,
  };
}

const DATENSATZ = { datum: '2026-10-19', von: '14:00', bis: '16:00', verkehrsmittel: 'Minibus', strasse: 'Musterstraße 1', plzOrt: '12345 Musterstadt' };

function job(over: Partial<EinsatzZeile>): EinsatzZeile {
  return { id: 'x', status: 'gebucht', anreise: null, abreise: null, pflegekraft: null, bewerbungen: null, ...over };
}

describe('berlinTag', () => {
  it('rechnet den Berliner Kalendertag, nicht die Gerätezeit', () => {
    expect(berlinTag(new Date('2026-10-14T21:59:00Z'))).toBe('2026-10-14'); // 23:59 Berlin (Sommerzeit)
    expect(berlinTag(new Date('2026-10-14T22:00:00Z'))).toBe('2026-10-15'); // 00:00 Berlin
    expect(berlinTag(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'); // Winterzeit, Jahreswechsel
  });
  it('Tage rechnen über Monats- und Jahreswechsel', () => {
    expect(tageBis('2026-10-15', '2026-11-01')).toBe(17);
    expect(plusTage('2026-12-30', 3)).toBe('2027-01-02');
    expect(plusTage('2026-10-24', 2)).toBe('2026-10-26'); // Zeitumstellung 25.10.
  });
});

describe('zeitstand (Spez. 5.3)', () => {
  it('vor, Anreisetag, im Einsatz, beendet', () => {
    expect(zeitstand(HEUTE, '2026-10-16', '2026-12-01', 'gebucht')).toBe('vor');
    expect(zeitstand(HEUTE, HEUTE, '2026-12-01', 'gebucht')).toBe('anreisetag');
    expect(zeitstand(HEUTE, '2026-10-01', '2026-12-01', 'gebucht')).toBe('im-einsatz');
    expect(zeitstand(HEUTE, '2026-09-01', '2026-10-14', 'gebucht')).toBe('beendet');
  });
  it('Abreisetag selbst gehört noch zum Einsatz', () => {
    expect(zeitstand(HEUTE, '2026-09-01', HEUTE, 'gebucht')).toBe('endet-bald');
  });
  it('„endet bald" genau ab 14 Tagen (Entscheidung 9), 15 Tage noch im Einsatz', () => {
    expect(ENDET_BALD_TAGE).toBe(14);
    expect(zeitstand(HEUTE, '2026-10-01', plusTage(HEUTE, 14), 'gebucht')).toBe('endet-bald');
    expect(zeitstand(HEUTE, '2026-10-01', plusTage(HEUTE, 15), 'gebucht')).toBe('im-einsatz');
  });
  it('Status „abgeschlossen" beendet auch vor der Abreise; die Datumsregel schlägt einen veralteten Spiegel', () => {
    expect(zeitstand(HEUTE, '2026-10-01', '2026-12-01', 'abgeschlossen')).toBe('beendet');
    expect(zeitstand(HEUTE, '2026-08-01', '2026-10-01', 'gebucht')).toBe('beendet');
  });
  it('ohne Anreisedatum: vor der Anreise (kein Datum geraten)', () => {
    expect(zeitstand(HEUTE, null, null, 'gebucht')).toBe('vor');
  });
});

describe('gebuchtStand: Rangfolge (Spez. 5.5)', () => {
  it('B vor VO: beim beendeten Einsatz nie der Vertragsknopf', () => {
    const s = gebuchtStand(eingabe({ vertrag: 'offen', einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-08-01', abreise: '2026-10-01' } }));
    expect(s.zustand).toBe('B');
  });
  it('VO vor Anreisetag und vor Anreisedaten', () => {
    expect(gebuchtStand(eingabe({ vertrag: 'offen', anreise: DATENSATZ })).zustand).toBe('VO');
    expect(gebuchtStand(eingabe({ vertrag: 'offen', einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' } })).zustand).toBe('VO');
  });
  it('AD mit Datensatz, AF ohne, VV bei Vertrag in Vorbereitung', () => {
    expect(gebuchtStand(eingabe({ anreise: DATENSATZ })).zustand).toBe('AD');
    expect(gebuchtStand(eingabe()).zustand).toBe('AF');
    expect(gebuchtStand(eingabe({ vertrag: 'vorbereitung' })).zustand).toBe('VV');
    expect(gebuchtStand(eingabe({ vertrag: 'anderer' })).zustand).toBe('AF');
  });
  it('AT mit und ohne Daten', () => {
    const at = gebuchtStand(eingabe({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' }, anreise: { ...DATENSATZ, datum: HEUTE } }));
    expect(at).toMatchObject({ zustand: 'AT', mitAnreiseDaten: true });
    const ohne = gebuchtStand(eingabe({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' } }));
    expect(ohne).toMatchObject({ zustand: 'AT', mitAnreiseDaten: false });
  });
  it('EB vor L', () => {
    expect(gebuchtStand(eingabe({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-09-01', abreise: '2026-10-26' } })).zustand).toBe('EB');
    expect(gebuchtStand(eingabe({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-01', abreise: '2026-11-29' } })).zustand).toBe('L');
  });
  it('Befund 1: das Datum des Anreise-Datensatzes gilt, auch wenn lead_jobs.anreise abweicht', () => {
    const s = gebuchtStand(eingabe({ anreise: { ...DATENSATZ, datum: '2026-10-21' } }));
    expect(s.anreiseDatum).toBe('2026-10-21');
  });
  it('nach der Anreise keine Ankunftsdaten mehr in der Karte', () => {
    const s = gebuchtStand(eingabe({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-01', abreise: '2026-11-29' }, anreise: { ...DATENSATZ, datum: '2026-10-01' } }));
    expect(s).toMatchObject({ zustand: 'L', mitAnreiseDaten: false });
  });
});

describe('anreiseAusEreignissen (Spez. 7, Regel 2)', () => {
  const ev = (meta: Record<string, unknown>, created_at = '2026-10-12T10:00:00Z'): AnreiseEreignis => ({
    event_type: 'caregiver_arrival_scheduled',
    created_at,
    metadata: {
      mamamia_job_offer_id: 777,
      anreise_datum: '2026-10-19',
      anreise_von: '14:00',
      anreise_bis: '16:00',
      verkehrsmittel: 'Minibus',
      einsatzort_strasse: 'Musterstraße 1',
      einsatzort_plz_ort: '12345 Musterstadt',
      hinweis: 'Osobus Disponent, Uhrzeitänderung',
      caregiver_photo_url: 'https://example.invalid/foto.jpg',
      ...meta,
    },
  });

  it('liest nur die Felder der Mail — nie hinweis, Foto-URL oder Schlüssel', () => {
    const d = anreiseAusEreignissen([ev({})], 777, 'gebucht');
    expect(d).toEqual({ datum: '2026-10-19', von: '14:00', bis: '16:00', verkehrsmittel: 'Minibus', strasse: 'Musterstraße 1', plzOrt: '12345 Musterstadt' });
    expect(JSON.stringify(d)).not.toMatch(/Osobus|hinweis|foto/i);
  });
  it('das neueste Ereignis je Job gilt (Geänderte Anreisedaten)', () => {
    const d = anreiseAusEreignissen([ev({}, '2026-10-10T10:00:00Z'), ev({ anreise_datum: '2026-10-21' }, '2026-10-13T10:00:00Z')], 777, 'gebucht');
    expect(d?.datum).toBe('2026-10-21');
  });
  it('anderer Job, Test-Ereignis, Job nicht gebucht ⇒ kein Datensatz', () => {
    expect(anreiseAusEreignissen([ev({ mamamia_job_offer_id: 778 })], 777, 'gebucht')).toBeNull();
    expect(anreiseAusEreignissen([ev({ test: true })], 777, 'gebucht')).toBeNull();
    expect(anreiseAusEreignissen([ev({})], 777, 'geplant')).toBeNull();
    expect(anreiseAusEreignissen(null, 777, 'gebucht')).toBeNull();
  });
  it('unvollständig oder falsches Format ⇒ kein Datensatz, auch kein älterer (nichts geraten)', () => {
    expect(anreiseAusEreignissen([ev({}, '2026-10-10T10:00:00Z'), ev({ anreise_von: '' }, '2026-10-13T10:00:00Z')], 777, 'gebucht')).toBeNull();
    expect(anreiseAusEreignissen([ev({ verkehrsmittel: null })], 777, 'gebucht')).toBeNull();
    expect(anreiseAusEreignissen([ev({ anreise_datum: '19.10.2026' })], 777, 'gebucht')).toBeNull();
  });
  it('Ende fehlt oder ist kein HH:MM ⇒ bis = null („ab 14 Uhr")', () => {
    expect(anreiseAusEreignissen([ev({ anreise_bis: null })], 777, 'gebucht')?.bis).toBeNull();
    expect(anreiseAusEreignissen([ev({ anreise_bis: 'abends' })], 777, 'gebucht')?.bis).toBeNull();
  });
  it('Job-ID darf als Text kommen', () => {
    expect(anreiseAusEreignissen([ev({ mamamia_job_offer_id: '777' })], 777, 'gebucht')).not.toBeNull();
  });
});

describe('Folgeeinsatz (Spez. 5.4)', () => {
  const dieser = job({ id: 'j1', anreise: '2026-10-01', abreise: '2026-11-29' });
  it('nächster gebuchter/geplanter Job ab 3 Tagen vor der Abreise, der früheste gewinnt', () => {
    const jobs = [dieser, job({ id: 'f2', status: 'geplant', anreise: '2027-01-10' }), job({ id: 'f1', status: 'gebucht', anreise: '2026-11-26' })];
    expect(findeFolgeeinsatz(jobs, 'j1', '2026-11-29')?.id).toBe('f1');
  });
  it('Fenster ±3 Tage: 4 Tage vorher zählt nicht', () => {
    expect(findeFolgeeinsatz([dieser, job({ id: 'f', anreise: '2026-11-25' })], 'j1', '2026-11-29')).toBeNull();
    expect(findeFolgeeinsatz([dieser, job({ id: 'f', anreise: '2026-11-26' })], 'j1', '2026-11-29')?.id).toBe('f');
  });
  it('abgeschlossen, storniert, ohne Anreise oder ohne Abreise dieses Einsatzes ⇒ keiner', () => {
    expect(findeFolgeeinsatz([dieser, job({ id: 'f', status: 'storniert', anreise: '2026-12-01' })], 'j1', '2026-11-29')).toBeNull();
    expect(findeFolgeeinsatz([dieser, job({ id: 'f', status: 'geplant', anreise: null })], 'j1', '2026-11-29')).toBeNull();
    expect(findeFolgeeinsatz([dieser, job({ id: 'f', anreise: '2026-12-01' })], 'j1', null)).toBeNull();
  });
  it('Hinweiszeile T5 nur in L und EB bei „geplant" mit Bewerbungen', () => {
    const f = job({ id: 'f', status: 'geplant', anreise: '2026-11-29', bewerbungen: 2 });
    expect(folgeHinweis('L', f)).toBe(true);
    expect(folgeHinweis('EB', f)).toBe(true);
    for (const z of ['VO', 'VV', 'AF', 'AD', 'AT', 'B'] as const) expect(folgeHinweis(z, f), z).toBe(false);
    expect(folgeHinweis('L', { ...f, bewerbungen: 0 })).toBe(false);
    expect(folgeHinweis('L', { ...f, status: 'gebucht' })).toBe(false);
    expect(folgeHinweis('L', null)).toBe(false);
  });
});

describe('anderer Einsatz beim beendeten (Ihr aktueller / nächster Einsatz)', () => {
  const beendet = job({ id: 'j1', status: 'abgeschlossen', anreise: '2026-05-19', abreise: '2026-07-19' });
  it('laufender Einsatz ⇒ „aktuell", Pille „Laufend"', () => {
    const lauf = job({ id: 'j2', anreise: '2026-10-01', abreise: '2026-11-29', pflegekraft: 'Anna B.' });
    const a = findeAnderenEinsatz([beendet, lauf], 'j1', HEUTE);
    expect(a).toMatchObject({ art: 'aktuell', job: { id: 'j2' } });
    expect(einsatzPille(lauf, HEUTE)).toBe('Laufend');
  });
  it('sonst der nächste gebuchte oder geplante ⇒ „nächster"', () => {
    const naechst = job({ id: 'j3', status: 'geplant', anreise: '2026-11-01' });
    expect(findeAnderenEinsatz([beendet, naechst], 'j1', HEUTE)).toMatchObject({ art: 'naechster', job: { id: 'j3' } });
    expect(einsatzPille(naechst, HEUTE)).toBe('Geplant');
    expect(einsatzPille(job({ anreise: '2026-11-01', abreise: '2026-12-01' }), HEUTE)).toBe('Gebucht');
  });
  it('kein anderer ⇒ null', () => {
    expect(findeAnderenEinsatz([beendet], 'j1', HEUTE)).toBeNull();
  });
});

describe('vertragTag: Berliner Kalendertag des Vertragsdatums', () => {
  it('Zeitstempel ⇒ Berliner Tag; „dd.mm.yyyy" und Kalendertag bleiben; Unlesbares ⇒ null', () => {
    expect(vertragTag('2026-10-12T22:30:00Z')).toBe('2026-10-13');
    expect(vertragTag('2026-10-12T21:59:59.999Z')).toBe('2026-10-12');
    expect(vertragTag('28.07.2026')).toBe('2026-07-28');
    expect(vertragTag('2026-07-28')).toBe('2026-07-28');
    expect(vertragTag('28.7.2026')).toBeNull();
    expect(vertragTag(undefined)).toBeNull();
  });
});

describe('reihenfolge (Spez. 4.2, texte_final Befund 1)', () => {
  // Standard seit der Gegenprüfung 15.10.: Martins Reihenfolge, die Karte vor dem Kontakt.
  const basis = { folge: null, anderer: null, mehrereEinsaetze: false, unterlagen: true, kontaktObenImEinsatz: false };
  const s = (over: Partial<GebuchtEingabe>) => gebuchtStand(eingabe(over));
  it('VO: Knopf direkt unter dem Status, keine Unterlagen, kein Seitenende', () => {
    expect(reihenfolge(s({ vertrag: 'offen' }), { ...basis, unterlagen: false })).toEqual(['status', 'vertragsknopf', 'karte', 'kontakt']);
  });
  it('AD: Karte, Satz unter der Karte, Kontakt, Unterlagen', () => {
    expect(reihenfolge(s({ anreise: DATENSATZ }), basis)).toEqual(['status', 'karte', 'unterKarte', 'kontakt', 'unterlagen', 'ende']);
  });
  it('AT ohne Daten: Kontakt vor der Karte', () => {
    expect(reihenfolge(s({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' } }), basis))
      .toEqual(['status', 'kontakt', 'karte', 'unterlagen', 'ende']);
  });
  const l = s({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-10-01', abreise: '2026-11-29' } });
  const eb = s({ einsatz: { id: 'j1', status: 'gebucht', anreise: '2026-09-01', abreise: '2026-10-26' } });
  it('L und EB: Standard Martins Reihenfolge (Karte, dann Kontakt), Alternative Kontakt über der Karte', () => {
    expect(l.zustand).toBe('L');
    expect(eb.zustand).toBe('EB');
    for (const st of [l, eb]) {
      expect(reihenfolge(st, basis)).toEqual(['status', 'karte', 'kontakt', 'unterlagen', 'ende']);
      expect(reihenfolge(st, { ...basis, kontaktObenImEinsatz: true })).toEqual(['status', 'kontakt', 'karte', 'unterlagen', 'ende']);
    }
  });
  it('L/EB mit Folgeeinsatz „geplant" und Bewerbungen: Hinweiszeile unter dem Status, Abschnitt unter dem Kontakt, nur einmal', () => {
    const folge = job({ id: 'f', status: 'geplant', anreise: '2026-11-29', bewerbungen: 2 });
    const r = reihenfolge(l, { ...basis, folge, mehrereEinsaetze: true });
    expect(r).toEqual(['status', 'folgeHinweis', 'karte', 'kontakt', 'folge', 'unterlagen', 'alleEinsaetze', 'ende']);
    expect(r.filter((b) => b === 'folge')).toHaveLength(1);
    expect(reihenfolge(eb, { ...basis, folge, kontaktObenImEinsatz: true }))
      .toEqual(['status', 'folgeHinweis', 'kontakt', 'karte', 'folge', 'unterlagen', 'ende']);
  });
  it('vor der Anreise mit Bewerbungen beim Folgeeinsatz: keine Hinweiszeile, Abschnitt unter dem Kontakt', () => {
    const folge = job({ id: 'f', status: 'geplant', anreise: '2026-11-29', bewerbungen: 2 });
    expect(reihenfolge(s({ anreise: DATENSATZ }), { ...basis, folge }))
      .toEqual(['status', 'karte', 'unterKarte', 'kontakt', 'folge', 'unterlagen', 'ende']);
  });
  it('Regel: der Abschnitt Folgeeinsatz steht in keinem Zustand und keiner Variante über dem Kontakt', () => {
    const staende = [
      s({ vertrag: 'offen' }), s({ vertrag: 'vorbereitung' }), s({}), s({ anreise: DATENSATZ }),
      s({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' } }),
      s({ einsatz: { id: 'j1', status: 'gebucht', anreise: HEUTE, abreise: '2026-11-29' }, anreise: { ...DATENSATZ, datum: HEUTE } }),
      l, eb,
    ];
    const zustaende = new Set<GebuchtZustand>();
    for (const st of staende) {
      zustaende.add(st.zustand);
      for (const folge of [job({ id: 'f', status: 'geplant', anreise: '2026-11-29', bewerbungen: 2 }), job({ id: 'f', status: 'gebucht', anreise: '2026-11-29', pflegekraft: 'Anna B.' })]) {
        for (const kontaktObenImEinsatz of [false, true]) {
          const r: Baustein[] = reihenfolge(st, { ...basis, folge, kontaktObenImEinsatz });
          expect(r.indexOf('folge'), `${st.zustand} ${kontaktObenImEinsatz}`).toBeGreaterThan(r.indexOf('kontakt'));
          expect(r.indexOf('kontakt')).toBeGreaterThan(-1);
        }
      }
    }
    expect([...zustaende].sort()).toEqual(['AD', 'AF', 'AT', 'EB', 'L', 'VO', 'VV']);
  });
  it('B: Karte, dann der andere Einsatz, Unterlagen, Kontakt (Befund 1 texte_final)', () => {
    const b = s({ einsatz: { id: 'j1', status: 'abgeschlossen', anreise: '2026-05-19', abreise: '2026-07-19' } });
    const anderer = { art: 'aktuell' as const, job: job({ id: 'j2', anreise: '2026-10-01', abreise: '2026-11-29' }) };
    expect(reihenfolge(b, { ...basis, anderer, mehrereEinsaetze: true })).toEqual(['status', 'karte', 'andererEinsatz', 'unterlagen', 'kontakt', 'alleEinsaetze', 'ende']);
  });
});
