// Kontaktbereich oben im Gebucht-Bildschirm — PROTOTYP 14.10.2026 (Martin: „Bereich oben … Marta Kapcio oder Kollegen und
// diese Telefonnummer … in dringenden Notfällen außerhalb der Geschäftszeiten"). Wortlaut: texte_final.md, V1–V3.
// Die Notfallnummer steht nirgends im Code: Hier stehen nur der Vorschau-Platzhalter und ein erkennbarer Fantasiewert.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  GebuchtKontakt,
  KONTAKT_EMPFEHLUNG,
  NOTFALL_PLATZHALTER,
  kontaktVarianteAusUrl,
  martaUntenAusUrl,
  notfallTelHref,
  type KontaktVariante,
} from '../../components/portal/GebuchtKontakt';
import { BookedScreen } from '../../components/portal/BookedScreen';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';
import { TELEFON, TELEFON_HREF } from '../../lib/kontakt';

/** Erkennbarer Fantasiewert, keine echte Nummer. */
const FANTASIE = '0123 456789';
const VARIANTEN: KontaktVariante[] = [1, 2, 3];

function links() {
  return screen.getAllByRole('link').map((a) => a.getAttribute('href'));
}

describe('GebuchtKontakt — ohne Notfallnummer entfällt die Nachtzeile (kein Ersatzwert)', () => {
  for (const variante of VARIANTEN) {
    for (const leer of [null, undefined, '', '   ']) {
      it(`V${variante}, notfallTelefon=${JSON.stringify(leer)} → keine Notfallzeile, kein 112, kein Platzhalter`, () => {
        const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={leer} />);
        expect(screen.queryByText(/Primundus-Notfallnummer/)).toBeNull();
        expect(screen.queryByText(/bis zum Morgen/)).toBeNull();
        expect(screen.queryByText(/112/)).toBeNull();
        expect(screen.queryByText(NOTFALL_PLATZHALTER)).toBeNull();
        expect(container.querySelector('[data-notfall]')).toBeNull();
        // Die Erreichbarkeit bleibt: Marta mit Knöpfen und sichtbarer Nummer.
        expect(screen.getByText('Marta Kapcio')).toBeTruthy();
        expect(screen.getByText(/Telefon und WhatsApp:/)).toBeTruthy();
      });
    }
  }
});

describe('GebuchtKontakt — Knöpfe und Links', () => {
  for (const variante of VARIANTEN) {
    it(`V${variante}: Anrufen (tel:) und WhatsApp (wa.me) wie im Marta-Kasten, sichtbare Nummer als tel:-Link`, () => {
      render(<GebuchtKontakt variante={variante} notfallTelefon={null} />);
      const anrufen = screen.getAllByRole('link', { name: `Marta Kapcio anrufen: ${TELEFON}` });
      // Runder Knopf + sichtbare Nummer
      expect(anrufen).toHaveLength(2);
      for (const a of anrufen) expect(a.getAttribute('href')).toBe(TELEFON_HREF);
      const wa = screen.getByRole('link', { name: 'Marta Kapcio per WhatsApp schreiben' });
      expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/4989200000830\?text=/);
      expect(wa.getAttribute('target')).toBe('_blank');
      // Sichtbare Nummer bricht nicht um (geschützte Leerzeichen).
      expect(anrufen.some((a) => a.textContent === TELEFON.replace(/ /g, '\u00a0'))).toBe(true);
      expect(links().every((h) => h === TELEFON_HREF || h?.startsWith('https://wa.me/'))).toBe(true);
    });

    it(`V${variante}: mit Nummer → Notfall-Link tel:, Bildschirmleser-Text, für Clarity maskiert, 112-Hinweis`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE} />);
      const notfall = screen.getAllByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE}` });
      // V3 hat zusätzlich den runden Knopf.
      expect(notfall).toHaveLength(variante === 3 ? 2 : 1);
      for (const a of notfall) expect(a.getAttribute('href')).toBe('tel:+49123456789');
      const block = container.querySelector('[data-notfall]');
      expect(block?.getAttribute('data-clarity-mask')).toBe('true');
      for (const a of notfall) expect(block?.contains(a)).toBe(true);
      expect(screen.getByText('Bei medizinischen Notfällen: 112')).toBeTruthy();
    });

    it(`V${variante}: Vorschau-Platzhalter → sichtbar, aber nie als tel:-Link`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={NOTFALL_PLATZHALTER} />);
      expect(screen.getByText(NOTFALL_PLATZHALTER)).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Notfallnummer anrufen/ })).toBeNull();
      expect(links().some((h) => h?.includes('Notfall'))).toBe(false);
      if (variante === 3) {
        const knopf = container.querySelector('[data-platzhalter="notfall-knopf"]');
        expect(knopf?.tagName).toBe('SPAN');
        expect(knopf?.getAttribute('aria-hidden')).toBe('true');
      }
    });
  }

  it('V3: Überschrift „So erreichen Sie uns", Etiketten mit Uhrzeit, „oder ein Kollege"', () => {
    render(<GebuchtKontakt variante={3} notfallTelefon={FANTASIE} />);
    expect(screen.getByRole('heading', { level: 2, name: 'So erreichen Sie uns' })).toBeTruthy();
    expect(screen.getByText('Täglich 8 bis 20 Uhr')).toBeTruthy();
    expect(screen.getByText('oder ein Kollege')).toBeTruthy();
    expect(screen.getByText('Von 20 bis 8 Uhr')).toBeTruthy();
    expect(screen.getByText('Wenn etwas nicht bis zum Morgen warten kann.')).toBeTruthy();
  });

  it('Ton: kein „bei akuten Problemen", kein „abberufen", kein „wenn etwas nicht passt"', () => {
    for (const variante of VARIANTEN) {
      const { container, unmount } = render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE} />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/akut|abberuf|nicht passt|Notfalltelefon/i);
      unmount();
    }
  });
});

describe('notfallTelHref', () => {
  it('Beratungsnummer ergibt genau den bekannten tel:-Link (Prüfung der Umrechnung)', () => {
    expect(notfallTelHref(TELEFON)).toBe(TELEFON_HREF);
  });
  it('0049 und +49 werden zu +49, Trennzeichen fallen weg', () => {
    expect(notfallTelHref('0049 123 456789')).toBe('tel:+49123456789');
    expect(notfallTelHref('+49 123 456-789')).toBe('tel:+49123456789');
    expect(notfallTelHref('0123/456789')).toBe('tel:+49123456789');
  });
  it('Platzhalter, Buchstaben, zu kurz, leer → null', () => {
    expect(notfallTelHref(NOTFALL_PLATZHALTER)).toBeNull();
    expect(notfallTelHref('Notruf 0123')).toBeNull();
    expect(notfallTelHref('0123')).toBeNull();
    expect(notfallTelHref('')).toBeNull();
    expect(notfallTelHref(null)).toBeNull();
    expect(notfallTelHref('12345678')).toBeNull();
  });
});

describe('Vorschau-Schalter', () => {
  it('?kontakt=1|2|3, sonst Empfehlung V3', () => {
    expect(kontaktVarianteAusUrl('?preview=gebucht&kontakt=1')).toBe(1);
    expect(kontaktVarianteAusUrl('?preview=gebucht&kontakt=2')).toBe(2);
    expect(kontaktVarianteAusUrl('?kontakt=3')).toBe(3);
    expect(kontaktVarianteAusUrl('?preview=gebucht')).toBe(KONTAKT_EMPFEHLUNG);
    expect(kontaktVarianteAusUrl('?kontakt=4')).toBe(KONTAKT_EMPFEHLUNG);
    expect(KONTAKT_EMPFEHLUNG).toBe(3);
  });
  it('?unten=siegel|marta, sonst Marta-Kasten wie heute', () => {
    expect(martaUntenAusUrl('?unten=siegel')).toBe('siegel');
    expect(martaUntenAusUrl('?unten=marta')).toBe('marta');
    expect(martaUntenAusUrl('?unten=x')).toBe('marta');
    expect(martaUntenAusUrl('')).toBe('marta');
  });
  it('Quelltext-Wächter: Der Platzhalter geht nur in der Vorschau ?preview=gebucht an den Bildschirm', () => {
    const quelle = readFileSync('src/pages/CustomerPortalPage.tsx', 'utf8');
    const treffer = quelle.match(/NOTFALL_PLATZHALTER/g) ?? [];
    // Import + genau eine Verwendung
    expect(treffer).toHaveLength(2);
    expect(quelle).toMatch(/notfallTelefon:\s*IS_PREVIEW_GEBUCHT\s*\?\s*NOTFALL_PLATZHALTER\s*:\s*null/);
  });
});

function makeApp(): Application {
  return {
    id: 'app-1',
    nurse: {
      id: 1, caregiverId: 50001, name: 'Maria Kowalski', age: 45, color: '#8B7355', experience: '5 J. Erfahrung',
      experienceYears: 5, language: { level: 'B1', bars: 3 }, history: { assignments: 7, avgDurationMonths: 2 },
      availability: '', availableSoon: false, addedTime: '', isLive: false, gender: 'female',
    } as unknown as Nurse,
    agencyName: 'Pflegeagentur',
    appliedAt: '—',
    status: 'accepted',
    message: '',
    offer: {
      monatlicheKosten: 2490, anreisedatum: '01.08.2026', abreisedatum: '12.09.2026', anreisekosten: 125, abreisekosten: 125,
      reisetage: 'Halb', feiertagszuschlag: 83, kuendigungsfrist: 'Täglich kündbar', submittedAt: '14.07.2026',
    },
  };
}

describe('BookedScreen mit Kontaktbereich (Prototyp)', () => {
  const kontakt = { variante: 3 as const, notfallTelefon: FANTASIE, martaUnten: 'marta' as const };

  it('Bereich steht direkt unter der Einleitung, vor der Pflegekraft und „Einsatz-Zeitraum & Kosten"', () => {
    const { container } = render(<BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned kontakt={kontakt} />);
    const bereich = container.querySelector('[data-kontakt-variante]');
    expect(bereich).toBeTruthy();
    const einleitung = screen.getByText(/meldet sich in Kürze persönlich bei Ihnen/);
    const pflegekraft = screen.getAllByText(/Maria/)[0];
    // DOCUMENT_POSITION_FOLLOWING = 4
    expect(einleitung.compareDocumentPosition(bereich as Node) & 4).toBe(4);
    expect((bereich as Node).compareDocumentPosition(pflegekraft) & 4).toBe(4);
  });

  it('Einsatz beendet → kein Bereich oben, Marta-Kasten am Ende bleibt', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned einsatzBeendet sterne={null} kontakt={kontakt} />,
    );
    expect(container.querySelector('[data-kontakt-variante]')).toBeNull();
    expect(screen.queryByText(/Primundus-Notfallnummer/)).toBeNull();
    expect(screen.getByText('Noch Fragen?')).toBeTruthy();
  });

  it('ohne `kontakt` → kein Bereich (Stand heute)', () => {
    const { container } = render(<BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned />);
    expect(container.querySelector('[data-kontakt-variante]')).toBeNull();
  });

  it('martaUnten: „marta" = Kasten wie heute; „siegel" = nur Siegel und Sterne, Marta nur einmal auf der Seite', () => {
    const { unmount } = render(<BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned sterne={null} kontakt={kontakt} />);
    expect(screen.getByText('Noch Fragen?')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'Marta Kapcio' })).toHaveLength(2);
    unmount();
    render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned sterne={null} kontakt={{ ...kontakt, martaUnten: 'siegel' }} />,
    );
    expect(screen.queryByText('Noch Fragen?')).toBeNull();
    expect(screen.getAllByRole('img', { name: 'Marta Kapcio' })).toHaveLength(1);
    expect(screen.getByRole('img', { name: 'Testsieger DIE WELT' })).toBeTruthy();
  });

  it('ohne Nummer (Produktion heute): nur Erreichbarkeit, keine Nachtzeile', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned kontakt={{ ...kontakt, notfallTelefon: null }} />,
    );
    const bereich = container.querySelector('[data-kontakt-variante]') as HTMLElement;
    expect(within(bereich).getByText('Täglich 8 bis 20 Uhr')).toBeTruthy();
    expect(within(bereich).queryByText('Von 20 bis 8 Uhr')).toBeNull();
    expect(screen.queryByText(/112/)).toBeNull();
  });
});
