/*
 * PostHog — die Regeln, die entscheiden, WAS an PostHog geht.
 *
 * Drei Dinge dürfen nie passieren, und jedes davon wäre von außen
 * unsichtbar (keine kaputte Seite, nur Daten am falschen Ort):
 *   1. Der Magic-Link-Token des Kundenportals landet bei PostHog — er ist
 *      der Zugang zum Kundenkonto, nicht nur ein Merkmal.
 *   2. Antworten aus dem Rechner (Pflegegrad, Mobilität) oder Telefon/PLZ
 *      aus Portal-Ereignissen gehen mit — Gesundheitsdaten, Art. 9 DSGVO.
 *   3. Der Browser schreibt direkt an *.posthog.com statt über den Proxy —
 *      Safari und Werbeblocker verwerfen das lautlos (Lehre vom 23.08.,
 *      siehe analytics/keinDirektzugriff.test.ts).
 *
 * Cross-Import aus `project 3/`: reines Modul ohne Next/Supabase/PostHog.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  POSTHOG_SCHLUESSEL,
  PROXY_PFAD,
  erlaubteEigenschaften,
  postHogKonfig,
  superEigenschaften,
  tokenAusText,
  tokenUeberall,
  umgebungFuer,
} from '../../project 3/lib/posthog-regeln';

const TOKEN = 'Xy7_kL9mNq2Rt5Vw8Za1Bc4Df6Gh0Jk3';

describe('umgebungFuer', () => {
  it('startet auf beiden Prod-Hosts', () => {
    expect(umgebungFuer('kostenrechner.primundus.de', false)).toBe('prod');
    expect(umgebungFuer('kundenportal.primundus.de', false)).toBe('prod');
  });

  it('bleibt auf Staging und localhost stumm — außer im Testlauf', () => {
    expect(umgebungFuer('kostenrechner-staging.onrender.com', false)).toBeNull();
    expect(umgebungFuer('caapp-staging.onrender.com', false)).toBeNull();
    expect(umgebungFuer('localhost', false)).toBeNull();
    expect(umgebungFuer('caapp-staging.onrender.com', true)).toBe('test');
  });

  it('lässt sich nicht über eine ähnlich klingende Domain einschalten', () => {
    expect(umgebungFuer('kostenrechner.primundus.de.evil.com', false)).toBeNull();
    expect(umgebungFuer('primundus.de', false)).toBeNull();
  });
});

describe('tokenAusText', () => {
  it('maskiert den Token in der Portal-Adresse', () => {
    expect(tokenAusText(`https://kundenportal.primundus.de/?token=${TOKEN}`))
      .toBe('https://kundenportal.primundus.de/?token=***');
  });

  it('maskiert ihn auch mitten in der Adresse und lässt die übrigen Parameter stehen', () => {
    expect(tokenAusText(`https://kundenportal.primundus.de/?m=pn1&token=${TOKEN}&job=42#pflegekraefte`))
      .toBe('https://kundenportal.primundus.de/?m=pn1&token=***&job=42#pflegekraefte');
  });

  it('maskiert ihn URL-kodiert (Adresse als Parameter einer anderen)', () => {
    const r = tokenAusText(`https://x.de/?weiter=https%3A%2F%2Fkundenportal.primundus.de%2F%3Ftoken%3D${TOKEN}`);
    expect(r).not.toContain(TOKEN);
  });

  it('maskiert den Vertrags-PDF-Link aus dem BookedScreen', () => {
    const r = tokenAusText(`https://kostenrechner.primundus.de/api/contract-pdf/abc?token=${TOKEN}`);
    expect(r).not.toContain(TOKEN);
  });

  it('fasst bereits maskierte Werte nicht noch einmal an', () => {
    expect(tokenAusText('/?token=<masked>&m=pn1')).toBe('/?token=<masked>&m=pn1');
    expect(tokenAusText('/?token=***')).toBe('/?token=***');
  });

  it('lässt Texte ohne Token unverändert', () => {
    expect(tokenAusText('https://kostenrechner.primundus.de/?gclid=abc')).toBe('https://kostenrechner.primundus.de/?gclid=abc');
  });
});

describe('tokenUeberall', () => {
  it('säubert verschachtelte Aufzeichnungsdaten (Link-Attribute im DOM-Baum)', () => {
    // Form eines rrweb-Vollbilds: Knoten mit attributes, childNodes, Meta-href.
    const schnipsel = {
      event: '$snapshot',
      properties: {
        $snapshot_data: [
          { type: 4, data: { href: `https://kundenportal.primundus.de/?token=${TOKEN}` } },
          {
            type: 2,
            data: {
              node: {
                childNodes: [
                  { tagName: 'a', attributes: { href: `/api/contract-pdf/1?token=${TOKEN}` } },
                  { tagName: 'a', attributes: { href: `/?token=${TOKEN}&job=7` } },
                ],
              },
            },
          },
        ],
      },
    };
    tokenUeberall(schnipsel);
    expect(JSON.stringify(schnipsel)).not.toContain(TOKEN);
    expect(JSON.stringify(schnipsel)).toContain('job=7');
  });

  it('arbeitet an Ort und Stelle und gibt dasselbe Objekt zurück', () => {
    const e = { properties: { $current_url: `/?token=${TOKEN}` } };
    expect(tokenUeberall(e)).toBe(e);
    expect(e.properties.$current_url).toBe('/?token=***');
  });

  it('übersteht null und einfache Werte', () => {
    expect(tokenUeberall(null)).toBeNull();
    expect(tokenUeberall('x')).toBe('x');
  });
});

describe('erlaubteEigenschaften — Positivliste', () => {
  it('lässt Schritt und Schrittname durch, die Antwort nicht', () => {
    expect(erlaubteEigenschaften({ step: 4, step_name: 'pflegegrad', answer: '3' }))
      .toEqual({ step: 4, step_name: 'pflegegrad' });
  });

  it('lässt Telefon, PLZ, Ort und Pflegekraft aus Portal-Ereignissen nicht durch', () => {
    expect(erlaubteEigenschaften({
      phone: '0171 1234567', plz: '79780', ort: 'Stühlingen',
      caregiver_id: 36531, caregiver_name: 'Aneta K.', mail_source: 'pn1',
    })).toEqual({ mail_source: 'pn1' });
  });

  it('verwirft verschachtelte Werte und maskiert Token auch hier', () => {
    expect(erlaubteEigenschaften({ source: { tief: 1 } })).toEqual({});
    expect(erlaubteEigenschaften({ source: `x?token=${TOKEN}` })).toEqual({ source: 'x?token=***' });
  });

  it('kommt mit fehlenden Eigenschaften zurecht', () => {
    expect(erlaubteEigenschaften(undefined)).toEqual({});
    expect(erlaubteEigenschaften(null)).toEqual({});
  });
});

describe('postHogKonfig', () => {
  const rechner = postHogKonfig({ app: 'kostenrechner', apiHost: PROXY_PFAD });
  const portal = postHogKonfig({ app: 'kundenportal', apiHost: 'https://kostenrechner.primundus.de/ingest' });

  it('schreibt über den Proxy, nie direkt an PostHog', () => {
    expect(rechner.api_host).toBe('/ingest');
    expect(portal.api_host).toBe('https://kostenrechner.primundus.de/ingest');
    expect(rechner.ui_host).toBe('https://eu.posthog.com');
  });

  it('zählt ohne Zustimmung cookielos und schaltet erst bei Zustimmung voll', () => {
    // on_reject + opt_out_capturing_by_default: Unentschiedene gelten als
    // „abgelehnt" und werden cookielos gezählt (posthog-js 1.430 isRejected).
    expect(rechner.cookieless_mode).toBe('on_reject');
    expect(rechner.opt_out_capturing_by_default).toBe(true);
  });

  it('legt den Einwilligungs-Merker als Cookie auf die Hauptdomain — so erbt das Portal ihn', () => {
    expect(rechner.opt_out_capturing_persistence_type).toBe('cookie');
    expect(rechner.cross_subdomain_cookie).toBe(true);
  });

  it('maskiert im Portal alle Texte der Aufzeichnung, im Rechner nur Eingaben', () => {
    expect(portal.session_recording).toEqual({ maskAllInputs: true, maskTextSelector: '*' });
    expect(rechner.session_recording).toEqual({ maskAllInputs: true });
  });

  it('nimmt aus Klicks weder Texte noch Attribute mit', () => {
    expect(rechner.mask_all_text).toBe(true);
    expect(rechner.mask_all_element_attributes).toBe(true);
    expect(portal.custom_personal_data_properties).toContain('token');
  });

  it('maskiert die Adresse an der Quelle', () => {
    expect(portal.get_current_url(`https://kundenportal.primundus.de/?token=${TOKEN}`))
      .toBe('https://kundenportal.primundus.de/?token=***');
  });

  it('säubert jedes Ereignis kurz vor dem Versand', () => {
    const ereignis = { properties: { $referrer: `https://kundenportal.primundus.de/?token=${TOKEN}` } };
    expect(JSON.stringify(portal.before_send(ereignis))).not.toContain(TOKEN);
  });

  it('komprimiert nur im Testlauf nicht', () => {
    expect(rechner.disable_compression).toBe(false);
    expect(postHogKonfig({ app: 'kostenrechner', apiHost: '/ingest', testlauf: true }).disable_compression).toBe(true);
  });

  it('legt Anonyme ohne Personenprofil an', () => {
    expect(rechner.person_profiles).toBe('identified_only');
  });
});

describe('superEigenschaften', () => {
  it('trennt App und Umgebung', () => {
    expect(superEigenschaften('kundenportal', 'test')).toEqual({ app: 'kundenportal', umgebung: 'test' });
  });
});

describe('Projekt-Schlüssel', () => {
  it('ist ein öffentlicher Projekt-Schlüssel, kein persönlicher API-Schlüssel', () => {
    // phc_ = Projekt-Token (öffentlich); phx_ wäre ein persönlicher
    // Schlüssel mit Kontozugriff und gehört NIE in den Code.
    expect(POSTHOG_SCHLUESSEL).toMatch(/^phc_[A-Za-z0-9]+$/);
  });
});

// ─── Wächter: nie direkt an PostHog ─────────────────────────────────────────

function dateien(ordner: string, aus: string[] = []): string[] {
  for (const name of readdirSync(ordner)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
    const pfad = join(ordner, name);
    if (statSync(pfad).isDirectory()) dateien(pfad, aus);
    else if (/\.(ts|tsx|js|jsx|html)$/.test(name)) aus.push(pfad);
  }
  return aus;
}

describe('Kein direkter Schreibweg zu PostHog aus dem Browser', () => {
  const WURZEL = join(__dirname, '..', '..');
  const code = [
    ...dateien(join(WURZEL, 'src')),
    ...dateien(join(WURZEL, 'project 3', 'lib')),
    ...dateien(join(WURZEL, 'project 3', 'components')),
    ...dateien(join(WURZEL, 'project 3', 'app')),
  ];

  it('nennt die Ingestion-Adresse von PostHog nirgends im Browser-Code', () => {
    // Erlaubt ist sie ausschließlich als Proxy-Ziel in project 3/next.config.js.
    // Kommentare abziehen — dort darf die Adresse als Begründung stehen.
    const ohneKommentare = (t: string) =>
      t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*\*.*$/gm, '');
    const treffer = code.filter((p) => /i\.posthog\.com/.test(ohneKommentare(readFileSync(p, 'utf8'))));
    expect(treffer).toEqual([]);
  });

  it('der Proxy in next.config.js zeigt auf die EU-Region', () => {
    const cfg = readFileSync(join(WURZEL, 'project 3', 'next.config.js'), 'utf8');
    expect(cfg).toContain("destination: 'https://eu.i.posthog.com/:path*'");
    expect(cfg).not.toMatch(/us(-assets)?\.i\.posthog\.com/);
  });
});
