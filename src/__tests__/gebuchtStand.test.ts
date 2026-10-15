// Gebucht-Seite neu (PROTOTYP 15.10.2026): Zustandslogik. Spezifikation gebucht-seite-2026-10-15, Abschnitte 5 und 7, und
// texte_final.md, Nachtrag 3 (Karte B mit Schritten, N3.2–N3.5). Alle Daten sind Fantasie-Werte; „heute" ist Donnerstag,
// 15.10.2026.
import {
  ENDET_BALD_TAGE,
  anreiseAusEreignissen,
  berlinTag,
  einsatzEtikett,
  einsatzPille,
  einsatzZeitraum,
  findeAnderenEinsatz,
  findeFolgeeinsatz,
  gebuchtStand,
  jahrNoetig,
  kostenZeile,
  plusTage,
  reihenfolge,
  schritte,
  tageBis,
  vertragDatum,
  vertragTag,
  zeilenText,
  zeitstand,
  type AnreiseEreignis,
  type EinsatzZeile,
  type GebuchtEingabe,
  type SchritteEingabe,
  type VertragStand,
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

describe('vertragDatum: Berliner Tag (Registry #20), nie der UTC-Tag', () => {
  it('ISO-Zeitstempel nach 22/23 Uhr UTC ist in Berlin schon der nächste Tag', () => {
    expect(vertragDatum('2026-10-12T22:30:00Z')).toBe('13.10.2026');
    expect(vertragDatum('2026-10-12T21:59:00Z')).toBe('12.10.2026');
    expect(vertragDatum('2026-01-05T23:30:00+00:00')).toBe('06.01.2026');
  });
  it('„dd.mm.yyyy" und Kalendertag bleiben; Unlesbares ⇒ null', () => {
    expect(vertragDatum('12.10.2026')).toBe('12.10.2026');
    expect(vertragDatum('2026-10-12')).toBe('12.10.2026');
    expect(vertragDatum('quatsch')).toBeNull();
    expect(vertragDatum(null)).toBeNull();
  });
});

// ─── Nachtrag 3: Karte und Schritte ───────────────────────────────────────────

const nb = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ');
type Zeitraum = { anreise: string | null; abreise: string | null; status?: string };
/** Beispieldaten wie N3.5 (heute Donnerstag, 15.10.2026). */
const ZR = {
  vor: { anreise: '2026-10-19', abreise: '2026-11-29' },
  at: { anreise: HEUTE, abreise: '2026-11-25' },
  l: { anreise: '2026-10-01', abreise: '2026-11-29' },
  eb: { anreise: '2026-09-05', abreise: '2026-10-26' },
  ebHeute: { anreise: '2026-09-05', abreise: HEUTE },
  b: { anreise: '2026-07-07', abreise: '2026-09-05', status: 'abgeschlossen' },
} satisfies Record<string, Zeitraum>;

interface Fall {
  zr?: Zeitraum;
  eintrag?: boolean | Partial<typeof DATENSATZ>;
  vertrag?: VertragStand;
  datum?: string | null;
  pdf?: boolean;
  ansehen?: boolean;
  knopf?: boolean;
  folge?: EinsatzZeile | null;
  brueckeOk?: boolean;
  bekommtMail?: boolean;
  vorname?: string | null;
}

function fall(f: Fall = {}) {
  const zr = f.zr ?? ZR.vor;
  const anreise = f.eintrag ? { ...DATENSATZ, datum: zr.anreise ?? DATENSATZ.datum, ...(typeof f.eintrag === 'object' ? f.eintrag : {}) } : null;
  const vertrag = f.vertrag ?? 'unterschrieben';
  const stand = gebuchtStand({ heute: HEUTE, einsatz: { id: 'j1', status: zr.status ?? 'gebucht', anreise: zr.anreise, abreise: zr.abreise }, anreise, vertrag });
  const e: SchritteEingabe = {
    stand,
    heute: HEUTE,
    anreise,
    vertrag: { stand: vertrag, datum: f.datum === undefined ? '12.10.2026' : f.datum, pdf: f.pdf ?? true, ansehen: f.ansehen ?? false, knopf: f.knopf ?? true },
    brueckeOk: f.brueckeOk ?? true,
    bekommtMail: f.bekommtMail ?? true,
    folge: f.folge ?? null,
    pflegekraftVorname: f.vorname === undefined ? 'Maria' : f.vorname,
  };
  return { stand, abschnitt: schritte(e) };
}
/** Kurzform „art:nummer:titel" je Schritt. */
const kurz = (f: Fall) => {
  const { abschnitt } = fall(f);
  return abschnitt ? { titel: abschnitt.titel, liste: abschnitt.liste.map((s) => `${s.art}:${s.nummer}:${nb(s.titel)}`) } : null;
};
const schritt = (f: Fall, id: string) => fall(f).abschnitt?.liste.find((s) => s.id === id) ?? null;
const folgeGeplant = (over: Partial<EinsatzZeile> = {}) => job({ id: 'f', status: 'geplant', anreise: '2026-11-29', bewerbungen: 0, ...over });
const folgeGebucht = (over: Partial<EinsatzZeile> = {}) => job({ id: 'f', status: 'gebucht', anreise: '2026-11-29', pflegekraft: 'Anna B.', ...over });
const WARTE = 'Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben. Dann bekommen Sie auch eine E‑Mail.';
const BESPRECHEN = 'Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.';

describe('jahrNoetig (N3.2 Regel 4)', () => {
  it('Jahr nur, wenn ein Datum nicht im laufenden Berliner Jahr liegt', () => {
    expect(jahrNoetig(['2026-10-19', '2026-11-29'], HEUTE)).toBe(false);
    expect(jahrNoetig(['2026-12-31', '2027-02-24'], HEUTE)).toBe(true);
    expect(jahrNoetig(['2025-12-03', '2026-02-04'], HEUTE)).toBe(true);
    expect(jahrNoetig([null, undefined], HEUTE)).toBe(false);
  });
});

describe('einsatzEtikett: nach der Zeit, nicht nach dem Vertrag (N3.3)', () => {
  const et = (zr: Zeitraum, vertrag: VertragStand = 'unterschrieben', eintrag = false) => einsatzEtikett(fall({ zr, vertrag, eintrag }).stand, HEUTE);
  it('vor der Anreise „Gebucht" (warnung), auch bei offenem Vertrag und in Vorbereitung', () => {
    for (const v of ['unterschrieben', 'offen', 'vorbereitung', 'anderer'] as const) expect(et(ZR.vor, v), v).toEqual({ text: 'Gebucht', ton: 'warnung' });
    expect(et(ZR.vor, 'unterschrieben', true)).toEqual({ text: 'Gebucht', ton: 'warnung' });
  });
  it('Anreisetag „Anreise heute geplant", mit und ohne Eintrag', () => {
    expect(et(ZR.at, 'unterschrieben', true)).toEqual({ text: 'Anreise heute geplant', ton: 'warnung' });
    expect(et(ZR.at)).toEqual({ text: 'Anreise heute geplant', ton: 'warnung' });
  });
  it('im Einsatz keins (auch VO während des Einsatzes)', () => {
    expect(et(ZR.l)).toBeNull();
    expect(et(ZR.l, 'offen')).toBeNull();
  });
  it('„Endet bald" ab 14 Tagen, „Endet heute" am Abreisetag, „Beendet" neutral', () => {
    expect(et(ZR.eb)).toEqual({ text: 'Endet bald', ton: 'warnung' });
    expect(et(ZR.ebHeute)).toEqual({ text: 'Endet heute', ton: 'warnung' });
    expect(et(ZR.b)).toEqual({ text: 'Beendet', ton: 'neutral' });
  });
  it('ohne Abreisedatum nie „Endet bald"', () => {
    expect(et({ anreise: '2026-09-05', abreise: null })).toBeNull();
  });
});

describe('einsatzZeitraum: Spalten mit „geplant" (N3.2 Regel 3)', () => {
  const zr = (f: Fall) => einsatzZeitraum(fall(f).stand, HEUTE);
  it('AD: ANREISE Montag 19.10. ohne „geplant", ABREISE Sonntag 29.11. geplant, ohne Jahr', () => {
    expect(zr({ eintrag: true })).toEqual({
      an: { iso: '2026-10-19', wochentag: 'Montag', datum: '19.10.', jahr: null, text: 'Montag, 19.10.' },
      anGeplant: false,
      ab: { iso: '2026-11-29', wochentag: 'Sonntag', datum: '29.11.', jahr: null, text: 'Sonntag, 29.11.' },
      abGeplant: true,
    });
  });
  it('ohne Eintrag vor und am Anreisetag: beide „geplant" (VO, VV, AF, AT ohne)', () => {
    for (const f of [{ vertrag: 'offen' as const }, { vertrag: 'vorbereitung' as const }, {}, { zr: ZR.at }]) {
      expect(zr(f)).toMatchObject({ anGeplant: true, abGeplant: true });
    }
  });
  it('VO mit Eintrag: ANREISE ohne „geplant"', () => {
    expect(zr({ vertrag: 'offen', eintrag: true })).toMatchObject({ anGeplant: false, abGeplant: true });
  });
  it('im Einsatz nur ABREISE geplant; beendet keins', () => {
    expect(zr({ zr: ZR.l })).toMatchObject({ an: { wochentag: 'Donnerstag', datum: '01.10.' }, anGeplant: false, abGeplant: true });
    expect(zr({ zr: ZR.b })).toMatchObject({ an: { wochentag: 'Dienstag', datum: '07.07.' }, ab: { wochentag: 'Samstag', datum: '05.09.' }, anGeplant: false, abGeplant: false });
  });
  it('ohne Abreisedatum nur ANREISE; ohne Anreisedatum keine Spalten', () => {
    expect(zr({ zr: { anreise: '2026-10-01', abreise: null } })?.ab).toBeNull();
    expect(zr({ zr: { anreise: null, abreise: '2026-11-29' } })).toBeNull();
  });
  it('Jahreswechsel: Jahr an beiden Spalten (auch beendet im Vorjahr)', () => {
    expect(zr({ zr: { anreise: '2026-12-31', abreise: '2027-02-24' }, eintrag: true })).toMatchObject({
      an: { wochentag: 'Donnerstag', datum: '31.12.', jahr: '2026' }, ab: { wochentag: 'Mittwoch', datum: '24.02.', jahr: '2027' },
    });
    expect(zr({ zr: { anreise: '2025-12-03', abreise: '2026-02-04', status: 'abgeschlossen' } })).toMatchObject({
      an: { wochentag: 'Mittwoch', datum: '03.12.', jahr: '2025' }, ab: { wochentag: 'Mittwoch', datum: '04.02.', jahr: '2026' }, abGeplant: false,
    });
  });
});

describe('kostenZeile (N3.2 Regel 5)', () => {
  const k = (f: Fall, tagessatz: number | null = 95) => kostenZeile(fall(f).stand, f.vertrag ?? 'unterschrieben', tagessatz);
  it('mit Vertrag dieser Pflegekraft: Tagessatz und Kostenübersicht mit beiden Daten', () => {
    expect(k({ eintrag: true })).toEqual({ tagessatz: 95, uebersicht: { anreise: '19.10.2026', abreise: '29.11.2026' } });
    expect(k({ zr: ZR.b })).toEqual({ tagessatz: 95, uebersicht: { anreise: '07.07.2026', abreise: '05.09.2026' } });
  });
  it('nie bei VO, VV, anderem Vertrag oder ohne Tagessatz', () => {
    for (const v of ['offen', 'vorbereitung', 'anderer'] as const) expect(k({ vertrag: v }), v).toBeNull();
    expect(k({}, null)).toBeNull();
  });
  it('ohne Abreise- oder Anreisedatum: Tagessatz ohne „Kostenübersicht ›"', () => {
    expect(k({ zr: { anreise: '2026-10-01', abreise: null } })).toEqual({ tagessatz: 95, uebersicht: null });
    expect(k({ zr: { anreise: null, abreise: null } })).toEqual({ tagessatz: 95, uebersicht: null });
  });
});

describe('schritte: Zustandstabelle N3.5, Wortlaut Zeichen für Zeichen', () => {
  it('AD (freigegebenes Bild): ✓ Vertrag, ✓ Anreise, 3 Nach der Anreise (nächster), 4 Folgeeinsatz (später)', () => {
    const f: Fall = { eintrag: true, folge: folgeGeplant() };
    expect(kurz(f)).toEqual({
      titel: 'So geht es weiter',
      liste: ['fertig:1:Vertrag unterschrieben', 'fertig:2:Anreise organisiert', 'jetzt:3:Nach der Anreise', 'spaeter:4:Folgeeinsatz ab Sonntag, 29.11.'],
    });
    const [vertrag, anreise, nach, folge] = fall(f).abschnitt!.liste;
    expect(nb(vertrag.text)).toBe('am 12.10.2026');
    expect(vertrag.link).toEqual({ ziel: 'pdf', text: 'Vertrag als PDF', aria: 'Vertrag als PDF ansehen, öffnet in einem neuen Fenster', inline: true });
    expect(anreise.zeilen.map((z) => [z.label, zeilenText(z), z.zusatz])).toEqual([
      ['Ankunft', 'Montag, 19.10., 14–16 Uhr', null],
      ['Verkehrsmittel', 'Minibus', null],
      ['Adresse', 'Musterstraße 1, 12345 Musterstadt', 'Hierhin wird Maria gebracht.'],
    ]);
    expect(anreise.zeilen.find((z) => z.id === 'adresse')?.maske).toBe(true);
    expect(anreise.klein).toBe('Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid.');
    expect(anreise.text).toBeNull();
    expect(nach.text).toBe('Wir melden uns bei Ihnen und fragen nach, ob alles gut klappt.');
    expect(folge.text).toBe('Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.');
    expect(folge.link).toEqual({ ziel: 'einsatz', text: 'Pflegekräfte einladen ›', jobId: 'f' });
  });
  it('VO: 1 Vertrag unterschreiben (nächster) mit Knopf ohne Satz, 2 Anreise wird abgestimmt + #116 + Wartezeile, 3 Nach der Anreise', () => {
    expect(kurz({ vertrag: 'offen' })).toEqual({
      titel: 'So geht es weiter',
      liste: ['jetzt:1:Vertrag unterschreiben', 'spaeter:2:Anreise wird abgestimmt', 'spaeter:3:Nach der Anreise'],
    });
    const v = schritt({ vertrag: 'offen' }, 'vertrag')!;
    expect(v).toMatchObject({ text: null, link: null, knopf: 'Vertrag jetzt abschließen →' });
    const a = schritt({ vertrag: 'offen' }, 'anreise')!;
    expect(nb(a.text)).toBe(BESPRECHEN);
    expect(a.klein).toBe(WARTE);
    expect(a.zeilen).toEqual([]);
  });
  it('VO ohne Nachhol-Weg: kein Knopf (kein toter Knopf)', () => {
    expect(schritt({ vertrag: 'offen', knopf: false }, 'vertrag')?.knopf).toBeNull();
  });
  it('VO mit Anreise-Eintrag: 1 nächster, ✓ Anreise, 3 später', () => {
    expect(kurz({ vertrag: 'offen', eintrag: true })?.liste).toEqual(['jetzt:1:Vertrag unterschreiben', 'fertig:2:Anreise organisiert', 'spaeter:3:Nach der Anreise']);
  });
  it('VV: 1 Vertrag in Vorbereitung + Satz Fassung 35, 2 Anreise wird abgestimmt nur mit Wartezeile, 3 Nach der Anreise', () => {
    expect(kurz({ vertrag: 'vorbereitung' })?.liste).toEqual(['jetzt:1:Vertrag in Vorbereitung', 'spaeter:2:Anreise wird abgestimmt', 'spaeter:3:Nach der Anreise']);
    expect(nb(schritt({ vertrag: 'vorbereitung' }, 'vertrag')?.text)).toBe('Wir bereiten Ihre Vertragsdokumente vor. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.');
    expect(schritt({ vertrag: 'vorbereitung' }, 'anreise')).toMatchObject({ text: null, klein: WARTE });
  });
  it('VV ohne Antwort der Brücke: Anreise-Schritt nur mit Titel', () => {
    expect(schritt({ vertrag: 'vorbereitung', brueckeOk: false }, 'anreise')).toMatchObject({ titel: 'Anreise wird abgestimmt', text: null, klein: null, zeilen: [] });
  });
  it('VV mit Anreise-Eintrag rechnet als AD, Schritt 1 bleibt „Vertrag in Vorbereitung"', () => {
    const f: Fall = { vertrag: 'vorbereitung', eintrag: true };
    expect(fall(f).stand.zustand).toBe('AD');
    expect(kurz(f)?.liste).toEqual(['jetzt:1:Vertrag in Vorbereitung', 'fertig:2:Anreise organisiert', 'spaeter:3:Nach der Anreise']);
  });
  it('AF: ✓ Vertrag, 2 Anreise wird abgestimmt (nächster) + #116 + Wartezeile, 3 später', () => {
    expect(kurz({})?.liste).toEqual(['fertig:1:Vertrag unterschrieben', 'jetzt:2:Anreise wird abgestimmt', 'spaeter:3:Nach der Anreise']);
    expect(schritt({}, 'anreise')).toMatchObject({ klein: WARTE });
    expect(nb(schritt({}, 'anreise')?.text)).toBe(BESPRECHEN);
  });
  it('AF ohne E-Mail: Wartezeile ohne Satz 2; ohne Brücke: keine Wartezeile', () => {
    expect(schritt({ bekommtMail: false }, 'anreise')?.klein).toBe('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.');
    expect(schritt({ brueckeOk: false }, 'anreise')?.klein).toBeNull();
  });
  it('AT mit Eintrag: Ankunft „Donnerstag, 15.10., 14–16 Uhr", 3 Nach der Anreise (nächster)', () => {
    const f: Fall = { zr: ZR.at, eintrag: true };
    expect(fall(f).stand.zustand).toBe('AT');
    expect(kurz(f)?.liste).toEqual(['fertig:1:Vertrag unterschrieben', 'fertig:2:Anreise organisiert', 'jetzt:3:Nach der Anreise']);
    expect(zeilenText(schritt(f, 'anreise')!.zeilen[0])).toBe('Donnerstag, 15.10., 14–16 Uhr');
  });
  it('AT ohne Eintrag: 2 Anreisedaten mit Bitte um Anruf, keine Wartezeile', () => {
    const f: Fall = { zr: ZR.at };
    expect(kurz(f)?.liste).toEqual(['fertig:1:Vertrag unterschrieben', 'jetzt:2:Anreisedaten', 'spaeter:3:Nach der Anreise']);
    expect(schritt(f, 'anreise')).toMatchObject({
      text: 'Uhrzeit und Verkehrsmittel stehen hier nicht. Rufen Sie uns bitte an, falls Ihnen diese Angaben fehlen.',
      klein: null,
      zeilen: [],
    });
  });
  it('L ohne Folgejob: nur ✓ Vertrag, Überschrift „Ihre Unterlagen"', () => {
    expect(kurz({ zr: ZR.l, datum: '25.09.2026' })).toEqual({ titel: 'Ihre Unterlagen', liste: ['fertig:1:Vertrag unterschrieben'] });
    expect(nb(schritt({ zr: ZR.l, datum: '25.09.2026' }, 'vertrag')?.text)).toBe('am 25.09.2026');
  });
  it('L mit Folgeeinsatz: geplant mit Bewerbungen, geplant ohne, gebucht', () => {
    const mitBew: Fall = { zr: ZR.l, folge: folgeGeplant({ bewerbungen: 2 }) };
    expect(kurz(mitBew)).toEqual({ titel: 'So geht es weiter', liste: ['fertig:1:Vertrag unterschrieben', 'jetzt:2:Folgeeinsatz ab Sonntag, 29.11.'] });
    expect(schritt(mitBew, 'folge')).toMatchObject({ text: 'Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.', link: { ziel: 'einsatz', text: '2 Bewerbungen ansehen ›', jobId: 'f' } });
    expect(schritt({ zr: ZR.l, folge: folgeGeplant() }, 'folge')?.link).toMatchObject({ text: 'Pflegekräfte einladen ›' });
    const gebucht = schritt({ zr: ZR.l, folge: folgeGebucht() }, 'folge')!;
    expect(nb(gebucht.text)).toBe('Für den Folgeeinsatz ist Anna B. gebucht.');
    expect(gebucht.link).toMatchObject({ text: 'Folgeeinsatz ansehen ›' });
  });
  it('EB: Folgeeinsatz ab Montag, 26.10.; ohne Namen; mit 1 Bewerbung; ab heute', () => {
    const f26 = { anreise: '2026-10-26' };
    expect(kurz({ zr: ZR.eb, folge: folgeGebucht(f26) })?.liste).toEqual(['fertig:1:Vertrag unterschrieben', 'jetzt:2:Folgeeinsatz ab Montag, 26.10.']);
    expect(schritt({ zr: ZR.eb, folge: folgeGebucht({ ...f26, pflegekraft: null }) }, 'folge')?.text).toBe('Für den Folgeeinsatz ist eine Pflegekraft gebucht.');
    expect(schritt({ zr: ZR.eb, folge: folgeGeplant({ ...f26, bewerbungen: 1 }) }, 'folge')?.link).toMatchObject({ text: '1 Bewerbung ansehen ›' });
    const heute = schritt({ zr: ZR.ebHeute, folge: folgeGebucht({ anreise: HEUTE }) }, 'folge')!;
    expect(heute.titel).toBe('Folgeeinsatz ab heute');
    expect(nb(heute.text)).toBe('Für den Folgeeinsatz ist Anna B. gebucht.');
  });
  it('EB ohne Folgejob: kein Satz zum „Danach", Überschrift „Ihre Unterlagen"', () => {
    expect(kurz({ zr: ZR.eb })).toEqual({ titel: 'Ihre Unterlagen', liste: ['fertig:1:Vertrag unterschrieben'] });
  });
  it('B: nur ✓ Vertrag, „Ihre Unterlagen"; nie ein Folgeeinsatz-Schritt', () => {
    expect(kurz({ zr: ZR.b, datum: '02.07.2026', folge: folgeGebucht({ anreise: '2026-09-05' }) })).toEqual({ titel: 'Ihre Unterlagen', liste: ['fertig:1:Vertrag unterschrieben'] });
  });
  it('B ohne Vertrag: Abschnitt entfällt', () => {
    expect(fall({ zr: ZR.b, vertrag: 'offen' }).abschnitt).toBeNull();
    expect(fall({ zr: ZR.b, vertrag: 'vorbereitung' }).abschnitt).toBeNull();
  });
  it('anderer Vertrag (Entscheidung 5 = B): „Vertrag aus früherer Buchung" + „unterschrieben am …", weitere Schritte wie der Zustand', () => {
    const l: Fall = { zr: ZR.l, vertrag: 'anderer', datum: '28.07.2026' };
    expect(kurz(l)).toEqual({ titel: 'Ihre Unterlagen', liste: ['fertig:1:Vertrag aus früherer Buchung'] });
    expect(nb(schritt(l, 'vertrag')?.text)).toBe('unterschrieben am 28.07.2026');
    expect(schritt(l, 'vertrag')?.link).toMatchObject({ ziel: 'pdf', inline: true });
    const af: Fall = { vertrag: 'anderer', datum: '28.07.2026' };
    expect(kurz(af)?.liste).toEqual(['fertig:1:Vertrag aus früherer Buchung', 'jetzt:2:Anreise wird abgestimmt', 'spaeter:3:Nach der Anreise']);
    expect(nb(schritt(af, 'anreise')?.text)).toBe(BESPRECHEN);
  });
  it('anderer Vertrag, Unterschrift nicht vor dieser Anreise (Randfall): „Vertrag unterschrieben" / „am …"', () => {
    const f: Fall = { zr: ZR.l, vertrag: 'anderer', datum: '02.10.2026' };
    expect(schritt(f, 'vertrag')?.titel).toBe('Vertrag unterschrieben');
    expect(nb(schritt(f, 'vertrag')?.text)).toBe('am 02.10.2026');
  });
  it('VO während des Einsatzes (Randfall): 1 Vertrag unterschreiben, [2 später Folgeeinsatz], kein Anreise- und Nach-Schritt', () => {
    expect(kurz({ zr: ZR.l, vertrag: 'offen' })).toEqual({ titel: 'So geht es weiter', liste: ['jetzt:1:Vertrag unterschreiben'] });
    expect(kurz({ zr: ZR.l, vertrag: 'offen', folge: folgeGeplant() })?.liste).toEqual(['jetzt:1:Vertrag unterschreiben', 'spaeter:2:Folgeeinsatz ab Sonntag, 29.11.']);
  });
  it('ohne Abreisedatum: nie ein Folgeeinsatz (das Fenster braucht die Abreise)', () => {
    const jobs = [job({ id: 'j1', anreise: '2026-10-01', abreise: null }), folgeGeplant()];
    const folge = findeFolgeeinsatz(jobs, 'j1', null);
    expect(folge).toBeNull();
    expect(kurz({ zr: { anreise: '2026-10-01', abreise: null }, folge })).toEqual({ titel: 'Ihre Unterlagen', liste: ['fertig:1:Vertrag unterschrieben'] });
  });
  it('ohne Anreisedatum (Zeit gilt als „vor"): wie AF', () => {
    expect(kurz({ zr: { anreise: null, abreise: null } })?.liste).toEqual(['fertig:1:Vertrag unterschrieben', 'jetzt:2:Anreise wird abgestimmt', 'spaeter:3:Nach der Anreise']);
  });
  it('Jahreswechsel: Ankunft und Folgeeinsatz-Titel mit Jahr, Vertragsdatum unverändert', () => {
    const f: Fall = { zr: { anreise: '2026-12-31', abreise: '2027-02-24' }, eintrag: true, folge: folgeGeplant({ anreise: '2027-02-24' }) };
    expect(zeilenText(schritt(f, 'anreise')!.zeilen[0])).toBe('Donnerstag, 31.12.2026, 14–16 Uhr');
    expect(nb(schritt(f, 'folge')?.titel)).toBe('Folgeeinsatz ab Mittwoch, 24.02.2027');
    expect(nb(schritt(f, 'vertrag')?.text)).toBe('am 12.10.2026');
  });
  it('Verkehrsmittel: Sindbad ohne Zusatz (Entscheidung 8), eigene Anreise „reist selbst an", Ankunft ohne Ende „ab 14 Uhr"', () => {
    const sindbad = schritt({ eintrag: { verkehrsmittel: 'Sindbad' } }, 'anreise')!;
    expect(zeilenText(sindbad.zeilen[1])).toBe('Reisebus (Sindbad)');
    expect(sindbad.zeilen[2].zusatz).toBeNull();
    const eigen = schritt({ eintrag: { verkehrsmittel: 'Own transport', bis: null } }, 'anreise')!;
    expect(zeilenText(eigen.zeilen[0])).toBe('Montag, 19.10., ab 14 Uhr');
    expect(zeilenText(eigen.zeilen[1])).toBe('Eigene Anreise');
    expect(eigen.zeilen[2].zusatz).toBe('Hierhin reist Maria selbst an.');
  });
  it('ohne Vornamen kein Zusatz; ohne Straße keine Adresse-Zeile; lange Namen', () => {
    expect(schritt({ eintrag: true, vorname: null }, 'anreise')!.zeilen[2].zusatz).toBeNull();
    expect(schritt({ eintrag: { strasse: null } }, 'anreise')!.zeilen.map((z) => z.id)).toEqual(['ankunft', 'verkehrsmittel']);
    expect(schritt({ eintrag: true, vorname: 'Małgorzata' }, 'anreise')!.zeilen[2].zusatz).toBe('Hierhin wird Małgorzata gebracht.');
    expect(nb(schritt({ zr: ZR.l, folge: folgeGebucht({ pflegekraft: 'Bogumiła S.' }) }, 'folge')?.text)).toBe('Für den Folgeeinsatz ist Bogumiła S. gebucht.');
  });
  it('Vertrag ohne PDF-Link: Datum + Rückfall „Unterschriebenen Vertrag ansehen →"; ohne Rückfall-Weg kein Link; Datum unlesbar: nur der Link', () => {
    expect(schritt({ pdf: false, ansehen: true }, 'vertrag')?.link).toEqual({ ziel: 'vertragAnsehen', text: 'Unterschriebenen Vertrag ansehen →' });
    expect(schritt({ pdf: false, ansehen: false }, 'vertrag')?.link).toBeNull();
    expect(schritt({ datum: 'quatsch' }, 'vertrag')).toMatchObject({ text: null, link: { ziel: 'pdf', inline: false } });
  });
});

describe('schritte: Regeln über alle Fälle', () => {
  const ZEITEN: Zeitraum[] = [ZR.vor, ZR.at, ZR.l, ZR.eb, ZR.ebHeute, ZR.b, { anreise: null, abreise: null }, { anreise: '2026-10-01', abreise: null }];
  const VERTRAEGE: VertragStand[] = ['unterschrieben', 'offen', 'vorbereitung', 'anderer'];
  const FOLGEN = [null, folgeGeplant(), folgeGeplant({ bewerbungen: 2 }), folgeGebucht()];
  const alle: Fall[] = [];
  for (const zr of ZEITEN) for (const vertrag of VERTRAEGE) for (const folge of FOLGEN) for (const eintrag of [false, true]) {
    for (const brueckeOk of [true, false]) alle.push({ zr, vertrag, folge, eintrag, brueckeOk });
  }
  it('höchstens ein „jetzt"; es ist der erste offene Schritt; Nummern = Stelle in der Liste', () => {
    for (const f of alle) {
      const a = fall(f).abschnitt;
      if (!a) continue;
      const offen = a.liste.filter((s) => s.art !== 'fertig');
      expect(a.liste.filter((s) => s.art === 'jetzt').length, JSON.stringify(f)).toBe(offen.length > 0 ? 1 : 0);
      if (offen.length) expect(offen[0].art).toBe('jetzt');
      a.liste.forEach((s, i) => expect(s.nummer).toBe(i + 1));
      expect(a.titel).toBe(offen.length ? 'So geht es weiter' : 'Ihre Unterlagen');
      expect(a.liste.map((s) => s.id)).toEqual(['vertrag', 'anreise', 'nach', 'folge'].filter((id) => a.liste.some((s) => s.id === id)));
    }
  });
  it('keine Uhrzeit und keine Anreise-Zeilen ohne gültigen Anreise-Eintrag', () => {
    for (const f of alle.filter((x) => !x.eintrag)) {
      for (const s of fall(f).abschnitt?.liste ?? []) {
        expect(s.zeilen, JSON.stringify(f)).toEqual([]);
        for (const t of [s.titel, s.text, s.klein]) expect(nb(t)).not.toMatch(/\d{1,2}(:\d{2})?(–\d{1,2})? Uhr|Minibus|Musterstraße/);
      }
    }
  });
  it('kein Folgeeinsatz-Schritt ohne Folgejob, nie im beendeten Einsatz', () => {
    for (const f of alle) {
      const hatFolge = (fall(f).abschnitt?.liste ?? []).some((s) => s.id === 'folge');
      if (!f.folge || f.zr === ZR.b) expect(hatFolge, JSON.stringify(f)).toBe(false);
    }
  });
  it('Anreise- und Nach-Schritt nur vor oder am Anreisetag', () => {
    for (const f of alle) {
      const { stand, abschnitt } = fall(f);
      const ids = (abschnitt?.liste ?? []).map((s) => s.id);
      if (stand.zeit !== 'vor' && stand.zeit !== 'anreisetag') {
        expect(ids).not.toContain('anreise');
        expect(ids).not.toContain('nach');
      } else {
        expect(ids).toContain('nach');
      }
    }
  });
  it('Wartezeile nur vor dem Anreisetag, ohne Eintrag, mit Antwort der Brücke', () => {
    for (const f of alle) {
      const { stand, abschnitt } = fall(f);
      const a = abschnitt?.liste.find((s) => s.id === 'anreise');
      const warte = !!a?.klein && a.klein.startsWith('Uhrzeit und Verkehrsmittel sehen Sie hier');
      expect(warte, JSON.stringify(f)).toBe(stand.zeit === 'vor' && !f.eintrag && f.brueckeOk !== false);
    }
  });
});

describe('reihenfolge (N3.2 Regel 1): eine Reihenfolge für alle Zustände', () => {
  it('Begrüßung, Karte, [anderer Einsatz], [Schritte], Kontakt, [Siegel]', () => {
    expect(reihenfolge({ anderer: false, schritte: true, ende: true })).toEqual(['gruss', 'einsatz', 'schritte', 'kontakt', 'ende']);
    expect(reihenfolge({ anderer: true, schritte: true, ende: true })).toEqual(['gruss', 'einsatz', 'andererEinsatz', 'schritte', 'kontakt', 'ende']);
    expect(reihenfolge({ anderer: false, schritte: false, ende: false })).toEqual(['gruss', 'einsatz', 'kontakt']);
  });
});
