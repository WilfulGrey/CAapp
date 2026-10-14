import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { FaqListe, FAQ, FAQ_ANGEBOT, FAQ_SCHLUESSEL } from '../../components/portal/FaqListe';

// Martin 08.10.2026: dieselben Fragen wie in der Angebotsmail („dass das sich deckt"). Die Bestpreis-Frage steht im Look
// „angebot" direkt nach den drei Grundfragen; die ersten vier sichtbaren Fragen bleiben unverändert.
describe('FaqListe, Look „angebot"', () => {
  it('Bestpreis-Frage nach den Grundfragen, die sichtbaren vier unverändert', () => {
    expect(FAQ_ANGEBOT.slice(0, 5).map((f) => f.q)).toEqual([
      'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
      'Was übernimmt die Pflegekraft, was ein Pflegedienst?',
      'Was brauche ich zu Hause?',
      'Wie läuft die Betreuung ab?',
      'Ich habe ein günstigeres Angebot. Was kann ich tun?',
    ]);
  });

  it('zeigt die Antwort im Wortlaut der Bestpreisgarantie', () => {
    render(<FaqListe karte />);
    expect(screen.queryByText('Ich habe ein günstigeres Angebot. Was kann ich tun?')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /weitere Fragen/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ich habe ein günstigeres Angebot/ }));
    expect(screen.getByText('Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot. Legen Sie uns das Angebot vor, wir passen unseren Preis an. Marta antwortet innerhalb eines Werktags.')).toBeTruthy();
  });
});

// Messpunkt `faq_geoeffnet` (Registry #123): kurzer Schlüssel je Frage, nie der Wortlaut, nur beim Aufklappen.
describe('FaqListe – Messpunkt beim Aufklappen', () => {
  it('jede Frage (FAQ und Look „angebot") hat einen eigenen, kurzen Schlüssel', () => {
    const fragen = [...new Set([...FAQ, ...FAQ_ANGEBOT].map((f) => f.q))];
    for (const q of fragen) expect(FAQ_SCHLUESSEL[q], q).toMatch(/^[a-z_]{3,20}$/);
    const schluessel = fragen.map((q) => FAQ_SCHLUESSEL[q]);
    expect(new Set(schluessel).size).toBe(schluessel.length);
  });

  it('meldet den Schlüssel beim Aufklappen, nicht beim Zuklappen (Karte)', () => {
    const onFrageGeoeffnet = vi.fn();
    render(<FaqListe karte onFrageGeoeffnet={onFrageGeoeffnet} />);
    const frage = screen.getByRole('button', { name: /Was brauche ich zu Hause/ });
    fireEvent.click(frage);
    fireEvent.click(frage);
    fireEvent.click(screen.getByRole('button', { name: /Was bedeuten die Deutsch-Niveaus/ }));
    expect(onFrageGeoeffnet.mock.calls).toEqual([['zuhause'], ['deutsch']]);
  });

  it('auch in der Liste ohne Karte; ohne Rückruf wie bisher', () => {
    const onFrageGeoeffnet = vi.fn();
    const { unmount } = render(<FaqListe onFrageGeoeffnet={onFrageGeoeffnet} />);
    fireEvent.click(screen.getByRole('button', { name: /Gehe ich mit dem Einladen einen Vertrag ein/ }));
    expect(onFrageGeoeffnet).toHaveBeenCalledWith('einladen_vertrag');
    unmount();
    render(<FaqListe karte />);
    fireEvent.click(screen.getByRole('button', { name: /Was brauche ich zu Hause/ }));
    expect(screen.getByText(/Ein eigenes, abschließbares Zimmer/)).toBeTruthy();
  });
});
