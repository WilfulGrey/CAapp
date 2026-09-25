import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SucheStand, kurzDatum } from '../../components/portal/SucheStand';

describe('SucheStand', () => {
  it('zeigt Datum, Anzahl, Reservierung und Wunschstart', async () => {
    const onAngaben = vi.fn();
    render(<SucheStand angefragtAm="2026-09-24T12:00:00Z" passende={4} wunschstart="2026-10-15" onAngaben={onAngaben} />);
    expect(screen.getByText('Stand heute')).toBeInTheDocument();
    expect(screen.getByText('am 24.09.')).toBeInTheDocument();
    expect(screen.getByText('4 passende Pflegekräfte gefunden')).toBeInTheDocument();
    expect(screen.getByText('Jede Bewerbung ist 72 Stunden für Sie reserviert')).toBeInTheDocument();
    expect(screen.getByText('ab 3 Tagen nach Ihrer Zusage · Wunschstart 15.10.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Angaben ansehen oder ändern/ }));
    expect(onAngaben).toHaveBeenCalledTimes(1);
  });

  it('ohne Treffer ehrlich „wir suchen", ohne Daten keine erfundenen Zeilen', () => {
    render(<SucheStand angefragtAm={null} passende={0} wunschstart={null} onAngaben={() => {}} />);
    expect(screen.getByText('Wir suchen passende Pflegekräfte')).toBeInTheDocument();
    expect(screen.queryByText(/^am /)).toBeNull();
    expect(screen.getByText('ab 3 Tagen nach Ihrer Zusage')).toBeInTheDocument();
  });

  it('nach entschiedenen Bewerbungen kein reines Zukunftsversprechen', () => {
    render(<SucheStand angefragtAm={null} passende={2} wunschstart={null} onAngaben={() => {}} bisherigeBewerbungen={1} />);
    expect(screen.getByText('bisher 1 Bewerbung, weitere kommen per E\u2011Mail')).toBeInTheDocument();
  });

  it('Einzahl bei einer Pflegekraft', () => {
    render(<SucheStand angefragtAm={null} passende={1} wunschstart={null} onAngaben={() => {}} />);
    expect(screen.getByText('1 passende Pflegekraft gefunden')).toBeInTheDocument();
  });

  it('kurzDatum rechnet in Berliner Zeit und verwirft Unsinn', () => {
    expect(kurzDatum('2026-09-24T23:30:00Z')).toBe('25.09.');
    expect(kurzDatum('kaputt')).toBeNull();
    // mamamia `arrival_at`: Tag wie geschrieben, ohne Umweg über new Date() (Safari).
    expect(kurzDatum('2026-10-15 00:00:00')).toBe('15.10.');
    expect(kurzDatum('2026-10-01')).toBe('01.10.');
    // Zeitpunkt mit Leerzeichen und Zone (Postgres-Form) liest auch Safari.
    expect(kurzDatum('2026-09-24 23:30:00+00:00')).toBe('25.09.');
    expect(kurzDatum(undefined)).toBeNull();
  });
});
