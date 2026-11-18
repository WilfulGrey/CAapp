/*
 * Rechner-Startseite im Look von Formular und Portal (Registry #155, Martin 09.11.2026: „Pass das mal alles an. Genau so“).
 * Quelltext-Test wie rechnerPortalLook.test.ts (der Root-Vitest lädt keine Next-Komponenten).
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { faqs } from '../../project 3/components/calculator/faqData';

const p3 = join(__dirname, '..', '..', 'project 3');
const lies = (datei: string) => readFileSync(join(p3, datei), 'utf8');
const seite = lies('app/page.tsx');

describe('Rechner-Startseite (Registry #155)', () => {
  it('eine Reihenfolge für alle Breiten: Ablauf, Stimmen, Garantie und Testsieger, Vergleich, Fragen, Schluss', () => {
    const reihe = ['<HowItWorks />', 'id="kundenstimmen"', '<BestpriceGuarantee />', '<ComparisonSection />', '<FAQSection />', '<FinalCTA bewertung={bewertung} />'];
    const pos = reihe.map((r) => seite.indexOf(r));
    for (const [i, p] of pos.entries()) expect(p, reihe[i]).toBeGreaterThan(-1);
    for (let i = 1; i < pos.length; i++) expect(pos[i]).toBeGreaterThan(pos[i - 1]);
    // Jeder Abschnitt nur einmal im Quelltext (vorher Ablauf und Karten doppelt, je nach Breite versteckt).
    expect(seite.split('<HowItWorks />')).toHaveLength(2);
  });

  it('die drei Erklärteile sind weg, auch als Datei', () => {
    for (const name of ['WhatIs24hCare', 'RequirementsSection', 'CareServicesSection']) {
      expect(seite).not.toContain(name);
      expect(existsSync(join(p3, `components/calculator/${name}.tsx`))).toBe(false);
    }
  });

  it('die Sprungziele der Sitelinks bleiben', () => {
    expect(lies('components/calculator/HowItWorks.tsx')).toContain('id="ablauf"');
    expect(seite).toContain('id="kundenstimmen"');
    // Anker an der Testsieger-Karte selbst (das WELT-Siegel im Kopf springt dorthin).
    expect(lies('components/calculator/BestpriceGuarantee.tsx')).toContain('<div id="testsieger" className="scroll-mt-28 lg:grid"><TestsiegerKarte /></div>');
    expect(lies('components/calculator/ComparisonSection.tsx')).toContain('id="kostenvergleich"');
  });

  it('Pflegeheim-Vergleich: Satz, Zahlen und Hinweis unverändert', () => {
    const v = lies('components/calculator/ComparisonSection.tsx');
    for (const t of ['deutlich günstiger als ein Pflegeheimplatz', '3.364 €', 'ab ca. 923 €', 'Beim Grundpreis rund 2.440 € weniger im Monat', 'vdek, Stand 1. Juli 2026']) {
      expect(v).toContain(t);
    }
  });

  it('Fragen: keine Vermittler-Sprache, keine Zahl ohne Beleg, „Wie schnell …“ bleibt', () => {
    const text = faqs.map((f) => `${f.question} ${f.answer}`).join(' ');
    expect(text).not.toMatch(/Netzwerk|tausende|[Vv]ermittl|Grundmobilität/);
    expect(faqs.map((f) => f.question)).toContain('Wie schnell kann eine Betreuungskraft starten?');
    expect(faqs.map((f) => f.question)).toContain('Wie läuft die Betreuung ab?');
  });

  it('ein Knopftext überall: „Angebot & Pflegekräfte ansehen“ (Martin 09.11., OpenAI-Empfehlung)', () => {
    for (const datei of ['components/calculator/HowItWorks.tsx', 'components/calculator/ComparisonSection.tsx', 'components/calculator/FinalCTA.tsx', 'components/calculator/HelpDialog.tsx']) {
      const t = lies(datei);
      expect(t, datei).toContain('{KNOPF_ANGEBOT}');
      expect(t, datei).not.toMatch(/>\s*Preis & Pflegekräfte ansehen/);
    }
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain('{KNOPF_ANGEBOT}{"\\u00a0"}→');
  });

  it('Schluss wie auf primundus.de: Titel, Text, Produktbühne, Punkte wie im Hero, Marta-Band (Registry #168)', () => {
    // Martin 16.11.2026: „diesen Schlusspunkt … das aufwendige, schöne Teil, was wir haben mit diesem Handy da drin“ und
    // „die Punkte darunter würde ich ändern, so wie wir sie jetzt überall haben“.
    const s = lies('components/calculator/FinalCTA.tsx');
    expect(s).not.toContain('bg-[#8B7355]');
    for (const t of ['In 2 Minuten wissen\\u00A0Sie, was es kostet und wer zu Ihnen passt.', '<ProduktBuehne />', '{GARANTIE.wort}', 'PORTAL_PUNKTE.map', '<BewertungsZeile stand={bewertung} />', 'Lieber erst sprechen?', 'täglich 8–20 Uhr']) expect(s).toContain(t);
    // Dieselben Punkte wie unter dem Hero-Knopf (Registry #158), nicht die alten von primundus.de.
    expect(s).not.toMatch(/Kein Vertrag vor Ihrer Auswahl|Täglich kündbar/);
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain('{PORTAL_PUNKTE.map((punkt) => (');
    // Die Bühne zeigt kein Preisbeispiel und keine erfundene Zahl außerhalb der Beispielprofile.
    const b = lies('components/calculator/ProduktBuehne.tsx');
    expect(b).not.toMatch(/\d[.\d]*\s?€/);
    expect(b).toContain('/downloads/die-welt-service-champions-2021.pdf');
  });
});

describe('Rechner-Startseite: eine linke Kante (Registry #160), Stil von primundus.de (Registry #168)', () => {
  // Martin 09.11.2026: „achte hier darauf, dass Überschriften linksbündig sind etc.“; 16.11.: „auf primundus.de sieht alles
  // schöner aus … richtig schöne, cleane und professionelle darstellung“.
  const ablauf = lies('components/calculator/HowItWorks.tsx');
  const vergleich = lies('components/calculator/ComparisonSection.tsx');
  const schluss = lies('components/calculator/FinalCTA.tsx');
  const garantie = lies('components/calculator/BestpriceGuarantee.tsx');
  const testsieger = lies('components/calculator/TestsiegerSection.tsx');
  const fragen = lies('components/calculator/FAQSection.tsx');
  const stimmen = lies('components/calculator/TestimonialCard.tsx');
  const marta = lies('components/calculator/PersonalContact.tsx');
  const stil = lies('components/calculator/startStil.ts');
  // Form des Hero-Knopfs (MultiStepForm.tsx), dort unverändert.
  const HERO_FORM = 'py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)]';

  it('Überschriften wie primundus.de: extrafett, #1C1C1C, enge Laufweite; eine Quelle für alle Abschnitte', () => {
    expect(stil).toContain("export const H2 = 'mt-3 text-[30px] md:text-[40px] font-extrabold leading-[1.1] tracking-[-0.03em] text-[#1C1C1C]");
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Fragen', fragen]] as const) {
      expect(t, name).toContain('className={H2}');
      expect(t, name).not.toContain('text-[#3D3D3D] mb-');
    }
  });

  it('die unteren Knöpfe sehen aus wie der Hero-Knopf: Höhe, Schatten, Pfeil als Text, links und so breit wie der Hero-Knopf', () => {
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain(HERO_FORM);
    expect(stil).toContain(HERO_FORM);
    expect(stil).toContain('inline-flex w-full max-w-md items-center');
    expect(stil).not.toContain('shadow-lg');
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Schluss', schluss]] as const) {
      expect(t, name).toContain('className={KNOPF}');
      expect(t, name).toContain('{KNOPF_ANGEBOT}{"\\u00a0"}→');
      expect(t, name).not.toContain('sm:w-auto');
    }
    expect(ablauf).not.toContain('text-center');
    expect(vergleich).not.toContain('text-center');
    expect(seite).toContain('<div className="mb-7 max-w-md">');
  });

  it('Garantie und Testsieger: linksbündig, Pillen an der Inhaltskante, Siegel und Titel in einer Kopfzeile', () => {
    for (const [name, t] of [['Garantie', garantie], ['Testsieger', testsieger]] as const) {
      expect(t, name).not.toMatch(/text-center|items-center text-center|mx-auto lg:mx-0|left-1\/2/);
      expect(t, name).not.toContain('#8A8279');
      expect(t, name).toMatch(/p-7 md:p-9/);
      expect(t, name).toMatch(/left-7/);
    }
    // Vorher Siegel allein in einem 160 px hohen Feld (lg:h-40 / w-40 h-40): Karten wirkten am Computer leer.
    expect(garantie).not.toContain('lg:h-40');
    expect(testsieger).not.toContain('w-40 h-40');
    expect(garantie).toContain('xl:flex-row');
    expect(testsieger).toContain('mt-3 flex items-start gap-5');
    expect(garantie).toContain('<div className="lg:grid"><BestpreisKarte /></div>');
    // Wortlaut, Siegel und Beleg-PDF unverändert.
    expect(garantie).toContain('{GARANTIE.zusage}');
    expect(garantie).toContain('{GARANTIE.warum}');
    expect(testsieger).toContain('6× Testsieger');
    expect(testsieger).toContain('Nr. 1 der Pflegekräfte-Vermittler');
    expect(testsieger).toContain('/downloads/die-welt-service-champions-2021.pdf');
  });

  it('alle Abschnitte in der Spalte von Kopf und Hero (eine linke Kante auf jeder Breite); Fragen und Schluss über die volle Breite', () => {
    // Hero: 1256 px mit lg:px-5 = 1216 px Innenbreite, am Tablet max-w-[560px] mittig. Ändert sich der Hero, hier mitziehen.
    expect(seite).toContain('mx-auto grid w-full max-w-[1256px] items-center lg:grid-cols-[46fr_54fr] lg:gap-12 lg:px-5');
    expect(seite).toContain('<div className="mx-auto max-w-[560px] lg:mx-0 lg:max-w-none">');
    expect(stil).toContain("export const SPALTE = 'mx-auto max-w-[560px] lg:max-w-[1216px]'");
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Fragen', fragen]] as const) {
      expect(t, name).toContain('className={SPALTE}');
    }
    expect(seite).toContain('max-w-[560px] lg:max-w-[1216px]');
    expect(schluss).toContain('max-w-[1216px]');
    expect(garantie).toContain('mx-auto grid max-w-[560px] gap-10 lg:max-w-[1216px] lg:grid-cols-2');
    for (const t of [ablauf, vergleich, fragen, schluss, garantie]) expect(t).not.toMatch(/md:max-w-\[900px\]|max-w-\[1100px\]|max-w-\[640px\]/);
    // Fragen ab md zwei Spalten (vorher 640 px schmal links), am Handy eine Karte mit Trennlinien.
    expect(fragen).toContain('md:grid md:grid-cols-2 md:items-start');
    // Ablauf: am Handy eine Karte, ab lg drei Karten nebeneinander.
    expect(ablauf).toContain('lg:grid lg:grid-cols-3');
    // Schluss ab lg zweispaltig mit der Produktbühne rechts.
    expect(schluss).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]');
  });

  it('Kundenstimmen auf dem dunklen Band wie primundus.de (Registry #168), Karten unverändert', () => {
    expect(seite).toContain('<section id="kundenstimmen" className="scroll-mt-24 bg-[#191715]');
    expect(seite).toContain('<TestimonialCard bewertung={bewertung} dunkel />');
    expect(stimmen).toContain('dunkel = false');
  });

  it('Kundenstimmen: Sterne in Gold wie die Zeile darüber, Raster ab md (Tablet 2, Computer 3 Spalten), am Handy Laufband', () => {
    expect(stimmen).toContain('fill-[#D4A843] text-[#D4A843]');
    expect(stimmen).not.toContain('#FBBC04');
    expect(stimmen).toContain('overflow-x-auto');
    expect(stimmen).toContain('md:grid md:grid-cols-2 md:min-w-0 lg:grid-cols-3');
    expect(stimmen).toContain('md:w-auto');
  });

  it('Kostenvergleich: zwei Karten mit den Punkten von primundus.de, Punkte erst ab md (Registry #168)', () => {
    const vergleich = lies('components/calculator/ComparisonSection.tsx');
    expect((vergleich.match(/text-\[36px\][^"]*lg:text-\[40px\]/g) || []).length).toBe(2);
    expect((vergleich.match(/hidden gap-2\.5 md:grid/g) || []).length).toBe(2);
    for (const t of ['Umzug in eine fremde Umgebung', 'Im gewohnten Zuhause bleiben', 'Empfohlen']) expect(vergleich).toContain(t);
  });

  it('Martas Kasten: der Standard der Verwendungen bleibt (der Schluss hat seit #168 das Marta-Band von primundus.de)', () => {
    expect(marta).toContain("'rounded-2xl border border-[#D4D4D8] bg-white p-4 shadow-sm'");
    expect(marta).toContain("'text-[#3D2B1F]'");
    expect(marta).toContain('ohneRahmen = false');
    for (const datei of ['app/24h-pflege-kostenrechner/page.tsx', 'app/step-2/page.tsx', 'components/calculator/KontaktSeite.tsx', 'components/calculator/PreisSeite.tsx']) {
      const t = lies(datei);
      // app/24h-pflege-kostenrechner importiert ihn nur; die übrigen zeigen ihn im Standard.
      expect(t, datei).toContain('PersonalContact');
      expect(t, datei).not.toContain('ohneRahmen');
    }
  });
});
