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

  it('Schluss hell mit Knopf, „100 % kostenfrei“, Kennzahlen und Marta', () => {
    const s = lies('components/calculator/FinalCTA.tsx');
    expect(s).not.toContain('bg-[#8B7355]');
    for (const t of ['<KostenfreiZeile />', '<KennzahlenZeile bewertung={bewertung} />', '<PersonalContact headline="Lieber direkt Kontakt aufnehmen?" body="" ohneRahmen />', '{KOPF_FRAGEN}']) expect(s).toContain(t);
  });
});

describe('Rechner-Startseite: eine linke Kante (Registry #160, ENTWURF)', () => {
  // Martin 09.11.2026: „achte hier darauf, dass Überschriften linksbündig sind etc.“
  const ablauf = lies('components/calculator/HowItWorks.tsx');
  const vergleich = lies('components/calculator/ComparisonSection.tsx');
  const schluss = lies('components/calculator/FinalCTA.tsx');
  const garantie = lies('components/calculator/BestpriceGuarantee.tsx');
  const testsieger = lies('components/calculator/TestsiegerSection.tsx');
  const fragen = lies('components/calculator/FAQSection.tsx');
  const stimmen = lies('components/calculator/TestimonialCard.tsx');
  const marta = lies('components/calculator/PersonalContact.tsx');
  // Form des Hero-Knopfs (MultiStepForm.tsx), dort unverändert.
  const HERO_FORM = 'py-[18px] text-[16px] min-[375px]:text-[17px] font-bold text-white shadow-[0_4px_14px_rgba(231,111,99,0.32)]';

  it('die drei unteren Knöpfe sehen aus wie der Hero-Knopf: Höhe, Schatten, Pfeil als Text; Ablauf und Vergleich auch 17 px', () => {
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain(HERO_FORM);
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Schluss', schluss]] as const) {
      expect(t, name).toContain('py-[18px]');
      expect(t, name).toContain('shadow-[0_4px_14px_rgba(231,111,99,0.32)]');
      expect(t, name).toContain('{KNOPF_ANGEBOT}{"\\u00a0"}→');
      expect(t, name).not.toContain('<svg');
      expect(t, name).not.toContain('shadow-lg');
    }
    expect(ablauf).toContain(HERO_FORM);
    expect(vergleich).toContain(HERO_FORM);
    // Schluss: die Karte ist am Handy 32 px schmaler als die Spalte; 17 px erst ab 400 px, damit bis zum Umbruch mindestens
    // 13 px Reserve bleiben (vorher 4 px bei 375 px Breite).
    expect(schluss).toContain('px-2 py-[18px] text-[15px] min-[375px]:text-[16px] min-[400px]:text-[17px] font-bold text-white');
    expect(schluss).not.toContain('px-1 ');
  });

  it('Knöpfe in Ablauf und Vergleich stehen an der linken Kante, nicht mittig, und sind so breit wie der Hero-Knopf', () => {
    expect(ablauf).not.toContain('text-center');
    expect(vergleich).not.toContain('text-center');
    // Hero: w-full in max-w-md (448 px); vorher sm:w-auto = 355 px Breite nach Inhalt.
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich]] as const) {
      expect(t, name).toContain('inline-flex w-full max-w-md items-center');
      expect(t, name).not.toContain('sm:w-auto');
    }
    expect(seite).toContain('<div className="mb-7 max-w-md">');
  });

  it('Garantie und Testsieger: linksbündig, Pillen an der Inhaltskante, Text 16 px in #6B6B6B', () => {
    for (const [name, t] of [['Garantie', garantie], ['Testsieger', testsieger]] as const) {
      expect(t, name).not.toMatch(/text-center|items-center text-center|mx-auto lg:mx-0|left-1\/2/);
      expect(t, name).not.toContain('#8A8279');
    }
    expect(garantie).not.toMatch(/text-\[1[45]px\]/);
    expect(garantie.match(/text-\[#6B6B6B\]/g)).toHaveLength(1);
    expect(testsieger).toContain('text-[16px] text-[#6B6B6B]');
    // Auch am Computer gestapelt (Siegel über dem Titel), eine Fassung, gleiche Innenabstände in beiden Karten.
    expect(garantie).not.toContain('<BestpreisKarte kompakt');
    expect(garantie).not.toContain('if (kompakt)');
    expect(garantie).toContain('<div className="lg:grid"><BestpreisKarte /></div>');
    expect(testsieger).not.toMatch(/lg:flex-row|lg:p-8|lg:left-8|lg:mb-0/);
    expect(garantie).not.toMatch(/lg:p-10|lg:left-10/);
    for (const t of [garantie, testsieger]) {
      expect(t).toContain('p-7 md:p-9 relative');
      expect(t).toContain('left-7 md:left-9 bg-');
    }
    // Garantie-Siegel ab lg in einem Feld so hoch wie das WELT-Siegel (w-40 h-40), damit beide Titel auf einer Höhe stehen.
    expect(garantie).toContain('mb-5 lg:flex lg:h-40 lg:items-center');
    expect(testsieger).toContain('w-40 h-40 mb-5 flex');
    // Wortlaut, Siegel und Beleg-PDF unverändert.
    expect(garantie).toContain('{GARANTIE.zusage}');
    expect(garantie).toContain('{GARANTIE.warum}');
    expect(testsieger).toContain('6× Testsieger');
    expect(testsieger).toContain('/downloads/die-welt-service-champions-2021.pdf');
  });

  it('alle Abschnitte in der Spalte von Kopf und Hero (eine linke Kante auf jeder Breite), Fragen und Schluss gleich schmal', () => {
    // Hero: 1256 px mit lg:px-5 = 1216 px Innenbreite, am Tablet max-w-[560px] mittig. Ändert sich der Hero, hier mitziehen.
    expect(seite).toContain('mx-auto grid w-full max-w-[1256px] items-center lg:grid-cols-[46fr_54fr] lg:gap-12 lg:px-5');
    expect(seite).toContain('<div className="mx-auto max-w-[560px] lg:mx-0 lg:max-w-none">');
    const spalte = 'max-w-[560px] lg:max-w-[1216px]';
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Fragen', fragen], ['Schluss', schluss], ['Seite (Kundenstimmen)', seite]] as const) {
      expect(t, name).toContain(spalte);
      expect(t, name).not.toMatch(/md:max-w-\[900px\]|max-w-\[1100px\]/);
    }
    expect(garantie).toContain('mx-auto grid max-w-[560px] gap-10 lg:max-w-[1216px] lg:grid-cols-2');
    expect(garantie).not.toMatch(/md:max-w-\[900px\]|max-w-\[1100px\]/);
    // Fragen-Liste und Schluss-Karte gleich breit (rechte Kanten bündig).
    expect(fragen).toContain('md:max-w-[640px]');
    expect(fragen).not.toContain('md:max-w-[760px]');
    expect(schluss).toContain('grid max-w-[640px] gap-4');
    // Ablauf am Tablet untereinander wie am Handy (drei Spalten in 560 px wären zu schmal), ab lg nebeneinander.
    expect(lies('components/calculator/FormularPortal.tsx')).toContain('quer ? "lg:grid lg:grid-cols-3 lg:gap-4" : undefined');
    expect(ablauf).toContain('px-4 pt-4 pb-1 lg:px-6 lg:py-6');
  });

  it('Schluss: Titel wie die übrigen H2 über der Karte, Knopf über die volle Kartenbreite, „100 % kostenfrei“ darunter mittig', () => {
    expect(schluss).not.toContain('text-center');
    expect(schluss).toContain('<h2 className="text-[26px] md:text-[32px] lg:text-[38px] leading-[1.25] font-bold text-[#3D3D3D] mb-6 md:mb-8">{KOPF_FRAGEN}</h2>');
    expect(schluss.indexOf('{KOPF_FRAGEN}')).toBeLessThan(schluss.indexOf('rounded-[20px] bg-white'));
    // Abstand nach oben wie zwischen den übrigen Abschnitten (py-12 md:py-16 + py-12 md:py-16 = 96/128 px).
    expect(schluss).toContain('px-5 pt-12 pb-14 md:pt-16 md:pb-20');
    expect(schluss).not.toContain('sm:w-auto');
    expect(schluss).toContain('inline-flex w-full items-center');
    // KostenfreiZeile selbst bleibt unverändert (läuft im Formular) und zentriert sich.
    expect(lies('components/calculator/FormularPortal.tsx')).toMatch(/export function KostenfreiZeile[\s\S]{0,600}?justify-center/);
  });

  it('Kundenstimmen: Sterne in Gold wie die Zeile darüber, ab lg Raster mit drei Spalten, am Handy Laufband', () => {
    expect(stimmen).toContain('fill-[#D4A843] text-[#D4A843]');
    expect(stimmen).not.toContain('#FBBC04');
    expect(stimmen).toContain('overflow-x-auto');
    expect(stimmen).toContain('lg:grid lg:grid-cols-3');
  });

  it('Martas Kasten: ohne Rahmen nur im Schluss, der Standard der fünf Verwendungen bleibt', () => {
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
