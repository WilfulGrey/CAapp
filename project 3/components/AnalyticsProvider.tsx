'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';
import { postHogStarten } from '@/lib/posthog';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // PostHog zuerst: die eigene Analyse feuert beim Start schon Ereignisse
    // (step_view des Wizards), die auch PostHog sehen soll.
    postHogStarten();
    initAnalytics();
  }, []);

  return <>{children}</>;
}
