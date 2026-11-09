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
    expect(lies('components/calculator/BestpriceGuarantee.tsx')).toContain('id="testsieger"');
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
    expect(lies('components/calculator/MultiStepForm.tsx')).toContain('{KNOPF_ANGEBOT} →');
  });

  it('Schluss hell mit Knopf, „100 % kostenfrei“, Kennzahlen und Marta', () => {
    const s = lies('components/calculator/FinalCTA.tsx');
    expect(s).not.toContain('bg-[#8B7355]');
    for (const t of ['<KostenfreiZeile />', '<KennzahlenZeile bewertung={bewertung} />', '<PersonalContact />', '{KOPF_FRAGEN}']) expect(s).toContain(t);
  });
});
