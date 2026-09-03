import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MatchCard } from '../../components/portal/MatchCard';
import { DeutschZeile, SprachBalken } from '../../components/portal/SprachBalken';
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

  it('Reihenfolge wie im SA-Portal und in der Mail: Label, Balken, Wert', () => {
    const { container } = render(<DeutschZeile nurse={kraft()} />);
    // Kein „Deutsch Gut" mehr am Stück — die Balken stehen dazwischen.
    expect(container.textContent).toBe('DeutschGut');
    const kinder = Array.from(container.firstElementChild!.childNodes);
    expect(kinder[0].textContent).toContain('Deutsch');
    expect((kinder[1] as HTMLElement).querySelectorAll('span').length).toBe(3);
    expect(kinder[2].textContent).toBe('Gut');
  });

  it('ohne bekannte Stufe keine leeren Kästchen', () => {
    const { container } = render(<DeutschZeile nurse={kraft({ language: { level: '—', bars: 0 } })} />);
    expect(container.textContent).toBe('Deutsch—');
    expect(container.querySelectorAll('.rounded-full').length).toBe(0);
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

  it('zeigt die Sprachbalken auf der Karte', () => {
    const { container } = render(
      <MatchCard nurse={kraft()} status="pending" onNurseClick={() => {}} />,
    );
    expect(container.textContent).toContain('DeutschGut');
    expect(gefuellt(container)).toBe(3);
  });
});
