import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchCardVorSpeichern } from '../../components/portal/MatchCardVorSpeichern';
import type { Nurse } from '../../types';

const nurse: Nurse = {
  id: 1,
  caregiverId: 50002,
  name: 'Helena Kowalski',
  age: 41,
  color: '#8B7355',
  experience: '5 J. Erfahrung',
  experienceYears: 5,
  language: { level: 'Gut', bars: 3 },
  history: { assignments: 7, avgDurationMonths: 2 },
};

// Rückbau Registry #122: die Karte vor dem ersten Speichern wie im Stand 75b8df8 — „Einladen“ als Umriss-Knopf mit
// Schloss; der Tipp geht nur an `onInvite` (das Portal öffnet dort „Warum erst die Pflegesituation?“ und liefert false).
describe('MatchCardVorSpeichern – Stand 75b8df8', () => {
  it('Pflegesituation fehlt: „Einladen“ mit Schloss als Umriss-Knopf; Tipp lädt nicht ein und öffnet kein Profil', async () => {
    const onInvite = vi.fn(() => false);
    const onInviteConfirm = vi.fn(async () => {});
    const onNurseClick = vi.fn();
    render(
      <MatchCardVorSpeichern nurse={nurse} status="pending" profilFehlt onNurseClick={onNurseClick} onInvite={onInvite} onInviteConfirm={onInviteConfirm} />,
    );
    const knopf = screen.getByRole('button', { name: 'Einladen' });
    expect(knopf.querySelector('.lucide-lock')).not.toBeNull();
    expect(knopf.className).toContain('bg-white');
    expect(knopf.className).toContain('border-[#CDBFA8]');
    expect(knopf.className).not.toMatch(/\bw-full\b/);
    expect(screen.queryByRole('button', { name: 'Profil vervollständigen & einladen' })).toBeNull();

    await userEvent.click(knopf);
    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(onInviteConfirm).not.toHaveBeenCalled();
    expect(onNurseClick).not.toHaveBeenCalled();
    expect(screen.queryByText(/wird eingeladen/)).toBeNull();
  });

  it('Kopf wie damals: Name, Alter, „Deutsch“ mit Balken und Stufe, Stufe + Fakten; Tipp auf die Karte öffnet das Profil', async () => {
    const onNurseClick = vi.fn();
    render(<MatchCardVorSpeichern nurse={nurse} status="pending" profilFehlt onNurseClick={onNurseClick} onInvite={() => false} />);
    expect(screen.getByText('Helena K.')).toBeInTheDocument();
    expect(screen.getByText(', 41')).toBeInTheDocument();
    const deutsch = screen.getByText('Deutsch', { exact: false });
    expect(deutsch.textContent).toBe('DeutschGut');
    // Drei Balken (SprachBalken) zwischen „Deutsch“ und der Stufe.
    expect(deutsch.querySelector('span')!.children).toHaveLength(3);
    expect(screen.getByText(/Einsätze über Primundus/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Helena K.'));
    expect(onNurseClick).toHaveBeenCalledTimes(1);
  });

  it('Empfehlung als Zeile ÜBER der Karte („Unsere Empfehlung für Sie“), Karte mit kräftigerem Rand', () => {
    const { container } = render(<MatchCardVorSpeichern nurse={nurse} status="pending" isRecommended profilFehlt onNurseClick={() => {}} />);
    const zeile = screen.getByText('Unsere Empfehlung für Sie');
    expect(zeile.tagName).toBe('P');
    const karte = container.querySelector('.rounded-card')!;
    expect(karte.contains(zeile)).toBe(false);
    expect(karte.className).toContain('border-[1.5px]');
  });

  it('mit gespeicherter Pflegesituation (nicht im Rückbau genutzt, wie damals): Koralle-„Einladen“ lädt ein', async () => {
    const onInviteConfirm = vi.fn(async () => {});
    render(<MatchCardVorSpeichern nurse={nurse} status="pending" onNurseClick={() => {}} onInvite={() => true} onInviteConfirm={onInviteConfirm} />);
    const knopf = screen.getByRole('button', { name: 'Einladen' });
    expect(knopf.querySelector('.lucide-lock')).toBeNull();
    expect(knopf.className).toContain('bg-pm-coral');
    await userEvent.click(knopf);
    expect(onInviteConfirm).toHaveBeenCalledTimes(1);
  });
});
