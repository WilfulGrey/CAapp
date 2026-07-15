// BookedScreen — „Vertrag nachträglich abschließen" (Martin, 2026-07-15).
// Kam die Annahme NICHT aus dem Portal (Agentur hat im SA-Portal akzeptiert →
// synthetische fc-App ohne signedForm/contract_snapshot), fehlt der Vertrag.
// Der Vertrag-Milestone wird dann zum aktiven Schritt: Hinweis + Button
// „Vertrag jetzt abschließen" (onSignContract). Liegt ein unterschriebener
// Vertrag vor (vertragSigned) oder fehlt der Handler, erscheint der Button nie.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookedScreen } from '../../components/portal/BookedScreen';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

function makeNurse(overrides: Partial<Nurse> = {}): Nurse {
  return {
    id: 1,
    caregiverId: 50001,
    name: 'Maria Kowalski',
    age: 45,
    color: '#8B7355',
    experience: '5 J. Erfahrung',
    experienceYears: 5,
    language: { level: 'B1', bars: 3 },
    history: { assignments: 7, avgDurationMonths: 2 },
    availability: '',
    availableSoon: false,
    addedTime: '',
    isLive: false,
    gender: 'female',
  } as unknown as Nurse;
}

function makeApp(overrides: Partial<Application> = {}): Application {
  return {
    id: 'fc-5511',
    nurse: makeNurse(),
    agencyName: 'Pflegeagentur',
    appliedAt: '—',
    status: 'accepted',
    message: '',
    synthetic: true,
    offer: {
      monatlicheKosten: 2490,
      anreisedatum: '01.08.2026',
      abreisedatum: '12.09.2026',
      anreisekosten: 125,
      abreisekosten: 125,
      reisetage: 'Halb',
      feiertagszuschlag: 83,
      kuendigungsfrist: 'Täglich kündbar',
      submittedAt: '14.07.2026',
    },
    ...overrides,
  };
}

describe('BookedScreen — Vertrag nachträglich abschließen', () => {
  it('ohne Vertrag + onSignContract → Hinweis + Button „Vertrag jetzt abschließen"', () => {
    render(
      <BookedScreen
        app={makeApp()}
        onNurseClick={() => {}}
        onSignContract={() => {}}
        vertragSigned={false}
      />,
    );
    expect(screen.getByText(/Bitte schließen Sie noch Ihren Betreuungsvertrag ab\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeTruthy();
    // Der passive „wird vorbereitet"-Text ist durch den aktiven Schritt ersetzt.
    expect(screen.queryByText(/wird vorbereitet/)).toBeNull();
  });

  it('Klick auf den Button ruft onSignContract auf', async () => {
    const onSignContract = vi.fn();
    const user = userEvent.setup();
    render(
      <BookedScreen
        app={makeApp()}
        onNurseClick={() => {}}
        onSignContract={onSignContract}
        vertragSigned={false}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Vertrag jetzt abschließen/ }));
    expect(onSignContract).toHaveBeenCalledTimes(1);
  });

  it('mit unterschriebenem Vertrag (vertragSigned) → Button nie sichtbar', () => {
    render(
      <BookedScreen
        app={makeApp()}
        onNurseClick={() => {}}
        onSignContract={() => {}}
        vertragSigned
        leadId="lead-uuid-1"
        leadToken="token-1"
      />,
    );
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
    expect(screen.getByText(/✓ Unterschrieben/)).toBeTruthy();
  });

  it('ohne onSignContract → heutiger passiver Zustand unverändert („wird vorbereitet")', () => {
    render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned={false} />,
    );
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
    expect(screen.getByText(/Ihr Betreuungsvertrag wird vorbereitet/)).toBeTruthy();
  });

  it('einsatzBeendet → kein aktiver Vertrag-Schritt trotz onSignContract', () => {
    render(
      <BookedScreen
        app={makeApp()}
        onNurseClick={() => {}}
        onSignContract={() => {}}
        vertragSigned={false}
        einsatzBeendet
      />,
    );
    expect(screen.queryByRole('button', { name: /Vertrag jetzt abschließen/ })).toBeNull();
  });
});
