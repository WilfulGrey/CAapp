import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KompaktEinleitung, KompaktePflegekraefte, KompaktPflegekraefteBereich, KompaktVertrauen, PflegekraftZeile, VERTRAUEN } from '../../components/portal/KompaktEinstieg';
import type { Nurse } from '../../types';

const basis: Nurse = {
  caregiverId: 50002,
  name: 'Helena Kowalski',
  age: 41,
  experience: '6 J. Erfahrung',
  experienceYears: 6,
  availability: '',
  availableSoon: true,
  language: { level: 'Gut', bars: 3 },
  color: '#8B7355',
  addedTime: '',
  isLive: true,
  gender: 'female',
  history: { assignments: 14, avgDurationMonths: 2 },
};

const zeileVon = (name: string) => screen.getByRole('button', { name: `Profil von ${name} ansehen` });
// Text der Zeile; das geschützte Leerzeichen vor dem „·" (Umbruch erst danach) als normales.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\u00A0/g, ' ');
// Gefüllte Punkte der Deutsch-Anzeige (DeutschPunkte aus dem Profil „V").
const gefuellt = (el: HTMLElement) => el.querySelectorAll('span.bg-pm-taupe').length;

// Kompakt-Einstieg (Vorschlag 03.10.2026, Runde 3): Zeilen statt Karten, dieselben Daten wie das Profil.
describe('PflegekraftZeile', () => {
  it('Name und Alter, Deutsch mit Punkten, Erfahrung · Einsätze bei uns — keine Sterne', () => {
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={() => {}} />);
    const zeile = zeileVon('Helena K.');
    expect(within(zeile).getByText('Helena K.')).toBeTruthy();
    expect(within(zeile).getByText(', 41')).toBeTruthy();
    expect(within(zeile).getByText('Deutsch gut')).toBeTruthy();
    expect(gefuellt(zeile)).toBe(3);
    expect(text(zeile)).toContain('6 Jahre Erfahrung · 14 Einsätze bei uns');
    // Keine Bewertung je Pflegekraft: kein Stern, auch nicht für Elite/Stammkraft.
    expect(zeile.textContent).not.toContain('★');
    expect(within(zeile).queryByText('Unsere Empfehlung')).toBeNull();
  });

  it('Punkte nach Niveau: „mittel" zwei von drei', () => {
    render(<PflegekraftZeile nurse={{ ...basis, language: { level: 'Mittel', bars: 2 } }} empfohlen={false} onClick={() => {}} />);
    const zeile = zeileVon('Helena K.');
    expect(within(zeile).getByText('Deutsch mittel')).toBeTruthy();
    expect(gefuellt(zeile)).toBe(2);
  });

  it('Einzahl: „1 Jahr Erfahrung · 1 Einsatz bei uns"', () => {
    render(<PflegekraftZeile nurse={{ ...basis, experienceYears: 1, history: { assignments: 1, avgDurationMonths: 2 } }} empfohlen={false} onClick={() => {}} />);
    expect(text(zeileVon('Helena K.'))).toContain('1 Jahr Erfahrung · 1 Einsatz bei uns');
  });

  it('fehlende oder null Teile entfallen samt Trenner', () => {
    const { unmount } = render(<PflegekraftZeile nurse={{ ...basis, experienceYears: 0 }} empfohlen={false} onClick={() => {}} />);
    let zeile = zeileVon('Helena K.');
    expect(zeile.textContent).toContain('14 Einsätze bei uns');
    expect(zeile.textContent).not.toContain('Erfahrung');
    expect(zeile.textContent).not.toContain('·');
    unmount();
    render(<PflegekraftZeile nurse={{ ...basis, history: { assignments: 0, avgDurationMonths: 0 } }} empfohlen={false} onClick={() => {}} />);
    zeile = zeileVon('Helena K.');
    expect(zeile.textContent).toContain('6 Jahre Erfahrung');
    expect(zeile.textContent).not.toContain('Einsätze');
    expect(zeile.textContent).not.toContain('·');
  });

  it('ohne Sprache, Jahre und Einsätze nur der Name; Empfehlung als Etikett', () => {
    render(
      <PflegekraftZeile
        nurse={{ ...basis, age: 0, experienceYears: 0, language: { level: '—', bars: 0 }, history: undefined }}
        empfohlen
        onClick={() => {}}
      />,
    );
    const zeile = zeileVon('Helena K.');
    const empfehlung = within(zeile).getByText('Unsere Empfehlung');
    // Runde 13: leiser Text, keine Pille.
    expect(empfehlung.className).not.toContain('rounded-full');
    expect(empfehlung.className).not.toContain('bg-');
    expect(zeile.textContent).not.toMatch(/Deutsch|Erfahrung|Einsätze|, \d/);
    expect(gefuellt(zeile)).toBe(0);
  });

  it('die ganze Zeile öffnet das Profil', async () => {
    const onClick = vi.fn();
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={onClick} />);
    await userEvent.click(zeileVon('Helena K.'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('KompaktePflegekraefte', () => {
  const props = {
    laedt: false, alleBearbeitet: false, keineVorschlaege: false,
    onProfil: () => {}, telefonHref: 'tel:0',
  };

  // Runde 8: nur noch die Zeilen — der Kopf „Ihre passenden Pflegekräfte" steht im Bereich darüber.
  it('nur die Zeilen, ohne eigene Überschrift; Empfehlung nur in der ersten', () => {
    render(
      <KompaktePflegekraefte
        {...props}
        eintraege={[{ nurse: basis, i: 0 }, { nurse: { ...basis, caregiverId: 50003, name: 'Anna Nowak' }, i: 1 }]}
      />,
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByText(/Vor dem Einladen/)).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Profil von / })).toHaveLength(2);
    // Runde 13: schlichte Zeilen mit Linien, keine Karte.
    const liste = zeileVon('Helena K.').parentElement!;
    expect(liste.className).toContain('divide-y');
    expect(liste.className).not.toContain('rounded-card');
    expect(screen.getAllByText('Unsere Empfehlung')).toHaveLength(1);
    expect(within(zeileVon('Helena K.')).getByText('Unsere Empfehlung')).toBeTruthy();
  });

  it('beim Laden: Hinweis statt Zeilen', () => {
    render(<KompaktePflegekraefte {...props} laedt eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByText('Wir laden Ihre Pflegekräfte …')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Profil von / })).toBeNull();
  });

  it('ohne Vorschläge: Leer-Zustand mit Marta', () => {
    render(<KompaktePflegekraefte {...props} keineVorschlaege eintraege={[]} />);
    expect(screen.getByText('Gerade keine weiteren Vorschläge')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mit Marta sprechen' }).getAttribute('href')).toBe('tel:0');
  });
});

describe('KompaktEinleitung', () => {
  it('Einleitung unter dem Titel im Wortlaut der Geschäftsführung (Runde 14: positiv, ohne „Ausfall")', () => {
    const { container } = render(<KompaktEinleitung />);
    const absatz = container.querySelector('p')!;
    expect(absatz.textContent).toBe(
      'Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte Betreuungskräfte. Anreise, Wechsel und Vertretung organisieren wir, und Ihre Ansprechpartnerin ist täglich von 8 bis 20 Uhr für Sie da.',
    );
    expect(absatz.textContent).not.toContain('Ausfall');
    // Uhrzeit und Satzende bleiben zusammen.
    expect(within(absatz).getByText('8 bis 20 Uhr').className).toContain('whitespace-nowrap');
    expect(within(absatz).getByText('für Sie da.').className).toContain('whitespace-nowrap');
  });
});

describe('KompaktVertrauen', () => {
  it('eine ruhige Zeile: Siegel, daneben „6× in Folge Testsieger DIE WELT · über 20 Jahre Erfahrung" und die Sterne', () => {
    const { container } = render(<KompaktVertrauen sterne={{ schnitt: '4,9', wert: 4.9, anzahl: 126 }} />);
    const siegel = container.querySelector('img')!;
    expect(siegel.getAttribute('src')).toBe('/badge-testsieger.webp');
    const teile = screen.getAllByRole('listitem');
    expect(teile.map((li) => li.textContent)).toEqual(['6× in Folge Testsieger DIE WELT', 'über 20 Jahre Erfahrung']);
    expect(VERTRAUEN).toHaveLength(2);
    // Teile ganz, Umbruch nur zwischen ihnen; der Trenner sitzt vor dem Teil und wird am Zeilenanfang abgeschnitten.
    for (const li of teile) {
      expect(li.className).toContain('whitespace-nowrap');
      expect(li.className).toContain("before:content-['·']");
    }
    expect(screen.getByRole('list').parentElement!.className).toContain('overflow-hidden');
    const sterne = screen.getByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ });
    expect(sterne.getAttribute('href')).toBe('https://primundus.de/erfahrungen');
    expect(siegel.parentElement!.contains(sterne)).toBe(true);
    // Mit einer dünnen Linie von den Punkten darüber getrennt.
    expect((container.firstElementChild as HTMLElement).className).toContain('border-t');
  });

  it('ohne Bewertungsstand: Siegel und Testsieger-Zeile, keine Sterne', () => {
    const { container } = render(<KompaktVertrauen sterne={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});

describe('KompaktPflegekraefteBereich', () => {
  const props = { aktiv: true, offen: false, onOeffnen: () => {}, liste: <p>Zeilen</p> };

  it('Kopf, Status-Hinweis mit Knopf und kleiner Zeile, darunter die Zeilen', async () => {
    const onOeffnen = vi.fn();
    render(<KompaktPflegekraefteBereich {...props} onOeffnen={onOeffnen}><p>Formular</p></KompaktPflegekraefteBereich>);
    const bereich = screen.getByRole('region', { name: 'Ihre passenden Pflegekräfte' });
    // Runde 13: keine Versalien-Zeile über der Überschrift.
    expect(within(bereich).queryByText('Für Sie ausgewählt')).toBeNull();
    expect(within(bereich).getByText(/^Echte Profile, ausgewählt nach/).textContent).toBe('Echte Profile, ausgewählt nach Ihren Angaben.');
    const hinweis = document.getElementById('patientendaten')!;
    // Runde 12: Status-Hinweis statt „Noch 2 Minuten bis zum Einladen".
    expect(within(hinweis).queryByText('Hinweis')).toBeNull();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeTruthy();
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine Bewerbungen erhalten.')).toBeTruthy();
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    // Look B: dunkles Kopfband mit dem Titel in Weiß, weißer Körper, kräftiger Rand.
    // Der Kasten ist dunkel (Rand + Band ohne helle Naht an den Ecken), nur der Körper ist weiß.
    const rahmen = hinweis.firstElementChild as HTMLElement;
    expect(rahmen.className).toContain('border-pm-taupe-ink');
    expect(rahmen.className).toContain('bg-pm-taupe-ink');
    const band = within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig');
    expect(band.parentElement).toBe(rahmen);
    expect(band.className).toContain('text-white');
    const koerper = within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Deshalb können Sie diese Pflegekräfte noch nicht einladen und noch keine Bewerbungen erhalten.').parentElement!;
    expect(koerper.className).toContain('bg-white');
    const unverbindlich = within(hinweis).getByText(/^Vieles ist schon ausgefüllt\./);
    expect(unverbindlich.textContent).toBe('Vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot ausdrücklich annehmen.');
    expect(within(unverbindlich).getByText('ausdrücklich annehmen.').className).toContain('whitespace-nowrap');
    // Reihenfolge: Kopf → Hinweis → Zeilen.
    const zeilen = screen.getByText('Zeilen');
    expect(hinweis.compareDocumentPosition(zeilen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Formular')).toBeNull();
    await userEvent.click(within(hinweis).getByRole('button', { name: 'Pflegesituation vervollständigen →' }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });

  it('offen: das Formular steht im weißen Körper des Hinweises, Knopf und kleine Zeile sind weg', () => {
    render(<KompaktPflegekraefteBereich {...props} offen><p>Formular</p></KompaktPflegekraefteBereich>);
    const hinweis = document.getElementById('patientendaten')!;
    expect(within(hinweis).getByText('Formular')).toBeTruthy();
    expect(within(hinweis).getByText('Formular').parentElement!.className).toContain('border-t');
    expect(screen.queryByRole('button', { name: 'Pflegesituation vervollständigen →' })).toBeNull();
    expect(screen.queryByText(/^Vieles ist schon ausgefüllt\./)).toBeNull();
    // Der Status bleibt über dem Formular stehen.
    expect(within(hinweis).getByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeTruthy();
  });

  it('nicht aktiv (alle anderen Zustände): nur der Inhalt, kein Kopf, kein Hinweis, keine Zeilen', () => {
    render(<KompaktPflegekraefteBereich {...props} aktiv={false}><p>Formular</p></KompaktPflegekraefteBereich>);
    expect(screen.getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText((_, el) => el?.tagName === 'P' && el.textContent === 'Ihre Pflegesituation ist noch nicht vollständig')).toBeNull();
    expect(screen.queryByText('Zeilen')).toBeNull();
  });
});
