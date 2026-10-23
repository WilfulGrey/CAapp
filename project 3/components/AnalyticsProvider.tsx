'use client';

import { useEffect } from 'react';
import { initAnalytics } from '@/lib/analytics';
import { websiteEinstiegMerken } from '@/lib/website-einstieg';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Einstieg auf primundus.de aus der Adresse (Registry #120) — vor allem anderen, nur im Arbeitsspeicher
    websiteEinstiegMerken();
    initAnalytics();
  }, []);

  return <>{children}</>;
}
