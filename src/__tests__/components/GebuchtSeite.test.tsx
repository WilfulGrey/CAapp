// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau): Komponententests je Zustand.
// Fantasie-Werte: „Maria Kowalski", „Anna B.", „Musterstraße 1", Notfallnummer +48 123 456 789. „Heute" = 15.10.2026.
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FOLGE_ABSCHNITT_ID, GebuchtSeite, notfallImHilfeBlatt, type GebuchtSeiteDaten, type GebuchtSeiteProps } from '../../components/portal/GebuchtSeite';
import { gebuchtVorschau, vorschauAlteSeite, vorschauZustandAusUrl } from '../../components/portal/gebuchtVorschau';
import { KONTAKT_TEXTE, NOTFALL_GELTUNG, NOTFALL_PLATZHALTER } from '../../components/portal/GebuchtKontakt';
import { anreiseAusEreignissen } from '../../lib/gebuchtStand';
import type { Nurse } from '../../types';

const HEUTE = '2026-10-15';
const FANTASIE_PL = '+48 123 456 789';
const NURSE = {
  caregiverId: 50001, name: 'Maria Kowalski', age: 61, experience: '6 J.', experienceYears: 6, availability: 'sofort verfügbar',
  availableSoon: true, language: { level: 'Gut', bars: 3 }, color: '#8B7355', addedTime: '', isLive: true, gender: 'female',
  image: 'https://example.invalid/maria.jpg', history: { assignments: 7, avgDurationMonths: 2 },
} as unknown as Nurse;
const KOPF = { name: 'Frau Müller', kuerzel: 'AM' };

const nb = (t: string | null | undefined) => (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

function vorschau(q: string, notfall: string | null = FANTASIE_PL, hostname?: string) {
  const search = `?preview=gebucht&${q}${notfall !== null ? `&notfall=${encodeURIComponent(notfall)}` : ''}`;
  return gebuchtVorschau({ search, heute: HEUTE, nurse: NURSE, kopf: KOPF, hostname });
}

function zeige(q: string, over: Partial<GebuchtSeiteProps> = {}, daten: Partial<GebuchtSeiteDaten> = {}, notfall: string | null = FANTASIE_PL) {
  const v = vorschau(q, notfall);
  const props: GebuchtSeiteProps = {
    daten: { ...v.daten, ...daten },
    kontaktTitel: v.kontaktTitel,
    kontaktObenImEinsatz: v.kontaktObenImEinsatz,
    folgeZeile: v.folgeZeile,
    seitenende: v.seitenende,
    sterne: null,
    onPflegekraft: vi.fn(),
    onVertragAbschliessen: vi.fn(),
    onEinsatz: vi.fn(),
    alleEinsaetzeHref: '?preview=jobs',
    ...over,
  };
  const r = render(<GebuchtSeite {...props} />);
  const seite = r.container.querySelector('[data-gebucht-seite]') as HTMLElement;
  const bausteine = [...seite.querySelectorAll('[data-baustein]')].map((e) => e.getAttribute('data-baustein'));
  return { ...r, props, seite, bausteine, text: nb(seite.textContent), h1: nb(seite.querySelector('h1')?.textContent) };
}

const OHNE_ANREISEDATEN = /Ankunft|Verkehrsmittel|Musterstraße|Minibus|Reisebus|Eigene Anreise|\d{1,2}(–\d{1,2})? Uhr|Hierhin/;
/** Text der Einsatz-Karte ohne die Wartezeile (die nennt „Uhrzeit und Verkehrsmittel" als das, was noch fehlt). */
function karteOhneWarten(seite: HTMLElement): string {
  const karte = seite.querySelector('[data-baustein="karte"]')!.cloneNode(true) as HTMLElement;
  karte.querySelector('[data-zeile="warten"]')?.remove();
  for (const z of ['ankunft', 'verkehrsmittel', 'adresse']) expect(karte.querySelector(`[data-zeile="${z}"]`), z).toBeNull();
  return nb(karte.textContent);
}

describe('Vorschau-Schalter', () => {
  it('Zustand aus &zustand=, Kürzel und Standard', () => {
    expect(vorschauZustandAusUrl('?preview=gebucht')).toBe('anreise-da');
    expect(vorschauZustandAusUrl('?zustand=vo')).toBe('vertrag-offen');
    expect(vorschauZustandAusUrl('?zustand=unterschrieben')).toBe('anreise-offen');
    expect(vorschauZustandAusUrl('?zustand=quatsch')).toBe('anreise-da');
    expect(vorschauAlteSeite('?preview=gebucht&seite=alt')).toBe(true);
    expect(vorschauAlteSeite('?preview=gebucht')).toBe(false);
  });
  it('Daten liegen relativ zu heute', () => {
    expect(vorschau('zustand=anreise-da').daten.einsatz.anreise).toBe('2026-10-19');
    expect(vorschau('zustand=anreisetag').daten.einsatz.anreise).toBe(HEUTE);
    expect(vorschau('zustand=beendet').daten.einsatz.abreise).toBe('2026-09-05');
  });
});

describe('je Zustand: Status, Bausteine, Texte', () => {
  it('VO: H1 wie Mail C, live Satz, Knopf oben, keine Kosten, keine Unterlagen, Notfallfeld (Entscheidung 3)', async () => {
    const r = zeige('zustand=vertrag-offen');
    expect(r.seite.getAttribute('data-zustand')).toBe('VO');
    expect(r.h1).toBe('Buchung bestätigt');
    expect(r.text).toContain('Bitte schließen Sie noch Ihren Betreuungsvertrag ab.');
    expect(r.text).not.toMatch(/Letzter Schritt|ist (sie|er) gebucht|eingeplant/);
    expect(r.bausteine.slice(0, 3)).toEqual(['status', 'vertragsknopf', 'karte']);
    expect(r.text).not.toMatch(/Tagessatz|Laut Ihrem Vertrag|Ihre Unterlagen|Dienstleistungsvertrag/);
    expect(r.seite.querySelector('[data-notfall]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vertrag jetzt abschließen →' }));
    expect(r.props.onVertragAbschliessen).toHaveBeenCalledTimes(1);
  });
  it('VO ohne Nachhol-Weg: kein toter Knopf', () => {
    const r = zeige('zustand=vertrag-offen', { onVertragAbschliessen: undefined });
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
    expect(r.bausteine).not.toContain('vertragsknopf');
  });
  it('VV: Satz Fassung 35, keine Kosten, keine Unterlagen', () => {
    const r = zeige('zustand=vorbereitung');
    expect(r.h1).toBe('Anreise am Montag, 19.10.');
    expect(r.text).toContain('Wir bereiten Ihre Vertragsdokumente vor.');
    expect(r.text).not.toMatch(/Tagessatz|Ihre Unterlagen/);
  });
  it('AF: Datum „geplant", Wartezeile, KEINE erfundenen Anreisedaten', () => {
    const r = zeige('zustand=anreise-offen');
    expect(r.h1).toBe('Anreise am Montag, 19.10.');
    expect(r.text).toContain('Ihr Vertrag ist unterschrieben. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.');
    const anreise = nb(r.seite.querySelector('[data-zeile="anreise"]')?.textContent);
    expect(anreise).toContain('Montag, 19.10.2026');
    expect(anreise).toContain('geplant');
    expect(karteOhneWarten(r.seite)).not.toMatch(OHNE_ANREISEDATEN);
    expect(r.text).toContain('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben. Dann bekommen Sie auch eine E\u2011Mail.');
    expect(r.bausteine).not.toContain('unterKarte');
    // Die Wartezeile ist kein dt/dd-Paar: kein <p> (und nichts außer div-Gruppen) direkt im <dl>.
    expect(r.seite.querySelectorAll('dl > :not(div)')).toHaveLength(0);
    for (const gruppe of r.seite.querySelectorAll('dl > div')) {
      expect(gruppe.querySelector(':scope > dt'), 'dt').not.toBeNull();
      expect(gruppe.querySelector(':scope > dd'), 'dd').not.toBeNull();
    }
  });
  it('AF ohne Antwort der Brücke: keine Wartezeile; ohne E-Mail: ohne E-Mail-Sätze', () => {
    expect(zeige('zustand=anreise-offen&bruecke=aus').text).not.toContain('Uhrzeit und Verkehrsmittel');
    const ohneMail = zeige('zustand=anreise-offen&mail=nein').text;
    expect(ohneMail).toContain('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.');
    expect(ohneMail).not.toMatch(/Dann bekommen Sie auch eine E.Mail|Eine Kopie haben Sie auch per E.Mail/);
  });
  it('AD: Ankunft, Verkehrsmittel, Adresse wie in der Mail; Satz unter der Karte; Kosten mit Quelle', () => {
    const r = zeige('zustand=anreise-da');
    expect(r.h1).toBe('Maria K. reist am Montag, 19.10. an');
    expect(r.text).toContain('Wir haben die Anreise Ihrer Pflegekraft organisiert.');
    const karte = nb((r.seite.querySelector('[data-baustein="karte"]') as HTMLElement).textContent);
    expect(karte).toContain('Montag, 19.10.2026, 14–16 Uhr');
    expect(karte).toContain('Minibus');
    expect(karte).toContain('Musterstraße 1');
    expect(karte).toContain('Hierhin wird Maria gebracht.');
    expect(karte).toContain('95 € / Tag');
    expect(karte).toContain('Anreise und Abreise pauschal je 125 €.');
    // T3a: die Quelle steht direkt beim Tagessatz, nicht über der Monatsaufstellung.
    const tagessatz = r.seite.querySelector('[data-zeile="tagessatz"]') as HTMLElement;
    expect(nb(tagessatz.querySelector('dt')?.textContent)).toBe('Tagessatz');
    expect(nb(tagessatz.querySelector('dd > span.block')?.textContent)).toBe('Laut Ihrem Vertrag vom 12.10.2026');
    expect(nb(r.seite.querySelector('[data-zeile="kosten"]')?.textContent)).not.toContain('Laut Ihrem Vertrag');
    expect(r.bausteine).toEqual(['status', 'karte', 'unterKarte', 'kontakt', 'unterlagen', 'ende']);
    expect(r.text).toContain('Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid.');
    expect(r.seite.querySelector('[data-zeile="adresse"]')?.getAttribute('data-clarity-mask')).toBe('true');
  });
  it('AD: eigene Anreise „reist selbst an", Sindbad ohne „Hierhin" (Entscheidung 8)', () => {
    expect(zeige('zustand=anreise-da&verkehr=eigen').text).toContain('Hierhin reist Maria selbst an.');
    const sindbad = zeige('zustand=anreise-da&verkehr=sindbad').text;
    expect(sindbad).toContain('Reisebus (Sindbad)');
    expect(sindbad).not.toContain('Hierhin');
  });
  it('AT mit Daten / ohne Daten (Kontakt vor der Karte, keine Wartezeile)', () => {
    expect(zeige('zustand=anreisetag').h1).toBe('Maria K. reist heute an');
    const ohne = zeige('zustand=anreisetag-offen');
    expect(ohne.h1).toBe('Anreise heute geplant');
    expect(ohne.bausteine.slice(0, 3)).toEqual(['status', 'kontakt', 'karte']);
    expect(ohne.text).not.toContain('Uhrzeit und Verkehrsmittel');
    expect(karteOhneWarten(ohne.seite)).not.toMatch(OHNE_ANREISEDATEN);
  });
  it('L: H1 mit Abreise, Standard Martins Reihenfolge (Karte, dann Kontakt), Anreise ohne „geplant"', () => {
    const r = zeige('zustand=im-einsatz');
    expect(r.h1).toBe('Gebuchter Einsatz bis Sonntag, 29.11.');
    expect(r.bausteine.slice(0, 3)).toEqual(['status', 'karte', 'kontakt']);
    const anreise = r.seite.querySelector('[data-zeile="anreise"]') as HTMLElement;
    expect(nb(anreise.textContent)).not.toContain('geplant');
    expect(nb((r.seite.querySelector('[data-zeile="abreise"]') as HTMLElement).textContent)).toContain('geplant');
    r.unmount();
    // Alternative per &kontaktoben=ja (L und EB); &kontaktoben=nein = Standard.
    for (const [q, erwartet] of [
      ['zustand=im-einsatz&kontaktoben=ja', ['status', 'kontakt', 'karte']],
      ['zustand=endet-bald&kontaktoben=ja', ['status', 'kontakt', 'karte']],
      ['zustand=im-einsatz&kontaktoben=nein', ['status', 'karte', 'kontakt']],
      ['zustand=endet-bald', ['status', 'karte', 'kontakt']],
    ] as const) {
      const v = zeige(q);
      expect(v.bausteine.slice(0, 3), q).toEqual(erwartet);
      v.unmount();
    }
  });
  it('EB: Folgekraft gebucht, Folgeeinsatz-Abschnitt mit Name', () => {
    const r = zeige('zustand=endet-bald');
    expect(r.h1).toBe('Anna B. übernimmt ab Montag, 26.10.');
    expect(r.text).toContain('Anna B. ist Ihre nächste Pflegekraft. Der Einsatz von Maria K. endet am Montag, 26.10.');
    expect(r.text).not.toContain('26.10..');
    const folge = nb((r.seite.querySelector('[data-baustein="folge"]') as HTMLElement).textContent);
    expect(folge).toContain('Folgeeinsatz');
    expect(folge).toContain('Gebucht');
    expect(folge).toContain('26.10.2026 – 07.12.2026');
    expect(folge).toContain('Anna B.');
    expect(r.bausteine).toContain('alleEinsaetze');
  });
  it('EB, Folgeeinsatz geplant ohne Bewerbung: Suchlauf-Zeile und „Pflegekräfte einladen ›"', () => {
    const r = zeige('zustand=endet-bald&folge=geplant');
    expect(r.h1).toBe('Einsatz endet am Montag, 26.10.');
    expect(r.text).toContain('Für die Zeit danach suchen wir eine Pflegekraft für Sie.');
    expect(r.text).toContain('Suchlauf läuft — noch keine Bewerbungen');
    expect(screen.getByRole('button', { name: 'Pflegekräfte einladen\u00a0›' })).toBeTruthy();
    expect(r.bausteine).not.toContain('folgeHinweis');
  });
  it('EB ohne Folgeeinsatz: kein Satz zum Danach (Befund 6)', () => {
    const r = zeige('zustand=endet-bald&folge=keiner');
    expect(r.text).not.toMatch(/Für die Zeit danach|nächste Pflegekraft|Wechsel/);
    expect(r.bausteine).not.toContain('folge');
  });
  it('L mit Bewerbungen beim Folgeeinsatz: Hinweiszeile T5 unter dem Status, Abschnitt erst unter dem Kontakt', async () => {
    const r = zeige('zustand=folgeeinsatz');
    expect(r.bausteine).toEqual(['status', 'folgeHinweis', 'karte', 'kontakt', 'folge', 'unterlagen', 'alleEinsaetze', 'ende']);
    expect(r.seite.getAttribute('data-folge-hinweis')).toBe('1');
    const zeile = screen.getByRole('button', { name: 'Folgeeinsatz: 2\u00a0Bewerbungen ansehen\u00a0›' });
    expect(zeile.className).toContain('min-h-[44px]');
    expect(r.text).toContain('2 Bewerbungen');
    await userEvent.click(zeile);
    expect(r.props.onEinsatz).toHaveBeenCalledWith('vorschau-einsatz-2');
    await userEvent.click(screen.getByRole('button', { name: 'Bewerbungen ansehen' }));
    expect(r.props.onEinsatz).toHaveBeenCalledTimes(2);
  });
  it('EB mit Bewerbungen und Kontakt oben: Hinweiszeile, der Abschnitt bleibt unter dem Kontakt', () => {
    const r = zeige('zustand=endet-bald&folge=bewerbungen&kontaktoben=ja');
    expect(r.bausteine.slice(0, 5)).toEqual(['status', 'folgeHinweis', 'kontakt', 'karte', 'folge']);
    expect(r.text).toContain('Folgeeinsatz: 2 Bewerbungen ansehen ›');
  });
  it('mit einsatzHref sind die Zeilen echte Links ?job=…, auch die Hinweiszeile (Ziel wie „Bewerbungen ansehen")', () => {
    zeige('zustand=folgeeinsatz', { einsatzHref: (id) => `?token=t&job=${id}` });
    expect(screen.getByRole('link', { name: 'Bewerbungen ansehen' }).getAttribute('href')).toBe('?token=t&job=vorschau-einsatz-2');
    expect(screen.getByRole('link', { name: 'Folgeeinsatz: 2\u00a0Bewerbungen ansehen\u00a0›' }).getAttribute('href')).toBe('?token=t&job=vorschau-einsatz-2');
  });
  it('&folgezeile=sprung: Rückfall-Wortlaut, Anker zum Abschnitt, Fenster scrollt nach dem Tipp, Fokus auf die Überschrift', async () => {
    const scroll = vi.fn();
    const vorher = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      const r = zeige('zustand=folgeeinsatz&folgezeile=sprung');
      const zeile = screen.getByRole('link', { name: '2\u00a0Bewerbungen für Ihren Folgeeinsatz\u00a0›' });
      expect(zeile.getAttribute('href')).toBe(`#${FOLGE_ABSCHNITT_ID}`);
      expect(zeile.className).toContain('min-h-[44px]');
      const abschnitt = r.seite.querySelector(`#${FOLGE_ABSCHNITT_ID}`) as HTMLElement;
      expect(abschnitt.getAttribute('data-baustein')).toBe('folge');
      // Abstand oben für die klebende Kopfleiste (48 px, mit „Alle meine Einsätze" ca. 76 px).
      expect(abschnitt.className).toContain('scroll-mt-24');
      await userEvent.click(zeile);
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.contexts[0]).toBe(abschnitt);
      expect(document.activeElement?.id).toBe('folgeeinsatz');
      expect(r.props.onEinsatz).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = vorher;
    }
  });
  it('Regel: Folgeeinsatz nie über dem Kontakt — alle Zustände, Folge-Arten und Reihenfolgen', () => {
    for (const z of ['vertrag-offen', 'vorbereitung', 'anreise-offen', 'anreise-da', 'anreisetag', 'anreisetag-offen', 'im-einsatz', 'endet-bald', 'folgeeinsatz']) {
      for (const f of ['geplant', 'bewerbungen', 'gebucht']) {
        for (const oben of ['ja', 'nein']) {
          const r = zeige(`zustand=${z}&folge=${f}&kontaktoben=${oben}`);
          if (r.bausteine.includes('folge')) expect(r.bausteine.indexOf('folge'), `${z} ${f} ${oben}`).toBeGreaterThan(r.bausteine.indexOf('kontakt'));
          r.unmount();
        }
      }
    }
  });
  it('B: live Wortlaut, Reihenfolge Karte → aktueller Einsatz → Unterlagen → Kontakt, ohne Notfallfeld', () => {
    const r = zeige('zustand=beendet');
    expect(r.h1).toBe('Einsatz beendet');
    expect(r.text).toContain('Der Einsatz vom 07.07.2026 bis 05.09.2026 ist abgeschlossen. Ihre Unterlagen bleiben jederzeit zugänglich.');
    expect(r.bausteine).toEqual(['status', 'karte', 'andererEinsatz', 'unterlagen', 'kontakt', 'alleEinsaetze', 'ende']);
    expect(r.text).toContain('Ihr aktueller Einsatz');
    expect(r.text).toContain('Laufend');
    expect(r.seite.querySelector('[data-notfall]')).toBeNull();
    expect(r.text).not.toContain('geplant');
  });
});

describe('Notfallnummer nur mit gültigem Wert', () => {
  it('gültige Nummer: getöntes Feld, Martins Phrase wörtlich, Anruf-Link 44 px, 112-Zeile, Clarity-Maske', () => {
    const r = zeige('zustand=im-einsatz');
    const feld = r.seite.querySelector('[data-notfall]') as HTMLElement;
    expect(feld.getAttribute('data-clarity-mask')).toBe('true');
    expect(nb(feld.textContent)).toContain(NOTFALL_GELTUNG);
    expect(nb(feld.textContent)).toContain(KONTAKT_TEXTE.notfallZeile);
    const link = within(feld).getByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE_PL}` });
    expect(link.getAttribute('href')).toBe('tel:+48123456789');
    expect(link.className).toContain('min-h-[44px]');
    expect(nb(feld.textContent)).toContain('Bei medizinischen Notfällen: 112');
    expect(nb(feld.textContent)).not.toMatch(/WhatsApp|Uhr/);
  });
  for (const [fall, wert] of [['keine', ''], ['ungültig', 'Notruf 0123'], ['andere Ländervorwahl', '+43 1 234567']] as const) {
    it(`${fall} Nummer: kein Notfallfeld, keine 112-Zeile, Erreichbarkeit bleibt`, () => {
      const r = zeige('zustand=im-einsatz', {}, { notfallTelefon: wert || null });
      expect(r.seite.querySelector('[data-notfall]')).toBeNull();
      expect(r.text).not.toMatch(/Notfallnummer|112/);
      expect(r.text).toContain('089 200 000 830');
    });
  }
  it('Vorschau ohne &notfall=: sichtbarer Platzhalter ohne Link', () => {
    const r = zeige('zustand=im-einsatz', {}, {}, null);
    const feld = r.seite.querySelector('[data-notfall]') as HTMLElement;
    expect(nb(feld.textContent)).toContain(NOTFALL_PLATZHALTER);
    expect(within(feld).queryByRole('link')).toBeNull();
  });
  it('Sicherheit: &notfall= gilt nur auf localhost/127.0.0.1/::1, sonst Platzhalter ohne Anruf-Link', () => {
    for (const host of ['kundenportal.primundus.de', 'caapp-staging.onrender.com', 'localhost.example.com', '']) {
      expect(vorschau('zustand=im-einsatz', FANTASIE_PL, host).daten.notfallTelefon, host).toBe(NOTFALL_PLATZHALTER);
    }
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
      expect(vorschau('zustand=im-einsatz', FANTASIE_PL, host).daten.notfallTelefon, host).toBe(FANTASIE_PL);
    }
    const v = vorschau('zustand=im-einsatz', FANTASIE_PL, 'kundenportal.primundus.de');
    const r = zeige('zustand=im-einsatz', {}, { notfallTelefon: v.daten.notfallTelefon });
    const feld = r.seite.querySelector('[data-notfall]') as HTMLElement;
    expect(nb(feld.textContent)).toContain(NOTFALL_PLATZHALTER);
    expect(within(feld).queryByRole('link')).toBeNull();
    expect(r.seite.querySelector('a[href^="tel:+48"]')).toBeNull();
  });
});

describe('nur Belegtes', () => {
  it('Anreise-Notiz der Agentur (hinweis) erscheint nie', () => {
    const anreise = anreiseAusEreignissen([{
      event_type: 'caregiver_arrival_scheduled', created_at: '2026-10-12T10:00:00Z',
      metadata: { mamamia_job_offer_id: 1, anreise_datum: '2026-10-19', anreise_von: '14:00', anreise_bis: '16:00', verkehrsmittel: 'Minibus', einsatzort_strasse: 'Musterstraße 1', einsatzort_plz_ort: '12345 Musterstadt', hinweis: 'Osobus Disponent Uhrzeitänderung' },
    }], 1, 'gebucht');
    const r = zeige('zustand=anreise-da', {}, { anreise });
    expect(r.text).toContain('Minibus');
    expect(r.text).not.toMatch(/Osobus|Disponent|Uhrzeitänderung/);
  });
  it('ohne belegten Tagessatz kein Kostenteil; Vertrag einer früheren Buchung (T4) ohne Kosten, mit Vertragsbeginn', () => {
    const ohne = zeige('zustand=im-einsatz', {}, { tagessatz: null });
    expect(ohne.text).not.toMatch(/Tagessatz|pauschal|Alle Kosten/);
    ohne.unmount();
    const anderer = zeige('zustand=im-einsatz&vertrag=anderer');
    expect(anderer.text).not.toMatch(/Tagessatz|Laut Ihrem Vertrag/);
    // Anreise 01.10.2026, Unterschrift 80 Tage vorher, Vertragsbeginn 4 Tage nach der Unterschrift.
    expect(nb(anderer.seite.querySelector('[data-zeile="dokument"]')?.textContent)).toBe('Dienstleistungsvertrag zur früheren Buchung');
    expect(nb(anderer.seite.querySelector('[data-zeile="vertragsdatum"]')?.textContent)).toBe('unterschrieben am 13.07.2026, Vertragsbeginn 17.07.2026');
    expect(anderer.text).toContain('Vertrag ansehen (PDF)');
    anderer.unmount();
    // Unterschrift nicht belegt vor dieser Anreise ⇒ nur „Dienstleistungsvertrag" (T4a), Datumszeile bleibt mit Vertragsbeginn.
    const v = vorschau('zustand=im-einsatz&vertrag=anderer');
    const nachher = zeige('zustand=im-einsatz&vertrag=anderer', {}, { vertrag: { ...v.daten.vertrag, datum: '2026-10-02' } });
    expect(nb(nachher.seite.querySelector('[data-zeile="dokument"]')?.textContent)).toBe('Dienstleistungsvertrag');
    expect(nb(nachher.seite.querySelector('[data-zeile="vertragsdatum"]')?.textContent)).toBe('unterschrieben am 02.10.2026, Vertragsbeginn 17.07.2026');
    nachher.unmount();
    // Vertrag zu dieser Pflegekraft: ohne Vertragsbeginn (live Wortlaut der Unterlagen).
    const eigen = zeige('zustand=im-einsatz');
    expect(nb(eigen.seite.querySelector('[data-zeile="dokument"]')?.textContent)).toBe('Dienstleistungsvertrag');
    expect(nb(eigen.seite.querySelector('[data-zeile="vertragsdatum"]')?.textContent)).toBe('unterschrieben am 28.09.2026');
  });
  it('ohne Foto Initialen, ohne Namen „Ihre Pflegekraft"', () => {
    const ohneFoto = zeige('zustand=anreise-da&foto=nein');
    expect(ohneFoto.seite.querySelector('[data-zeile="pflegekraft"] img')).toBeNull();
    expect(nb(ohneFoto.seite.querySelector('[data-zeile="pflegekraft"]')?.textContent)).toContain('MK');
    const ohneName = zeige('zustand=vertrag-offen&name=nein');
    expect(ohneName.h1).toBe('Buchung bestätigt');
    expect(ohneName.text).toContain('Bitte schließen Sie noch Ihren Betreuungsvertrag ab.');
    expect(ohneName.text).not.toMatch(/Maria/);
    ohneName.unmount();
    // T2: EB mit Folgekraft, ohne Namen der jetzigen Pflegekraft
    expect(zeige('zustand=endet-bald&name=nein').text).toContain('Anna B. ist Ihre nächste Pflegekraft. Der Einsatz Ihrer jetzigen Pflegekraft endet am Montag, 26.10.');
  });
  it('&name=lang: lange Namen für die H1-Messung', () => {
    const ad = zeige('zustand=anreise-da&name=lang');
    expect(ad.h1).toBe('Małgorzata W. reist am Montag, 19.10. an');
    ad.unmount();
    const eb = zeige('zustand=endet-bald&name=lang');
    expect(eb.h1).toBe('Bogumiła S. übernimmt ab Montag, 26.10.');
    expect(eb.text).toContain('Der Einsatz von Małgorzata W. endet am Montag, 26.10.');
  });
  it('unsichtbare H1 und Name der Karte sind verschieden', () => {
    const ohneDatum = { einsatz: { id: 'vorschau-einsatz-1', status: 'gebucht', anreise: null, abreise: null } };
    const r = zeige('zustand=anreise-offen', {}, ohneDatum);
    expect(r.seite.querySelector('h1')?.className).toContain('sr-only');
    expect(r.h1).toBe('Ihr Einsatz');
    expect(screen.getByRole('region', { name: 'Ihr Einsatz mit Maria K.' })).toBeTruthy();
    r.unmount();
    zeige('zustand=anreise-offen&name=nein', {}, ohneDatum);
    expect(screen.getByRole('region', { name: 'Ihr Einsatz mit Ihrer Pflegekraft' })).toBeTruthy();
  });
  it('Vertragsdatum als Berliner Tag: accepted_at nach 22 Uhr UTC ⇒ nächster Tag; Snapshot „dd.mm.yyyy" bleibt', () => {
    const v = vorschau('zustand=anreise-da');
    const spaet = zeige('zustand=anreise-da', {}, { vertrag: { ...v.daten.vertrag, datum: '2026-10-12T22:30:00Z' } });
    expect(nb(spaet.seite.querySelector('[data-zeile="tagessatz"]')?.textContent)).toContain('Laut Ihrem Vertrag vom 13.10.2026');
    expect(nb(spaet.seite.querySelector('[data-zeile="vertragsdatum"]')?.textContent)).toBe('unterschrieben am 13.10.2026');
    spaet.unmount();
    const snapshot = zeige('zustand=anreise-da', {}, { vertrag: { ...v.daten.vertrag, datum: '11.10.2026' } });
    expect(nb(snapshot.seite.querySelector('[data-zeile="vertragsdatum"]')?.textContent)).toBe('unterschrieben am 11.10.2026');
  });
  it('Pflegekraft-Zeile öffnet das Profil (Screenreader wie PflegekraftZeile)', async () => {
    const r = zeige('zustand=anreise-da');
    await userEvent.click(screen.getByRole('button', { name: 'Profil von Maria K. ansehen' }));
    expect(r.props.onPflegekraft).toHaveBeenCalledTimes(1);
  });
  it('„Alle Kosten im Überblick" klappt die Monatszeilen mit den Daten der Karte auf', async () => {
    const r = zeige('zustand=anreise-da');
    expect(r.seite.querySelector('[data-baustein="monatszeilen"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Alle Kosten im Überblick' }));
    const zeilen = nb(r.seite.querySelector('[data-baustein="monatszeilen"]')?.textContent);
    // T3b: erste Zeile nennt die Grundlage der Rechnung
    expect(zeilen.startsWith('Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.')).toBe(true);
    expect(zeilen).toContain('Oktober 2026');
    expect(zeilen).toContain('November 2026');
    expect(zeilen).toContain('An- und Abreisetage werden mit vollem Tagessatz berechnet.');
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toBeTruthy();
  });
  it('Unterlagen: PDF-Link in neuem Fenster mit Screenreader-Text; Kopie-Satz mit geschütztem Bindestrich', () => {
    const r = zeige('zustand=anreise-da');
    expect(r.text).toContain('Eine Kopie haben Sie auch per E\u2011Mail erhalten.');
    const link = screen.getByRole('link', { name: 'Vertrag als PDF ansehen, öffnet in einem neuen Fenster' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(nb(link.textContent)).toBe('Vertrag ansehen (PDF)');
  });
  it('Kontakt-Überschrift: A Martins Wortlaut (Standard), B per Schalter', () => {
    expect(zeige('zustand=anreise-da').text).toContain('Ihr Kontakt zur Agentur');
    expect(zeige('zustand=anreise-da&kontakt=b').text).toContain('Ihr Kontakt zu Primundus');
  });
  it('kein gestrichener Text auf der Seite (Spezifikation 6.12)', () => {
    for (const z of ['vertrag-offen', 'vorbereitung', 'anreise-offen', 'anreise-da', 'anreisetag', 'anreisetag-offen', 'im-einsatz', 'endet-bald', 'beendet', 'folgeeinsatz']) {
      const { text, unmount } = zeige(`zustand=${z}`);
      expect(text, z).not.toMatch(/Vielen Dank —|Als Nächstes|\bFolgt\b|Details folgen in Kürze|Zur Hälfte|Noch Fragen\?|Hinweis der Agentur|ist angekommen|sofort verfügbar/);
      unmount();
    }
  });
});

describe('Quelltext-Wächter', () => {
  const seite = readFileSync('src/pages/CustomerPortalPage.tsx', 'utf8');
  it('neue Seite nur im Vorschau-Zweig ?preview=gebucht; echte Kunden behalten BookedScreen', () => {
    expect(seite).toMatch(/const GEBUCHT_NEU_VORSCHAU = VORSCHAU_SUCHE !== null && !vorschauAlteSeite\(VORSCHAU_SUCHE\);/);
    expect(seite).toMatch(/const VORSCHAU_SUCHE = IS_PREVIEW_GEBUCHT && typeof window !== 'undefined' \? window\.location\.search : null;/);
    expect(seite.match(/gebuchtVorschau\(/g) ?? []).toHaveLength(1);
    expect(seite).toMatch(/const gebuchtNeu = GEBUCHT_NEU_VORSCHAU && acceptedApp && VORSCHAU_SUCHE !== null\s*\?\s*gebuchtVorschau\(/);
    expect(seite.match(/<GebuchtSeite\b/g) ?? []).toHaveLength(1);
    expect(seite).toMatch(/\{acceptedApp && gebuchtNeu \? \(\s*<div className="bg-pm-paper">\s*<GebuchtSeite/);
    expect(seite.match(/<BookedScreen\b/g) ?? []).toHaveLength(1);
  });
  it('die Vorschau-Daten (gebuchtVorschau.ts) importiert nur die Portal-Seite', () => {
    const quelle = readFileSync('src/components/portal/GebuchtSeite.tsx', 'utf8');
    expect(quelle).not.toMatch(/gebuchtVorschau/);
  });
  it('Hilfe-Blatt: Notfallfeld am berechneten Zustand, nicht am Vorschau-Etikett', () => {
    expect(seite).toMatch(/unterKopf=\{gebuchtNeu && notfallImHilfeBlatt\(gebuchtNeu\.daten\)/);
    expect(seite).not.toMatch(/gebuchtNeu\.zustand !== 'beendet'/);
  });
});

describe('Notfallfeld im Hilfe-Blatt hängt am berechneten Zustand', () => {
  it('beendet ⇒ kein Feld; im Einsatz und vor der Anreise ⇒ Feld; auch ohne Vorschau-Etikett', () => {
    expect(notfallImHilfeBlatt(vorschau('zustand=beendet').daten)).toBe(false);
    expect(notfallImHilfeBlatt(vorschau('zustand=im-einsatz').daten)).toBe(true);
    expect(notfallImHilfeBlatt(vorschau('zustand=vertrag-offen').daten)).toBe(true);
    // Abreise gestern, Status noch „gebucht" (veralteter Spiegel): nach Datum beendet ⇒ kein Feld.
    const d = vorschau('zustand=im-einsatz').daten;
    expect(notfallImHilfeBlatt({ ...d, einsatz: { ...d.einsatz, abreise: '2026-10-14' } })).toBe(false);
    expect(notfallImHilfeBlatt({ ...d, einsatz: { ...d.einsatz, abreise: HEUTE } })).toBe(true);
  });
});

describe('Bausteine außerhalb der Seite (nur mit den neuen Props anders)', () => {
  it('Profil-Blatt: ohneVerfuegbarkeit blendet „ab sofort" aus, ohne Prop bleibt es (Spezifikation 6.11)', async () => {
    const { CustomerNurseModal } = await import('../../components/portal/CustomerNurseModal');
    const n = { ...NURSE, availability: 'ab sofort', image: undefined } as Nurse;
    const mit = render(<CustomerNurseModal nurse={n} onClose={() => {}} nurProfil />);
    expect(screen.getByText('ab sofort')).toBeTruthy();
    mit.unmount();
    render(<CustomerNurseModal nurse={n} onClose={() => {}} nurProfil ohneVerfuegbarkeit />);
    expect(screen.queryByText('ab sofort')).toBeNull();
  });
  it('Hilfe-Blatt: ohne Props unverändert, mit `unterKopf` Notfallfeld UNTER der Kopfzeile mit dem X, „täglich 8–20 Uhr"', async () => {
    const { ContactPopup } = await import('../../components/portal/ContactPopup');
    const { NotfallFeld } = await import('../../components/portal/GebuchtKontakt');
    const alt = render(<ContactPopup onClose={() => {}} />);
    expect(screen.getByText('Mo–So, 8–20 Uhr')).toBeTruthy();
    expect(screen.queryByText(/Notfallnummer/)).toBeNull();
    alt.unmount();
    const zu = vi.fn();
    const neu = render(<ContactPopup onClose={zu} unterKopf={<NotfallFeld nummer={FANTASIE_PL} />} zeiten="täglich 8–20 Uhr" />);
    expect(screen.getByText('täglich 8–20 Uhr')).toBeTruthy();
    const anruf = screen.getByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE_PL}` });
    expect(screen.getByText('Bekannt aus')).toBeTruthy();
    // Kopfzeile „Ihre Beraterin" mit dem X steht oben, das Notfallfeld darunter.
    const kopf = screen.getByText('Ihre Beraterin').parentElement as HTMLElement;
    const x = kopf.querySelector('button') as HTMLButtonElement;
    expect(x).not.toBeNull();
    const feld = anruf.closest('[data-notfall]') as HTMLElement;
    expect(kopf.compareDocumentPosition(feld) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kopf.contains(feld)).toBe(false);
    await userEvent.click(x);
    expect(zu).toHaveBeenCalledTimes(1);
    neu.unmount();
    // ungültige Nummer ⇒ das Feld rendert nichts
    const leer = render(<NotfallFeld nummer="Notruf 0123" />);
    expect(leer.container.innerHTML).toBe('');
  });
  it('Fußnote der Monatsaufstellung: derselbe Wortlaut wie im Dialog „Angebot prüfen"', async () => {
    const { aufstellungHinweis, MonatsAufstellung } = await import('../../components/portal/MonatsAufstellung');
    expect(aufstellungHinweis({ hasSummer: true, relevantHolidayNames: ['Heiligabend', 'Silvester'] })).toBe(
      'An- und Abreisetage werden mit vollem Tagessatz berechnet. Im Juli und August fällt ein Sommerzuschlag von 6,67 €/Tag (200 €/Monat) an. An Heiligabend, Silvester wird der doppelte Tagessatz berechnet.',
    );
    const r = render(<MonatsAufstellung offer={{ monatlicheKosten: 2850, anreisedatum: '01.07.2026', abreisedatum: '31.08.2026', anreisekosten: 125, abreisekosten: 125, reisetage: '', feiertagszuschlag: 95, kuendigungsfrist: '', submittedAt: '' }} />);
    expect(nb(r.container.textContent)).toContain('An- und Abreisetage werden mit vollem Tagessatz berechnet. Im Juli und August fällt ein Sommerzuschlag von 6,67 €/Tag (200 €/Monat) an.');
  });
});
