import { describe, expect, it } from 'vitest';
import {
  TELEFON_FEHLER,
  telefonBereinigen,
  telefonFehler,
  telefonGueltig,
  telefonZiffern,
} from '../../project 3/lib/telefon';

describe('telefonBereinigen', () => {
  it('lässt keine Buchstaben zu', () => {
    expect(telefonBereinigen('0171abc1234567')).toBe('01711234567');
    expect(telefonBereinigen('0171 123 oder 0151')).toBe('0171 123 0151');
  });

  it('behält die Trennzeichen, die Kunden und Autofill tippen', () => {
    expect(telefonBereinigen('+49 (0)171 / 123-4567')).toBe('+49 (0)171 / 123-4567');
  });

  it('erlaubt „+" nur ganz vorne', () => {
    expect(telefonBereinigen('0171+123')).toBe('0171123');
    expect(telefonBereinigen('++49 171')).toBe('+49 171');
  });
});

describe('telefonFehler', () => {
  it('akzeptiert die echten Formate aus den Anfragen', () => {
    for (const nr of ['01711234567', '+49 171 1234567', '0049 171 1234567', '030/1234567', '0821 1234', '+43 664 1234567']) {
      expect(telefonGueltig(nr), nr).toBe(true);
    }
  });

  it('lehnt leere, unvollständige und doppelte Nummern ab', () => {
    expect(telefonFehler('  ')).toBe(TELEFON_FEHLER.leer);
    expect(telefonFehler('040 123')).toBe(TELEFON_FEHLER.kurz);
    expect(telefonFehler('1234567')).toBe(TELEFON_FEHLER.kurz);
    expect(telefonFehler('0171 1234567 / 0151 12345678')).toBe(TELEFON_FEHLER.lang);
  });

  it('zählt die Einleitung 00 nicht mit', () => {
    expect(telefonZiffern('0049 171 1234567')).toBe('491711234567');
  });
});
