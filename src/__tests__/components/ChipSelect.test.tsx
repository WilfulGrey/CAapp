import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipSelect, chipSpalten } from '../../components/portal/ChipSelect';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChipSelect', () => {
  it('wählt aus, wählt wieder ab und meldet aria-pressed', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<ChipSelect value="" onChange={onChange} options={['Ja', 'Nein']} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ja' }));
    expect(onChange).toHaveBeenLastCalledWith('Ja');

    rerender(<ChipSelect value="Ja" onChange={onChange} options={['Ja', 'Nein']} />);
    const ja = screen.getByRole('button', { name: 'Ja' });
    expect(ja).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(ja);
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('zeigt kurze Beschriftungen, speichert aber den unveränderten Wert', async () => {
    const onChange = vi.fn();
    render(
      <ChipSelect
        value=""
        onChange={onChange}
        options={['Kein/e', 'Pflegegrad 1', 'Pflegegrad 2']}
        labels={{ 'Kein/e': 'Keiner', 'Pflegegrad 1': '1', 'Pflegegrad 2': '2' }}
      />,
    );
    expect(screen.queryByText('Pflegegrad 1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onChange).toHaveBeenLastCalledWith('Pflegegrad 1');
  });

  it('markiert ein leeres Pflichtfeld mit data-invalid', () => {
    const { container } = render(<ChipSelect value="" onChange={() => {}} options={['Ja', 'Nein']} invalid />);
    expect(container.querySelector('[data-invalid="1"]')).not.toBeNull();
  });

  it('holt nach der ersten Auswahl das nächste Feld in den Blick, beim Ändern nicht', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <div>
        <div data-field="heben"><ChipSelect value="" onChange={onChange} options={['Ja', 'Nein']} /></div>
        <p>Zwischentext ohne Feld</p>
        <div data-field="demenz" data-testid="naechstes"><span>Demenz</span></div>
      </div>,
    );
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Ja' }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByTestId('naechstes'));

    // Ein bereits beantwortetes Feld umstellen springt nicht weg.
    rerender(
      <div>
        <div data-field="heben"><ChipSelect value="Ja" onChange={onChange} options={['Ja', 'Nein']} /></div>
        <div data-field="demenz"><span>Demenz</span></div>
      </div>,
    );
    scroll.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Nein' }));
    expect(scroll).not.toHaveBeenCalled();
  });
});

describe('chipSpalten', () => {
  it('zwei Optionen nebeneinander', () => {
    expect(chipSpalten(['Männlich', 'Weiblich'])).toBe(2);
    expect(chipSpalten(['Ja (nur Draußen)', 'Nein'])).toBe(2);
  });
  it('kurze Beschriftungen in drei Spalten', () => {
    expect(chipSpalten(['Keiner', '1', '2', '3', '4', '5'])).toBe(3);
    expect(chipSpalten(['Egal', 'Weiblich', 'Männlich'])).toBe(3);
    expect(chipSpalten(['bis 50', '51–60', '61–70', '71–80', '81–90', '91–100', 'über 100'])).toBe(3);
  });
  it('vier Optionen als 2 × 2', () => {
    expect(chipSpalten(['Keine', 'Hund', 'Katze', 'Andere'])).toBe(2);
    expect(chipSpalten(['Nein', 'Leichtgradig', 'Mittelgradig', 'Schwer'])).toBe(2);
  });
  it('lange Beschriftungen als ganze Zeilen', () => {
    expect(chipSpalten(['Einfamilienhaus', 'Wohnung in Mehrfamilienhaus', 'Andere'])).toBe(1);
    expect(chipSpalten(['Vollständig mobil', 'Am Gehstock', 'Rollatorfähig', 'Rollstuhlfähig', 'Bettlägerig'])).toBe(1);
  });
});
