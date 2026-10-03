import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KompaktePflegekraefte, PflegekraftZeile } from '../../components/portal/KompaktEinstieg';
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

// Kompakt-Einstieg (Vorschlag 03.10.2026): Zeilen statt Karten, dieselben Daten wie das Profil.
describe('PflegekraftZeile', () => {
  it('Name, Alter, Deutsch und Erfahrung, Einsätze bei uns mit Stern (Elite)', () => {
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={() => {}} />);
    expect(screen.getByText('Helena K.')).toBeTruthy();
    expect(screen.getByText(', 41')).toBeTruthy();
    expect(screen.getByText('Deutsch gut · 6 Jahre Erfahrung')).toBeTruthy();
    expect(screen.getByText(/14 Einsätze bei uns/).textContent).toContain('★');
    expect(screen.queryByText('Unsere Empfehlung')).toBeNull();
  });

  it('Stern nur bei Elite und Stammkraft, nicht bei „Bewährt"', () => {
    render(<PflegekraftZeile nurse={{ ...basis, history: { assignments: 3, avgDurationMonths: 2 } }} empfohlen={false} onClick={() => {}} />);
    expect(screen.getByText(/3 Einsätze bei uns/).textContent).not.toContain('★');
  });

  it('fehlende Teile entfallen: ohne Sprache, Jahre und Einsätze nur der Name', () => {
    render(
      <PflegekraftZeile
        nurse={{ ...basis, age: 0, experienceYears: 0, language: { level: '—', bars: 0 }, history: undefined }}
        empfohlen
        onClick={() => {}}
      />,
    );
    expect(screen.getByText('Unsere Empfehlung')).toBeTruthy();
    expect(screen.queryByText(/Deutsch/)).toBeNull();
    expect(screen.queryByText(/Erfahrung/)).toBeNull();
    expect(screen.queryByText(/Einsätze bei uns/)).toBeNull();
    expect(screen.queryByText(/^, /)).toBeNull();
  });

  it('die ganze Zeile öffnet das Profil', async () => {
    const onClick = vi.fn();
    render(<PflegekraftZeile nurse={basis} empfohlen={false} onClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Profil von Helena K. ansehen' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('KompaktePflegekraefte', () => {
  const props = { laedt: false, alleBearbeitet: false, keineVorschlaege: false, onProfil: () => {}, telefonHref: 'tel:0' };

  it('Überschrift mit der Zahl der Zeilen, Einzahl bei einer; Empfehlung nur in der ersten', () => {
    const { rerender } = render(<KompaktePflegekraefte {...props} eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByRole('heading', { name: '1 passende Pflegekraft' })).toBeTruthy();
    rerender(
      <KompaktePflegekraefte
        {...props}
        eintraege={[{ nurse: basis, i: 0 }, { nurse: { ...basis, caregiverId: 50003, name: 'Anna Nowak' }, i: 1 }]}
      />,
    );
    expect(screen.getByRole('heading', { name: '2 passende Pflegekräfte' })).toBeTruthy();
    expect(screen.getAllByText('Unsere Empfehlung')).toHaveLength(1);
  });

  it('beim Laden keine Zahl', () => {
    render(<KompaktePflegekraefte {...props} laedt eintraege={[{ nurse: basis, i: 0 }]} />);
    expect(screen.getByRole('heading', { name: 'Passende Pflegekräfte' })).toBeTruthy();
    expect(screen.getByText('Wir laden Ihre Pflegekräfte …')).toBeTruthy();
  });
});
