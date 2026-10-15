// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau): Komponententests je Zustand.
// Fantasie-Werte: „Maria Kowalski", „Anna B.", „Musterstraße 1", Notfallnummer +48 123 456 789. „Heute" = 15.10.2026.
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GebuchtSeite, type GebuchtSeiteDaten, type GebuchtSeiteProps } from '../../components/portal/GebuchtSeite';
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

function vorschau(q: string, notfall: string | null = FANTASIE_PL) {
  const search = `?preview=gebucht&${q}${notfall !== null ? `&notfall=${encodeURIComponent(notfall)}` : ''}`;
  return gebuchtVorschau({ search, heute: HEUTE, nurse: NURSE, kopf: KOPF });
}

function zeige(q: string, over: Partial<GebuchtSeiteProps> = {}, daten: Partial<GebuchtSeiteDaten> = {}, notfall: string | null = FANTASIE_PL) {
  const v = vorschau(q, notfall);
  const props: GebuchtSeiteProps = {
    daten: { ...v.daten, ...daten },
    kontaktTitel: v.kontaktTitel,
    kontaktObenImEinsatz: v.kontaktObenImEinsatz,
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
  it('VO: H1, Satz, Knopf oben, keine Kosten, keine Unterlagen, Notfallfeld (Entscheidung 3)', async () => {
    const r = zeige('zustand=vertrag-offen');
    expect(r.seite.getAttribute('data-zustand')).toBe('VO');
    expect(r.h1).toBe('Letzter Schritt: Ihr Vertrag');
    expect(r.text).toContain('Wir haben Maria K. für Sie eingeplant. Mit Ihrer Unterschrift ist sie gebucht.');
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
    expect(r.text).toContain('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben. Dann bekommen Sie auch eine E-Mail.');
    expect(r.bausteine).not.toContain('unterKarte');
  });
  it('AF ohne Antwort der Brücke: keine Wartezeile; ohne E-Mail: ohne E-Mail-Sätze', () => {
    expect(zeige('zustand=anreise-offen&bruecke=aus').text).not.toContain('Uhrzeit und Verkehrsmittel');
    const ohneMail = zeige('zustand=anreise-offen&mail=nein').text;
    expect(ohneMail).toContain('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.');
    expect(ohneMail).not.toMatch(/Dann bekommen Sie auch eine E-Mail|Eine Kopie haben Sie auch per E-Mail/);
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
    expect(karte).toContain('Laut Ihrem Vertrag vom 12.10.2026');
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
  it('L: H1 mit Abreise, Kontakt oben, Anreise ohne „geplant"', () => {
    const r = zeige('zustand=im-einsatz');
    expect(r.h1).toBe('Gebuchter Einsatz bis Sonntag, 29.11.');
    expect(r.bausteine.slice(0, 3)).toEqual(['status', 'kontakt', 'karte']);
    const anreise = r.seite.querySelector('[data-zeile="anreise"]') as HTMLElement;
    expect(nb(anreise.textContent)).not.toContain('geplant');
    expect(nb((r.seite.querySelector('[data-zeile="abreise"]') as HTMLElement).textContent)).toContain('geplant');
    expect(zeige('zustand=im-einsatz&kontaktoben=nein').bausteine.slice(0, 3)).toEqual(['status', 'karte', 'kontakt']);
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
    expect(screen.getByRole('button', { name: 'Pflegekräfte einladen ›' })).toBeTruthy();
  });
  it('EB ohne Folgeeinsatz: kein Satz zum Danach (Befund 6)', () => {
    const r = zeige('zustand=endet-bald&folge=keiner');
    expect(r.text).not.toMatch(/Für die Zeit danach|nächste Pflegekraft|Wechsel/);
    expect(r.bausteine).not.toContain('folge');
  });
  it('L mit Bewerbungen beim Folgeeinsatz: Abschnitt direkt unter dem Status, Hauptknopf', async () => {
    const r = zeige('zustand=folgeeinsatz');
    expect(r.bausteine.slice(0, 2)).toEqual(['status', 'folge']);
    expect(r.text).toContain('2 Bewerbungen');
    await userEvent.click(screen.getByRole('button', { name: 'Bewerbungen ansehen' }));
    expect(r.props.onEinsatz).toHaveBeenCalledWith('vorschau-einsatz-2');
  });
  it('mit einsatzHref sind die Zeilen echte Links ?job=…', () => {
    zeige('zustand=folgeeinsatz', { einsatzHref: (id) => `?token=t&job=${id}` });
    expect(screen.getByRole('link', { name: 'Bewerbungen ansehen' }).getAttribute('href')).toBe('?token=t&job=vorschau-einsatz-2');
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
  it('ohne belegten Tagessatz kein Kostenteil; Vertrag einer anderen Pflegekraft ohne Kosten, Unterlagen bleiben', () => {
    expect(zeige('zustand=im-einsatz', {}, { tagessatz: null }).text).not.toMatch(/Tagessatz|pauschal|Alle Kosten/);
    const anderer = zeige('zustand=im-einsatz&vertrag=anderer');
    expect(anderer.text).not.toMatch(/Tagessatz|Laut Ihrem Vertrag/);
    expect(anderer.text).toContain('Dienstleistungsvertrag');
    expect(anderer.text).toContain('unterschrieben am');
  });
  it('ohne Foto Initialen, ohne Namen „Ihre Pflegekraft"', () => {
    const ohneFoto = zeige('zustand=anreise-da&foto=nein');
    expect(ohneFoto.seite.querySelector('[data-zeile="pflegekraft"] img')).toBeNull();
    expect(nb(ohneFoto.seite.querySelector('[data-zeile="pflegekraft"]')?.textContent)).toContain('MK');
    const ohneName = zeige('zustand=vertrag-offen&name=nein');
    expect(ohneName.text).toContain('Wir haben Ihre Pflegekraft für Sie eingeplant.');
    expect(ohneName.text).not.toMatch(/Maria/);
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
    expect(zeilen).toContain('Oktober 2026');
    expect(zeilen).toContain('November 2026');
    expect(zeilen).toContain('An- und Abreisetage werden mit vollem Tagessatz berechnet.');
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toBeTruthy();
  });
  it('Unterlagen: PDF-Link in neuem Fenster mit Screenreader-Text', () => {
    zeige('zustand=anreise-da');
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
  it('Hilfe-Blatt: ohne Props unverändert, mit `oben` und `zeiten` Notfallfeld oben und „täglich 8–20 Uhr"', async () => {
    const { ContactPopup } = await import('../../components/portal/ContactPopup');
    const { NotfallFeld } = await import('../../components/portal/GebuchtKontakt');
    const alt = render(<ContactPopup onClose={() => {}} />);
    expect(screen.getByText('Mo–So, 8–20 Uhr')).toBeTruthy();
    expect(screen.queryByText(/Notfallnummer/)).toBeNull();
    alt.unmount();
    const neu = render(<ContactPopup onClose={() => {}} oben={<NotfallFeld nummer={FANTASIE_PL} />} zeiten="täglich 8–20 Uhr" />);
    expect(screen.getByText('täglich 8–20 Uhr')).toBeTruthy();
    expect(screen.getByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE_PL}` })).toBeTruthy();
    expect(screen.getByText('Bekannt aus')).toBeTruthy();
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
