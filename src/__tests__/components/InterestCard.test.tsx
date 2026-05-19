import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterestCard } from '../../components/portal/InterestCard';
import type { Nurse } from '../../types';

function makeNurse(overrides: Partial<Nurse> = {}): Nurse {
  return {
    id: 1,
    caregiverId: 50001,
    name: 'Helena Kowalski',
    age: 45,
    color: '#8B7355',
    experience: '5 J. Erfahrung',
    experienceYears: 5,
    language: { level: 'B1', bars: 3 },
    history: { assignments: 7, avgDurationMonths: 2 },
    ...overrides,
  };
}

describe('InterestCard', () => {
  it('renders Einladen + Ablehnen buttons when status is idle', () => {
    render(
      <InterestCard
        nurse={makeNurse()}
        status="idle"
        onNurseClick={() => {}}
      />,
    );
    expect(screen.getByText(/Einladen/)).toBeTruthy();
    expect(screen.getByText(/Ablehnen/)).toBeTruthy();
  });

  it('shows "Hat Interesse" badge', () => {
    render(
      <InterestCard
        nurse={makeNurse()}
        status="idle"
        onNurseClick={() => {}}
      />,
    );
    expect(screen.getByText(/Hat Interesse/)).toBeTruthy();
  });

  it('Einladen click → onInviteConfirm called, shows "wird eingeladen" pill while pending', async () => {
    let resolve!: () => void;
    const onInviteConfirm = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(
      <InterestCard
        nurse={makeNurse()}
        status="idle"
        onNurseClick={() => {}}
        onInviteConfirm={onInviteConfirm}
      />,
    );

    await user.click(screen.getByText(/Einladen/));
    expect(onInviteConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/wird eingeladen/)).toBeTruthy();
    resolve();
    await waitFor(() => expect(screen.queryByText(/wird eingeladen/)).toBeNull());
  });

  it('Ablehnen click → onDismiss called', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <InterestCard
        nurse={makeNurse()}
        status="idle"
        onNurseClick={() => {}}
        onDismiss={onDismiss}
      />,
    );
    await user.click(screen.getByText(/Ablehnen/));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('status=invited renders confirmation pill, no Einladen button', () => {
    render(
      <InterestCard
        nurse={makeNurse()}
        status="invited"
        onNurseClick={() => {}}
      />,
    );
    expect(screen.getByText(/Einladung gesendet/)).toBeTruthy();
    expect(screen.queryByText(/^Einladen$/)).toBeNull();
  });

  it('Card body click triggers onNurseClick (Details panel)', () => {
    const onNurseClick = vi.fn();
    render(
      <InterestCard
        nurse={makeNurse()}
        status="idle"
        onNurseClick={onNurseClick}
      />,
    );
    fireEvent.click(screen.getByText(/Helena/));
    expect(onNurseClick).toHaveBeenCalledTimes(1);
  });
});
