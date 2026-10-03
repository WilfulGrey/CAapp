import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aufzaehlung, EigenanteilZeile, KompaktEinleitung, KompaktePflegekraefte, PflegekraftZeile, SchritteKasten, zuschussKurzname } from '../../components/portal/KompaktEinstieg';
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
    onProfil: () => {}, onVervollstaendigen: () => {}, telefonHref: 'tel:0',
  };

  it('Eyebrow, Überschrift mit der Zahl der Zeilen (Einzahl bei einer); Empfehlung nur in der ersten', () => {
    const { rerender } = render(<KompaktePflegekraefte {...props} eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByText('Für Sie ausgewählt')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '1 passende Pflegekraft' })).toBeTruthy();
    rerender(
      <KompaktePflegekraefte
        {...props}
        eintraege={[{ nurse: basis, i: 0 }, { nurse: { ...basis, caregiverId: 50003, name: 'Anna Nowak' }, i: 1 }]}
      />,
    );
    expect(screen.getByRole('heading', { name: '2 passende Pflegekräfte' })).toBeTruthy();
    expect(screen.getAllByText('Unsere Empfehlung')).toHaveLength(1);
    expect(within(zeileVon('Helena K.')).getByText('Unsere Empfehlung')).toBeTruthy();
  });

  it('Hinweis unter der Überschrift: „Vor dem Einladen: Pflegesituation vervollständigen →" öffnet das Formular', async () => {
    const onVervollstaendigen = vi.fn();
    const onProfil = vi.fn();
    render(<KompaktePflegekraefte {...props} onProfil={onProfil} onVervollstaendigen={onVervollstaendigen} eintraege={[{ nurse: basis, i: 0 }]} />);
    const hinweis = screen.getByRole('button', { name: 'Vor dem Einladen: Pflegesituation vervollständigen →' });
    // Steht direkt unter der Überschrift, vor der ersten Zeile.
    const titel = screen.getByRole('heading', { name: '1 passende Pflegekraft' });
    expect(titel.compareDocumentPosition(hinweis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hinweis.compareDocumentPosition(zeileVon('Helena K.')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(hinweis);
    expect(onVervollstaendigen).toHaveBeenCalledTimes(1);
    expect(onProfil).not.toHaveBeenCalled();
  });

  it('beim Laden keine Zahl und kein Hinweis', () => {
    render(<KompaktePflegekraefte {...props} laedt eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByRole('heading', { name: 'Passende Pflegekräfte' })).toBeTruthy();
    expect(screen.getByText('Wir laden Ihre Pflegekräfte …')).toBeTruthy();
    expect(screen.queryByText(/Vor dem Einladen/)).toBeNull();
  });

  it('ohne Vorschläge: Leer-Zustand mit Marta, kein Hinweis', () => {
    render(<KompaktePflegekraefte {...props} keineVorschlaege eintraege={[]} />);
    expect(screen.getByText('Gerade keine weiteren Vorschläge')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mit Marta sprechen' }).getAttribute('href')).toBe('tel:0');
    expect(screen.queryByText(/Vor dem Einladen/)).toBeNull();
  });
});

describe('SchritteKasten', () => {
  it('drei Schritte: 1 erledigt, 2 jetzt mit Knopf, 3 später und gesperrt', async () => {
    const onOeffnen = vi.fn();
    render(<SchritteKasten aktiv offen={false} onOeffnen={onOeffnen}><p>Formular</p></SchritteKasten>);
    const kasten = screen.getByRole('region', { name: 'So geht es weiter' });
    expect(kasten.id).toBe('patientendaten');
    const schritte = within(kasten).getAllByRole('listitem');
    expect(schritte).toHaveLength(3);
    expect(schritte[0].textContent).toBe('Erledigt: Angebot erstellt');
    expect(schritte[1].getAttribute('aria-current')).toBe('step');
    expect(within(schritte[1]).getByText('Pflegesituation vervollständigen')).toBeTruthy();
    expect(within(schritte[1]).getByText('Dauert etwa 2 Minuten, vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie sich für eine Pflegekraft entscheiden.')).toBeTruthy();
    expect(schritte[2].getAttribute('aria-current')).toBeNull();
    expect(within(schritte[2]).getByText('Pflegekräfte einladen und Bewerbungen erhalten')).toBeTruthy();
    expect(within(schritte[2]).getByText('Passende Pflegekräfte bewerben sich bei Ihnen mit Foto, Erfahrung, Anreisedatum und Preis.')).toBeTruthy();
    // Schritt 3 hat keinen Knopf: Er darf nicht nach „geht schon" aussehen.
    expect(within(schritte[2]).queryByRole('button')).toBeNull();
    expect(screen.queryByText('Formular')).toBeNull();
    await userEvent.click(within(schritte[1]).getByRole('button', { name: 'Jetzt vervollständigen →' }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
  });

  it('offen: das Formular steht unter Schritt 2, der Knopf ist weg', () => {
    render(<SchritteKasten aktiv offen onOeffnen={() => {}}><p>Formular</p></SchritteKasten>);
    const schritte = within(screen.getByRole('region', { name: 'So geht es weiter' })).getAllByRole('listitem');
    expect(within(schritte[1]).getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Jetzt vervollständigen →' })).toBeNull();
  });

  it('nicht aktiv (alle anderen Zustände): nur der Inhalt, kein Kasten', () => {
    render(<SchritteKasten aktiv={false} offen={false} onOeffnen={() => {}}><p>Formular</p></SchritteKasten>);
    expect(screen.getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'So geht es weiter' })).toBeNull();
    expect(screen.queryByText('Angebot erstellt')).toBeNull();
  });
});

describe('KompaktEinleitung', () => {
  it('Einleitung unter dem Titel im Wortlaut, „6–8 Wochen" bricht nicht um', () => {
    const { container } = render(<KompaktEinleitung />);
    const absatz = container.querySelector('p')!;
    expect(absatz.textContent).toBe(
      'Eine Betreuungskraft wohnt bei Ihnen und hilft im Alltag: bei der Körperpflege, beim Essen und im Haushalt. Um alles Weitere kümmern wir uns: Anreise, Wechsel in der Regel alle 6–8 Wochen, schnellstmöglich Ersatz bei Ausfall und die taggenaue Abrechnung.',
    );
    expect(within(absatz).getByText('6–8 Wochen').className).toContain('whitespace-nowrap');
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
