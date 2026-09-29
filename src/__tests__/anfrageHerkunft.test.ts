/*
 * Herkunft jeder Absendung (Registry #105, 28.09.2026).
 *
 * 28.09. 16:08: Ein Besucher von primundus.de schickte ab, war aber schon
 * Kunde — die Absendung hing als Duplikat an seiner Anfrage vom 07.09. und
 * erschien nirgends als Website-Anfrage. Die Lead-Quelle bleibt bewusst die
 * erste; deshalb bekommt jede Absendung ein eigenes Ereignis mit ihrer Quelle.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { anfrageArt, anfrageHerkunft } from '../../project 3/lib/anfrage-herkunft';

describe('Herkunft je Absendung', () => {
  it('unterscheidet neue, hochgestufte und doppelte Anfragen', () => {
    expect(anfrageArt({ isNew: true, isUpgrade: false })).toBe('neu');
    expect(anfrageArt({ isNew: false, isUpgrade: true })).toBe('hochgestuft');
    expect(anfrageArt({ isNew: false, isUpgrade: false })).toBe('duplikat');
  });

  it('hält beim Duplikat die Quelle der NEUEN Absendung fest', () => {
    expect(anfrageHerkunft({ isNew: false, isUpgrade: false, quelle: 'website:apex-components', websitePfad: null }))
      .toEqual({ art: 'duplikat', quelle: 'website:apex-components', website_pfad: null });
    expect(anfrageHerkunft({ isNew: true, isUpgrade: false, quelle: 'website:apex-referrer', websitePfad: '/24h-pflege-muenchen' }))
      .toEqual({ art: 'neu', quelle: 'website:apex-referrer', website_pfad: '/24h-pflege-muenchen' });
  });

  it('die Absende-Route schreibt das Ereignis zu JEDER Absendung, gleich nach der Lead-Suche', () => {
    const code = readFileSync(join(__dirname, '..', '..', 'project 3', 'app', 'api', 'angebot-anfordern', 'route.ts'), 'utf8');
    const suche = code.indexOf('await findOrCreateLead(');
    const ereignis = code.indexOf("'anfrage_herkunft'");
    expect(suche).toBeGreaterThan(-1);
    expect(ereignis).toBeGreaterThan(suche);
    const dazwischen = code.slice(suche, ereignis);
    // Nicht nur bei neuen Leads: keine Bedingung auf isNew/isUpgrade davor.
    expect(dazwischen).not.toMatch(/if\s*\(\s*!?\s*(isNew|isUpgrade)/);
  });
});
