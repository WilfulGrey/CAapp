export type ConsentCategory = 'necessary' | 'analytics' | 'marketing';

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp?: number;
}

const CONSENT_STORAGE_KEY = 'primundus_cookie_consent';
const CONSENT_VERSION = '1.0';

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
