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

  it('die drei unteren Knöpfe sehen aus wie der Hero-Knopf: Höhe, 17 px, Schatten, Pfeil als Text', () => {
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain(HERO_FORM);
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Schluss', schluss]] as const) {
      expect(t, name).toContain(HERO_FORM);
      expect(t, name).toContain('{KNOPF_ANGEBOT}{"\\u00a0"}→');
      expect(t, name).not.toContain('<svg');
      expect(t, name).not.toContain('shadow-lg');
    }
  });

  it('Knöpfe in Ablauf und Vergleich stehen an der linken Kante, nicht mittig', () => {
    expect(ablauf).not.toContain('text-center');
    expect(vergleich).not.toContain('text-center');
  });

  it('Garantie und Testsieger: linksbündig, Pillen an der Inhaltskante, Text 16 px in #6B6B6B', () => {
    for (const [name, t] of [['Garantie', garantie], ['Testsieger', testsieger]] as const) {
      expect(t, name).not.toMatch(/text-center|items-center text-center|mx-auto lg:mx-0|left-1\/2/);
      expect(t, name).not.toContain('#8A8279');
    }
    expect(garantie).not.toMatch(/text-\[1[45]px\]/);
    expect(garantie.match(/text-\[#6B6B6B\]/g)).toHaveLength(2);
    expect(testsieger).toContain('text-[16px] text-[#6B6B6B]');
    // Wortlaut, Siegel und Beleg-PDF unverändert.
    expect(garantie).toContain('{GARANTIE.zusage}');
    expect(garantie).toContain('{GARANTIE.warum}');
    expect(testsieger).toContain('6× Testsieger');
    expect(testsieger).toContain('/downloads/die-welt-service-champions-2021.pdf');
  });

  it('Fragen und Schluss stehen in derselben Spalte wie die Abschnitte darüber, der Inhalt bleibt schmal', () => {
    const spalte = 'max-w-[560px] md:max-w-[900px] lg:max-w-[1100px]';
    for (const [name, t] of [['Ablauf', ablauf], ['Vergleich', vergleich], ['Fragen', fragen], ['Schluss', schluss]] as const) {
      expect(t, name).toContain(spalte);
    }
    expect(fragen).toContain('md:max-w-[760px]');
    expect(schluss).toContain('grid max-w-[640px] gap-4');
  });

  it('Schluss: Titel links, Knopf über die volle Kartenbreite, „100 % kostenfrei“ darunter mittig', () => {
    expect(schluss).not.toContain('text-center');
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
