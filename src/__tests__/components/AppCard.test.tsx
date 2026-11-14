/** @vitest-environment jsdom */
// Bewerbungskarte (Registry #164, Martin 14.11.2026: „darunter halt eben so in gräulich die Pflegekraft, das Angebot und da kommt
// 95 € Tagessatz, in Klammern vielleicht nochmal den Monatssatz, Anreise, Abreise, Reisekosten und Nachricht, dass das alles
// so ein bisschen strukturierter zusammenpasst“; „unter dem Button die Punkte, dann sieht das genauso aus wie im Angebot“).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppCard } from '../../components/portal/AppCard';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

const nurse: Nurse = {
  caregiverId: 4711, name: 'Maria Kowalska', age: 62, experience: '6 J. Erfahrung', experienceYears: 6,
  availability: 'sofort verfügbar', availableSoon: true, language: { level: 'Gut', bars: 3 }, color: '#8B7355',
  addedTime: '', isLive: true, gender: 'female', history: { assignments: 14, avgDurationMonths: 2.5 },
};
const app = (o: Partial<Application['offer']> = {}, message = 'Ich freue mich auf den Einsatz bei Ihnen.'): Application => ({
  id: 'a1', nurse, agencyName: 'Primundus', appliedAt: '', status: 'new', message,
  offer: {
    monatlicheKosten: 2850, anreisedatum: '19.05.2026', abreisedatum: '19.07.2026', anreisekosten: 125, abreisekosten: 125,
    reisetage: 'Voller Tagessatz', feiertagszuschlag: 0, kuendigungsfrist: 'täglich', submittedAt: '', ...o,
  },
});
const ohne = (el: Element, sel: string) => { const k = el.cloneNode(true) as Element; k.querySelectorAll(sel).forEach((x) => x.remove()); return k.textContent; };

describe('Bewerbungskarte gegliedert (Registry #164)', () => {
  it('drei graue Abschnitte: Pflegekraft (Zeile wie die Liste), Angebot (Tagessatz mit Monatssatz, Anreise, Abreise, Reisekosten), Nachricht; darunter „Angebot prüfen“, Punkte und Kennzahlen wie im Angebot, „Ablehnen“', async () => {
    const onReview = vi.fn();
    const onBestpreis = vi.fn();
    const { container } = render(
      <AppCard app={app()} onReview={onReview} onDecline={() => {}} onNurseClick={() => {}}
        vorteile={{ onBestpreis, sterne: { schnitt: '4,9', wert: 4.9, anzahl: 126 } }} />,
    );
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Pflegekraft', 'Angebot', 'Nachricht']);
    // Pflegekraft: Kopf wie die Zeile der Liste, ohne Stufe und ohne Einsätze.
    const kopf = screen.getByTestId('pflegekraft-profil');
    expect(ohne(kopf, '[aria-hidden="true"]')).toBe('Maria, 626 Jahre ErfahrungDeutsch Gut');
    expect(container.textContent).not.toMatch(/Elite|Stammkraft|Einsätze bei uns|Profil ansehen|verfügbar/);
    // Angebot: Bezeichnung links, Wert rechts.
    const angebot = container.querySelector('[data-bewerbung-angebot]') as HTMLElement;
    expect([...angebot.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Tagessatz', 'Anreise', 'Abreise', 'Reisekosten']);
    expect([...angebot.querySelectorAll('dd')].map((d) => d.textContent)).toEqual([
      '95 € (2.850 € im Monat)', '19.05.2026', 'vorauss. 19.07.2026', '125 € je Fahrt',
    ]);
    // Nachricht wörtlich, ohne Kasten „Hinweis der Agentur“.
    expect(screen.getByText('Ich freue mich auf den Einsatz bei Ihnen.')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Hinweis der Agentur/i);
    // Kein „Frage an … stellen“ ohne Chat.
    expect(screen.queryByRole('button', { name: /Frage an/ })).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Angebot prüfen' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    // Unter dem Knopf dieselben Punkte und Kennzahlen wie die Preiskarte vor dem Speichern.
    const punkte = container.querySelector('[data-garantie]') as HTMLElement;
    expect(within(punkte).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Bestpreisgarantie', 'Keine Vermittlungsgebühren', 'Tägliche Kündigung', 'Taggenaue Abrechnung']);
    expect(container.querySelector('[data-kopf-warum]')!.textContent).toBe('Warum Primundus?');
    expect(container.querySelector('[data-vertrauen]')!.textContent).toMatch(/4,9.*126 Bewertungen.*20 Jahre.*6× in Folge/);
    await userEvent.setup().click(within(punkte).getByRole('button', { name: /^Bestpreisgarantie/ }));
    expect(onBestpreis).toHaveBeenCalledTimes(1);
    // Kein grüner Link „Mehr Infos“ mehr.
    expect(screen.queryByRole('button', { name: 'Mehr Infos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ablehnen' })).toBeInTheDocument();
  });

  it('verschiedene Reisekosten: „125 € Anreise, 130 € Abreise“; ohne Nachricht kein Abschnitt „Nachricht“', () => {
    const { container } = render(
      <AppCard app={app({ abreisekosten: 130 }, '  ')} onReview={() => {}} onDecline={() => {}} onNurseClick={() => {}} />,
    );
    const angebot = container.querySelector('[data-bewerbung-angebot]') as HTMLElement;
    expect([...angebot.querySelectorAll('dd')].at(-1)!.textContent).toBe('125 € Anreise, 130 € Abreise');
    expect([...container.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['Pflegekraft', 'Angebot']);
  });
});
