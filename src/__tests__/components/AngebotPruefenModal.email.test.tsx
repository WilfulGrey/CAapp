/** @vitest-environment jsdom */
// Registry #52: Vertragsformular prüft das E-Mail-FORMAT (Pflicht bleibt wie
// vorher: nur die Kontaktperson). „x@t-online.de@t-online.de" ging bis 05.09.
// durch und legte den Mamamia-Sync der Buchung lahm.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngebotPruefenModal } from '../../components/portal/AngebotPruefenModal';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

function makeApp(): Application {
  return {
    id: '12629',
    nurse: {
      id: 1, caregiverId: 24274, name: 'Leontyna S.', age: 67, color: '#8B7355',
      experience: '5 J. Erfahrung', experienceYears: 5, language: { level: 'B1', bars: 3 },
      history: { assignments: 7, avgDurationMonths: 2 }, availability: '', availableSoon: false,
      addedTime: '', isLive: false, gender: 'female',
    } as unknown as Nurse,
    agencyName: 'Pflegeagentur', appliedAt: '—', status: 'new', message: '',
    offer: {
      monatlicheKosten: 2650, anreisedatum: '01.10.2026', abreisedatum: '15.12.2026',
      anreisekosten: 125, abreisekosten: 125, reisetage: 'Halb', feiertagszuschlag: 88,
      kuendigungsfrist: 'Täglich kündbar', submittedAt: '05.09.2026',
    },
  };
}

const prefill = {
  vorname: 'Elsa', nachname: 'Stein', strasse: 'Bogenweg 2', einsatzort: '03130 Schwarze Pumpe',
  telefon: '0176', email: '', agGleich: true,
  kpVorname: 'Catarina', kpNachname: 'Stein', kpTelefon: '0176',
};

function kpEmailInput() {
  const kpSection = screen.getByText(/Kontaktperson/).closest('div')!;
  const inputs = within(kpSection.parentElement!).getAllByPlaceholderText('Bitte eingeben');
  const el = inputs.find((i) => {
    const label = i.closest('div')?.querySelector('label')?.textContent ?? '';
    return label.includes('E-Mail') && label.includes('*');
  });
  if (!el) throw new Error('KP E-Mail input not found');
  return el;
}

const signButton = () => screen.getByRole('button', { name: /unterschreiben/i });
// signDisabled (= !canProceed) rendert diesen Hinweis; der Button selbst hängt zusätzlich an Name + Häkchen.
const gesperrt = () => screen.queryByText(/Kundendaten vollständig ausfüllen/) !== null;

describe('AngebotPruefenModal — E-Mail-Format (Registry #52)', () => {
  it('KP-Mail „x@t-online.de@t-online.de" ⇒ Unterschrift gesperrt + Hinweis erst nach Blur; gültig ⇒ frei', async () => {
    const user = userEvent.setup();
    render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'catarina-stein@t-online.de@t-online.de' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(signButton()).toBeDisabled();
    expect(gesperrt()).toBe(true);
    // Hinweis NICHT vor dem Verlassen des Feldes (kein Rot mitten im Tippen)
    expect(screen.queryByText(/gültige E-Mail-Adresse/)).toBeNull();
    const input = kpEmailInput();
    await user.click(input);
    await user.tab();
    expect(screen.getByText(/gültige E-Mail-Adresse/)).toBeTruthy();

    await user.clear(input);
    await user.type(input, 'catarina-stein@t-online.de');
    expect(screen.queryByText(/gültige E-Mail-Adresse/)).toBeNull();
    expect(gesperrt()).toBe(false);
  });

  it('LE-Mail bleibt optional: leer ⇒ frei, unbrauchbar ⇒ gesperrt', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'ok@example.de', email: '' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(gesperrt()).toBe(false);
    unmount();
    render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'ok@example.de', email: 'Michael.kopka @ Freenet.de' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(gesperrt()).toBe(true);
    expect(signButton()).toBeDisabled();
    await user.click(screen.getAllByPlaceholderText('Bitte eingeben')[0]);
  });
});
