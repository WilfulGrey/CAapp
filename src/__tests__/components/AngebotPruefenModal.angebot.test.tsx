/** @vitest-environment jsdom */
// „Angebot prüfen“, Schritt 1, neu gegliedert wie die Bewerbungskarte (Martin 14.11.2026, mockup_pruefen.html):
//   - Schritte als Kreise mit Linie: der aktuelle dunkel gefüllt, die anderen grau umrandet; erledigte führen zurück
//   - Abschnitte „Pflegekraft“ (Kopf wie die Zeile der Liste, ohne Stufe), „Angebot“ (Zeilen links grau, rechts dunkel),
//     „Nachricht“ (application.message wörtlich, kein gelber Kasten)
//   - keine Zeitangabe mehr („vor 12 Min.“), über „Weiter“ der Satz „Sie unterschreiben erst in Schritt 3.“
// Werte und Bedingungen wie vorher, nur umbenannt: Tagessatz = Monat / 30, Sommerzuschlag nur bei Juli/August im Zeitraum.
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AngebotPruefenModal } from '../../components/portal/AngebotPruefenModal';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

const nurse = {
  id: 1, caregiverId: 25407, name: 'Halina Jankowska', age: 60, color: '#8B7355',
  experience: '5 J. Erfahrung', experienceYears: 5, language: { level: 'Gut', bars: 3 },
  history: { assignments: 14, avgDurationMonths: 2 }, availability: '', availableSoon: false,
  addedTime: '', isLive: false, gender: 'female',
} as unknown as Nurse;

function bewerbung(offer: Partial<Application['offer']> = {}, message = 'Ich reise mit meinem Hund.\nEr ist ruhig.'): Application {
  return {
    id: '13721', nurse, agencyName: 'Pflegeagentur', appliedAt: '—', status: 'new', message,
    offer: {
      monatlicheKosten: 2850, anreisedatum: '01.10.2026', abreisedatum: '15.12.2026',
      anreisekosten: 125, abreisekosten: 125, reisetage: 'Halb', feiertagszuschlag: 95,
      kuendigungsfrist: 'Täglich kündbar', submittedAt: 'vor 12 Min.',
      ...offer,
    },
  };
}

function oeffnen(app = bewerbung()) {
  const onNurseClick = vi.fn();
  render(<AngebotPruefenModal app={app} onClose={vi.fn()} onAccept={vi.fn()} onNurseClick={onNurseClick} />);
  return { onNurseClick };
}

const angebot = () => document.querySelector('[data-pruefen-angebot]') as HTMLElement;
/** Wert rechts neben der Bezeichnung (geschützte Leerzeichen als normale Leerzeichen). */
const wert = (label: string) =>
  (within(angebot()).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? '').replace(/ /g, ' ');
const schritte = () => within(screen.getByRole('list', { name: 'Schritte' })).getAllByRole('listitem');

beforeEach(() => window.sessionStorage.clear());

describe('Angebot prüfen, Schritt 1 (Martin 14.11.2026)', () => {
  it('Schritte: drei Kreise „Angebot“, „Ihre Angaben“, „Unterschrift“, nur der erste aktuell und dunkel gefüllt', () => {
    oeffnen();
    expect(screen.getByRole('heading', { name: 'Angebot prüfen' })).toBeInTheDocument();
    const li = schritte();
    expect(li.map((s) => s.textContent)).toEqual(['1Angebot', '2Ihre Angaben', '3Unterschrift']);
    expect(li[0]).toHaveAttribute('aria-current', 'step');
    expect(li[1]).not.toHaveAttribute('aria-current');
    const kreis = (s: HTMLElement) => s.querySelector('[data-schritt-kreis]')?.className ?? '';
    expect(kreis(li[0])).toContain('bg-pm-ink');
    for (const s of li.slice(1)) expect(kreis(s)).toMatch(/border-pm-line .*bg-white/);
    // Kein Koralle-Ton und nicht mehr „1 · Angebot“ mit Unterstrich.
    expect(screen.getByRole('list', { name: 'Schritte' }).innerHTML).not.toMatch(/coral/);
    expect(screen.queryByText(/1 · Angebot/)).toBeNull();
  });

  it('Pflegekraft wie die Zeile der Liste: „Vorname, Alter“, Erfahrung, Deutsch; ohne Stufe und Einsätze; Tipp öffnet das Profil', async () => {
    const { onNurseClick } = oeffnen();
    const kopf = within(document.querySelector('[data-pruefen-pflegekraft]') as HTMLElement);
    expect(kopf.getByText('Pflegekraft')).toBeInTheDocument();
    expect(kopf.getByText('Halina')).toBeInTheDocument();
    expect(kopf.getByText(', 60')).toBeInTheDocument();
    expect(kopf.getByText('5 Jahre Erfahrung')).toBeInTheDocument();
    expect(kopf.getByText('Deutsch Gut')).toBeInTheDocument();
    const text = (document.querySelector('[data-pruefen-pflegekraft]') as HTMLElement).textContent ?? '';
    expect(text).not.toMatch(/Elite|Stammkraft|Bewährt|Einsätze|Profil →/);
    await userEvent.click(kopf.getByRole('button', { name: /Profil von Halina/ }));
    expect(onNurseClick).toHaveBeenCalledWith(nurse);
  });

  it('Angebot als Zeilen mit den bisherigen Werten, neu benannt; Reisekosten gleich hoch → „je Fahrt“ mit Zusatzzeile', () => {
    oeffnen();
    expect(within(angebot()).getAllByRole('term').map((t) => t.textContent))
      .toEqual(['Tagessatz', 'Anreise', 'Abreise', 'Reisekosten', 'Reisetage', 'Feiertage', 'Kündigung']);
    expect(wert('Tagessatz')).toBe('95 € (2.850 € im Monat)');
    expect(wert('Anreise')).toBe('01.10.2026');
    expect(wert('Abreise')).toBe('vorauss. 15.12.2026');
    expect(wert('Reisekosten')).toBe('125 € je Fahrtfür Anreise und Abreise');
    expect(within(angebot()).getByText('für Anreise und Abreise').className).toContain('text-pm-muted');
    expect(wert('Reisetage')).toBe('voller Tagessatz');
    expect(wert('Feiertage')).toBe('doppelter Tagessatz');
    expect(wert('Kündigung')).toBe('täglich kündbar');
    // Oktober bis Dezember: kein Sommerzuschlag (Martin 09.09.2026).
    expect(within(angebot()).queryByText('Sommerzuschlag')).toBeNull();
  });

  it('Reisekosten verschieden hoch → „125 € Anreise, 130 € Abreise“, ohne Zusatzzeile', () => {
    oeffnen(bewerbung({ abreisekosten: 130 }));
    expect(wert('Reisekosten')).toBe('125 € Anreise, 130 € Abreise');
    expect(screen.queryByText('für Anreise und Abreise')).toBeNull();
  });

  it('Sommerzuschlag nur, wenn der Zeitraum Juli/August berührt: „6,67 € pro Tag“ mit grauer Zeile „im Juli und August“', () => {
    oeffnen(bewerbung({ anreisedatum: '19.05.2026', abreisedatum: '19.07.2026' }));
    // Stelle wie im Entwurf: zwischen Feiertage und Kündigung.
    expect(within(angebot()).getAllByRole('term').map((t) => t.textContent))
      .toEqual(['Tagessatz', 'Anreise', 'Abreise', 'Reisekosten', 'Reisetage', 'Feiertage', 'Sommerzuschlag', 'Kündigung']);
    expect(wert('Sommerzuschlag')).toBe('6,67 € pro Tagim Juli und August');
    expect(screen.getByText('im Juli und August').className).toContain('text-pm-muted');
  });

  it('ⓘ bei Feiertagen klappt die Liste der Feiertage auf und wieder zu; aria-controls zeigt immer auf ein vorhandenes Element', async () => {
    oeffnen();
    const info = screen.getByRole('button', { name: 'Welche Feiertage?' });
    // Feste 20 px plus before:-inset-3 = 44 px Tippfläche (Regel in ui/Button.tsx); nur Symbolgröße ergab 42 px.
    expect(info.className).toMatch(/\bh-5\b/);
    expect(info.className).toMatch(/\bw-5\b/);
    expect(info.className).toContain('before:-inset-3');
    const liste = document.getElementById(info.getAttribute('aria-controls') ?? '');
    expect(liste).not.toBeNull();
    expect(info).toHaveAttribute('aria-expanded', 'false');
    expect(liste).not.toBeVisible();
    await userEvent.click(info);
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Karfreitag, Ostersonntag, Ostermontag, 1\. Mai/)).toBeVisible();
    await userEvent.click(info);
    expect(info).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/Karfreitag/)).not.toBeVisible();
  });

  it('Schritt 1 ohne Grün, Mint, Gelb oder Koralle-Fläche (Grün nur für „Pflegesituation vervollständigen“)', () => {
    oeffnen(bewerbung({ anreisedatum: '19.05.2026', abreisedatum: '19.07.2026' }));
    // Vorher: „✓ Täglich kündbar“ auf bg-green-50, grüner Haken in der Schrittanzeige, gelber Kasten der Agentur.
    expect(screen.getByRole('dialog').innerHTML).not.toMatch(/pm-green|mint|green-\d|amber|coral-tint|yellow/);
  });

  it('Nachricht wörtlich mit Zeilenumbruch, ohne gelben Kasten; keine Zeitangabe', () => {
    oeffnen();
    expect(screen.getByText('Nachricht')).toBeInTheDocument();
    const text = screen.getByText(/Ich reise mit meinem Hund\./);
    expect(text.textContent).toBe('Ich reise mit meinem Hund.\nEr ist ruhig.');
    expect(text.className).toContain('whitespace-pre-wrap');
    expect(text.closest('[class*="amber"]')).toBeNull();
    expect(screen.queryByText(/Hinweis der Agentur/i)).toBeNull();
    expect(screen.queryByText('vor 12 Min.')).toBeNull();
    expect(screen.queryByText('Konditionen')).toBeNull();
  });

  it('ohne Nachricht kein leerer Abschnitt „Nachricht“', () => {
    oeffnen(bewerbung({}, '  '));
    expect(screen.queryByText('Nachricht')).toBeNull();
  });

  it('über „Weiter“ steht „Sie unterschreiben erst in Schritt 3.“; „Weiter“ (Koralle) führt zu den Angaben, „Angebot“ zurück', async () => {
    oeffnen();
    expect(screen.getByText('Sie unterschreiben erst in Schritt 3.')).toBeInTheDocument();
    const weiter = screen.getByRole('button', { name: 'Weiter' });
    expect(weiter.className).toContain('bg-pm-coral');
    expect(weiter.className).not.toContain('bg-pm-green');
    await userEvent.click(weiter);
    expect(screen.getByRole('heading', { name: 'Ihre Angaben' })).toBeInTheDocument();
    expect(screen.queryByText('Sie unterschreiben erst in Schritt 3.')).toBeNull();
    expect(schritte()[1]).toHaveAttribute('aria-current', 'step');
    // Erledigter Schritt: Haken statt Zahl, antippbar zurück zum Angebot.
    await userEvent.click(within(schritte()[0]).getByRole('button', { name: /Angebot/ }));
    expect(screen.getByRole('heading', { name: 'Angebot prüfen' })).toBeInTheDocument();
  });
});
