// Gebucht-Seite neu (PROTOTYP 15.10.2026, nur Vorschau): Komponententests je Zustand nach texte_final.md, Nachtrag 3.
// Freigegebener Bildschirm (AD, Martin 15.10. abends: „finde ich super") Zeichen für Zeichen, alle übrigen Zustände nach der
// Zustandstabelle N3.5. Fantasie-Werte: „Maria Kowalski", „Anna B.", „Musterstraße 1", Nummer +48 123 456 789. „Heute" =
// Donnerstag, 15.10.2026.
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GebuchtSeite, notfallImHilfeBlatt, type GebuchtSeiteDaten, type GebuchtSeiteProps } from '../../components/portal/GebuchtSeite';
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

const nb = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Text eines Elements, wie er auf dem Bildschirm steht: Leerzeichen an den Grenzen von Block-Elementen und von Kindern eines
 * Flex- oder Grid-Behälters (jsdom kennt kein innerText). Inline-Teile wie das kleine Jahr hinter dem Datum bleiben dran.
 */
const BLOCK_TAG = /^(DIV|P|H1|H2|H3|LI|OL|UL|DL|DT|DD|SECTION)$/;
const BLOCK_KLASSE = /(^|\s)block(\s|$)/;
const BEHAELTER = /(^|\s)(flex|inline-flex|grid)(\s|$)/;
function lesen(el: Node | null | undefined): string {
  if (!el) return '';
  const teile: string[] = [];
  const geh = (n: Node) => {
    if (n.nodeType === 3) { teile.push(n.textContent ?? ''); return; }
    if (n.nodeType !== 1) return;
    const e = n as Element;
    const eltern = e.parentElement?.getAttribute('class') ?? '';
    const block = BLOCK_TAG.test(e.tagName) || BLOCK_KLASSE.test(e.getAttribute('class') ?? '') || BEHAELTER.test(eltern);
    if (block) teile.push(' ');
    e.childNodes.forEach(geh);
    if (block) teile.push(' ');
  };
  geh(el);
  return nb(teile.join(''));
}

function vorschau(q: string, notfall: string | null = FANTASIE_PL, hostname = 'localhost') {
  const search = `?preview=gebucht&${q}${notfall !== null ? `&notfall=${encodeURIComponent(notfall)}` : ''}`;
  return gebuchtVorschau({ search, heute: HEUTE, nurse: NURSE, kopf: KOPF, hostname });
}

function zeige(q: string, over: Partial<GebuchtSeiteProps> = {}, daten: Partial<GebuchtSeiteDaten> = {}, notfall: string | null = FANTASIE_PL) {
  const v = vorschau(q, notfall);
  const props: GebuchtSeiteProps = {
    daten: { ...v.daten, ...daten },
    kontaktTitel: v.kontaktTitel,
    seitenende: v.seitenende,
    sterne: null,
    onPflegekraft: vi.fn(),
    onVertragAbschliessen: vi.fn(),
    onEinsatz: vi.fn(),
    ...over,
  };
  const r = render(<GebuchtSeite {...props} />);
  const seite = r.container.querySelector('[data-gebucht-seite]') as HTMLElement;
  const q1 = (sel: string) => seite.querySelector(sel) as HTMLElement | null;
  const txt = (sel: string) => lesen(q1(sel));
  const bausteine = [...seite.querySelectorAll('[data-baustein]')].map((e) => e.getAttribute('data-baustein'));
  const schritte = [...seite.querySelectorAll('[data-schritt]')].map((li) => `${li.getAttribute('data-art')}:${lesen(li.querySelector('h3'))}`);
  return { ...r, props, seite, q1, txt, bausteine, schritte, text: lesen(seite) };
}

/** Was die Karte und die Schritte in einem Zustand zeigen (für die Zustandstabelle). */
function uebersicht(q: string) {
  const r = zeige(q);
  const etikett = r.q1('[data-teil="etikett"]');
  const aus = {
    zustand: r.seite.getAttribute('data-zustand'),
    etikett: etikett ? `${lesen(etikett)} (${etikett.getAttribute('data-ton')})` : null,
    an: r.txt('[data-spalte="anreise"]') || null,
    ab: r.txt('[data-spalte="abreise"]') || null,
    kosten: r.txt('[data-teil="kosten"]') || null,
    titel: r.txt('#schritte-titel') || null,
    schritte: r.schritte,
    notfall: !!r.q1('[data-notfall]'),
  };
  r.unmount();
  return aus;
}

const MIT_KOSTEN = 'Tagessatz 95 € / Tag Kostenübersicht';
const N3 = 'So geht es weiter';
const UNTERLAGEN = 'Ihre Unterlagen';
const V_FERTIG = 'fertig:Vertrag unterschrieben';

describe('Vorschau-Schalter', () => {
  it('Zustand aus &zustand=, Kürzel und Standard', () => {
    expect(vorschauZustandAusUrl('?preview=gebucht')).toBe('anreise-da');
    expect(vorschauZustandAusUrl('?zustand=vo')).toBe('vertrag-offen');
    expect(vorschauZustandAusUrl('?zustand=unterschrieben')).toBe('anreise-offen');
    expect(vorschauZustandAusUrl('?zustand=endet-heute')).toBe('endet-heute');
    expect(vorschauZustandAusUrl('?zustand=quatsch')).toBe('anreise-da');
    expect(vorschauAlteSeite('?preview=gebucht&seite=alt')).toBe(true);
    expect(vorschauAlteSeite('?preview=gebucht')).toBe(false);
  });
  it('Daten liegen relativ zu heute; AD hat wie im Bild einen geplanten Folgeeinsatz ohne Bewerbung', () => {
    const ad = vorschau('zustand=anreise-da').daten;
    expect(ad.einsatz).toMatchObject({ anreise: '2026-10-19', abreise: '2026-11-29' });
    expect(ad.jobs[1]).toMatchObject({ status: 'geplant', anreise: '2026-11-29', bewerbungen: 0 });
    expect(vorschau('zustand=anreisetag').daten.einsatz.anreise).toBe(HEUTE);
    expect(vorschau('zustand=beendet').daten.einsatz.abreise).toBe('2026-09-05');
    expect(vorschau('zustand=endet-heute').daten.einsatz.abreise).toBe(HEUTE);
  });
  it('&eintrag=, &ohne=, &jahr=wechsel', () => {
    expect(vorschau('zustand=vertrag-offen&eintrag=ja').daten.anreise?.datum).toBe('2026-10-19');
    expect(vorschau('zustand=anreise-da&eintrag=nein').daten.anreise).toBeNull();
    expect(vorschau('zustand=im-einsatz&ohne=abreise').daten.einsatz.abreise).toBeNull();
    expect(vorschau('zustand=anreise-offen&ohne=anreise').daten.einsatz.anreise).toBeNull();
    expect(vorschau('zustand=anreise-da&jahr=wechsel').daten.einsatz).toMatchObject({ anreise: '2026-12-31', abreise: '2027-02-24' });
    expect(vorschau('zustand=beendet&jahr=wechsel').daten.einsatz).toMatchObject({ anreise: '2025-12-03', abreise: '2026-02-04' });
  });
});

describe('freigegebener Bildschirm (AD): Aufbau und Wortlaut Zeichen für Zeichen', () => {
  it('Reihenfolge Begrüßung, Karte, Schritte, Kontakt, Siegel; eine H1 „Ihr Einsatz", keine Satz-Überschrift', () => {
    const r = zeige('zustand=anreise-da');
    expect(r.bausteine).toEqual(['gruss', 'einsatz', 'schritte', 'kontakt', 'ende']);
    expect(r.seite.querySelectorAll('h1')).toHaveLength(1);
    expect(nb(r.seite.querySelector('h1')?.textContent)).toBe('Ihr Einsatz');
    expect(r.txt('[data-baustein="gruss"]')).toBe('AM Guten Tag, Frau Müller Ihr persönlicher Bereich');
    expect(r.text).not.toMatch(/reist am|reist heute|Gebuchter Einsatz bis|Buchung bestätigt|Einsatz endet|übernimmt/);
  });
  it('Karte: Kopfleiste mit Etikett, Pflegekraft, ANREISE → ABREISE, Tagessatz mit Kostenübersicht', () => {
    const r = zeige('zustand=anreise-da');
    expect(r.txt('[data-teil="kopfleiste"]')).toBe('Ihr Einsatz Gebucht');
    const etikett = r.q1('[data-teil="etikett"]')!;
    expect(etikett.getAttribute('data-ton')).toBe('warnung');
    expect(etikett.querySelector('span')?.className).toContain('bg-pm-amber-tint');
    expect(r.txt('[data-teil="pflegekraft"]')).toBe('Maria K. Ihre Pflegekraft');
    expect(r.q1('[data-teil="pflegekraft"] img')?.getAttribute('src')).toBe(NURSE.image);
    expect(r.txt('[data-spalte="anreise"]')).toBe('Anreise Montag 19.10.');
    expect(r.txt('[data-spalte="abreise"]')).toBe('Abreise Sonntag 29.11. geplant');
    expect(r.q1('[data-spalte="anreise"] dt')?.className).toContain('uppercase');
    expect(r.txt('[data-teil="kosten"]')).toBe(MIT_KOSTEN);
  });
  it('Schritte: Überschrift, Kreise (✓, ✓, 3, 4), Linie, Wortlaut je Schritt', () => {
    const r = zeige('zustand=anreise-da');
    expect(r.txt('#schritte-titel')).toBe(N3);
    expect(r.schritte).toEqual([V_FERTIG, 'fertig:Anreise organisiert', 'jetzt:Nach der Anreise', 'spaeter:Folgeeinsatz ab Sonntag, 29.11.']);
    const li = [...r.seite.querySelectorAll('[data-schritt]')] as HTMLElement[];
    expect(li.map((x) => nb(x.querySelector('[data-teil="kreis"]')?.textContent))).toEqual(['', '', '3', '4']);
    expect(li.map((x) => x.querySelector('[data-teil="kreis"] svg') !== null)).toEqual([true, true, false, false]);
    expect(li[2].querySelector('[data-teil="kreis"]')?.className).toContain('ring-pm-taupe');
    expect(li[3].querySelector('[data-teil="kreis"]')?.className).toContain('ring-pm-line');
    expect(li.map((x) => x.querySelector('[data-teil="linie"]')?.className.includes('bg-pm-green') ?? null)).toEqual([true, true, false, null]);
    expect(nb(li[0].querySelector('[data-zeile="text"]')?.textContent)).toBe('am 12.10.2026 · Vertrag als PDF');
    expect(li[0].querySelector('[data-zeile="text"]')?.textContent).toContain('2026 · Vertrag');
    expect([...li[1].querySelectorAll('[data-zeile]')].map((z) => lesen(z))).toEqual([
      'Ankunft Montag, 19.10., 14–16 Uhr',
      'Verkehrsmittel Minibus',
      'Adresse Musterstraße 1, 12345 Musterstadt Hierhin wird Maria gebracht.',
      'Stimmt eine Angabe nicht, sagen Sie uns bitte Bescheid.',
    ]);
    expect(li[1].querySelector('[data-zeile="adresse"]')?.getAttribute('data-clarity-mask')).toBe('true');
    expect(nb(li[2].querySelector('[data-zeile="text"]')?.textContent)).toBe('Wir melden uns bei Ihnen und fragen nach, ob alles gut klappt.');
    expect(nb(li[3].querySelector('[data-zeile="text"]')?.textContent)).toBe('Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.');
    expect(screen.getByRole('button', { name: 'Pflegekräfte einladen ›' })).toBeTruthy();
  });
  it('Kontakt wie GebuchtKontakt (Marta, Tagesnummer, Notfallfeld unter der Tagesnummer) und Siegel', () => {
    const r = zeige('zustand=anreise-da');
    const kontakt = r.txt('[data-baustein="kontakt"]');
    expect(kontakt.startsWith('Ihr Kontakt zur Agentur')).toBe(true);
    expect(kontakt).toContain('Marta Kapcio');
    expect(kontakt).toContain('oder ein Kollege');
    expect(kontakt).toContain('Telefon und WhatsApp, täglich 8–20 Uhr:');
    expect(kontakt.indexOf('089 200 000 830')).toBeLessThan(kontakt.indexOf('Primundus-Notfallnummer'));
    expect(kontakt).toContain(`Primundus-Notfallnummer, ${NOTFALL_GELTUNG}:`);
    expect(r.txt('[data-baustein="ende"]')).toContain('6× Testsieger');
  });
  it('„Vertrag als PDF" öffnet das PDF in einem neuen Fenster, mit Screenreader-Text und erweiterter Tippfläche', () => {
    zeige('zustand=anreise-da');
    const link = screen.getByRole('link', { name: 'Vertrag als PDF ansehen, öffnet in einem neuen Fenster' });
    expect(link.getAttribute('href')).toBe('/primundus-mustervertrag.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(nb(link.textContent)).toBe('Vertrag als PDF');
    expect(link.className).toMatch(/before:-inset-y-3/);
  });
  it('„Kostenübersicht" klappt Grundlage und Monatszeilen auf; Beschriftung bleibt, Pfeil nach unten', async () => {
    const r = zeige('zustand=anreise-da');
    expect(r.q1('[data-baustein="monatszeilen"]')).toBeNull();
    const knopf = screen.getByRole('button', { name: 'Kostenübersicht' });
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(knopf);
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    expect(nb(knopf.textContent)).toBe('Kostenübersicht');
    expect(knopf.querySelector('svg')?.getAttribute('class')).toContain('rotate-90');
    const zeilen = r.txt('[data-baustein="monatszeilen"]');
    expect(zeilen.startsWith('Grundlage: Ihr Tagessatz und die angegebenen Daten für Anreise und Abreise.')).toBe(true);
    expect(zeilen).toContain('Oktober 2026');
    expect(zeilen).toContain('November 2026');
    expect(zeilen).toContain('An- und Abreisetage werden mit vollem Tagessatz berechnet.');
    await userEvent.click(knopf);
    expect(r.q1('[data-baustein="monatszeilen"]')).toBeNull();
  });
  it('Pflegekraft-Zeile öffnet das Profil; „Pflegekräfte einladen ›" führt zum Folgeeinsatz', async () => {
    const r = zeige('zustand=anreise-da');
    await userEvent.click(screen.getByRole('button', { name: 'Profil von Maria K. ansehen' }));
    expect(r.props.onPflegekraft).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Pflegekräfte einladen ›' }));
    expect(r.props.onEinsatz).toHaveBeenCalledWith('vorschau-einsatz-2');
  });
  it('mit einsatzHref sind die Links echte Links ?job=…', () => {
    zeige('zustand=anreise-da', { einsatzHref: (id) => `?token=t&job=${id}` });
    expect(screen.getByRole('link', { name: 'Pflegekräfte einladen ›' }).getAttribute('href')).toBe('?token=t&job=vorschau-einsatz-2');
  });
});

describe('alle Zustände nach der Zustandstabelle N3.5', () => {
  const FALL: Array<[string, ReturnType<typeof uebersicht>]> = [
    ['zustand=anreise-da', { zustand: 'AD', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'fertig:Anreise organisiert', 'jetzt:Nach der Anreise', 'spaeter:Folgeeinsatz ab Sonntag, 29.11.'], notfall: true }],
    ['zustand=vertrag-offen', { zustand: 'VO', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10. geplant', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: N3,
      schritte: ['jetzt:Vertrag unterschreiben', 'spaeter:Anreise wird abgestimmt', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=vertrag-offen&eintrag=ja', { zustand: 'VO', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: N3,
      schritte: ['jetzt:Vertrag unterschreiben', 'fertig:Anreise organisiert', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=vorbereitung', { zustand: 'VV', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10. geplant', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: N3,
      schritte: ['jetzt:Vertrag in Vorbereitung', 'spaeter:Anreise wird abgestimmt', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=vorbereitung&eintrag=ja', { zustand: 'AD', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: N3,
      schritte: ['jetzt:Vertrag in Vorbereitung', 'fertig:Anreise organisiert', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=anreise-offen', { zustand: 'AF', etikett: 'Gebucht (warnung)', an: 'Anreise Montag 19.10. geplant', ab: 'Abreise Sonntag 29.11. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'jetzt:Anreise wird abgestimmt', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=anreisetag', { zustand: 'AT', etikett: 'Anreise heute geplant (warnung)', an: 'Anreise Donnerstag 15.10.', ab: 'Abreise Mittwoch 25.11. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'fertig:Anreise organisiert', 'jetzt:Nach der Anreise'], notfall: true }],
    ['zustand=anreisetag-offen', { zustand: 'AT', etikett: 'Anreise heute geplant (warnung)', an: 'Anreise Donnerstag 15.10. geplant', ab: 'Abreise Mittwoch 25.11. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'jetzt:Anreisedaten', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=im-einsatz', { zustand: 'L', etikett: null, an: 'Anreise Donnerstag 01.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: MIT_KOSTEN, titel: UNTERLAGEN,
      schritte: [V_FERTIG], notfall: true }],
    ['zustand=folgeeinsatz', { zustand: 'L', etikett: null, an: 'Anreise Donnerstag 01.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'jetzt:Folgeeinsatz ab Sonntag, 29.11.'], notfall: true }],
    ['zustand=endet-bald', { zustand: 'EB', etikett: 'Endet bald (warnung)', an: 'Anreise Samstag 05.09.', ab: 'Abreise Montag 26.10. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'jetzt:Folgeeinsatz ab Montag, 26.10.'], notfall: true }],
    ['zustand=endet-heute', { zustand: 'EB', etikett: 'Endet heute (warnung)', an: 'Anreise Samstag 05.09.', ab: 'Abreise Donnerstag 15.10. geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'jetzt:Folgeeinsatz ab heute'], notfall: true }],
    ['zustand=endet-bald&folge=keiner', { zustand: 'EB', etikett: 'Endet bald (warnung)', an: 'Anreise Samstag 05.09.', ab: 'Abreise Montag 26.10. geplant', kosten: MIT_KOSTEN, titel: UNTERLAGEN,
      schritte: [V_FERTIG], notfall: true }],
    ['zustand=beendet&folge=keiner', { zustand: 'B', etikett: 'Beendet (neutral)', an: 'Anreise Dienstag 07.07.', ab: 'Abreise Samstag 05.09.', kosten: MIT_KOSTEN, titel: UNTERLAGEN,
      schritte: [V_FERTIG], notfall: false }],
    ['zustand=im-einsatz&vertrag=anderer', { zustand: 'L', etikett: null, an: 'Anreise Donnerstag 01.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: UNTERLAGEN,
      schritte: ['fertig:Vertrag aus früherer Buchung'], notfall: true }],
    ['zustand=im-einsatz&vertrag=offen', { zustand: 'VO', etikett: null, an: 'Anreise Donnerstag 01.10.', ab: 'Abreise Sonntag 29.11. geplant', kosten: null, titel: N3,
      schritte: ['jetzt:Vertrag unterschreiben'], notfall: true }],
    ['zustand=im-einsatz&ohne=abreise', { zustand: 'L', etikett: null, an: 'Anreise Donnerstag 01.10.', ab: null, kosten: 'Tagessatz 95 € / Tag', titel: UNTERLAGEN,
      schritte: [V_FERTIG], notfall: true }],
    ['zustand=anreise-offen&ohne=anreise', { zustand: 'AF', etikett: 'Gebucht (warnung)', an: null, ab: null, kosten: 'Tagessatz 95 € / Tag', titel: N3,
      schritte: [V_FERTIG, 'jetzt:Anreise wird abgestimmt', 'spaeter:Nach der Anreise'], notfall: true }],
    ['zustand=anreise-da&jahr=wechsel', { zustand: 'AD', etikett: 'Gebucht (warnung)', an: 'Anreise Donnerstag 31.12.2026', ab: 'Abreise Mittwoch 24.02.2027 geplant', kosten: MIT_KOSTEN, titel: N3,
      schritte: [V_FERTIG, 'fertig:Anreise organisiert', 'jetzt:Nach der Anreise', 'spaeter:Folgeeinsatz ab Mittwoch, 24.02.2027'], notfall: true }],
    ['zustand=beendet&jahr=wechsel&folge=keiner', { zustand: 'B', etikett: 'Beendet (neutral)', an: 'Anreise Mittwoch 03.12.2025', ab: 'Abreise Mittwoch 04.02.2026', kosten: MIT_KOSTEN, titel: UNTERLAGEN,
      schritte: [V_FERTIG], notfall: false }],
  ];
  for (const [q, erwartet] of FALL) {
    it(q, () => expect(uebersicht(q)).toEqual(erwartet));
  }
  it('Kopfleiste: ohne Etikett nur „Ihr Einsatz"; Etikett „Beendet" im neutralen Ton', () => {
    const l = zeige('zustand=im-einsatz');
    expect(l.txt('[data-teil="kopfleiste"]')).toBe('Ihr Einsatz');
    l.unmount();
    const b = zeige('zustand=beendet&folge=keiner');
    expect(b.q1('[data-teil="etikett"] span')?.className).toContain('ring-pm-chip');
  });
});

describe('Inhalt der Schritte je Zustand', () => {
  it('VO: Knopf „Vertrag jetzt abschließen →" ohne Satz, Anreise-Schritt mit #116 und Wartezeile', async () => {
    const r = zeige('zustand=vertrag-offen');
    const vertrag = r.q1('[data-schritt="vertrag"]')!;
    expect(vertrag.querySelector('[data-zeile="text"]')).toBeNull();
    const knopf = within(vertrag).getByRole('button', { name: 'Vertrag jetzt abschließen →' });
    expect(knopf.closest('[data-zeile="knopf"]')?.className).toContain('[&>button]:min-h-[48px]');
    await userEvent.click(knopf);
    expect(r.props.onVertragAbschliessen).toHaveBeenCalledTimes(1);
    expect(r.txt('[data-schritt="anreise"] [data-zeile="text"]')).toBe('Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen, um die Anreise zu besprechen.');
    expect(r.txt('[data-schritt="anreise"] [data-zeile="klein"]')).toBe('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben. Dann bekommen Sie auch eine E‑Mail.');
  });
  it('VO ohne Nachhol-Weg: kein toter Knopf', () => {
    zeige('zustand=vertrag-offen', { onVertragAbschliessen: undefined });
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
  });
  it('VV: Satz Fassung 35 im Vertrag-Schritt, im Anreise-Schritt nur die Wartezeile; ohne Brücke nur der Titel', () => {
    const r = zeige('zustand=vorbereitung');
    expect(r.txt('[data-schritt="vertrag"] [data-zeile="text"]')).toBe('Wir bereiten Ihre Vertragsdokumente vor. Marta Kapcio oder ein Kollege meldet sich in Kürze persönlich bei Ihnen.');
    expect(r.q1('[data-schritt="anreise"] [data-zeile="text"]')).toBeNull();
    expect(r.q1('[data-schritt="anreise"] [data-zeile="klein"]')).not.toBeNull();
    r.unmount();
    const ohne = zeige('zustand=vorbereitung&bruecke=aus');
    expect(lesen(ohne.q1('[data-schritt="anreise"] > div'))).toBe('Anreise wird abgestimmt');
  });
  it('AF: Wartezeile ohne E-Mail-Satz bei &mail=nein, keine bei &bruecke=aus', () => {
    const ohneMail = zeige('zustand=anreise-offen&mail=nein');
    expect(ohneMail.txt('[data-schritt="anreise"] [data-zeile="klein"]')).toBe('Uhrzeit und Verkehrsmittel sehen Sie hier, sobald wir die Anreise organisiert haben.');
    ohneMail.unmount();
    expect(zeige('zustand=anreise-offen&bruecke=aus').q1('[data-zeile="klein"]')).toBeNull();
  });
  it('AT ohne Eintrag: Schritt „Anreisedaten" mit Bitte um Anruf, keine Wartezeile', () => {
    const r = zeige('zustand=anreisetag-offen');
    expect(r.txt('[data-schritt="anreise"] [data-zeile="text"]')).toBe('Uhrzeit und Verkehrsmittel stehen hier nicht. Rufen Sie uns bitte an, falls Ihnen diese Angaben fehlen.');
    expect(r.q1('[data-zeile="klein"]')).toBeNull();
  });
  it('AT mit Eintrag: Ankunft „Donnerstag, 15.10., 14–16 Uhr"', () => {
    expect(zeige('zustand=anreisetag').txt('[data-zeile="ankunft"]')).toBe('Ankunft Donnerstag, 15.10., 14–16 Uhr');
  });
  it('Folgeeinsatz: geplant mit Bewerbungen, gebucht mit und ohne Namen, ab heute', () => {
    const bew = zeige('zustand=folgeeinsatz');
    expect(bew.txt('[data-schritt="folge"] [data-zeile="text"]')).toBe('Für den Folgeeinsatz suchen wir eine Pflegekraft für Sie.');
    expect(screen.getByRole('button', { name: '2 Bewerbungen ansehen ›' }).className).toMatch(/min-h-\[40px\].*before:-inset-y-0\.5/);
    bew.unmount();
    const eins = zeige('zustand=endet-bald&folge=bewerbungen');
    expect(screen.getByRole('button', { name: '2 Bewerbungen ansehen ›' })).toBeTruthy();
    eins.unmount();
    const gebucht = zeige('zustand=endet-bald');
    expect(gebucht.txt('[data-schritt="folge"] [data-zeile="text"]')).toBe('Für den Folgeeinsatz ist Anna B. gebucht.');
    expect(screen.getByRole('button', { name: 'Folgeeinsatz ansehen ›' })).toBeTruthy();
    gebucht.unmount();
    const geplant = zeige('zustand=endet-bald&folge=geplant');
    expect(screen.getByRole('button', { name: 'Pflegekräfte einladen ›' })).toBeTruthy();
    geplant.unmount();
    const lang = zeige('zustand=endet-bald&name=lang');
    expect(lang.txt('[data-schritt="folge"] [data-zeile="text"]')).toBe('Für den Folgeeinsatz ist Bogumiła S. gebucht.');
  });
  it('anderer Vertrag: „Vertrag aus früherer Buchung" + „unterschrieben am …", „·" hängt am Datum', () => {
    const r = zeige('zustand=im-einsatz&vertrag=anderer');
    // Anreise 01.10.2026, Unterschrift 80 Tage vorher.
    expect(r.txt('[data-schritt="vertrag"] [data-zeile="text"]')).toBe('unterschrieben am 13.07.2026 · Vertrag als PDF');
    expect(r.q1('[data-schritt="vertrag"] [data-zeile="text"]')?.textContent).toContain('13.07.2026 ·');
  });
  it('Vertrag ohne PDF-Link: Rückfall „Unterschriebenen Vertrag ansehen →" nur mit Weg', async () => {
    const v = vorschau('zustand=im-einsatz');
    const ansehen = vi.fn();
    const r = zeige('zustand=im-einsatz', { onVertragAnsehen: ansehen }, { vertrag: { ...v.daten.vertrag, pdfHref: null } });
    expect(r.txt('[data-schritt="vertrag"] [data-zeile="text"]')).toBe('am 28.09.2026');
    await userEvent.click(screen.getByRole('button', { name: 'Unterschriebenen Vertrag ansehen →' }));
    expect(ansehen).toHaveBeenCalledTimes(1);
    r.unmount();
    zeige('zustand=im-einsatz', {}, { vertrag: { ...v.daten.vertrag, pdfHref: null } });
    expect(screen.queryByRole('button', { name: /Vertrag ansehen/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Vertrag als PDF/ })).toBeNull();
  });
  it('Vertragsdatum als Berliner Tag: accepted_at nach 22 Uhr UTC ⇒ nächster Tag; Snapshot „dd.mm.yyyy" bleibt', () => {
    const v = vorschau('zustand=anreise-da');
    const spaet = zeige('zustand=anreise-da', {}, { vertrag: { ...v.daten.vertrag, datum: '2026-10-12T22:30:00Z' } });
    expect(spaet.txt('[data-schritt="vertrag"] [data-zeile="text"]')).toBe('am 13.10.2026 · Vertrag als PDF');
    spaet.unmount();
    expect(zeige('zustand=anreise-da', {}, { vertrag: { ...v.daten.vertrag, datum: '11.10.2026' } }).txt('[data-schritt="vertrag"] [data-zeile="text"]')).toBe('am 11.10.2026 · Vertrag als PDF');
  });
  it('Verkehrsmittel: eigene Anreise „Hierhin reist Maria selbst an.", Sindbad ohne „Hierhin" (Entscheidung 8)', () => {
    expect(zeige('zustand=anreise-da&verkehr=eigen').txt('[data-zeile="adresse"]')).toBe('Adresse Musterstraße 1, 12345 Musterstadt Hierhin reist Maria selbst an.');
    const sindbad = zeige('zustand=anreise-da&verkehr=sindbad');
    expect(sindbad.txt('[data-zeile="verkehrsmittel"]')).toBe('Verkehrsmittel Reisebus (Sindbad)');
    expect(sindbad.text).not.toContain('Hierhin');
  });
  it('ohne Namen nur „Ihre Pflegekraft" und kein „Hierhin …"; ohne Foto Initialen; lange Namen brechen nicht im Namen', () => {
    const ohneName = zeige('zustand=anreise-da&name=nein&foto=nein');
    expect(ohneName.txt('[data-teil="pflegekraft"]')).toBe('Ihre Pflegekraft');
    expect(ohneName.text).not.toMatch(/Maria|Hierhin/);
    ohneName.unmount();
    const ohneFoto = zeige('zustand=anreise-da&foto=nein');
    expect(ohneFoto.q1('[data-teil="pflegekraft"] img')).toBeNull();
    expect(ohneFoto.txt('[data-teil="pflegekraft"]')).toContain('MK');
    ohneFoto.unmount();
    const lang = zeige('zustand=anreise-da&name=lang');
    expect(lang.q1('[data-teil="pflegekraft"]')?.textContent).toContain('Małgorzata W.');
    expect(lang.txt('[data-zeile="adresse"]')).toContain('Hierhin wird Małgorzata gebracht.');
  });
  it('B mit neuerem Einsatz: zwischen Karte und „Ihre Unterlagen" „Ihr aktueller Einsatz" als tippbare Einsatz-Zeile', async () => {
    const r = zeige('zustand=beendet');
    expect(r.bausteine).toEqual(['gruss', 'einsatz', 'andererEinsatz', 'schritte', 'kontakt', 'ende']);
    expect(r.txt('[data-baustein="andererEinsatz"]')).toBe('Ihr aktueller Einsatz Laufend 05.09.2026 – 04.11.2026 Anna B.');
    expect(r.txt('#schritte-titel')).toBe('Ihre Unterlagen');
    await userEvent.click(within(r.q1('[data-baustein="andererEinsatz"]')!).getByRole('button'));
    expect(r.props.onEinsatz).toHaveBeenCalledWith('vorschau-einsatz-2');
    r.unmount();
    const naechster = zeige('zustand=beendet&folge=geplant');
    expect(naechster.txt('[data-baustein="andererEinsatz"]')).toBe('Ihr nächster Einsatz Geplant 25.10.2026 – 06.12.2026 Suchlauf läuft — noch keine Bewerbungen');
  });
  it('Kontakt-Überschrift: A Martins Wortlaut (Standard), B per Schalter', () => {
    expect(zeige('zustand=anreise-da').txt('#kontakt-gebucht')).toBe('Ihr Kontakt zur Agentur');
    expect(zeige('zustand=anreise-da&kontakt=b').txt('#kontakt-gebucht')).toBe('Ihr Kontakt zu Primundus');
  });
});

/** Alle Vorschau-Zustände samt Varianten. */
const ALLE = [
  'zustand=anreise-da', 'zustand=vertrag-offen', 'zustand=vertrag-offen&eintrag=ja', 'zustand=vorbereitung', 'zustand=vorbereitung&eintrag=ja',
  'zustand=anreise-offen', 'zustand=anreisetag', 'zustand=anreisetag-offen', 'zustand=im-einsatz', 'zustand=folgeeinsatz',
  'zustand=im-einsatz&folge=geplant', 'zustand=im-einsatz&folge=gebucht', 'zustand=endet-bald', 'zustand=endet-heute',
  'zustand=endet-bald&folge=bewerbungen', 'zustand=endet-bald&folge=geplant', 'zustand=endet-bald&folge=keiner',
  'zustand=beendet', 'zustand=beendet&folge=keiner', 'zustand=beendet&folge=geplant', 'zustand=im-einsatz&vertrag=anderer',
  'zustand=im-einsatz&vertrag=offen', 'zustand=im-einsatz&ohne=abreise', 'zustand=anreise-offen&ohne=anreise', 'zustand=anreise-da&jahr=wechsel',
  'zustand=anreise-da&name=nein&foto=nein', 'zustand=anreise-da&verkehr=eigen', 'zustand=anreise-da&ende=a',
];

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
  it('die Notiz der Agentur zur Anreise erscheint nie; „hinweis" steht in keinem Zustand im DOM', () => {
    const anreise = anreiseAusEreignissen([{
      event_type: 'caregiver_arrival_scheduled', created_at: '2026-10-12T10:00:00Z',
      metadata: { mamamia_job_offer_id: 1, anreise_datum: '2026-10-19', anreise_von: '14:00', anreise_bis: '16:00', verkehrsmittel: 'Minibus', einsatzort_strasse: 'Musterstraße 1', einsatzort_plz_ort: '12345 Musterstadt', hinweis: 'Osobus Disponent Uhrzeitänderung' },
    }], 1, 'gebucht');
    const r = zeige('zustand=anreise-da', {}, { anreise });
    expect(r.text).toContain('Minibus');
    expect(r.seite.innerHTML).not.toMatch(/Osobus|Disponent|Uhrzeitänderung/);
    r.unmount();
    for (const q of ALLE) {
      const z = zeige(q);
      expect(z.container.innerHTML, q).not.toMatch(/hinweis/i);
      z.unmount();
    }
  });
  it('keine Uhrzeit, kein Verkehrsmittel, keine Adresse ohne Anreise-Eintrag (außerhalb des Kontakts)', () => {
    for (const q of ALLE) {
      const v = vorschau(q);
      const r = zeige(q);
      if (!v.daten.anreise || !['vor', 'anreisetag'].includes(r.seite.getAttribute('data-zeit') ?? '')) {
        const ohneKontakt = r.seite.cloneNode(true) as HTMLElement;
        ohneKontakt.querySelector('[data-baustein="kontakt"]')?.remove();
        const t = nb(ohneKontakt.textContent);
        expect(t, q).not.toMatch(/\d{1,2}(:\d{2})?(–\d{1,2})? Uhr|Minibus|Reisebus|Eigene Anreise|Musterstraße|Hierhin|Ankunft/);
        expect(r.q1('[data-zeile="ankunft"]'), q).toBeNull();
      }
      r.unmount();
    }
  });
  it('kein Folgeeinsatz-Schritt ohne Folgejob, nie im beendeten Einsatz', () => {
    for (const q of ALLE) {
      const v = vorschau(q);
      const r = zeige(q);
      const hatFolgejob = v.daten.jobs.length > 1 && r.seite.getAttribute('data-zustand') !== 'B';
      if (!hatFolgejob) expect(r.q1('[data-schritt="folge"]'), q).toBeNull();
      r.unmount();
    }
  });
  it('Notfallfeld in allen Zuständen außer B', () => {
    for (const q of ALLE) {
      const r = zeige(q);
      expect(!!r.q1('[data-notfall]'), q).toBe(r.seite.getAttribute('data-zustand') !== 'B');
      r.unmount();
    }
  });
  it('kein gestrichener Text auf der Seite (N3.7)', () => {
    for (const q of ALLE) {
      const r = zeige(q);
      expect(r.text, q).not.toMatch(/Alle meine Einsätze|Laut Ihrem Vertrag|Alle Kosten im Überblick|Weniger anzeigen|Eine Kopie|pauschal je 125|Dienstleistungsvertrag|Vertragsbeginn|Bitte schließen Sie noch|Buchung bestätigt|reist am|reist heute|Gebuchter Einsatz bis|übernimmt|ist angekommen|\bkommt\b|Als Nächstes|Vielen Dank —|sofort verfügbar|Folgeeinsatz: |vermitteln/);
      expect(r.seite.querySelectorAll('h1'), q).toHaveLength(1);
      r.unmount();
    }
  });
  it('Siegel immer (Entscheidung 7 B), auch in VO und VV; &ende=a ohne Siegel', () => {
    for (const q of ['zustand=vertrag-offen', 'zustand=vorbereitung', 'zustand=beendet']) {
      const r = zeige(q);
      expect(r.bausteine.at(-1), q).toBe('ende');
      r.unmount();
    }
    expect(zeige('zustand=anreise-da&ende=a').bausteine).toEqual(['gruss', 'einsatz', 'schritte', 'kontakt']);
  });
  it('ohne belegten Tagessatz keine Kostenzeile', () => {
    expect(zeige('zustand=im-einsatz', {}, { tagessatz: null }).q1('[data-teil="kosten"]')).toBeNull();
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
    expect(seite).toMatch(/nachKontakt=\{gebuchtNeu && notfallImHilfeBlatt\(gebuchtNeu\.daten\)/);
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
  it('Hilfe-Blatt: ohne Props unverändert, mit `nachKontakt` Notfallfeld UNTER Martas Tageskontakt, X bleibt oben, „täglich 8–20 Uhr"', async () => {
    const { ContactPopup } = await import('../../components/portal/ContactPopup');
    const { NotfallFeld } = await import('../../components/portal/GebuchtKontakt');
    const alt = render(<ContactPopup onClose={() => {}} />);
    expect(screen.getByText('Mo–So, 8–20 Uhr')).toBeTruthy();
    expect(screen.queryByText(/Notfallnummer/)).toBeNull();
    alt.unmount();
    const zu = vi.fn();
    const neu = render(<ContactPopup onClose={zu} nachKontakt={<NotfallFeld nummer={FANTASIE_PL} />} zeiten="täglich 8–20 Uhr" />);
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
    // Erreichbarkeit zuerst (Martin 02.10.): Martas Tagesnummer steht VOR dem Notfallfeld.
    const tagesnummer = screen.getByText('täglich 8–20 Uhr').closest('div') as HTMLElement;
    expect(tagesnummer.compareDocumentPosition(feld) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
