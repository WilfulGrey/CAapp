/*
 * Der A/B-Test „Pria-Float" ist am 13.09.2026 beendet worden (Registry #67):
 * seit 29.08. A 500 Sitzungen / 25 Leads, B 421 / 24, der Chat selbst 1 Lead
 * in drei Wochen, zuletzt 17 Gespräche ohne Lead. Dieser Test hält fest, dass
 * die Weiche nicht wieder zu würfeln beginnt und kein Lader das Widget nachzieht.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const lies = (pfad: string) => readFileSync(join(WURZEL, pfad), 'utf8');

describe('Pria abgeschaltet', () => {
  it('die Startseite wird nicht mehr umgeschrieben', () => {
    const mw = lies('middleware.ts');
    const block = mw.slice(mw.indexOf("pathname === '/'"));
    expect(block).not.toContain('NextResponse.rewrite');
    expect(mw).not.toContain('würfeln');
    expect(mw).not.toContain('/kosten-berechnen');
  });

  it('löscht ein altes Varianten-Cookie', () => {
    const mw = lies('middleware.ts');
    expect(mw).toMatch(/cookies\.delete\('pm_variante'\)/);
    // Der Matcher muss „/" behalten, sonst läuft die Löschung nie.
    const config = mw.slice(mw.indexOf('export const config'));
    expect(config).toMatch(/matcher:\s*\[\s*'\/'/);
  });

  it('kein Lader zieht pria-widget.js auf Startseite oder /kosten-berechnen', () => {
    expect(lies('app/layout.tsx')).not.toContain('pria-widget.js');
    expect(lies('app/kosten-berechnen/page.tsx')).not.toContain('pria-widget.js');
    expect(lies('app/page.tsx')).not.toContain('pria-widget.js');
  });

  it('die Herkunft der Leads kommt aus der Adresse, nicht aus einem Cookie', () => {
    const analytics = lies('lib/analytics.ts');
    expect(analytics).not.toContain('pm_variante');
    expect(analytics).toMatch(/landingPage:\s*variantenSeite\(\)/);
  });
});
