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
import { anfrageArt, anfrageHerkunft, geraetPruefen, sitzungPruefen } from '../../project 3/lib/anfrage-herkunft';

describe('Herkunft je Absendung', () => {
  it('unterscheidet neue, hochgestufte und doppelte Anfragen', () => {
    expect(anfrageArt({ isNew: true, isUpgrade: false })).toBe('neu');
    expect(anfrageArt({ isNew: false, isUpgrade: true })).toBe('hochgestuft');
    expect(anfrageArt({ isNew: false, isUpgrade: false })).toBe('duplikat');
  });

  it('hält beim Duplikat die Quelle der NEUEN Absendung fest', () => {
    expect(anfrageHerkunft({ isNew: false, isUpgrade: false, quelle: 'website:apex-components', websitePfad: null }))
      .toEqual({ art: 'duplikat', quelle: 'website:apex-components', website_pfad: null, session_id: null, geraet: null });
    expect(anfrageHerkunft({ isNew: true, isUpgrade: false, quelle: 'website:apex-referrer', websitePfad: '/24h-pflege-muenchen' }))
      .toEqual({ art: 'neu', quelle: 'website:apex-referrer', website_pfad: '/24h-pflege-muenchen', session_id: null, geraet: null });
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

  it('verknüpft Sitzung und Gerät nur in genau der erwarteten Form (Registry #106)', () => {
    expect(anfrageHerkunft({ isNew: true, isUpgrade: false, quelle: 'website:apex-startseite', websitePfad: null, sessionId: 'sess_1790606183416_fx1ww0ia5bt', geraet: 'mobile' }))
      .toEqual({ art: 'neu', quelle: 'website:apex-startseite', website_pfad: null, session_id: 'sess_1790606183416_fx1ww0ia5bt', geraet: 'mobile' });
    expect(sitzungPruefen('sess_1790606183416_fx1ww0ia5bt')).toBe('sess_1790606183416_fx1ww0ia5bt');
    expect(sitzungPruefen('sess_1')).toBeNull();
    expect(sitzungPruefen('e6a6deb8263e303d8d4b4bdc13c7523f9c80ff01c7d8b4341bb91cb2a4a5668f')).toBeNull(); // Fingerprint, keine Sitzung
    expect(sitzungPruefen("sess_1790606183416_x'; drop table leads;--")).toBeNull();
    expect(sitzungPruefen(12345)).toBeNull();
    expect(geraetPruefen('tablet')).toBe('tablet');
    expect(geraetPruefen('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)')).toBeNull();
    expect(geraetPruefen(undefined)).toBeNull();
  });

  it('das Formular schickt Sitzung und Gerät mit, die Route reicht sie ans Ereignis', () => {
    const wurzel = join(__dirname, '..', '..', 'project 3');
    const formular = readFileSync(join(wurzel, 'components', 'calculator', 'MultiStepForm.tsx'), 'utf8');
    expect(formular).toMatch(/sessionId: analytics\.getSessionId\(\),\s*geraet: analytics\.getGeraeteTyp\(\),/);
    const route = readFileSync(join(wurzel, 'app', 'api', 'angebot-anfordern', 'route.ts'), 'utf8');
    expect(route).toContain('anfrageHerkunft({ isNew, isUpgrade, quelle: quelleSicher, websitePfad: websitePfadSicher, sessionId, geraet })');
  });
});
