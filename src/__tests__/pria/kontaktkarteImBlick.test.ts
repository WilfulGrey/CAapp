/*
 * Pria auf dem Handy: das Feld, in das getippt wird, muss sichtbar bleiben.
 *
 * Warum dieser Test existiert (29.08.2026, Martins Video): Wer seine
 * Kontaktdaten im Chat änderte, tippte blind. Zwei Ursachen, die zusammen
 * genau das ergaben:
 *
 * 1. SPRUNG ANS ENDE. `handyLayout()` läuft bei offener Tastatur in JEDEM
 *    Frame (siehe `takt()`) und ruft `runter()`. Das setzte hart
 *    `thread.scrollTop = thread.scrollHeight`. Die Kontaktkarte hing aber
 *    mitten im Verlauf — jede weitere Blase hatte sie nach oben geschoben.
 *    Das fokussierte Feld wurde also fortlaufend aus dem Bild gezogen,
 *    während der Finger darauf lag.
 * 2. ZOOM. Die Felder IN den Karten standen auf 15 px. Unter 16 px zoomt
 *    iOS beim Fokus in die Seite hinein. Das Panel hängt am Layout-Fenster,
 *    das sichtbare ist danach schmaler: ✕ und Sendeknopf standen außerhalb
 *    des Bildes, das ganze Panel wirkte verrutscht.
 *
 * Dazu kam ein `focus()` in einem 420-ms-Timer, der die Eingabe aus der
 * Nachrichtenzeile stahl — und auf iOS die Tastatur oft gar nicht öffnet,
 * weil dort nur der direkte Gestenkontext zählt.
 *
 * Gelesen wird als Text: `public/pria.html` ist eine eigenständige Seite
 * ohne Modulsystem und lässt sich nicht importieren.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WURZEL = join(__dirname, '..', '..', '..', 'project 3');
const html = readFileSync(join(WURZEL, 'public', 'pria.html'), 'utf8');

/** Rumpf einer Funktion über Klammerzählung — ein Muster verschluckt sich an
 *  den geschweiften Klammern der Objektliterale darin. */
function rumpf(quelle: string, kopf: string): string {
  const von = quelle.indexOf(kopf);
  if (von < 0) return '';
  let i = quelle.indexOf('{', von), tiefe = 0;
  for (let j = i; j < quelle.length; j++) {
    if (quelle[j] === '{') tiefe++;
    else if (quelle[j] === '}' && --tiefe === 0) return quelle.slice(i, j + 1);
  }
  return '';
}

/** Effektive Schriftgröße eines Selektors: erst die Grundregel, dann eine
 *  eventuelle Überschreibung im Handy-Block. */
function schriftgroesse(css: string, selektor: string): number | null {
  const regel = new RegExp(selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}', 'g');
  let letzte: number | null = null;
  for (const t of css.matchAll(regel)) {
    const px = /font-size:\s*([\d.]+)px/.exec(t[1]);
    if (px) letzte = parseFloat(px[1]);
  }
  return letzte;
}

const handyBlock = rumpf(html, '@media(max-width:640px)');

describe('Pria — das fokussierte Feld bleibt im Bild', () => {
  it('findet den Handy-Block überhaupt', () => {
    // Ohne diese Zusicherung wären die Schriftgrößen-Prüfungen unten
    // stillschweigend bestanden, weil sie auf leerem Text suchen.
    expect(handyBlock.length).toBeGreaterThan(400);
  });

  it('springt nicht ans Ende, solange ein Feld im Verlauf den Fokus hat', () => {
    const r = rumpf(html, 'function runter()');
    expect(r, 'runter() nicht gefunden').not.toBe('');
    const fokus = r.indexOf('activeElement');
    const ende = r.indexOf('thread.scrollHeight');
    expect(fokus, 'runter() fragt den Fokus nicht ab').toBeGreaterThan(0);
    expect(ende, 'runter() springt nicht mehr ans Ende').toBeGreaterThan(0);
    expect(fokus, 'die Fokus-Abfrage muss VOR dem Sprung ans Ende stehen').toBeLessThan(ende);
  });

  it('hält eine offene Formularkarte als letztes Element im Verlauf', () => {
    const e = rumpf(html, 'function einfuegen(');
    expect(e).toContain('insertBefore');
    expect(e, 'einfuegen() richtet sich nicht nach der offenen Karte').toContain('formKarte');
    // Die beiden Bausteine, die JEDE Blase erzeugen, müssen darüber laufen —
    // sonst schiebt die nächste Antwort die Karte wieder aus dem Bild.
    for (const fn of ['function bub(', 'function tippt()']) {
      const b = rumpf(html, fn);
      expect(b, `${fn} hängt noch direkt an den Verlauf an`).not.toContain('thread.appendChild');
      expect(b, `${fn} benutzt einfuegen() nicht`).toContain('einfuegen(');
    }
  });

  it('gibt die Karte wieder frei, sobald sie erledigt ist', () => {
    // Sonst stünde jede spätere Blase für immer über einer abgeschickten
    // Karte — die Reihenfolge im Verlauf wäre dauerhaft falsch.
    expect(html).toContain('kontaktOffen=false; uebergeben=true; formKarte=null;');
    expect(html, 'die Rückruf-Karte gibt formKarte nicht frei')
      .toContain('rueckrufOffen=false; formKarte=null;');
  });

  it('stiehlt den Fokus nicht mit einem Timer', () => {
    const z = rumpf(html, 'function zumKontakt(');
    expect(z, 'zumKontakt() nicht gefunden').not.toBe('');
    // Auf den ganzen Rumpf geprüft, nicht auf ein Muster „setTimeout … focus":
    // dazwischen steht `(()=>leer.focus()` — jedes sparsame Muster bricht an
    // der ersten Klammer ab und der Wächter schliefe. zumKontakt() braucht
    // ohnehin keinen Timer mehr.
    expect(z, 'verzögerter focus() stiehlt die Eingabe aus der Nachrichtenzeile')
      .not.toContain('setTimeout');
    expect(z, 'scrollIntoView verschiebt auch die Seite dahinter und kämpft mit runter()')
      .not.toContain('scrollIntoView');
    // Fokus nur auf ausdrücklichen Wunsch — der Parameter ist die Bedingung.
    expect(z).toContain('if(fokus)');
  });

  it('bietet neben den Feldern keinen zweiten Weg an', () => {
    // Martin, 29.08.: „warum bieten wir überhaupt die Kontaktdaten im Chat
    // einzutragen — ist doch unnötig". Die drei Felder stehen jetzt direkt
    // über der Eingabezeile; ein Chip daneben führt vom Ziel weg und war der
    // längere Weg: erst tippen, dann vom Modell auslesen lassen, dann
    // bestätigen.
    expect(html, 'das Angebot „hier im Chat" ist zurück').not.toMatch(/hier im Chat/);
    const k = rumpf(html, 'function kontakt()');
    expect(k, 'die Karte bietet wieder Chips an').toContain('setChips([])');
    // Die Fähigkeit bleibt aber: wer seine Daten trotzdem tippt, wird
    // verstanden. Nur hingeschickt wird niemand mehr.
    expect(html, 'ein getippter Kontakt wird nicht mehr verstanden')
      .toContain("r.typ==='kontakt'");
  });

  it('korrigiert die Sicht ohne Animation', () => {
    // `.thread` steht auf `scroll-behavior:smooth`. Schön für eine neu
    // eintreffende Blase — verheerend für diese Korrektur, die bei offener
    // Tastatur in JEDEM Frame läuft: jede Zuweisung startet eine neue
    // Animation, der Verlauf kommt nie zur Ruhe. Im Browser nachgemessen
    // (29.08.): mit `smooth` blieb `scrollTop` auf 0 und das fokussierte
    // Feld stand 700 px unterhalb des Fensters; mit `auto` sitzt es drin.
    const s = rumpf(html, 'function sicht(');
    expect(s, 'sicht() nicht gefunden').not.toBe('');
    expect(s, 'die Korrektur laeuft animiert — der Verlauf kommt nie zur Ruhe')
      .toContain("scrollBehavior='auto'");
    expect(s, 'das vorherige Scrollverhalten wird nicht zurueckgesetzt')
      .toContain('thread.style.scrollBehavior=vorher');
  });

  it('lässt iOS bei keinem Eingabefeld hineinzoomen', () => {
    // Safari zoomt beim Fokus in jedes Feld unter 16 px. Das trifft nicht nur
    // die Lesbarkeit: ein hineingezoomtes Fenster verschiebt das ganze Panel.
    for (const feld of ['.feld', '.eingabe input']) {
      const px = schriftgroesse(handyBlock, feld) ?? schriftgroesse(html, feld);
      expect(px, `${feld} hat auf dem Handy keine Schriftgröße`).not.toBeNull();
      expect(px, `${feld} steht auf ${px}px — unter 16px zoomt iOS hinein`)
        .toBeGreaterThanOrEqual(16);
    }
  });
});
