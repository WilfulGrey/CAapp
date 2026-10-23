import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MatchCard } from '../../components/portal/MatchCard';
import { SprachBalken } from '../../components/portal/SprachBalken';
import type { Nurse } from '../../types';

function kraft(overrides: Partial<Nurse> = {}): Nurse {
  return {
    caregiverId: 50001,
    name: 'Helena Kowalski',
    age: 45,
    color: '#8B7355',
    experience: '5 J. Erfahrung',
    experienceYears: 5,
    language: { level: 'Gut', bars: 3 },
    history: { assignments: 7, avgDurationMonths: 2 },
    ...overrides,
  } as Nurse;
}

const gefuellt = (c: HTMLElement) => c.querySelectorAll('.bg-\\[\\#8B7355\\]').length;

describe('SprachBalken', () => {
  it('füllt genau so viele Balken wie die Stufe hergibt', () => {
    for (const [balken, erwartet] of [[1, 1], [2, 2], [3, 3]] as const) {
      const { container, unmount } = render(<SprachBalken balken={balken} />);
      expect(container.querySelectorAll('span > span').length).toBe(3);
      expect(gefuellt(container)).toBe(erwartet);
      unmount();
    }
  });
});

describe('Pflegekraft-Karte', () => {
  it('ist weiss, nicht grau — sie liegt in einem grauen Kasten', () => {
    const { container } = render(
      <MatchCard nurse={kraft()} status="pending" onNurseClick={() => {}} />,
    );
    const karte = container.querySelector('.group')!;
    expect(karte.className).toContain('bg-white');
    expect(karte.className).not.toContain('#F4F4F6');
  });

  it('zeigt Deutsch als Punkte im Profil („V", 27.09.2026)', () => {
    const { container } = render(
      <MatchCard nurse={kraft()} status="pending" onNurseClick={() => {}} />,
    );
    expect(container.textContent).toContain('Deutsch gut');
    expect(container.querySelectorAll('.bg-pm-taupe').length).toBe(3);
  });

  it('ohne bekannte Stufe keine leeren Punkte', () => {
    const { container } = render(
      <MatchCard nurse={kraft({ language: { level: 'Gut', bars: 0 } })} status="pending" onNurseClick={() => {}} />,
    );
    expect(container.querySelectorAll('.bg-pm-taupe, .bg-pm-profil-linie').length).toBe(0);
  });
});
