/*
 * Sprungziele der Rechner-Startseite: jede id genau einmal und auf jeder Breite
 * sichtbar (Registry #141).
 *
 * Warum dieser Test existiert (26.10.2026): Google-Ads-Sitelinks zeigen auf
 * kostenrechner.primundus.de/#testsieger und /#ablauf. Am Computer (ab 1024 px)
 * sprangen beide nicht (live gemessen mit Playwright, scrollY 0):
 *  - #testsieger stand nur in TestsiegerSection im Block `lg:hidden`; der
 *    Testsieger-Kasten für den Computer hatte keine id. Auch das WELT-Siegel im
 *    Hero (href="#testsieger") sprang dort nicht.
 *  - #ablauf stand zweimal im DOM (HowItWorks im `lg:hidden`- und im
 *    `hidden lg:block`-Block). Der Browser nimmt das erste Element mit der id;
 *    ist es ausgeblendet, scrollt er nicht.
 * Am Handy liefen beide. #kostenvergleich und #calculator-form liefen überall.
 *
 * Der Root-Vitest darf keine Next-Komponenten laden (CI installiert die Pakete
 * von project 3 nicht), deshalb liest dieser Test den Quelltext von
 * app/page.tsx und der eingebundenen Komponenten mit dem TypeScript-Parser:
 * Wo steht die id, wie oft wird sie gerendert, und liegt auf dem Weg dorthin ein
 * Element, das auf irgendeiner Breite ausgeblendet ist (`hidden`, `lg:hidden`,
 * `md:hidden` …)?
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const RECHNER = join(__dirname, '..', '..', 'project 3');
const SEITE = join(RECHNER, 'app', 'page.tsx');
const ANKER = ['testsieger', 'ablauf', 'kostenvergleich', 'calculator-form'] as const;
/** Diese drei tragen ihren Abstand zur Kopfzeile als Klasse; #calculator-form über globals.css. */
const MIT_SCROLL_MT = new Set<string>(['testsieger', 'ablauf', 'kostenvergleich']);

type Element = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
interface Fund { el: Element; vorfahren: Element[] }

const quellen = new Map<string, ts.SourceFile>();
function lies(datei: string): ts.SourceFile {
  let sf = quellen.get(datei);
  if (!sf) {
    sf = ts.createSourceFile(datei, readFileSync(datei, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    quellen.set(datei, sf);
  }
  return sf;
}

/** Alle JSX-Elemente unterhalb von `wurzel`, je mit den umschließenden JSX-Elementen. */
function elemente(wurzel: ts.Node): Fund[] {
  const funde: Fund[] = [];
  const besuche = (n: ts.Node, stapel: Element[]) => {
    if (ts.isJsxSelfClosingElement(n)) {
      funde.push({ el: n, vorfahren: stapel });
      n.forEachChild((k) => besuche(k, stapel));
      return;
    }
    if (ts.isJsxElement(n)) {
      funde.push({ el: n.openingElement, vorfahren: stapel });
      const innen = [...stapel, n.openingElement];
      n.children.forEach((k) => besuche(k, innen));
      n.openingElement.forEachChild((k) => besuche(k, stapel));
      return;
    }
    n.forEachChild((k) => besuche(k, stapel));
  };
  besuche(wurzel, []);
  return funde;
}

function attribut(el: Element, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function idVon(el: Element): string | null {
  const a = attribut(el, 'id');
  if (!a?.initializer) return null;
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteralLike(a.initializer.expression)) {
    return a.initializer.expression.text;
  }
  return null;
}

/** Alle Klassen, die im className stehen können (auch aus Bedingungen und Vorlagen). */
function klassenVon(el: Element): string[] {
  const a = attribut(el, 'className');
  if (!a?.initializer) return [];
  const teile: string[] = [];
  const sammle = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n)) teile.push(n.text);
    else if (ts.isTemplateExpression(n)) {
      teile.push(n.head.text);
      n.templateSpans.forEach((s) => { teile.push(s.literal.text); sammle(s.expression); });
    } else n.forEachChild(sammle);
  };
  sammle(a.initializer);
  return teile.join(' ').split(/\s+/).filter(Boolean);
}

/** `hidden`, `lg:hidden`, `md:hidden`, `max-[374px]:hidden` … = auf mindestens einer Breite unsichtbar. */
const blendetAus = (klasse: string) => /^(?:[^\s:]+:)*hidden$/.test(klasse);

function beschreibe(el: Element): string {
  const id = idVon(el);
  const k = klassenVon(el).join(' ');
  return `<${el.tagName.getText()}${id ? ` id="${id}"` : ''}${k ? ` className="${k}"` : ''}>`;
}

/** Imports aus @/components/... in page.tsx: Komponentenname → Datei. */
function komponentenDerSeite(): Map<string, string> {
  const sf = lies(SEITE);
  const karte = new Map<string, string>();
  sf.statements.forEach((s) => {
    if (!ts.isImportDeclaration(s) || !ts.isStringLiteral(s.moduleSpecifier)) return;
    const pfad = s.moduleSpecifier.text;
    if (!pfad.startsWith('@/components/')) return;
    const datei = join(RECHNER, pfad.slice(2) + '.tsx');
    const namen = s.importClause?.namedBindings;
    if (namen && ts.isNamedImports(namen)) namen.elements.forEach((e) => karte.set(e.name.text, datei));
  });
  return karte;
}

/** Funktionsrumpf der Komponente `name` in `datei` (function Name / const Name = …). */
function komponente(datei: string, name: string): ts.Node {
  let fund: ts.Node | undefined;
  const suche = (n: ts.Node) => {
    if (fund) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) fund = n;
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) fund = n.initializer;
    else n.forEachChild(suche);
  };
  suche(lies(datei));
  if (!fund) throw new Error(`Komponente ${name} nicht in ${relative(RECHNER, datei)} gefunden`);
  return fund;
}

/** Was eine Komponente je Render ausgibt: jede return-Anweisung (bzw. Pfeil mit Ausdruck) für sich. */
function renderZweige(fn: ts.Node): ts.Node[] {
  const zweige: ts.Node[] = [];
  const suche = (n: ts.Node) => {
    if (ts.isReturnStatement(n) && n.expression) zweige.push(n.expression);
    if (ts.isArrowFunction(n) && !ts.isBlock(n.body)) zweige.push(n.body);
    n.forEachChild(suche);
  };
  suche(fn);
  return zweige;
}

interface Ort {
  /** Element mit der id */
  traeger: Element;
  /** Kette von außen nach innen bis einschließlich Träger, über Komponentengrenzen hinweg */
  kette: Element[];
  datei: string;
}

/**
 * Wie oft die id beim Rendern der Startseite im DOM steht und wo.
 * Komponenten mit mehreren return-Zweigen (MultiStepForm) zählen je Instanz mit
 * dem größten Zweig, weil immer nur ein Zweig gerendert wird.
 */
function orte(anker: string): { anzahl: number; orte: Ort[] } {
  const seite = lies(SEITE);
  const komponenten = komponentenDerSeite();
  const ergebnis: Ort[] = [];
  let anzahl = 0;
  for (const { el, vorfahren } of elemente(seite)) {
    if (idVon(el) === anker) {
      anzahl += 1;
      ergebnis.push({ traeger: el, kette: [...vorfahren, el], datei: SEITE });
    }
    const name = el.tagName.getText();
    const datei = komponenten.get(name);
    if (!datei) continue;
    let groesster = 0;
    for (const zweig of renderZweige(komponente(datei, name))) {
      const treffer = elemente(zweig).filter((f) => idVon(f.el) === anker);
      groesster = Math.max(groesster, treffer.length);
      treffer.forEach((t) => ergebnis.push({ traeger: t.el, kette: [...vorfahren, el, ...t.vorfahren, t.el], datei }));
    }
    anzahl += groesster;
  }
  return { anzahl, orte: ergebnis };
}

function tsxDateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((n) => {
    const p = join(ordner, n);
    if (statSync(p).isDirectory()) return tsxDateien(p);
    return n.endsWith('.tsx') ? [p] : [];
  });
}

describe('Sprungziele der Rechner-Startseite (Registry #141)', () => {
  it.each(ANKER)('#%s steht genau einmal im DOM', (anker) => {
    const { anzahl } = orte(anker);
    expect(anzahl, `id="${anker}" wird ${anzahl}× gerendert — der Browser springt nur zum ersten`).toBe(1);
  });

  it.each(ANKER)('#%s liegt auf keiner Breite in einem ausgeblendeten Block', (anker) => {
    const { orte: liste } = orte(anker);
    expect(liste.length).toBeGreaterThan(0);
    for (const ort of liste) {
      const versteckt = ort.kette.filter((el) => klassenVon(el).some(blendetAus));
      expect(
        versteckt.map(beschreibe),
        `id="${anker}" (${relative(RECHNER, ort.datei)}) liegt in einem Block, der auf einer Breite ausgeblendet ist`,
      ).toEqual([]);
    }
  });

  it.each([...MIT_SCROLL_MT])('#%s hält Abstand zur Kopfzeile (scroll-mt)', (anker) => {
    for (const ort of orte(anker).orte) {
      expect(klassenVon(ort.traeger).some((k) => /^scroll-mt-/.test(k)), `${beschreibe(ort.traeger)} ohne scroll-mt`).toBe(true);
    }
  });

  it('#testsieger umfasst den Kasten fürs Handy und den für den Computer, das WELT-Siegel im Hero zeigt darauf', () => {
    const [ort] = orte('testsieger').orte;
    expect(ort?.datei, 'Sprungziel #testsieger gehört in app/page.tsx um beide Fassungen').toBe(SEITE);
    const block = ort.traeger.parent;
    expect(block.getText()).toContain('<TestsiegerSection');
    expect(block.getText(), 'Testsieger-Kasten für den Computer fehlt im Sprungziel').toContain('6× Testsieger');
    expect(lies(SEITE).getFullText()).toContain('href="#testsieger"');
  });

  it('die ids stehen nur dort, wo der Test sie sucht (keine verschachtelte Komponente, kein vergessener Ort)', () => {
    const bekannt = new Set([SEITE, ...komponentenDerSeite().values()]);
    for (const datei of [SEITE, ...tsxDateien(join(RECHNER, 'components'))]) {
      const text = readFileSync(datei, 'utf8');
      for (const anker of ANKER) {
        if (!text.includes(`id="${anker}"`)) continue;
        expect(bekannt.has(datei), `id="${anker}" steht in ${relative(RECHNER, datei)}, das page.tsx nicht direkt einbindet`).toBe(true);
      }
    }
  });
});
