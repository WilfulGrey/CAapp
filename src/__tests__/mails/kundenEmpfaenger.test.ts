import { describe, it, expect } from 'vitest';
import { kundenEmpfaenger, kopieAdresse } from '../../../project 3/lib/empfaenger';

// Zweite Kundenadresse als CC (Martin, 03.09.2026: "die dürfen sich sehen").
// Der Helfer ist die EINE Stelle, die entscheidet, ob eine Kopie mitgeht —
// beide Sender (Next + Edge-Kopie) fragen ihn, statt es selbst zu raten.

describe('kundenEmpfaenger', () => {
  it('haengt die Kopie-Adresse als cc an', () => {
    expect(kundenEmpfaenger({ email: 'vater@example.de', email_cc: 'tochter@example.de' }))
      .toEqual({ to: 'vater@example.de', cc: 'tochter@example.de' });
  });

  it('ohne Kopie-Adresse bleibt es bei einem Empfaenger', () => {
    expect(kundenEmpfaenger({ email: 'vater@example.de' })).toEqual({ to: 'vater@example.de' });
    expect(kundenEmpfaenger({ email: 'vater@example.de', email_cc: '   ' })).toEqual({ to: 'vater@example.de' });
    expect(kundenEmpfaenger({ email: 'vater@example.de', email_cc: null })).toEqual({ to: 'vater@example.de' });
  });

  it('verwirft eine Kopie, die dem Hauptempfaenger gleicht — auch bei anderer Schreibweise', () => {
    expect(kundenEmpfaenger({ email: 'Vater@Example.de', email_cc: 'vater@example.de' })).toEqual({ to: 'Vater@Example.de' });
  });

  it('verwirft, was keine Adresse ist — ein Komma-Konstrukt gehoert hier nicht rein', () => {
    expect(kopieAdresse('a@x.de, b@y.de', 'vater@example.de')).toBeNull();
    expect(kopieAdresse('tochter@', 'vater@example.de')).toBeNull();
    expect(kopieAdresse('kein-at.de', 'vater@example.de')).toBeNull();
  });

  it('nimmt den ueberschriebenen Hauptempfaenger als Vergleichsbasis', () => {
    // Tippfehler-Fall: die Kette adressiert aus dem Lead, der Snapshot ist Fallback.
    expect(kundenEmpfaenger({ email: '', email_cc: 'tochter@example.de' }, 'vater@example.de'))
      .toEqual({ to: 'vater@example.de', cc: 'tochter@example.de' });
  });

  it('schneidet Leerraum weg', () => {
    expect(kundenEmpfaenger({ email: ' vater@example.de ', email_cc: ' tochter@example.de ' }))
      .toEqual({ to: 'vater@example.de', cc: 'tochter@example.de' });
  });
});
