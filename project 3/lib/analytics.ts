import { cookieConsent } from './cookie-consent';

/*
 * Geschrieben wird ueber die EIGENE Domain, nicht direkt nach Supabase.
 *
 * Bis 23.08.2026 lief jeder dieser neun Schreibzugriffe als Anfrage an eine
 * fremde Herkunft (…supabase.co). Bei Safari-Nutzern kam davon nichts an:
 *
 *   Fetch API cannot load https://<ref>.supabase.co/rest/v1/analytics_sessions
 *   ?select=id due to access control checks.
 *
 * Vor Supabase haengt Cloudflare und setzt zur Bot-Erkennung einen Cookie
 * auf supabase.co; Safari blockiert Cross-Site-Cookies, Cloudflare weist ab,
 * und die Absage traegt keine CORS-Kopfzeilen. Der Server ist in Ordnung —
 * die OPTIONS-Vorabfrage antwortet mit 200 und `allow-origin: *`, und in
 * Chrome tritt der Fehler nicht auf. Es lag ausschliesslich am Weg.
 *
 * Folge war ein Totalausfall fuer alle iPhones, iPads und Safari-Macs:
 * schon die Session entstand nicht, damit blieb `sessionDbId` leer, und
 * jedes Event landete in einer Warteschlange, die nie geleert wurde.
 *
 * Ueber /api/analytics/collect ist es dieselbe Herkunft — kein CORS, kein
 * fremder Cookie, keine Bot-Pruefung dazwischen. Nebenbei verschwindet
 * damit der zweite Supabase-Client im Browser („Multiple GoTrueClient
 * instances detected"), denn dieses Modul braucht gar keinen mehr.
 */
async function senden(nutzlast: Record<string, unknown>): Promise<any | null> {
  try {
    const res = await fetch('/api/analytics/collect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nutzlast),
      // Ueberlebt eine Navigation, die mitten im Senden passiert.
      keepalive: true,
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    // Messung darf nie etwas kaputtmachen.
    return null;
  }
}

interface SessionData {
  sessionId: string;
  fingerprint: string;
  userAgent: string;
  referrer: string;
  landingPage: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  deviceType: string;
  browser: string;
  os: string;
}

// Kampagnen-Parameter, die Google Ads (UTM-Suffix + Auto-Tagging) an die
// Landing-URL hängt. utm_source/medium/campaign stehen direkt auf dem
// Session-Insert (Spalten existieren seit jeher); die hier gelisteten
// werden per best-effort Update nachgetragen (Bug #33 — fail-soft, damit
// Sessions auch dann entstehen, wenn die Migration noch nicht appliziert
// ist) und in sessionStorage gemerkt, damit der Angebot-Submit die
// Klick-IDs Minuten später noch an den Lead hängen kann.
const AD_PARAM_KEYS = ['gclid', 'wbraid', 'gbraid', 'utm_term', 'utm_content'] as const;
type AdParams = Partial<Record<(typeof AD_PARAM_KEYS)[number], string>>;
const AD_PARAMS_KEY = '_prim_ad_params';

/** Pfad der ausgelieferten Test-Variante (siehe middleware.ts). */
export function variantenSeite(): string {
  if (typeof document === 'undefined') return '/';
  const echt = window.location.pathname;
  // Nur auf der Startseite greift die Weiche — Unterseiten bleiben sie selbst.
  if (echt !== '/') return echt;
  const v = /(?:^|;\s*)pm_variante=([ABC])(?:;|$)/.exec(document.cookie || '');
  return v ? ({ A: '/', B: '/kosten-berechnen', C: '/sofortangebot' } as Record<string, string>)[v[1]] : echt;
}

export interface CriticalSubmitInput {
  step: number;
  stepName: string;
  timeOnStepSeconds?: number;
  conversion?: {
    leadId?: string;
    conversionType: string;
    conversionValue?: number;
    formData?: any;
  };
}

class Analytics {
  private sessionId: string | null = null;
  private sessionDbId: string | null = null;
  private fingerprint: string | null = null;
  private startTime: number = Date.now();
  private lastPageView: string | null = null;
  private pageViewStartTime: number = Date.now();
  private formFieldTimes: Map<string, number> = new Map();
  // Events fired before createOrUpdateSession() set sessionDbId — e.g. the
  // wizard's step-1 step_view on mount. Replayed by flushPendingEvents().
  private pendingEvents: Array<() => void> = [];
  // Guard: Pageview/consent_choice nur einmal nachholen, auch wenn der
  // Nutzer die Einstellungen mehrfach speichert.
  private consentReplayed = false;
  // Scroll-Tiefe: erreichte Schwellen dieser Seite (einmal pro Pageview).
  private scrollDepthsFired = new Set<number>();

  private flushPendingEvents() {
    if (this.pendingEvents.length === 0) return;
    const queued = this.pendingEvents;
    this.pendingEvents = [];
    queued.forEach(fn => fn());
  }

  async init() {
    if (typeof window === 'undefined') return;

    this.sessionId = this.getOrCreateSessionId();
    this.rememberAdParams();

    /* Der Fingerprint stand bis 23.08. VOR dem ersten Datenbank-Aufruf —
       ohne try/catch und mit `await`. Ein Beiwerk konnte damit die gesamte
       Messung aufhalten: wirft oder haengt `crypto.subtle`, kommt es nie
       zur Session und danach zu gar nichts mehr. Jetzt ist er abgesichert
       und darf ausfallen, ohne den Rest mitzunehmen. */
    try {
      this.fingerprint = await this.generateFingerprint();
    } catch (error) {
      console.warn('[Analytics] Fingerprint übersprungen:', error);
      this.fingerprint = 'unavailable';
    }

    const sessionData = this.collectSessionData();
    await this.createOrUpdateSession(sessionData);
    await this.persistAdParams();

    this.trackPageView();
    this.setupPageViewTracking();
    this.setupEventListeners();

    cookieConsent.subscribe((consent) => {
      if (!consent.analytics) {
        console.log('[Analytics] Analytics consent revoked, stopping tracking');
      } else {
        console.log('[Analytics] Analytics consent granted, tracking enabled');
        // CRO 15.08.: Das Banner lädt die Seite nicht mehr neu. Alles, was
        // vor der Einwilligung am Consent-Gate abprallte (Pageview der
        // Landung), wird hier einmalig nachgeholt, sonst fehlte die Session
        // im Funnel. consent_choice macht die Einwilligung selbst zählbar —
        // Ablehnungen bleiben konsequent untrackt (kein Event ohne Consent).
        if (!this.consentReplayed) {
          this.consentReplayed = true;
          this.trackPageView();
          this.trackEvent('consent', 'consent_choice', {
            analytics: true,
            marketing: consent.marketing === true,
          });
        }
      }
    });

    this.setupScrollDepthTracking();
  }

  private hasAnalyticsConsent(): boolean {
    return cookieConsent.hasCategory('analytics');
  }

  /** Fuer Komponenten, die ein Event erst nach der Einwilligung feuern duerfen. */
  hasConsent(): boolean {
    return this.hasAnalyticsConsent();
  }

  private getOrCreateSessionId(): string {
    const SESSION_KEY = '_prim_session';
    let sessionId = sessionStorage.getItem(SESSION_KEY);

    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }

    return sessionId;
  }

  private async generateFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      new Date().getTimezoneOffset(),
      screen.width,
      screen.height,
      screen.colorDepth,
    ];

    const fingerprint = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private collectSessionData(): SessionData {
    const urlParams = new URLSearchParams(window.location.search);
    const ua = navigator.userAgent;

    return {
      sessionId: this.sessionId!,
      fingerprint: this.fingerprint!,
      userAgent: ua,
      referrer: document.referrer || 'direct',
      /* Welche Variante der Besucher gesehen hat — NICHT die Adresse.
         Die Weiche in middleware.ts liefert A/B/C alle unter „/" aus
         (Rewrite, damit Google dieselbe Landingpage sieht wie in der
         Anzeige). window.location.pathname wäre deshalb für alle drei „/"
         und der Test nicht auswertbar. Das Cookie `pm_variante` trägt die
         Wahrheit; ohne Cookie (Direktaufruf einer Unterseite) bleibt es
         beim echten Pfad. */
      landingPage: variantenSeite(),
      utmSource: urlParams.get('utm_source') || undefined,
      utmMedium: urlParams.get('utm_medium') || undefined,
      utmCampaign: urlParams.get('utm_campaign') || undefined,
      deviceType: this.getDeviceType(),
      browser: this.getBrowser(ua),
      os: this.getOS(ua),
    };
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  }

  private getBrowser(ua: string): string {
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    if (ua.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  private getOS(ua: string): string {
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac OS')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS')) return 'iOS';
    return 'Unknown';
  }

  private async createOrUpdateSession(data: SessionData) {
    // Anlegen und Auffrischen entscheidet jetzt der Server (siehe `senden`);
    // zurueck kommt die Zeilen-Id, an der alles Weitere haengt.
    const antwort = await senden({ kind: 'session', data });
    this.sessionDbId = antwort?.id ?? null;
    if (!this.sessionDbId) {
      console.warn('[Analytics] Keine Session-Id erhalten — Events werden gepuffert.');
    }
    // Id steht — nachholen, was vorher in die Warteschlange ging.
    if (this.sessionDbId) this.flushPendingEvents();
  }

  private setupPageViewTracking() {
    let lastPath = window.location.pathname;

    const observer = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        this.trackPageView();
        lastPath = window.location.pathname;
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('popstate', () => {
      this.trackPageView();
    });
  }

  async trackPageView(pagePath?: string, pageTitle?: string) {
    if (!this.sessionDbId) return;
    if (!this.hasAnalyticsConsent()) {
      console.log('[Analytics] Skipping page view tracking - no consent');
      return;
    }

    const timeOnPreviousPage = this.lastPageView
      ? Math.round((Date.now() - this.pageViewStartTime) / 1000)
      : 0;

    const currentPath = pagePath || window.location.pathname;
    const currentTitle = pageTitle || document.title;

    // Ein Aufruf statt zwei: die Verweildauer der vorherigen Seite traegt
    // der Server nach, bevor er die neue anlegt.
    await senden({
      kind: 'page_view',
      sessionId: this.sessionDbId,
      pagePath: currentPath,
      pageTitle: currentTitle,
      previousPath: this.lastPageView,
      timeOnPrevious: timeOnPreviousPage,
    });

    this.lastPageView = currentPath;
    this.pageViewStartTime = Date.now();
    // Neue Seite -> Scroll-Schwellen neu zaehlen (SPA-Navigation).
    this.scrollDepthsFired.clear();
  }

  async trackEvent(eventType: string, eventName: string, eventData?: any) {
    if (!this.sessionDbId) {
      // Fired before the analytics session finished initialising (e.g. the
      // wizard's step-1 step_view on mount). Queue it — flushPendingEvents()
      // replays it once the session id is available, instead of dropping it.
      this.pendingEvents.push(() => this.trackEvent(eventType, eventName, eventData));
      return;
    }
    if (!this.hasAnalyticsConsent()) {
      console.log('[Analytics] Skipping event tracking - no consent');
      return;
    }

    await senden({
      kind: 'event',
      sessionId: this.sessionDbId,
      eventType,
      eventName,
      eventData: eventData || {},
      pagePath: window.location.pathname,
    });
  }

  async trackFormInteraction(
    formName: string,
    fieldName: string,
    interactionType: string,
    fieldValue?: string
  ) {
    if (!this.sessionDbId) return;
    if (!this.hasAnalyticsConsent()) {
      console.log('[Analytics] Skipping form interaction tracking - no consent');
      return;
    }

    const fieldKey = `${formName}_${fieldName}`;
    let timeSpent = 0;

    if (interactionType === 'blur' || interactionType === 'change') {
      const startTime = this.formFieldTimes.get(fieldKey);
      if (startTime) {
        timeSpent = Math.round((Date.now() - startTime) / 1000);
        this.formFieldTimes.delete(fieldKey);
      }
    } else if (interactionType === 'focus') {
      this.formFieldTimes.set(fieldKey, Date.now());
    }

    try {
      await senden({
        kind: 'form_interaction',
        sessionId: this.sessionDbId,
        formName,
        fieldName,
        interactionType,
        fieldValue,
        timeSpent,
      });
    } catch (error) {
      console.error('Analytics form interaction error:', error);
    }
  }

  async trackConversion(
    conversionType: string,
    leadId?: string,
    conversionValue?: number,
    formData?: any
  ) {
    if (!this.sessionDbId) {
      console.warn('[Analytics] Cannot track conversion: no session ID');
      return;
    }

    if (!this.hasAnalyticsConsent()) {
      console.log('[Analytics] Skipping conversion tracking - no consent');
      return;
    }

    try {
      console.log('[Analytics] Tracking conversion:', {
        conversionType,
        leadId,
        conversionValue,
        sessionDbId: this.sessionDbId
      });

      const antwort = await senden({
        kind: 'conversion',
        sessionId: this.sessionDbId,
        leadId,
        conversionType,
        conversionValue,
        formData: formData || {},
      });

      if (antwort?.ok) {
        console.log('[Analytics] Conversion tracked successfully');
      } else {
        console.error('[Analytics] Conversion tracking error');
      }
    } catch (error) {
      console.error('[Analytics] Conversion error:', error);
    }
  }

  // CRO 15.08.: Scroll-Tiefe als Event (25/50/75/100 %). Clarity liefert die
  // Kurve nur aggregiert im Dashboard — als analytics_event ist sie mit dem
  // Funnel derselben Session verknüpfbar (z. B. „gescrollt, aber Warm-up nie
  // beantwortet"). Passiv + rAF-throttled; Consent-Gate greift in trackEvent.
  private setupScrollDepthTracking() {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        const pct = (window.scrollY / max) * 100;
        for (const threshold of [25, 50, 75, 100]) {
          if (pct < threshold || this.scrollDepthsFired.has(threshold)) continue;
          // Ohne Einwilligung verwirft trackEvent das Event still. Dann die
          // Schwelle NICHT abhaken, sonst ist sie fuer die restliche Session
          // verbrannt — der naechste Scroll nach dem Consent holt sie nach.
          // (Bug 16.08.: deshalb kam seit dem Deploy kein einziges
          // scroll_depth an — das Gate greift, bevor jemand zugestimmt hat.)
          if (!this.hasAnalyticsConsent()) continue;
          this.scrollDepthsFired.add(threshold);
          this.trackEvent('engagement', 'scroll_depth', { depth: threshold });
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  private setupEventListeners() {
    window.addEventListener('beforeunload', () => {
      const timeOnPage = Math.round((Date.now() - this.pageViewStartTime) / 1000);
      if (this.lastPageView && timeOnPage > 0) {
        navigator.sendBeacon(
          '/api/analytics/page-time',
          JSON.stringify({
            sessionId: this.sessionDbId,
            pagePath: this.lastPageView,
            timeOnPage,
          })
        );
      }
    });
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getSessionDbId(): string | null {
    return this.sessionDbId;
  }

  // Liest die Ad-Parameter der AKTUELLEN URL (nicht sessionStorage).
  private collectAdParamsFromUrl(): AdParams {
    const urlParams = new URLSearchParams(window.location.search);
    const out: AdParams = {};
    for (const key of AD_PARAM_KEYS) {
      const value = urlParams.get(key);
      if (value && value.length <= 200) out[key] = value;
    }
    return out;
  }

  // Merge in sessionStorage: ein späterer Ad-Klick in derselben Session
  // überschreibt nur die Keys, die er tatsächlich mitbringt (letzter
  // Klick gewinnt), organische Folge-Landings löschen nichts.
  private rememberAdParams() {
    const fromUrl = this.collectAdParamsFromUrl();
    if (Object.keys(fromUrl).length === 0) return;
    try {
      const existing = JSON.parse(sessionStorage.getItem(AD_PARAMS_KEY) || '{}');
      sessionStorage.setItem(AD_PARAMS_KEY, JSON.stringify({ ...existing, ...fromUrl }));
    } catch {
      // sessionStorage gesperrt (Safari private mode) — Attribution entfällt.
    }
  }

  // Klick-IDs + utm_term/utm_content auf die Session-Zeile schreiben.
  // Bewusst als SEPARATES best-effort Update statt im Insert: so entstehen
  // Sessions auch dann, wenn die Spalten-Migration (20260814090000) noch
  // nicht appliziert ist — es fehlt dann nur die Attribution, nicht die
  // ganze Session.
  private async persistAdParams() {
    if (!this.sessionDbId) return;
    const params = this.collectAdParamsFromUrl();
    if (Object.keys(params).length === 0) return;
    await senden({ kind: 'ad_params', sessionId: this.sessionDbId, params });
  }

  // Für den Lead-Submit: alles, was wir in dieser Session an Ad-Parametern
  // gesehen haben (sessionStorage überlebt die Wizard-Interaktion).
  getAdParams(): AdParams {
    try {
      return JSON.parse(sessionStorage.getItem(AD_PARAMS_KEY) || '{}');
    } catch {
      return {};
    }
  }

  // Letzte Events vor einer harten Navigation (Bug #33): der Sofort-Redirect
  // ins Portal hat die supabase-js-Inserts (step_complete contact_form +
  // conversion) in ~50 % der Fälle abgebrochen. sendBeacon überlebt die
  // Navigation garantiert; Fallback fetch(keepalive) für Browser ohne
  // sendBeacon. Insert passiert server-seitig in /api/analytics/critical-event.
  trackCriticalSubmit(input: CriticalSubmitInput) {
    if (!this.sessionDbId) {
      console.warn('[Analytics] Cannot track critical submit: no session ID');
      return;
    }
    if (!this.hasAnalyticsConsent()) {
      console.log('[Analytics] Skipping critical submit tracking - no consent');
      return;
    }

    const payload = JSON.stringify({
      sessionId: this.sessionDbId,
      pagePath: window.location.pathname,
      events: [
        {
          event_type: 'wizard',
          event_name: 'step_complete',
          event_data: {
            step: input.step,
            step_name: input.stepName,
            time_on_step_seconds: input.timeOnStepSeconds,
          },
        },
      ],
      conversion: input.conversion
        ? {
            lead_id: input.conversion.leadId,
            conversion_type: input.conversion.conversionType,
            conversion_value: input.conversion.conversionValue,
            form_data: input.conversion.formData || {},
          }
        : undefined,
    });

    try {
      if (
        typeof navigator.sendBeacon === 'function' &&
        navigator.sendBeacon(
          '/api/analytics/critical-event',
          new Blob([payload], { type: 'application/json' })
        )
      ) {
        return;
      }
    } catch {
      // sendBeacon geworfen/abgelehnt — unten der keepalive-Fallback.
    }
    fetch('/api/analytics/critical-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

export const analytics = new Analytics();

export function initAnalytics() {
  if (typeof window !== 'undefined') {
    analytics.init();
  }
}
