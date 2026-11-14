/** @vitest-environment jsdom */
// Fenster „Bewerbung ablehnen“ (Registry #164, Code-Prüfung 14.11.2026): Pflegekraft wie die Zeile der Liste, ohne Stufe und
// Einsätze; Knopf „Ablehnen“ in Koralle statt Rot, erst mit Grund aktiv.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeclineConfirmModal } from '../../components/portal/DeclineConfirmModal';
import type { Application } from '../../components/portal/shared';

const app = {
  id: 'a1', agencyName: 'Primundus', appliedAt: '', status: 'new', message: '',
  nurse: {
    caregiverId: 1, name: 'Maria Kowalska', age: 62, experience: '', experienceYears: 6, availability: 'sofort verfügbar',
    availableSoon: true, language: { level: 'Gut', bars: 3 }, color: '#8B7355', addedTime: '', isLive: true, gender: 'female',
    history: { assignments: 14, avgDurationMonths: 2 },
  },
  offer: { monatlicheKosten: 2850, anreisedatum: '', abreisedatum: '', anreisekosten: 125, abreisekosten: 125, reisetage: '', feiertagszuschlag: 0, kuendigungsfrist: '', submittedAt: '' },
} as Application;

describe('DeclineConfirmModal (Registry #164)', () => {
  it('Pflegekraft als Zeile ohne Stufe, Einsätze und Verfügbarkeit; „Ablehnen“ in Koralle, erst mit Grund', async () => {
    const onConfirm = vi.fn();
    const { container } = render(<DeclineConfirmModal app={app} onCancel={() => {}} onConfirm={onConfirm} />);
    const kraft = container.querySelector('[data-ablehnen-pflegekraft]') as HTMLElement;
    // Ohne Foto die Initialen (für Vorleseprogramme ausgeblendet).
    const ohneInitialen = kraft.cloneNode(true) as HTMLElement;
    ohneInitialen.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
    expect(ohneInitialen.textContent).toBe('Maria, 626 Jahre ErfahrungDeutsch Gut');
    expect(container.textContent).not.toMatch(/Elite|Stammkraft|Einsätze|verfügbar/);
    const knopf = screen.getByRole('button', { name: 'Ablehnen' });
    expect(knopf.className).toContain('bg-pm-coral');
    expect(container.innerHTML).not.toMatch(/bg-red-|text-red-/);
    expect(knopf).toBeDisabled();
    await userEvent.setup().type(screen.getByRole('textbox'), 'Passt leider nicht.');
    await userEvent.setup().click(knopf);
    expect(onConfirm).toHaveBeenCalledWith('Passt leider nicht.');
  });
});
