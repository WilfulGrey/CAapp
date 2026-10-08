import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaqListe, FAQ_ANGEBOT } from '../../components/portal/FaqListe';

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
