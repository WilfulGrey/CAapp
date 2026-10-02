import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchCard } from '../../components/portal/MatchCard';
import type { Nurse } from '../../types';

const nurse: Nurse = {
  id: 1,
  caregiverId: 50002,
  name: 'Helena Kowalski',
  age: 41,
  color: '#8B7355',
  experience: '5 J. Erfahrung',
  experienceYears: 5,
  language: { level: 'B1', bars: 3 },
  history: { assignments: 7, avgDurationMonths: 2 },
};

// Registry #109 (Martin 02.10.): Solange die Pflegesituation fehlt, steht auf jeder
// Pflegekraft-Karte „Profil vervollständigen & einladen" in Koralle über die volle Breite —
// kein Umriss-„Einladen" mit Schloss. Der Tipp geht nur an `onInvite` (das Portal springt dort
// ins Formular und liefert false), eingeladen wird nichts.
describe('MatchCard – Pflegesituation fehlt', () => {
  it('Koralle-Knopf über die volle Breite, kein Schloss, Tipp lädt nicht ein und öffnet kein Profil', async () => {
    const onInvite = vi.fn(() => false);
    const onInviteConfirm = vi.fn(async () => {});
    const onNurseClick = vi.fn();
    render(
      <MatchCard nurse={nurse} status="pending" profilFehlt onNurseClick={onNurseClick} onInvite={onInvite} onInviteConfirm={onInviteConfirm} />,
    );
    const knopf = screen.getByRole('button', { name: 'Profil vervollständigen & einladen' });
    expect(knopf.className).toMatch(/\bw-full\b/);
    expect(knopf.className).toMatch(/\bbg-pm-coral\b/);
    expect(screen.queryByRole('button', { name: 'Einladen' })).toBeNull();
    expect(knopf.querySelector('.lucide-lock')).toBeNull();

    await userEvent.click(knopf);
    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(onInviteConfirm).not.toHaveBeenCalled();
    expect(onNurseClick).not.toHaveBeenCalled();
    expect(screen.queryByText(/wird eingeladen/)).toBeNull();
  });

  it('nach dem Speichern unverändert: „Einladen" lädt ein', async () => {
    const onInviteConfirm = vi.fn(async () => {});
    render(<MatchCard nurse={nurse} status="pending" onNurseClick={() => {}} onInvite={() => true} onInviteConfirm={onInviteConfirm} />);
    expect(screen.queryByRole('button', { name: 'Profil vervollständigen & einladen' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Einladen' }));
    expect(onInviteConfirm).toHaveBeenCalledTimes(1);
  });
});
