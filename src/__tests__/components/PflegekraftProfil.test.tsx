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

describe('PflegekraftProfil – Einsätze', () => {
  beforeEach(() => { _resetCache(); vi.restoreAllMocks(); });

  it('ohne geladenes Profil: Zahl der Liste, kein eigener Abruf', () => {
    const spy = vi.spyOn(client, 'callMamamia');
    render(<PflegekraftProfil nurse={nurse} onProfil={() => {}} />);
    expect(screen.getByText('Neu bei uns')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Profil im Cache mit mamamia-Einsatz: „1 Einsatz bei uns" statt „Neu bei uns"', async () => {
    vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: voll([fertig]) });
    await fetchCaregiver(31033);
    render(<PflegekraftProfil nurse={nurse} onProfil={() => {}} />);
    expect(screen.getByText('1 Einsatz bei uns')).toBeInTheDocument();
    expect(screen.queryByText('Neu bei uns')).toBeNull();
  });

  it('gerade woanders im Einsatz, keiner abgeschlossen: „Im Einsatz / bei einem anderen Kunden"', async () => {
    vi.spyOn(client, 'callMamamia').mockResolvedValue({ Caregiver: voll([{ ...fertig, status: 'on_job' }], true) });
    await fetchCaregiver(31033);
    render(<PflegekraftProfil nurse={nurse} onProfil={() => {}} />);
    expect(screen.getByText('Im Einsatz')).toBeInTheDocument();
    expect(screen.getByText('bei einem anderen Kunden')).toBeInTheDocument();
    expect(screen.queryByText('Neu bei uns')).toBeNull();
  });
});
