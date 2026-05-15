import { createClient } from '@supabase/supabase-js';
import { cookieConsent } from './cookie-consent';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

  private flushPendingEvents() {
    if (this.pendingEvents.length === 0) return;
    const queued = this.pendingEvents;
    this.pendingEvents = [];
    queued.forEach(fn => fn());
  }

  async init() {
    if (typeof window === 'undefined') return;

    this.sessionId = this.getOrCreateSessionId();
    this.fingerprint = await this.generateFingerprint();

    const sessionData = this.collectSessionData();
    await this.createOrUpdateSession(sessionData);

    this.trackPageView();
    this.setupPageViewTracking();
    this.setupEventListeners();

    cookieConsent.subscribe((consent) => {
      if (!consent.analytics) {
        console.log('[Analytics] Analytics consent revoked, stopping tracking');
      } else {
        console.log('[Analytics] Analytics consent granted, tracking enabled');
      }
    });
  }

  private hasAnalyticsConsent(): boolean {
    return cookieConsent.hasCategory('analytics');
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
      landingPage: window.location.pathname,
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
    try {
      const { data: existingSession } = await supabase
        .from('analytics_sessions')
        .select('id')
        .eq('session_id', data.sessionId)
        .maybeSingle();

      if (existingSession) {
        this.sessionDbId = existingSession.id;
        await supabase
          .from('analytics_sessions')
          .update({ last_activity: new Date().toISOString() })
          .eq('id', existingSession.id);
      } else {
        const { data: newSession } = await supabase
          .from('analytics_sessions')
          .insert({
            session_id: data.sessionId,
            fingerprint: data.fingerprint,
            user_agent: data.userAgent,
            referrer: data.referrer,
            landing_page: data.landingPage,
            utm_source: data.utmSource,
            utm_medium: data.utmMedium,
            utm_campaign: data.utmCampaign,
            device_type: data.deviceType,
            browser: data.browser,
            os: data.os,
          })
          .select('id')
          .single();

        if (newSession) {
          this.sessionDbId = newSession.id;
        }
      }
      // Session id is ready — replay anything queued before now.
      if (this.sessionDbId) this.flushPendingEvents();
    } catch (error) {
      console.error('Analytics session error:', error);
    }
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

    if (this.lastPageView && timeOnPreviousPage > 0) {
      await supabase
        .from('analytics_page_views')
        .update({ time_on_page: timeOnPreviousPage })
        .eq('session_id', this.sessionDbId)
        .eq('page_path', this.lastPageView)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    const currentPath = pagePath || window.location.pathname;
    const currentTitle = pageTitle || document.title;

    try {
      await supabase.from('analytics_page_views').insert({
        session_id: this.sessionDbId,
        page_path: currentPath,
        page_title: currentTitle,
        referrer_path: this.lastPageView,
        viewed_at: new Date().toISOString(),
      });

      this.lastPageView = currentPath;
      this.pageViewStartTime = Date.now();
    } catch (error) {
      console.error('Analytics page view error:', error);
    }
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

    try {
      await supabase.from('analytics_events').insert({
        session_id: this.sessionDbId,
        event_type: eventType,
        event_name: eventName,
        event_data: eventData || {},
        page_path: window.location.pathname,
      });
    } catch (error) {
      console.error('Analytics event error:', error);
    }
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
      await supabase.from('analytics_form_interactions').insert({
        session_id: this.sessionDbId,
        form_name: formName,
        field_name: fieldName,
        interaction_type: interactionType,
        field_value: fieldValue,
        time_spent: timeSpent,
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

      const { data, error } = await supabase.from('analytics_conversions').insert({
        session_id: this.sessionDbId,
        lead_id: leadId,
        conversion_type: conversionType,
        conversion_value: conversionValue,
        form_data: formData || {},
      });

      if (error) {
        console.error('[Analytics] Conversion tracking error:', error);
      } else {
        console.log('[Analytics] Conversion tracked successfully');
      }
    } catch (error) {
      console.error('[Analytics] Conversion error:', error);
    }
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
}

export const analytics = new Analytics();

export function initAnalytics() {
  if (typeof window !== 'undefined') {
    analytics.init();
  }
}
