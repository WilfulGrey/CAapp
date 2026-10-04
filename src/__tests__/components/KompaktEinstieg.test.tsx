import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aufzaehlung, EigenanteilZeile, FotoStapel, KompaktePflegekraefte, KUEMMERN_PUNKTE, PflegekraefteKarte, PflegekraftZeile, WirKuemmernUns, zuschussKurzname } from '../../components/portal/KompaktEinstieg';
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

  // Runde 6: Zahl und „was fehlt" sagt die Karte darüber — hier nur die kleine Überschrift „Die Profile".
  it('kleine Überschrift „Die Profile", keine große Überschrift, kein Schloss-Hinweis; Empfehlung nur in der ersten Zeile', () => {
    render(
      <KompaktePflegekraefte
        {...props}
        eintraege={[{ nurse: basis, i: 0 }, { nurse: { ...basis, caregiverId: 50003, name: 'Anna Nowak' }, i: 1 }]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Die Profile' })).toBeTruthy();
    expect(screen.queryByText('Für Sie ausgewählt')).toBeNull();
    expect(screen.queryByText(/passende Pflegekr/)).toBeNull();
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

describe('WirKuemmernUns', () => {
  it('kleine fette Überschrift mit Siegel daneben, darunter die sieben Häkchen im Wortlaut', () => {
    const { container } = render(<WirKuemmernUns onBestpreis={() => {}} />);
    const titel = screen.getByRole('heading', { name: 'Wir kümmern uns um alles' });
    // Siegel rechts in derselben Zeile, nur als Bild (der Punkt sagt es in Worten).
    const siegel = container.querySelector('img')!;
    expect(siegel.getAttribute('src')).toBe('/badge-testsieger.webp');
    expect(siegel.getAttribute('alt')).toBe('');
    expect(siegel.parentElement).toBe(titel.parentElement);
    const punkte = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(punkte).toEqual([
      'Anreise ab 3 Tagen möglich',
      'Wechsel und Ersatz geregelt',
      'Täglich kündbar',
      'Keine Vermittlungsgebühr',
      'Bestpreisgarantie',
      'Über 20 Jahre Erfahrung',
      '6× Testsieger DIE WELT',
    ]);
    expect(KUEMMERN_PUNKTE).toHaveLength(7);
    // Eine Spalte auf dem Handy, zwei erst ab 640 px.
    expect(screen.getByRole('list').className).toContain('grid-cols-1');
    expect(screen.getByRole('list').className).toContain('sm:grid-cols-2');
  });

  it('nur „Bestpreisgarantie" ist antippbar und öffnet das Pop-up', async () => {
    const onBestpreis = vi.fn();
    render(<WirKuemmernUns onBestpreis={onBestpreis} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Bestpreisgarantie' }));
    expect(onBestpreis).toHaveBeenCalledTimes(1);
  });
});

describe('FotoStapel', () => {
  it('runde Fotos übereinander (ab dem zweiten überlappend), ohne Foto die Initialen', () => {
    const { container } = render(
      <FotoStapel nurses={[{ ...basis, image: '/a.jpg' }, { ...basis, caregiverId: 50003, name: 'Anna Nowak', image: undefined }]} />,
    );
    const kreise = container.querySelectorAll(':scope > div > span');
    expect(kreise).toHaveLength(2);
    expect(kreise[0].className).toContain('rounded-full');
    expect(kreise[0].className).toContain('border-white');
    expect(kreise[0].className).not.toContain('-ml-2.5');
    expect(kreise[1].className).toContain('-ml-2.5');
    expect(kreise[0].querySelector('img')!.getAttribute('src')).toBe('/a.jpg');
    expect(kreise[1].textContent).toBe('AN');
  });
});

describe('PflegekraefteKarte', () => {
  const fuenf: Nurse[] = ['Ewa Lis', 'Anna Nowak', 'Helena Wolf', 'Pavel Kral', 'Irena Pawlak'].map((name, k) => ({
    ...basis, caregiverId: 60000 + k, name, image: `/p${k}.jpg`,
  }));
  const props = { aktiv: true, laedt: false, offen: false, onOeffnen: () => {}, onProfile: () => {} };

  it('Titel mit der Zahl, Fotos, was fehlt, Knopf, „Unverbindlich", Link zu den Profilen', async () => {
    const onOeffnen = vi.fn();
    const onProfile = vi.fn();
    render(<PflegekraefteKarte {...props} nurses={fuenf} onOeffnen={onOeffnen} onProfile={onProfile}><p>Formular</p></PflegekraefteKarte>);
    const karte = screen.getByRole('region', { name: '5 Pflegekräfte sind schon für Sie ausgewählt' });
    expect(karte.id).toBe('patientendaten');
    expect(within(karte).getByText('für Sie ausgewählt').className).toContain('whitespace-nowrap');
    expect(karte.querySelectorAll('img')).toHaveLength(5);
    expect(within(karte).getByText('Fotos, Namen und Profile liegen bereit.')).toBeTruthy();
    expect(within(karte).getByText('Zum Einladen fehlt nur noch Ihre Pflegesituation: etwa 2 Minuten, vieles ist schon ausgefüllt.')).toBeTruthy();
    const unverbindlich = within(karte).getByText(/^Unverbindlich:/);
    expect(unverbindlich.textContent).toBe('Unverbindlich: Ein Vertrag entsteht erst, wenn Sie sich für eine Pflegekraft entscheiden.');
    expect(within(unverbindlich).getByText('Pflegekraft entscheiden.').className).toContain('whitespace-nowrap');
    expect(screen.queryByText('Formular')).toBeNull();
    await userEvent.click(within(karte).getByRole('button', { name: 'Pflegesituation vervollständigen →' }));
    expect(onOeffnen).toHaveBeenCalledTimes(1);
    await userEvent.click(within(karte).getByRole('button', { name: 'Alle 5 Profile ansehen ↓' }));
    expect(onProfile).toHaveBeenCalledTimes(1);
  });

  it('Einzahl: „1 Pflegekraft ist schon für Sie ausgewählt", Link „Profil ansehen ↓"', () => {
    render(<PflegekraefteKarte {...props} nurses={[fuenf[0]]}><p>Formular</p></PflegekraefteKarte>);
    expect(screen.getByRole('region', { name: '1 Pflegekraft ist schon für Sie ausgewählt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Profil ansehen ↓' })).toBeTruthy();
  });

  it('offen: das Formular steht in der Karte; Knopf, „Unverbindlich" und Link sind weg', () => {
    render(<PflegekraefteKarte {...props} nurses={fuenf} offen><p>Formular</p></PflegekraefteKarte>);
    const karte = screen.getByRole('region', { name: '5 Pflegekräfte sind schon für Sie ausgewählt' });
    expect(within(karte).getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pflegesituation vervollständigen →' })).toBeNull();
    expect(screen.queryByText(/^Unverbindlich:/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Profile ansehen/ })).toBeNull();
  });

  it('beim Laden: keine Zahl, keine Fotos, kein Link — der Knopf bleibt', () => {
    render(<PflegekraefteKarte {...props} laedt nurses={fuenf}><p>Formular</p></PflegekraefteKarte>);
    const karte = screen.getByRole('region', { name: 'Passende Pflegekräfte' });
    expect(karte.querySelectorAll('img')).toHaveLength(0);
    expect(screen.queryByText('Fotos, Namen und Profile liegen bereit.')).toBeNull();
    expect(screen.queryByRole('button', { name: /Profile ansehen/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pflegesituation vervollständigen →' })).toBeTruthy();
  });

  it('nicht aktiv (alle anderen Zustände): nur der Inhalt, keine Karte', () => {
    render(<PflegekraefteKarte {...props} aktiv={false} nurses={fuenf}><p>Formular</p></PflegekraefteKarte>);
    expect(screen.getByText('Formular')).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText(/ausgewählt/)).toBeNull();
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
