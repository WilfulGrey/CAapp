import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FaqListe, FAQ, FAQ_ANGEBOT, FAQ_STAND_75B8DF8 } from '../../components/portal/FaqListe';

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

// Rückbau Registry #122: vor dem ersten Speichern die Fragen wie im Stand 75b8df8 — ohne die Bestpreis-Frage (#118).
describe('FaqListe, Stand 75b8df8 (FAQ_STAND_75B8DF8)', () => {
  it('genau die zwölf Fragen von damals, in derselben Reihenfolge', () => {
    expect(FAQ_STAND_75B8DF8.map((f) => f.q)).toEqual([
      'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
      'Was bedeutet „Einladen"?',
      'Gehe ich mit dem Einladen einen Vertrag ein?',
      'Kann ich jederzeit kündigen?',
      'Wie funktioniert die Abrechnung?',
      'Wie lange bleibt die Pflegekraft — und wie läuft der Wechsel?',
      'Was passiert, wenn die Pflegekraft ausfällt?',
      'Wie werden Reisekosten abgerechnet?',
      'Ist das legal?',
      'Mit wem wird der Vertrag geschlossen?',
      'Welche Kosten entstehen insgesamt?',
      'Kann ich die Pflegesachleistungen der Pflegekasse dafür einsetzen?',
    ]);
    // Die Antworten sind dieselben Objekte wie in FAQ (seit 75b8df8 unverändert).
    expect(FAQ_STAND_75B8DF8.every((f) => FAQ.includes(f))).toBe(true);
  });

  it('`fragen`: vier sichtbar, „8 weitere Fragen“; ohne `fragen` unverändert „9 weitere Fragen“', () => {
    const { unmount } = render(<FaqListe fragen={FAQ_STAND_75B8DF8} />);
    expect(screen.getByText('Gut zu wissen')).toBeTruthy();
    expect(screen.getByRole('button', { name: '8 weitere Fragen' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '8 weitere Fragen' }));
    expect(screen.queryByText('Ich habe ein günstigeres Angebot. Was kann ich tun?')).toBeNull();
    expect(screen.getByText('Kann ich die Pflegesachleistungen der Pflegekasse dafür einsetzen?')).toBeTruthy();
    unmount();
    render(<FaqListe />);
    expect(screen.getByRole('button', { name: `${FAQ.length - 4} weitere Fragen` })).toBeTruthy();
  });
});
