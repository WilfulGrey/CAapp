// Kontaktbereich im Gebucht-Bildschirm — PROTOTYP 14.10.2026 (Martin: „Bereich oben … Marta Kapcio oder Kollegen und
// diese Telefonnummer"). Wortlaut: texte_final.md (Runde 3 + 3b), V1–V3.
// Die Notfallnummer steht nirgends im Code: Hier stehen nur der Vorschau-Platzhalter und erkennbare Fantasiewerte.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  GebuchtKontakt,
  KONTAKT_EMPFEHLUNG,
  KONTAKT_TEXTE,
  NOTFALL_GELTUNG,
  NOTFALL_PLATZHALTER,
  kontaktPositionAusUrl,
  kontaktVarianteAusUrl,
  martaUntenAusUrl,
  notfallAusVorschauUrl,
  notfallTelHref,
  type KontaktVariante,
} from '../../components/portal/GebuchtKontakt';
import { BookedScreen } from '../../components/portal/BookedScreen';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';
import { ERREICHBAR, TELEFON, TELEFON_HREF } from '../../lib/kontakt';

/** Erkennbare Fantasiewerte, keine echten Nummern. */
const FANTASIE_PL = '+48 123 456 789';
const FANTASIE_PL_HREF = 'tel:+48123456789';
const FANTASIE_DE = '0123 456789';
const VARIANTEN: KontaktVariante[] = [1, 2, 3];
const NBSP = ' ';

function links() {
  return screen.getAllByRole('link').map((a) => a.getAttribute('href'));
}
/** Text ohne geschützte Leerzeichen (für Vergleiche mit den Konstanten). */
function text(el: Element | null) {
  return (el?.textContent ?? '').replace(/ /g, ' ');
}

describe('Wortlaut (texte_final.md, Runde 3)', () => {
  it('Martins Phrase steht wörtlich in den Notfallzeilen beider Formen, ohne Uhrzeit', () => {
    expect(NOTFALL_GELTUNG).toBe('in dringenden Fällen jederzeit, vor allem außerhalb unserer Zeiten');
    expect(KONTAKT_TEXTE.notfallZeile).toBe(`Primundus-Notfallnummer, ${NOTFALL_GELTUNG}:`);
    expect(KONTAKT_TEXTE.v2Notfall).toBe(`Bitte melden Sie sich ${NOTFALL_GELTUNG}, unter der Primundus-Notfallnummer:`);
    for (const t of Object.values(KONTAKT_TEXTE)) {
      expect(t).not.toMatch(/20 bis 8|bis zum Morgen|nachts|akut|abberuf|Probleme|nicht passt|Notfalltelefon/i);
      // Kein WhatsApp bei der Notfallnummer (offen, ob sie WhatsApp hat).
      expect(/WhatsApp/.test(t) && /Notfall/.test(t)).toBe(false);
    }
  });
  it('„täglich 8–20 Uhr" kommt aus ERREICHBAR (portalweiter Standard)', () => {
    expect(KONTAKT_TEXTE.tagZeile).toBe(`Telefon und WhatsApp, ${ERREICHBAR}:`);
    expect(KONTAKT_TEXTE.v2Tag).toBe(`Bei Fragen erreichen Sie uns ${ERREICHBAR} per Telefon und WhatsApp:`);
    expect(ERREICHBAR).toBe('täglich 8–20 Uhr');
  });
  it('Empfehlung V1', () => {
    expect(KONTAKT_EMPFEHLUNG).toBe(1);
  });
});

describe('GebuchtKontakt — Aufbau je Variante', () => {
  for (const variante of VARIANTEN) {
    it(`V${variante}: Phrase im DOM, „oder ein Kollege", Tageszeile aus ERREICHBAR, 112 im Notfallblock`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE_PL} />);
      const alles = text(container);
      expect(alles).toContain(NOTFALL_GELTUNG);
      expect(alles).toContain(variante === 2 ? KONTAKT_TEXTE.v2Tag : KONTAKT_TEXTE.tagZeile);
      expect(alles).toContain(variante === 2 ? KONTAKT_TEXTE.v2Notfall : KONTAKT_TEXTE.notfallZeile);
      expect(screen.getByText('oder ein Kollege')).toBeTruthy();
      expect(alles).not.toMatch(/20 bis 8|bis zum Morgen|Ihre Beraterin/);
      const block = container.querySelector('[data-notfall]');
      expect(block).toBeTruthy();
      expect(within(block as HTMLElement).getByText(KONTAKT_TEXTE.hinweis112)).toBeTruthy();
    });

    it(`V${variante}: „8–20 Uhr" bricht nicht um (nowrap), Nummern mit geschützten Leerzeichen`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE_PL} />);
      const zeit = [...container.querySelectorAll('span.whitespace-nowrap')].map((el) => el.textContent);
      expect(zeit).toContain('8–20 Uhr');
      const tag = screen.getByRole('link', { name: KONTAKT_TEXTE.ariaTag });
      expect(tag.textContent).toBe(TELEFON.replace(/ /g, NBSP));
      const notfall = screen.getByRole('link', { name: `Primundus-Notfallnummer anrufen: ${FANTASIE_PL}` });
      expect(notfall.textContent).toBe(FANTASIE_PL.replace(/ /g, NBSP));
    });
  }

  it('V3 hat die sichtbare Überschrift, V1/V2 nur den Bereichsnamen für Screenreader', () => {
    const { unmount } = render(<GebuchtKontakt variante={3} notfallTelefon={null} />);
    expect(screen.getByRole('heading', { level: 2, name: 'So erreichen Sie uns' })).toBeTruthy();
    unmount();
    for (const variante of [1, 2] as const) {
      const r = render(<GebuchtKontakt variante={variante} notfallTelefon={null} />);
      expect(screen.queryByRole('heading')).toBeNull();
      expect(screen.getByRole('region', { name: 'So erreichen Sie uns' })).toBeTruthy();
      r.unmount();
    }
  });
});

describe('GebuchtKontakt — Knöpfe und Links', () => {
  for (const variante of VARIANTEN) {
    it(`V${variante}: runde Knöpfe wie im Marta-Kasten, sichtbare Tagesnummer „Primundus anrufen"`, () => {
      render(<GebuchtKontakt variante={variante} notfallTelefon={null} />);
      const rund = screen.getByRole('link', { name: `Marta Kapcio anrufen: ${TELEFON}` });
      expect(rund.getAttribute('href')).toBe(TELEFON_HREF);
      const wa = screen.getByRole('link', { name: 'Marta Kapcio per WhatsApp schreiben' });
      expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/4989200000830\?text=/);
      const tag = screen.getByRole('link', { name: `Primundus anrufen: ${TELEFON}` });
      expect(tag.getAttribute('href')).toBe(TELEFON_HREF);
      expect(tag.className).toMatch(/min-h-\[44px\]/);
      expect(links().every((h) => h === TELEFON_HREF || h?.startsWith('https://wa.me/'))).toBe(true);
    });

    it(`V${variante}: Notfallnummer = genau EIN tel:-Link (kein runder Knopf), maskiert, 44 px Tippfläche`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE_PL} />);
      const notfall = screen.getAllByRole('link', { name: /Notfallnummer anrufen/ });
      expect(notfall).toHaveLength(1);
      expect(notfall[0].getAttribute('href')).toBe(FANTASIE_PL_HREF);
      expect(notfall[0].getAttribute('aria-label')).toBe(`Primundus-Notfallnummer anrufen: ${FANTASIE_PL}`);
      expect(notfall[0].className).toMatch(/min-h-\[44px\]/);
      const block = container.querySelector('[data-notfall]');
      expect(block?.getAttribute('data-clarity-mask')).toBe('true');
      expect(block?.contains(notfall[0])).toBe(true);
      // Kein runder Knopf (48 px) im Notfallblock.
      expect(block?.querySelector('.rounded-full')).toBeNull();
      // Kein WhatsApp bei der Notfallnummer.
      expect(block?.querySelector('a[href^="https://wa.me"]')).toBeNull();
    });

    it(`V${variante}: deutsche Nummer wird ebenfalls angenommen`, () => {
      render(<GebuchtKontakt variante={variante} notfallTelefon={FANTASIE_DE} />);
      expect(screen.getByRole('link', { name: /Notfallnummer anrufen/ }).getAttribute('href')).toBe('tel:+49123456789');
    });

    it(`V${variante}: Vorschau-Platzhalter → sichtbar, aber nie als tel:-Link`, () => {
      const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={NOTFALL_PLATZHALTER} />);
      expect(screen.getByText(NOTFALL_PLATZHALTER)).toBeTruthy();
      expect(screen.queryByRole('link', { name: /Notfallnummer anrufen/ })).toBeNull();
      expect(container.querySelector('[data-platzhalter="notfall"]')?.tagName).toBe('SPAN');
      expect(links().some((h) => h?.includes('Notfall'))).toBe(false);
    });

    for (const leer of [null, undefined, '', '   ', 'Notruf 0123', '+48 123 456', '+43 1 234567', '48 123 456 789']) {
      it(`V${variante}, notfallTelefon=${JSON.stringify(leer)} → kein Notfallblock, kein 112, kein toter Link`, () => {
        const { container } = render(<GebuchtKontakt variante={variante} notfallTelefon={leer} />);
        expect(container.querySelector('[data-notfall]')).toBeNull();
        expect(text(container)).not.toMatch(/Notfallnummer|112|jederzeit/);
        expect(screen.queryByRole('link', { name: /Notfallnummer/ })).toBeNull();
        // Die Erreichbarkeit bleibt.
        expect(screen.getByText('Marta Kapcio')).toBeTruthy();
        expect(screen.getByRole('link', { name: KONTAKT_TEXTE.ariaTag })).toBeTruthy();
      });
    }
  }
});

describe('notfallTelHref', () => {
  it('Beratungsnummer ergibt genau den bekannten tel:-Link (Prüfung der Umrechnung)', () => {
    expect(notfallTelHref(TELEFON)).toBe(TELEFON_HREF);
  });
  it('Polen: +48 und 0048, genau 9 Ziffern', () => {
    expect(notfallTelHref('+48 123 456 789')).toBe('tel:+48123456789');
    expect(notfallTelHref('0048 123 456 789')).toBe('tel:+48123456789');
    expect(notfallTelHref('+48 123-456-789')).toBe('tel:+48123456789');
    expect(notfallTelHref('+48123456789')).toBe('tel:+48123456789');
    expect(notfallTelHref('+48 123 456 78')).toBeNull();
    expect(notfallTelHref('+48 123 456 7890')).toBeNull();
    expect(notfallTelHref('48 123 456 789')).toBeNull();
  });
  it('Deutschland: +49, 0049, national mit 0, (0) und „+49 0…" werden zu +49', () => {
    expect(notfallTelHref('0049 123 456789')).toBe('tel:+49123456789');
    expect(notfallTelHref('+49 123 456-789')).toBe('tel:+49123456789');
    expect(notfallTelHref('0123/456789')).toBe('tel:+49123456789');
    expect(notfallTelHref('+49 (0)89 200 000 830')).toBe(TELEFON_HREF);
    expect(notfallTelHref('+49 089 200 000 830')).toBe(TELEFON_HREF);
    expect(notfallTelHref('+49 12345')).toBeNull();
    expect(notfallTelHref('+49 1234 5678 9012 34')).toBeNull();
  });
  it('Platzhalter, Buchstaben, + mitten drin, andere Länder, zu kurz, leer → null', () => {
    expect(notfallTelHref(NOTFALL_PLATZHALTER)).toBeNull();
    expect(notfallTelHref('Notruf 0123')).toBeNull();
    expect(notfallTelHref('0123 +456789')).toBeNull();
    expect(notfallTelHref('++48 123 456 789')).toBeNull();
    expect(notfallTelHref('+43 1 234567')).toBeNull();
    expect(notfallTelHref('0123')).toBeNull();
    expect(notfallTelHref('')).toBeNull();
    expect(notfallTelHref(null)).toBeNull();
    expect(notfallTelHref('12345678')).toBeNull();
  });
});

describe('Vorschau-Schalter', () => {
  it('?kontakt=1|2|3, sonst Empfehlung V1', () => {
    expect(kontaktVarianteAusUrl('?preview=gebucht&kontakt=1')).toBe(1);
    expect(kontaktVarianteAusUrl('?preview=gebucht&kontakt=2')).toBe(2);
    expect(kontaktVarianteAusUrl('?kontakt=3')).toBe(3);
    expect(kontaktVarianteAusUrl('?preview=gebucht')).toBe(KONTAKT_EMPFEHLUNG);
    expect(kontaktVarianteAusUrl('?kontakt=4')).toBe(KONTAKT_EMPFEHLUNG);
  });
  it('?unten=siegel|marta, sonst Marta-Kasten wie heute', () => {
    expect(martaUntenAusUrl('?unten=siegel')).toBe('siegel');
    expect(martaUntenAusUrl('?unten=marta')).toBe('marta');
    expect(martaUntenAusUrl('?unten=x')).toBe('marta');
    expect(martaUntenAusUrl('')).toBe('marta');
  });
  it('?kontaktpos=unten, sonst oben', () => {
    expect(kontaktPositionAusUrl('?kontaktpos=unten')).toBe('unten');
    expect(kontaktPositionAusUrl('?kontaktpos=oben')).toBe('oben');
    expect(kontaktPositionAusUrl('?kontaktpos=x')).toBe('oben');
    expect(kontaktPositionAusUrl('')).toBe('oben');
  });
  it('?notfall=… kodiert und unkodiert (ein „+" wird zum Leerzeichen), sonst Platzhalter', () => {
    expect(notfallAusVorschauUrl('?preview=gebucht&notfall=%2B48%20123%20456%20789')).toBe(FANTASIE_PL);
    expect(notfallAusVorschauUrl('?preview=gebucht&notfall=+48 123 456 789')).toBe(FANTASIE_PL);
    expect(notfallAusVorschauUrl('?preview=gebucht&notfall=0123%20456789')).toBe(FANTASIE_DE);
    expect(notfallAusVorschauUrl('?preview=gebucht')).toBe(NOTFALL_PLATZHALTER);
    expect(notfallAusVorschauUrl('?preview=gebucht&notfall=')).toBe(NOTFALL_PLATZHALTER);
  });
  it('Quelltext-Wächter: außerhalb ?preview=gebucht ist der Bereich AUS, die Nummer kommt nur aus der Vorschau-URL', () => {
    const quelle = readFileSync('src/pages/CustomerPortalPage.tsx', 'utf8');
    expect(quelle).toMatch(/const VORSCHAU_SUCHE = IS_PREVIEW_GEBUCHT && typeof window !== 'undefined' \? window\.location\.search : null;/);
    expect(quelle).toMatch(/const GEBUCHT_KONTAKT = VORSCHAU_SUCHE !== null && [^\n]*\n\s*\?[\s\S]*?:\s*undefined;/);
    // notfallAusVorschauUrl: Import + genau eine Verwendung (in GEBUCHT_KONTAKT)
    expect(quelle.match(/notfallAusVorschauUrl/g) ?? []).toHaveLength(2);
    expect(quelle).not.toMatch(/NOTFALL_PLATZHALTER/);
    expect(quelle.match(/kontakt=\{GEBUCHT_KONTAKT\}/g) ?? []).toHaveLength(1);
  });
  it('Quelltext-Wächter: keine polnische oder deutsche Mobilnummer im Code außerhalb der Tests', () => {
    const treffer: string[] = [];
    const lauf = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const pfad = join(dir, name);
        if (statSync(pfad).isDirectory()) {
          if (name !== '__tests__') lauf(pfad);
        } else if (/\.(tsx?|css|json)$/.test(name)) {
          const inhalt = readFileSync(pfad, 'utf8');
          if (/(?:\+|00)48[\s/-]?\d{3}[\s/-]?\d{3}[\s/-]?\d{3}/.test(inhalt)) treffer.push(pfad);
        }
      }
    };
    lauf('src');
    expect(treffer).toEqual([]);
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
  const kontakt = { variante: 1 as const, notfallTelefon: FANTASIE_PL, martaUnten: 'marta' as const };

  it('Standard: Bereich direkt unter der Einleitung, vor der Pflegekraft', () => {
    const { container } = render(<BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned kontakt={kontakt} />);
    const bereich = container.querySelector('[data-kontakt-variante]');
    expect(bereich).toBeTruthy();
    const einleitung = screen.getByText(/meldet sich in Kürze persönlich bei Ihnen/);
    const pflegekraft = screen.getAllByText(/Maria/)[0];
    // DOCUMENT_POSITION_FOLLOWING = 4
    expect(einleitung.compareDocumentPosition(bereich as Node) & 4).toBe(4);
    expect((bereich as Node).compareDocumentPosition(pflegekraft) & 4).toBe(4);
  });

  it('Vertrag offen + position „unten": Vertragsknopf vor dem Bereich, Bereich nach „Als Nächstes"', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} onSignContract={() => {}} kontakt={{ ...kontakt, position: 'unten' }} />,
    );
    const bereich = container.querySelector('[data-kontakt-variante]') as Node;
    const knopf = screen.getByRole('button', { name: /Vertrag jetzt abschließen/ });
    const alsNaechstes = screen.getByRole('heading', { name: 'Als Nächstes' });
    expect(knopf.compareDocumentPosition(bereich) & 4).toBe(4);
    expect(alsNaechstes.compareDocumentPosition(bereich) & 4).toBe(4);
  });

  it('Vertrag offen + Standard „oben": Bereich vor dem Vertragsknopf', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} onSignContract={() => {}} kontakt={kontakt} />,
    );
    const bereich = container.querySelector('[data-kontakt-variante]') as Node;
    const knopf = screen.getByRole('button', { name: /Vertrag jetzt abschließen/ });
    expect(bereich.compareDocumentPosition(knopf) & 4).toBe(4);
  });

  it('Einsatz beendet → kein Bereich, Marta-Kasten am Ende bleibt', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned einsatzBeendet sterne={null} kontakt={kontakt} />,
    );
    expect(container.querySelector('[data-kontakt-variante]')).toBeNull();
    expect(screen.queryByText(/Primundus-Notfallnummer/)).toBeNull();
    expect(screen.getByText('Noch Fragen?')).toBeTruthy();
  });

  it('ohne `kontakt` → kein Bereich (Stand heute, außerhalb der Vorschau)', () => {
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

  it('ohne Nummer: nur Erreichbarkeit, kein Notfallblock', () => {
    const { container } = render(
      <BookedScreen app={makeApp()} onNurseClick={() => {}} vertragSigned kontakt={{ ...kontakt, notfallTelefon: null }} />,
    );
    const bereich = container.querySelector('[data-kontakt-variante]') as HTMLElement;
    expect(text(bereich)).toContain(KONTAKT_TEXTE.tagZeile);
    expect(bereich.querySelector('[data-notfall]')).toBeNull();
    expect(screen.queryByText(/112/)).toBeNull();
  });
});
