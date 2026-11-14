import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PflegekraftProfil } from '../../components/portal/PflegekraftProfil';
import { fetchCaregiver, _resetCache } from '../../lib/mamamia/caregiverCache';
import * as client from '../../lib/mamamia/client';
import type { Nurse } from '../../types';

// Registry #127: Die Karte zählt Einsätze wie das Profil-Fenster, sobald das
// volle Profil (mit Departures) im Cache liegt — ohne eigenen Abruf.
const nurse = {
  caregiverId: 31033, name: 'Anna G.', age: 40, experience: '2 J. Erfahrung', experienceYears: 2,
  availability: 'ab sofort', availableSoon: true, language: { level: 'Mittel', bars: 2 },
  color: '#fff', addedTime: '', isLive: false, gender: 'female',
} as Nurse; // Liste: hp_total_jobs = 0 ⇒ keine history

const voll = (einsaetze: unknown[], onOtherJob = false) => ({
  id: 31033, first_name: 'Anna', last_name: 'G.', gender: 'female', year_of_birth: 1986,
  germany_skill: 'level_2', care_experience: '2', hp_total_jobs: 0, hp_total_days: 0, hp_avg_mission_days: 0,
  hobbies: [], personalities: [], mobilities: [], languagables: [], nationality: null,
  einsaetze, on_other_job: onOtherJob,
});
const fertig = { arrival_date: '2026-04-10 00:00:00', departure_date: '2026-05-11 00:00:00', duration_days: 31, status: 'finish', zip_code: '10115', city: 'Berlin' };

// Registry #164 (Martin 14.11.2026: „überall angleichen … immer die, die wir jetzt haben, mit dem Foto, mit den 3 Infos“; zu
// den Stufen: „das versteht kein Mensch“): Der Kopf jeder Karte ist die Zeile der Liste. Keine Stufe, keine Einsätze-Zahl,
// kein „Neu bei uns“/„Im Einsatz“, auch wenn das volle Profil im Cache liegt.
describe('PflegekraftProfil – Kopf wie die Zeile der Liste (Registry #164)', () => {
  beforeEach(() => { _resetCache(); vi.restoreAllMocks(); });

  it('ohne geladenes Profil: „Vorname, Alter“, Erfahrung, Deutsch, Pfeil; keine Stufe, keine Einsätze; kein eigener Abruf', () => {
    const spy = vi.spyOn(client, 'callMamamia');
    const { container } = render(<PflegekraftProfil nurse={nurse} onProfil={() => {}} />);
    const kopf = screen.getByTestId('pflegekraft-profil');
    // Ohne Foto die Initialen (für Vorleseprogramme ausgeblendet), daneben die drei Angaben.
    const ohneInitialen = kopf.cloneNode(true) as HTMLElement;
    ohneInitialen.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
    expect(ohneInitialen.textContent).toBe('Anna, 402 Jahre ErfahrungDeutsch Mittel');
    expect(kopf).toHaveAccessibleName('Profil von Anna G. ansehen');
    expect(container.textContent).not.toMatch(/Elite|Stammkraft|Einsatz|Einsätze|Neu bei uns|Profil ansehen|ab sofort/);
    expect(spy).not.toHaveBeenCalled();
  });

  it('auch mit Profil im Cache (Einsatz bei uns, gerade woanders im Einsatz) keine Einsätze-Angabe', async () => {
    vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: voll([fertig, { ...fertig, status: 'on_job' }], true) });
    await fetchCaregiver(31033);
    const { container } = render(<PflegekraftProfil nurse={nurse} onProfil={() => {}} />);
    expect(container.textContent).not.toMatch(/Einsatz|Einsätze|Neu bei uns|Im Einsatz|anderen Kunden/);
    expect(screen.getByText('Deutsch Mittel')).toBeInTheDocument();
  });

  it('Tipp und Enter öffnen das Profil', async () => {
    const onProfil = vi.fn();
    render(<PflegekraftProfil nurse={nurse} onProfil={onProfil} />);
    const kopf = screen.getByTestId('pflegekraft-profil');
    kopf.click();
    kopf.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onProfil).toHaveBeenCalledTimes(2);
  });
});
