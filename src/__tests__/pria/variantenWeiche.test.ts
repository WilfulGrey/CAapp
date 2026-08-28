/*
 * Die Varianten-Weiche auf der Startseite (A/B/C je ein Drittel).
 *
 * Warum sie in der middleware sitzt und nicht in drei Ads-Kampagnen
 * (SEA-Session, 28.08.2026): Drei Kampagnen auf DIESELBEN Keywords
 * konkurrieren im eigenen Konto — Google lässt pro Suchanfrage nur EINE
 * Anzeige zu und wählt nach Anzeigenrang. Die Zuteilung folgte damit genau
 * der Größe, die gemessen werden sollte: 65 von 89 Keywords lagen doppelt,
 * die Kosten-Kampagne fiel von 198 auf 12 Impressionen/Tag. Deshalb EINE
 * Kampagne auf „/" und die Drittelung serverseitig.
 *
 * Dieser Test hält die vier Eigenschaften fest, ohne die der Test wertlos
 * (oder schädlich) wäre — sie sind alle schon einmal übersehen worden.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const middleware = readFileSync(join(WURZEL, 'middleware.ts'), 'utf8');

describe('Varianten-Weiche auf „/"', () => {
  it('läuft überhaupt für die Startseite', () => {
    // Ohne „/" im Matcher passiert gar nichts — genau das war beim ersten
    // Versuch der Fall (der Matcher hatte sich zwischenzeitlich geändert).
    const config = middleware.slice(middleware.indexOf('export const config'));
    expect(config, 'matcher enthält „/" nicht — die Weiche greift nie').toMatch(/matcher:\s*\[\s*'\/'/);
  });

  it('entscheidet serverseitig und leitet nicht um', () => {
    // Redirect statt Rewrite hieße: Google sieht eine andere Landingpage
    // als die Anzeigen-Ziel-URL. Und ein Umschalten im Browser (erst A,
    // dann C) würde die Absprungrate künstlich hochtreiben.
    const block = middleware.slice(middleware.indexOf("pathname === '/'"));
    expect(block, 'Die Weiche nutzt kein rewrite').toContain('NextResponse.rewrite');
    expect(block, 'Die Weiche leitet um — die Adresse muss „/" bleiben').not.toContain('NextResponse.redirect');
  });

  it('erkennt den Besucher wieder (Cookie)', () => {
    const block = middleware.slice(middleware.indexOf("pathname === '/'"));
    expect(block, 'Kein Cookie — der Besucher bekäme bei jedem Aufruf eine andere Variante').toContain('pm_variante');
    // 90 Tage: so lange rechnet Google einen Klick der Anzeige zu.
    expect(block).toMatch(/maxAge:\s*60\s*\*\s*60\s*\*\s*24\s*\*\s*90/);
  });

  it('lässt Crawler immer auf A', () => {
    // Wechselnde Inhalte unter derselben Adresse sind Cloaking; ein
    // indexierter Voll-Chat statt der Startseite wäre ein SEO-Schaden,
    // den kein Test wert ist.
    const block = middleware.slice(middleware.indexOf("pathname === '/'"));
    const botPruefung = block.indexOf('BOT.test');
    const wuerfel = block.indexOf('würfeln()');
    expect(botPruefung, 'Keine Bot-Erkennung vor der Zuteilung').toBeGreaterThan(-1);
    expect(botPruefung, 'Der Bot wird erst nach dem Würfeln geprüft').toBeLessThan(wuerfel);

    // Die Erkennung wirklich ausführen, nicht nur nach Namen suchen —
    // sonst besteht der Test auch, wenn das Muster gar nicht greift.
    const roh = /const BOT = (\/.+\/[a-z]*);/.exec(middleware);
    expect(roh, 'BOT-Muster nicht gefunden').not.toBeNull();
    // eslint-disable-next-line no-eval
    const BOT: RegExp = eval(roh![1]);

    const crawler = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
      'Chrome-Lighthouse',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (compatible; SemrushBot/7~bl)',
    ];
    for (const ua of crawler) {
      expect(BOT.test(ua), `Crawler nicht erkannt: ${ua}`).toBe(true);
    }

    // Und Menschen dürfen NICHT als Bot gelten — sonst bekämen alle A
    // und der Test liefe leer.
    const menschen = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36',
    ];
    for (const ua of menschen) {
      expect(BOT.test(ua), `Echter Besucher fälschlich als Bot: ${ua.slice(0, 40)}…`).toBe(false);
    }
  });

  it('meldet die Variante an die Messung — nicht die Adresse', () => {
    // Beim Rewrite bleibt window.location.pathname „/" für alle drei.
    // Ohne diese Ableitung wäre der Test nicht auswertbar.
    const analytics = readFileSync(join(WURZEL, 'lib', 'analytics.ts'), 'utf8');
    expect(analytics, 'analytics liest die Variante nicht aus dem Cookie').toContain('pm_variante');
    expect(analytics).toMatch(/landingPage:\s*variantenSeite\(\)/);
    for (const datei of ['public/pria.html', 'components/calculator/MultiStepForm.tsx']) {
      expect(
        readFileSync(join(WURZEL, datei), 'utf8'),
        `${datei} meldet die Herkunft ohne die Variante`,
      ).toContain('variantenSeite(');
    }
  });
});
