/*
 * Der Browser darf nicht direkt in die Analytics-Tabellen schreiben.
 *
 * Warum dieser Test existiert (23.08.2026): lib/analytics.ts hat an neun
 * Stellen per supabase-js direkt nach …supabase.co geschrieben. Fuer
 * Safari-Nutzer kam davon nichts an — vor Supabase haengt Cloudflare und
 * setzt zur Bot-Erkennung einen Cookie auf einer fremden Domain; Safari
 * blockiert Cross-Site-Cookies, Cloudflare weist ab, und die Absage traegt
 * keine CORS-Kopfzeilen:
 *
 *   Fetch API cannot load …/rest/v1/analytics_sessions?select=id
 *   due to access control checks.
 *
 * Es scheiterte schon der erste Aufruf, also entstand nicht einmal eine
 * Session. Alle iPhones, iPads und Safari-Macs waren damit vollstaendig
 * unsichtbar — kein Besucher, kein Pageview, kein step_view. Aufgefallen
 * ist es erst, als im Tagesreport mehr abgeschlossene Wizards standen als
 * gestartete.
 *
 * Der Fehler ist von aussen unsichtbar: kein roter Balken, keine kaputte
 * Seite, nur stillschweigend fehlende Zahlen. Deshalb prueft ihn eine
 * Maschine.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');

describe('Analytics — kein Datenbank-Zugriff aus dem Browser', () => {
  const quelle = readFileSync(join(WURZEL, 'lib', 'analytics.ts'), 'utf8');
  // Kommentare abziehen: der Befund selbst steht dort beschrieben.
  const code = quelle
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('ruft in lib/analytics.ts kein supabase.from(...) auf', () => {
    const treffer = code.match(/supabase\s*\.?\s*\n?\s*\.from\(/g) ?? [];
    expect(treffer, `${treffer.length} direkte Tabellen-Zugriffe`).toEqual([]);
  });

  it('erzeugt dort auch keinen Supabase-Client', () => {
    // Ein zweiter Client im Browser hat zusaetzlich die Warnung
    // „Multiple GoTrueClient instances detected" ausgeloest.
    expect(code).not.toMatch(/createClient\s*\(/);
  });

  it('schickt stattdessen an die eigene Domain', () => {
    // Ohne diese Zusicherung waere eine leergeraeumte Datei ein bestandener Test.
    expect(code).toContain("fetch('/api/analytics/collect'");
  });
});
