/** @vitest-environment jsdom */
// Registry #52: Vertragsformular prüft das E-Mail-FORMAT (Pflicht bleibt wie
// vorher: nur die Kontaktperson). „x@t-online.de@t-online.de" ging bis 05.09.
// durch und legte den Mamamia-Sync der Buchung lahm.
import { beforeEach, describe, it, expect, vi } from 'vitest';
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
  anrede: 'Frau', vorname: 'Elsa', nachname: 'Stein', strasse: 'Bogenweg 2', einsatzort: '03130 Schwarze Pumpe',
  telefon: '0176', email: '', agGleich: true,
  kpVorname: 'Catarina', kpNachname: 'Stein', kpTelefon: '0176',
};

const kpEmailInput = () => within(screen.getByRole('region', { name: /Kontaktperson/ })).getByLabelText(/^E-Mail/);
// Offene/ungültige Angaben stehen oben in der Zusammenfassung (Martin 29.09.2026);
// mit ihnen führt „Weiter zur Unterschrift" nicht zur Unterschrift.
const fehltZeile = (name: RegExp) => screen.queryByRole('button', { name }) !== null;
const kommtZurUnterschrift = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));
  return screen.queryByRole('button', { name: /Vertrag jetzt unterschreiben/ }) !== null;
};

// Der Dialog merkt sich Eingaben im sessionStorage (je Bewerbung) — Tests sollen bei null anfangen.
beforeEach(() => window.sessionStorage.clear());

describe('AngebotPruefenModal — E-Mail-Format (Registry #52)', () => {
  it('KP-Mail „x@t-online.de@t-online.de" ⇒ als ungültig gelistet + Hinweis erst nach Blur; gültig ⇒ frei', async () => {
    const user = userEvent.setup();
    render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'catarina-stein@t-online.de@t-online.de' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(fehltZeile(/Kontaktperson: E-Mail ungültig/)).toBe(true);
    // Hinweis am Feld NICHT vor dem Verlassen des Feldes (kein Rot mitten im Tippen)
    expect(screen.queryByText(/gültige E-Mail-Adresse/)).toBeNull();
    const input = kpEmailInput();
    await user.click(input);
    await user.tab();
    expect(screen.getByText(/gültige E-Mail-Adresse/)).toBeTruthy();

    await user.clear(input);
    await user.type(input, 'catarina-stein@t-online.de');
    expect(screen.queryByText(/gültige E-Mail-Adresse/)).toBeNull();
    expect(fehltZeile(/Kontaktperson/)).toBe(false);
    expect(await kommtZurUnterschrift(user)).toBe(true);
  });

  it('LE-Mail bleibt optional: leer ⇒ frei, unbrauchbar ⇒ gelistet und keine Unterschrift', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'ok@example.de', email: '' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(screen.getByText('Alle Pflichtangaben vorhanden.')).toBeTruthy();
    unmount();
    window.sessionStorage.clear(); // sonst gewinnt der Entwurf des ersten Dialogs
    render(
      <AngebotPruefenModal app={makeApp()} prefill={{ ...prefill, kpEmail: 'ok@example.de', email: 'Michael.kopka @ Freenet.de' }} contractOnly
        onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
    );
    expect(fehltZeile(/Betreute Person: E-Mail ungültig/)).toBe(true);
    expect(await kommtZurUnterschrift(user)).toBe(false);
    // Nach dem Versuch steht der Hinweis am Feld, auch ohne Blur.
    expect(screen.getByText(/gültige E-Mail-Adresse/)).toBeTruthy();
  });
});
