/** @vitest-environment jsdom */
// Registry #88 (Fall Hümmer): die Anrede des Leistungsempfängers geht als
// contract_patient.salutation an StoreConfirmation — dort Pflicht und nur
// 'Mr.'/'Mrs.'. „Divers" (gewählt für ein Ehepaar) ließ Mamamia den Akzept
// ablehnen. Ein Prefill außerhalb von Frau/Herr (in der DB steht z. B.
// patient_anrede „Familie") darf nicht still als „Frau" angezeigt und als
// „Familie" gesendet werden.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngebotPruefenModal } from '../../components/portal/AngebotPruefenModal';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

const app: Application = {
  id: '13721',
  nurse: {
    id: 1, caregiverId: 25407, name: 'Halina J.', age: 60, color: '#8B7355',
    experience: '5 J. Erfahrung', experienceYears: 5, language: { level: 'B1', bars: 3 },
    history: { assignments: 7, avgDurationMonths: 2 }, availability: '', availableSoon: false,
    addedTime: '', isLive: false, gender: 'female',
  } as unknown as Nurse,
  agencyName: 'Pflegeagentur', appliedAt: '—', status: 'new', message: '',
  offer: {
    monatlicheKosten: 2650, anreisedatum: '01.10.2026', abreisedatum: '15.12.2026',
    anreisekosten: 125, abreisekosten: 125, reisetage: 'Halb', feiertagszuschlag: 88,
    kuendigungsfrist: 'Täglich kündbar', submittedAt: '25.09.2026',
  },
};

const prefill = {
  vorname: 'Margareta und Jakob', nachname: 'Zöcklein', strasse: 'Holnstein Weg 4', einsatzort: '96120 Bischberg',
  telefon: '0175', email: '', agGleich: true,
  kpVorname: 'Theresia', kpNachname: 'Hümmer', kpTelefon: '0175', kpEmail: 'th@example.de',
};

// Erste Auswahlliste = Anrede des Leistungsempfängers.
const leAnrede = () => screen.getAllByRole('combobox')[0] as HTMLSelectElement;
const gesperrt = () => screen.queryByText(/Kundendaten vollständig ausfüllen/) !== null;

function renderModal(anrede?: string) {
  render(
    <AngebotPruefenModal app={app} prefill={{ ...prefill, ...(anrede ? { anrede } : {}) }} contractOnly
      onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={vi.fn()} />,
  );
}

describe('AngebotPruefenModal — Anrede Leistungsempfänger (Registry #88)', () => {
  it('bietet nur Frau und Herr an, kein „Divers"', () => {
    renderModal('Frau');
    const werte = Array.from(leAnrede().options).map((o) => o.textContent);
    expect(werte).toEqual(['Frau', 'Herr']);
  });

  it('Prefill „Familie" ⇒ leer, Unterschrift gesperrt, bis der Kunde Frau oder Herr wählt', async () => {
    const user = userEvent.setup();
    renderModal('Familie');
    expect(leAnrede().value).toBe('');
    expect(gesperrt()).toBe(true);
    await user.selectOptions(leAnrede(), 'Herr');
    expect(leAnrede().value).toBe('Herr');
    expect(gesperrt()).toBe(false);
  });
});
