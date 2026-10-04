import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aufzaehlung, EigenanteilZeile, KompaktEinleitung, KompaktePflegekraefte, KompaktPflegekraefteBereich, KompaktVertrauen, PflegekraftZeile, zuschussKurzname } from '../../components/portal/KompaktEinstieg';
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
    expect(within(zeile).getByText('Unsere Empfehlung')).toBeTruthy();
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
  it('Einleitung unter dem Titel im Wortlaut der Geschäftsführung; Einheiten brechen nicht um', () => {
    const { container } = render(<KompaktEinleitung />);
    const absatz = container.querySelector('p')!;
    expect(absatz.textContent).toBe(
      'Ihr Angebot umfasst eine Rund-um-Betreuung zu Hause durch bei uns angestellte, sozialversicherte Betreuungskräfte. Dazu kommen über 20 Jahre Erfahrung, tägliche Kündbarkeit und 6× Testsieger DIE WELT. Unten finden Sie die für Sie ausgewählten Pflegekräfte: einfach Pflegesituation vervollständigen und Favoriten einladen.',
    );
    for (const teil of ['20 Jahre', '6× Testsieger DIE WELT', 'Favoriten einladen.']) {
      expect(within(absatz).getByText(teil).className).toContain('whitespace-nowrap');
    }
  });
});

describe('KompaktVertrauen', () => {
  it('eine Zeile: kleines Testsieger-Siegel links, daneben die Sterne — kein Text zum Testsieger', () => {
    const { container } = render(<KompaktVertrauen sterne={{ schnitt: '4,9', wert: 4.9, anzahl: 126 }} />);
    const siegel = container.querySelector('img')!;
    expect(siegel.getAttribute('src')).toBe('/badge-testsieger.webp');
    const sterne = screen.getByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ });
    expect(sterne.getAttribute('href')).toBe('https://primundus.de/erfahrungen');
    expect(siegel.parentElement).toBe(sterne.parentElement);
    expect(siegel.compareDocumentPosition(sterne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.textContent).not.toMatch(/Testsieger|Erfahrung/);
  });

  it('ohne Bewertungsstand nur das Siegel', () => {
    const { container } = render(<KompaktVertrauen sterne={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});

describe('KompaktPflegekraefteBereich', () => {
  const props = { aktiv: true, offen: false, onOeffnen: () => {}, liste: <p>Zeilen</p> };

  it('Kopf, Hinweis mit Knopf und „Unverbindlich", darunter die Zeilen', async () => {
    const onOeffnen = vi.fn();
    render(<KompaktPflegekraefteBereich {...props} onOeffnen={onOeffnen}><p>Formular</p></KompaktPflegekraefteBereich>);
    const bereich = screen.getByRole('region', { name: 'Ihre passenden Pflegekräfte' });
    expect(within(bereich).getByText('Für Sie ausgewählt')).toBeTruthy();
    expect(within(bereich).getByText(/^Echte Profile, ausgewählt nach/).textContent).toBe('Echte Profile, ausgewählt nach Ihren Angaben.');
    const hinweis = document.getElementById('patientendaten')!;
    expect(within(hinweis).getByText('Noch 2 Minuten bis zum Einladen')).toBeTruthy();
    expect(within(hinweis).getByText(/^Vervollständigen Sie kurz/).textContent).toBe(
      'Vervollständigen Sie kurz Ihre Pflegesituation, vieles ist schon ausgefüllt. Danach laden Sie Pflegekräfte ein und erhalten Bewerbungen mit Foto, Erfahrung, Anreisedatum und Preis.',
    );
    const unverbindlich = within(hinweis).getByText(/^Unverbindlich:/);
    expect(unverbindlich.textContent).toBe('Unverbindlich: Ein Vertrag entsteht erst, wenn Sie ein Angebot ausdrücklich annehmen.');
    expect(within(unverbindlich).getByText('ausdrücklich annehmen.').className).toContain('whitespace-nowrap');
    // Reihenfolge: Kopf → Hinweis → Zeilen.
    const zeilen = screen.getByText('Zeilen');
    expect(hinweis.compareDocumentPosition(zeilen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Formular')).toBeNull();
    await userEvent.click(within(hinweis).getByRole('button', { name: 'Jetzt vervollständigen →' }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });

  it('offen: das Formular steht im Hinweis, Knopf und „Unverbindlich" sind weg', () => {
    render(<KompaktPflegekraefteBereich {...props} offen><p>Formular</p></KompaktPflegekraefteBereich>);
    const hinweis = document.getElementById('patientendaten')!;
    expect(within(hinweis).getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Jetzt vervollständigen →' })).toBeNull();
    expect(screen.queryByText(/^Unverbindlich:/)).toBeNull();
  });

  it('nicht aktiv (alle anderen Zustände): nur der Inhalt, kein Kopf, kein Hinweis, keine Zeilen', () => {
    render(<KompaktPflegekraefteBereich {...props} aktiv={false}><p>Formular</p></KompaktPflegekraefteBereich>);
    expect(screen.getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    expect(screen.queryByText('Zeilen')).toBeNull();
  });
});

describe('EigenanteilZeile', () => {
  const posten = [
    { name: 'pflegegeld', label: 'Pflegegeld' },
    { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget (3.539 Euro/Jahr ab Pflegegrad 2)' },
    { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit' },
  ];

  it('Betrag wie übergeben, Posten in Kurzform, „So rechnen wir ›" öffnet die Aufstellung', async () => {
    const onRechnung = vi.fn();
    const { container } = render(<EigenanteilZeile betrag="1.622 €" posten={posten} onRechnung={onRechnung} />);
    const [zeile1, zeile2] = [...container.querySelectorAll('p')].map((p) => (p.textContent ?? '').replace(/\u00A0/g, ' '));
    expect(zeile1).toBe('Ihr Eigenanteil: ca. 1.622 € im Monat');
    expect(zeile2).toBe('nach Pflegegeld, Entlastungsbudget und Steuerersparnis · So rechnen wir ›');
    await userEvent.click(screen.getByRole('button', { name: 'So rechnen wir ›' }));
    expect(onRechnung).toHaveBeenCalledTimes(1);
  });

  it('nur die Posten, die den Betrag senken (hier einer)', () => {
    const { container } = render(<EigenanteilZeile betrag="2.453 €" posten={[posten[0]]} onRechnung={() => {}} />);
    expect((container.querySelectorAll('p')[1].textContent ?? '').replace(/\u00A0/g, ' ')).toBe('nach Pflegegeld · So rechnen wir ›');
  });

  it('aufzaehlung: eins, zwei, drei', () => {
    expect(aufzaehlung([])).toBe('');
    expect(aufzaehlung(['A'])).toBe('A');
    expect(aufzaehlung(['A', 'B'])).toBe('A und B');
    expect(aufzaehlung(['A', 'B', 'C'])).toBe('A, B und C');
  });

  it('zuschussKurzname: bekannte Posten kurz, unbekannte wie im Aufklapper (Label ohne Klammer)', () => {
    expect(posten.map(zuschussKurzname)).toEqual(['Pflegegeld', 'Entlastungsbudget', 'Steuerersparnis']);
    expect(zuschussKurzname({ name: 'entlastungsbetrag', label: 'Entlastungsbetrag (125 Euro/Monat)' })).toBe('Entlastungsbetrag');
  });
});
