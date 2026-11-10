// Freitext mit Vorschlägen (Martin 10.11.2026): Antippen schreibt den Vorschlag in das Textfeld, nochmal antippen nimmt
// ihn heraus; gespeichert wird nur der Text.
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VorschlagText, enthaeltVorschlag, schalteVorschlag, passendeVorschlaege, VORSCHLAEGE } from '../../components/portal/VorschlagText';

describe('schalteVorschlag', () => {
  it('hängt an und nimmt wieder heraus', () => {
    expect(schalteVorschlag('', 'Kochen')).toBe('Kochen');
    expect(schalteVorschlag('Kochen', 'Haushalt')).toBe('Kochen, Haushalt');
    expect(schalteVorschlag('Kochen, Haushalt', 'Kochen')).toBe('Haushalt');
  });
  it('lässt eigenen Text stehen und hängt sauber an', () => {
    expect(schalteVorschlag('Blumen gießen,  ', 'Kochen')).toBe('Blumen gießen, Kochen');
    expect(schalteVorschlag('Blumen gießen, kochen', 'Kochen')).toBe('Blumen gießen');
  });
  it('erkennt nur ganze Einträge, Groß-/Kleinschreibung egal', () => {
    expect(enthaeltVorschlag('Körperpflege, kochen', 'Kochen')).toBe(true);
    expect(enthaeltVorschlag('Kochen am Wochenende', 'Kochen')).toBe(false);
  });
  it('erkennt Vorschläge auch nach Zeilenumbruch, Semikolon oder Punkt und nimmt nur sie heraus (Prüfung 10.11.)', () => {
    expect(enthaeltVorschlag('Toilettengang\nTrinken geben', 'Toilettengang')).toBe(true);
    expect(schalteVorschlag('Toilettengang\nTrinken geben', 'Toilettengang')).toBe('Trinken geben');
    expect(schalteVorschlag('Kochen; Garten gießen', 'Kochen')).toBe('Garten gießen');
    expect(enthaeltVorschlag('Körperpflege, Kochen.', 'Kochen')).toBe(true);
    expect(schalteVorschlag('Körperpflege, Kochen.', 'Kochen')).toBe('Körperpflege');
    // eigener Text bleibt Zeichen für Zeichen stehen (Zeilenumbrüche, doppelte Leerzeichen)
    expect(schalteVorschlag('Garten  gießen\nBlumen, Kochen', 'Kochen')).toBe('Garten  gießen\nBlumen');
    expect(schalteVorschlag('Kochen, Garten  gießen\nBlumen', 'Kochen')).toBe('Garten  gießen\nBlumen');
    // nicht doppelt einfügen, wenn er nach einem Umbruch steht
    expect(schalteVorschlag('Toilettengang\n', 'Toilettengang')).toBe('');
  });
  it('blendet unpassende Vorschläge aus, außer sie stehen schon im Text', () => {
    expect(passendeVorschlaege(['zu Fuß', 'Auto'], '', ['Auto'])).toEqual(['zu Fuß']);
    expect(passendeVorschlaege(['zu Fuß', 'Auto'], 'Auto', ['Auto'])).toEqual(['zu Fuß', 'Auto']);
  });
  it('keine Beschriftung enthält ein Trennzeichen (sonst zerfiele sie beim Herausnehmen)', () => {
    for (const liste of Object.values(VORSCHLAEGE)) for (const v of liste) expect(v).not.toMatch(/[,;\n.]/);
  });
});

function Rahmen({ start = '' }: { start?: string }) {
  const [wert, setWert] = useState(start);
  return <VorschlagText wert={wert} onWert={setWert} vorschlaege={['Kochen', 'Haushalt']} name="Aufgaben der Pflegekraft" feldKlasse="" />;
}

describe('VorschlagText', () => {
  it('Textfeld erst nach dem ersten Tipp, dann steht der Vorschlag darin', async () => {
    render(<Rahmen />);
    expect(screen.queryByRole('textbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Kochen' }));
    expect(screen.getByRole('textbox', { name: 'Aufgaben der Pflegekraft' })).toHaveValue('Kochen');
    expect(screen.getByRole('button', { name: 'Kochen' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Haushalt' }));
    expect(screen.getByRole('textbox')).toHaveValue('Kochen, Haushalt');
    await userEvent.click(screen.getByRole('button', { name: 'Kochen' }));
    expect(screen.getByRole('textbox')).toHaveValue('Haushalt');
  });
  it('„Weiteres“ öffnet das leere Feld zum Schreiben; der Kunde kann ergänzen', async () => {
    render(<Rahmen />);
    await userEvent.click(screen.getByRole('button', { name: 'Weiteres' }));
    const feld = screen.getByRole('textbox');
    expect(feld).toHaveFocus();
    await userEvent.type(feld, 'Blumen gießen');
    await userEvent.click(screen.getByRole('button', { name: 'Kochen' }));
    expect(feld).toHaveValue('Blumen gießen, Kochen');
    // Feld bleibt, auch wenn der Kunde alles löscht.
    await userEvent.clear(feld);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
  it('alter Freitext: Feld sofort sichtbar, passende Vorschläge gewählt', () => {
    render(<Rahmen start="Haushalt, Garten" />);
    expect(screen.getByRole('textbox')).toHaveValue('Haushalt, Garten');
    expect(screen.getByRole('button', { name: 'Haushalt' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Kochen' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Weiteres' })).toBeNull();
  });
});
