export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp?: number;
}

const CONSENT_STORAGE_KEY = 'primundus_cookie_consent';
const CONSENT_VERSION = '1.0';

// Eine Cookie-Leiste für primundus.de UND den Kostenrechner (Registry #99, 27.09.2026, Martin: „eins und zwei umsetzen“).
// localStorage gilt je Domain: Wer auf primundus.de schon „Alle akzeptieren“ oder „Nur notwendige“ gewählt hatte, bekam im
// Rechner dieselbe Leiste noch einmal — direkt vor Frage 1. Seit 25.09. beantworteten nur noch 3 von 10 Website-Besuchern
// Frage 1 (Anzeigen-Besucher 94 %). primundus.de schreibt die Wahl seit 27.09. zusätzlich ins Cookie `pm_consent` auf
// .primundus.de; der Rechner liest es als zweite Quelle (localStorage bleibt vorn) und schreibt jede eigene Wahl hinein.
// Wert: URL-kodiertes JSON {necessary, analytics, marketing[, timestamp]} — dieselbe Form wie auf primundus.de.
const COOKIE_NAME = 'pm_consent';
const COOKIE_DOMAIN = '.primundus.de';
const COOKIE_TAGE = 180;

function cookieLesen(): ConsentState | null {
  if (typeof document === 'undefined') return null;
  try {
    const teil = document.cookie.split('; ').find((c) => c.startsWith(COOKIE_NAME + '='));
    if (!teil) return null;
    const v = JSON.parse(decodeURIComponent(teil.slice(COOKIE_NAME.length + 1)));
    return typeof v?.necessary === 'boolean'
      ? { necessary: true, analytics: v.analytics === true, marketing: v.marketing === true }
      : null;
  } catch {
    return null;
  }
}

function cookieSchreiben(state: ConsentState | null): void {
  if (typeof document === 'undefined') return;
  // Auf *.onrender.com (Staging) und localhost ohne Domain: dort gilt das Cookie nur für den eigenen Host
  const aufDomain = location.hostname.endsWith('primundus.de') ? `; Domain=${COOKIE_DOMAIN}` : '';
  const sicher = location.protocol === 'https:' ? '; Secure' : '';
  try {
    document.cookie = state
      ? `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(state))}; Max-Age=${COOKIE_TAGE * 86400}; Path=/; SameSite=Lax${aufDomain}${sicher}`
      : `${COOKIE_NAME}=; Max-Age=0; Path=/${aufDomain}${sicher}`;
  } catch (error) {
    console.error('Error writing consent cookie:', error);
  }
}

export class CookieConsentManager {
  private static instance: CookieConsentManager;
  private consentState: ConsentState | null = null;
  private listeners: Array<(state: ConsentState) => void> = [];

  private constructor() {
    if (typeof window !== 'undefined') {
      this.loadConsent();
    }
  }

  static getInstance(): CookieConsentManager {
    if (!CookieConsentManager.instance) {
      CookieConsentManager.instance = new CookieConsentManager();
    }
    return CookieConsentManager.instance;
  }

  private loadConsent(): void {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.version === CONSENT_VERSION) {
          this.consentState = data.consent;
        }
      }
    } catch (error) {
      console.error('Error loading consent:', error);
    }
    // Zweite Quelle: die Wahl, die der Besucher schon auf primundus.de (oder hier) getroffen hat
    if (!this.consentState) this.consentState = cookieLesen();
  }

  saveConsent(consent: ConsentState): void {
    const consentWithTimestamp = {
      ...consent,
      timestamp: Date.now(),
    };

    this.consentState = consentWithTimestamp;

    try {
      localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({
          version: CONSENT_VERSION,
          consent: consentWithTimestamp,
        })
      );
    } catch (error) {
      console.error('Error saving consent:', error);
    }
    cookieSchreiben(consentWithTimestamp);

    this.notifyListeners(consentWithTimestamp);
  }

  getConsent(): ConsentState | null {
    return this.consentState;
  }

  hasConsent(): boolean {
    return this.consentState !== null;
  }

  hasCategory(category: ConsentCategory): boolean {
    if (!this.consentState) return false;
    return this.consentState[category] === true;
  }

  acceptAll(): void {
    this.saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  }

  acceptNecessary(): void {
    this.saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  }

  revokeConsent(): void {
    this.consentState = null;
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch (error) {
      console.error('Error revoking consent:', error);
    }
    // Widerruf gilt auch für primundus.de — dort erscheint die Leiste dann ebenfalls wieder
    cookieSchreiben(null);
    this.notifyListeners({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  }

  subscribe(listener: (state: ConsentState) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(state: ConsentState): void {
    this.listeners.forEach((listener) => listener(state));
    // CRO 15.08.: Window-Event zusätzlich zu den internen Listenern. Das
    // ga-consent-Inline-Script in app/layout.tsx wartet seit jeher auf
    // 'cookie-consent-changed' — dispatcht hat es aber nie jemand, weshalb
    // GA4 nach Einwilligung nur über den (jetzt entfernten) Full-Reload kam.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cookie-consent-changed', { detail: state })
      );
    }
  }
}

export const cookieConsent = CookieConsentManager.getInstance();
