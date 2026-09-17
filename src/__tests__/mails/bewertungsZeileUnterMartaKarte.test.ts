import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Bewertungszeile direkt unter Martas Karte (Martin, 17.09.2026) — in JEDER
// Kundenmail mit Karte. Die Karte existiert in mehreren Kopien (email.ts,
// Edge Function), daher bewacht dieser Test die Quellen: jede Karte bekommt
// die Zeile, bewusst ausgenommen sind
//   - Vermittler-Mails (Geschäftspartner, kein Endkunde; vermittler.ts)
//   - die Bewertungsanfrage (bittet selbst um eine Bewertung).

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const lies = (datei: string) => readFileSync(join(WURZEL, datei), 'utf8');

// Der grüne WhatsApp-Knopf steht in jeder Kopie der Karte genau einmal.
const KARTE = 'WhatsApp schreiben</a>';
const ZEILE = 'bewertungsZeileHtml(';

function positionen(quelle: string, nadel: string): number[] {
  const out: number[] = [];
  for (let i = quelle.indexOf(nadel); i !== -1; i = quelle.indexOf(nadel, i + 1)) out.push(i);
  return out;
}

describe('Bewertungszeile unter Martas Karte', () => {
  it('lib/email.ts: jede Karte hat die Zeile, bevor die nächste Karte beginnt', () => {
    const quelle = lies('lib/email.ts');
    const karten = positionen(quelle, KARTE);
    expect(karten.length).toBeGreaterThanOrEqual(6);
    karten.forEach((start, i) => {
      const ende = karten[i + 1] ?? quelle.length;
      expect(quelle.slice(start, ende), `Karte Nr. ${i + 1}`).toContain(ZEILE);
    });
  });

  it('lib/email.ts: die Bewertungsanfrage bekommt keine Zeile', () => {
    const quelle = lies('lib/email.ts');
    const start = quelle.indexOf('export function getBewertungsanfrageTemplate(');
    expect(start).toBeGreaterThan(0);
    const naechste = quelle.indexOf('\nexport ', start + 1);
    const rumpf = quelle.slice(start, naechste === -1 ? quelle.length : naechste);
    expect(rumpf).not.toContain(ZEILE);
  });

  it('Edge Function: buildMartaSig hängt die Zeile an', () => {
    const quelle = lies('supabase/functions/send-scheduled-emails/index.ts');
    const start = quelle.indexOf('function buildMartaSig(');
    const ende = quelle.indexOf('\n}\n', start);
    expect(start).toBeGreaterThan(0);
    expect(quelle.slice(start, ende)).toContain(ZEILE);
    expect(positionen(quelle, KARTE)).toHaveLength(1);
  });

  it('Edge Function: Vermittler-Mails rufen die Karte ohne Zeile auf, Kundenmails mit', () => {
    const quelle = lies('supabase/functions/send-scheduled-emails/index.ts');
    const vermittler = quelle.match(/signatur:\s*buildMartaSig\([^)]*\)/g) ?? [];
    expect(vermittler.length).toBeGreaterThanOrEqual(4);
    for (const aufruf of vermittler) expect(aufruf).toMatch(/mitBewertung:\s*false/);

    const alle = quelle.match(/buildMartaSig\([^)]*\)/g) ?? [];
    const kunden = alle.filter((a) => !/mitBewertung:\s*false/.test(a));
    expect(kunden.length).toBeGreaterThanOrEqual(14);
  });

  it('Bewertungsanfrage und Vermittler-Modul kennen die Zeile nicht', () => {
    expect(lies('supabase/functions/send-scheduled-emails/bewertung.ts')).not.toContain(ZEILE);
    expect(lies('supabase/functions/send-scheduled-emails/vermittler.ts')).not.toContain(ZEILE);
  });

  it('Edge Function lädt den Stand pro Aufruf, bevor Mails gebaut werden', () => {
    const quelle = lies('supabase/functions/send-scheduled-emails/index.ts');
    const laden = positionen(quelle, 'bewertungsStand = await ladeBewertungsStand(');
    // Demo-Vorschau + echter Versand.
    expect(laden).toHaveLength(2);
  });
});
