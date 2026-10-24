import { describe, it, expect } from 'vitest';
import {
  linkToken,
  istSeiteMitLinkToken,
  LINK_TOKEN_COOKIE,
} from '../../project 3/lib/link-token';

// Registry #134: Abmelden, Rückmeldung und Feedback bekommen den Schlüssel aus
// dem Mail-Link per Cookie, die Middleware nimmt ihn aus der Adresse.

describe('istSeiteMitLinkToken', () => {
  it('kennt genau die drei Mail-Link-Seiten', () => {
    expect(istSeiteMitLinkToken('/abmelden')).toBe(true);
    expect(istSeiteMitLinkToken('/feedback')).toBe(true);
    expect(istSeiteMitLinkToken('/rueckmeldung')).toBe(true);
    expect(istSeiteMitLinkToken('/')).toBe(false);
    expect(istSeiteMitLinkToken('/abmelden/x')).toBe(false);
    expect(istSeiteMitLinkToken('/kalkulation/1')).toBe(false);
  });
});

describe('linkToken', () => {
  it('nimmt die Adresse zuerst', () => {
    expect(linkToken('?token=aus-adresse', `${LINK_TOKEN_COOKIE}=aus-cookie`)).toBe('aus-adresse');
  });

  it('sonst das Cookie, auch zwischen anderen', () => {
    expect(linkToken('?knopf=interesse', `pm_consent=x; ${LINK_TOKEN_COOKIE}=abc123; andere=1`)).toBe('abc123');
  });

  it('dekodiert den Cookie-Wert', () => {
    expect(linkToken('', `${LINK_TOKEN_COOKIE}=a%2Bb`)).toBe('a+b');
  });

  it('ohne beides: null', () => {
    expect(linkToken('', 'pm_consent=x')).toBeNull();
    expect(linkToken('', `${LINK_TOKEN_COOKIE}=`)).toBeNull();
  });

  it('verwechselt ähnliche Cookie-Namen nicht', () => {
    expect(linkToken('', `x${LINK_TOKEN_COOKIE}=falsch`)).toBeNull();
  });
});
