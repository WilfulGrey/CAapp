import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomerNurseModal } from '../../components/portal/CustomerNurseModal';
import type { KundenBedarf } from '../../lib/passtZuIhnen';
import type { Application } from '../../components/portal/shared';
import type { Nurse } from '../../types';

const nurse = {
  caregiverId: 7, name: 'Maria Kowalska', age: 52, experience: '8 Jahre', experienceYears: 8,
  availability: 'ab sofort', availableSoon: true, language: { level: 'Gut', bars: 3 },
  color: '#fff', addedTime: '', isLive: false, gender: 'female',
} as Nurse;

// Volles Profil wie aus mappers.ts (Wortlaut der Übersetzungen), Angaben wie im freigegebenen Bild a_icons_v3.
const profil: NonNullable<Nurse['profile']> = {
  nationality: 'Polnisch', yearOfBirth: 1964, weight: '51-60 kg', height: '151-160 cm', maritalStatus: 'Verwitwet',
  drivingLicense: false, isNurse: false, smoking: 'no', education: 'Abitur',
  qualifications: 'Demenzbetreuung, Mobilisierung, Wundversorgung',
  aboutDe: 'Maria ist eine ruhige, einfühlsame Frau.', furtherHobbies: 'Klassische Musik',
  hobbies: ['Backen', 'Musik', 'Gartenarbeit'], personalities: ['einfühlsam', 'ruhig', 'zuverlässig', 'herzlich'],
  acceptedMobilities: ['Selbstständig mobil', 'Rollatorfähig', 'Bettlägerig'], otherLanguages: [{ name: 'Englisch', level: 'A2' }],
};
const voll = {
  ...nurse, profile: profil,
  detailedAssignments: [
    { startDate: '10.01.2026', endDate: '20.03.2026', postalCode: '80331', city: 'München', duration: '10 Wochen' },
    { startDate: '15.12.2024', endDate: '20.02.2025', postalCode: '50667', city: 'Köln', duration: '10 Wochen' },
  ],
} as Nurse;
const nachSpeichern: KundenBedarf = { personen: 2, demenz: true, inkontinenz: true, nacht: true, mobilitaet: 'rollator' };

/** Blatt (weiße Fläche), wie die Integrationstests es finden. */
const blatt = () => document.querySelector('.pointer-events-auto') as HTMLElement;

// Review 25.09.: Aus dem Gebucht-Bildschirm, dem Vertrag und den erledigten
// Karten öffnet die Seite das Profil ohne onInvite. „Einladen" darf dort nicht
// stehen, sonst meldet es Erfolg, ohne etwas zu senden.
describe('CustomerNurseModal – Aktionen', () => {
  it('ohne Einladen-Aktion: weder „Einladen" noch „Nein danke", kein Satz zum Einladen', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /Einladen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(screen.queryByText(/sich zu bewerben/)).toBeNull();
  });

  it('nach dem Speichern (Pflegekraft-Karte): grauer Satz, „Nein danke“ als Textlink in Taupe, „Einladen“ in Koralle mit Symbol', async () => {
    const onInvite = vi.fn(async () => {});
    const onDeclineMatch = vi.fn();
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} onInvite={onInvite} onDeclineMatch={onDeclineMatch} />);
    expect(screen.getByText('Laden Sie Maria ein, sich zu bewerben.').className).toContain('text-pm-muted');
    const nein = screen.getByRole('button', { name: 'Nein danke' });
    expect(nein.className).toContain('text-pm-taupe-ink');
    expect(nein.className).toContain('underline');
    const einladen = screen.getByRole('button', { name: 'Einladen' });
    expect(einladen.className).toContain('bg-pm-coral');
    expect(einladen.className).toContain('hover:bg-pm-coral-deep');
    expect(einladen.className).not.toMatch(/pm-green/);
    expect(einladen.querySelector('svg')!.getAttribute('class')).toContain('lucide-user-plus');
    // Reihenfolge: Satz, „Nein danke“ links, „Einladen“ rechts
    expect(nein.compareDocumentPosition(einladen) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(nein);
    expect(onDeclineMatch).toHaveBeenCalledTimes(1);
    // Einladen: wartet auf das Versprechen, dann „eingeladen“
    await userEvent.click(einladen);
    expect(onInvite).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Pflegekraft wurde eingeladen!/)).toBeInTheDocument();
  });

  it('Einladen scheitert: zurück zum Knopf, keine Erfolgsmeldung', async () => {
    const onInvite = vi.fn(async () => { throw new Error('nein'); });
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} onInvite={onInvite} />);
    await userEvent.click(screen.getByRole('button', { name: 'Einladen' }));
    expect(await screen.findByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(screen.queryByText(/Pflegekraft wurde eingeladen!/)).toBeNull();
  });

  it('vor dem Speichern (einladenVorSpeichern): EIN Knopf „Zur Bewerbung einladen“ in Koralle über die volle Breite (Martin 14.11.2026: Grün nur für „vervollständigen“)', async () => {
    const vormerken = vi.fn();
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} einladenVorSpeichern={vormerken} zumFormular={vi.fn()} />);
    const knopf = document.querySelector('[data-profil-einladen]') as HTMLElement;
    expect(knopf.textContent).toBe('Zur Bewerbung einladen');
    expect(knopf.className).toContain('bg-pm-coral');
    expect(knopf.className).toContain('w-full');
    expect(knopf.className).not.toMatch(/pm-green/);
    expect(screen.getByText('Laden Sie Maria ein, sich zu bewerben.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(document.querySelector('[data-profil-zum-formular]')).toBeNull();
    await userEvent.click(knopf);
    expect(vormerken).toHaveBeenCalledTimes(1);
  });

  it('Rückfall vor dem Speichern (zumFormular): grüner Knopf ins Formular wie bisher, ohne Satz zum Einladen', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} zumFormular={vi.fn()} />);
    const knopf = document.querySelector('[data-profil-zum-formular]') as HTMLElement;
    expect(knopf.textContent).toBe('Pflegesituation vervollständigen');
    expect(knopf.className).toContain('bg-pm-green');
    expect(screen.queryByText(/sich zu bewerben/)).toBeNull();
  });

  it('Bewerbung: „Ablehnen“ als Textlink, „Angebot prüfen“ in Koralle; abgelehnt: „Ablehnung rückgängig machen“; keine roten Flächen', async () => {
    const app = { id: 'a1', nurse, agencyName: '', appliedAt: '', status: 'new', message: '' } as unknown as Application;
    const onDecline = vi.fn();
    const onReview = vi.fn();
    const r = render(<CustomerNurseModal nurse={nurse} onClose={() => {}} app={app} onDecline={onDecline} onReview={onReview} />);
    expect(screen.getByRole('button', { name: 'Ablehnen' }).className).toContain('text-pm-taupe-ink');
    expect(screen.getByRole('button', { name: 'Angebot prüfen' }).className).toContain('bg-pm-coral');
    expect(blatt().innerHTML).not.toMatch(/bg-red|red-50|coral-tint|#FFF1EC/);
    expect(screen.queryByText(/sich zu bewerben/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angebot prüfen' }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledTimes(1);
    r.unmount();
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(<CustomerNurseModal nurse={nurse} onClose={onClose} app={{ ...app, status: 'declined' }} onUndo={onUndo} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ablehnung rückgängig machen' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('eingeladen, aus einer erledigten Karte: „Eingeladen — warten auf Bewerbung“, ohne Satz zum Einladen', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} isInvited />);
    expect(screen.getByText(/Eingeladen — warten auf Bewerbung/)).toBeInTheDocument();
    expect(screen.queryByText(/sich zu bewerben/)).toBeNull();
  });

  it('gebucht (nurProfil): keine Aktionen, auch wenn früher eingeladen', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} isInvited nurProfil onInvite={vi.fn(async () => {})} />);
    expect(screen.queryByText(/Eingeladen — warten auf Bewerbung/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Einladen/ })).toBeNull();
  });

  it('Schließen: X mit 44-px-Fläche', async () => {
    const onClose = vi.fn();
    render(<CustomerNurseModal nurse={nurse} onClose={onClose} />);
    const zu = screen.getByRole('button', { name: 'Schließen' });
    expect(zu.className).toContain('h-11');
    expect(zu.className).toContain('w-11');
    await userEvent.click(zu);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// Neues Profil nach dem freigegebenen Bild (Runde 5, a_icons_v3, Martin 14.11.2026).
describe('CustomerNurseModal – Aufbau wie im freigegebenen Bild', () => {
  it('Kopf: „Vorname, Alter“, Jahre Erfahrung, „Deutsch Gut“ mit Erklärung; keine Stufe, keine Verfügbarkeit, keine Emojis', () => {
    render(<CustomerNurseModal nurse={{ ...voll, history: { assignments: 14, avgDurationMonths: 2 } }} onClose={() => {}} kundenBedarf={nachSpeichern} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Maria, 52');
    expect(screen.getByText('8 Jahre Erfahrung')).toBeInTheDocument();
    expect(screen.getByText('Deutsch Gut')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Was bedeutet Deutsch Gut?' })).toBeInTheDocument();
    const text = blatt().textContent ?? '';
    for (const weg of ['Elite', 'Stammkraft', 'Bewährt', 'Erfahrungsstufe', 'Einsätze bei uns', 'ab sofort', 'verfügbar',
      'Geschlecht', 'Weiblich', 'Geburtsjahr', '1964', 'Gewicht', 'Größe', 'Weitere Interessen', 'Klassische Musik',
      'Akzeptierte Mobilität', 'Rollatorfähig', 'Ausbildung', 'Abitur', 'Deutschkenntnisse', 'Besondere Merkmale', 'Über mich']) {
      expect(text, weg).not.toContain(weg);
    }
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('„Warum Maria zu Ihnen passt“: eine Zeile je Bedarf mit grünem Haken; ohne Grund kein Kasten', () => {
    const r = render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={nachSpeichern} />);
    const kasten = document.querySelector('[data-passt-gruende]') as HTMLElement;
    expect(within(kasten).getByRole('heading').textContent).toBe('Warum Maria zu Ihnen passt');
    expect(within(kasten).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Erfahrung mit Demenz', 'Erfahrung mit zwei Personen', 'Erfahrung mit Inkontinenz', 'Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollator',
    ]);
    expect(kasten.className).toContain('bg-pm-shell');
    expect(kasten.querySelector('.text-pm-green')).not.toBeNull();
    r.unmount();
    render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={{ personen: 1, demenz: false, inkontinenz: null, nacht: false, mobilitaet: 'mobil' }} />);
    expect(document.querySelector('[data-passt-gruende]')).toBeNull();
    expect(screen.queryByText(/zu Ihnen passt/)).toBeNull();
  });

  it('Mobilitäts-Zeile: entfällt, wenn die Pflegekraft die Stufe nicht annimmt; erst nach dem Laden des Profils', () => {
    const r = render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={{ ...nachSpeichern, mobilitaet: 'rollstuhl' }} />);
    expect(screen.queryByText('Erfahrung mit Rollstuhl')).toBeNull();
    expect(screen.getByText('Erfahrung mit Demenz')).toBeInTheDocument();
    r.unmount();
    render(<CustomerNurseModal nurse={nurse} profileLoading onClose={() => {}} kundenBedarf={nachSpeichern} />);
    expect(screen.queryByText('Erfahrung mit Rollator')).toBeNull();
    expect(screen.getByText('Erfahrung mit zwei Personen')).toBeInTheDocument();
  });

  it('„Über Maria“: Text, dann die Angaben in fester Reihenfolge, Qualifikationen zuletzt und ohne die schon genannte Demenz', () => {
    render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={nachSpeichern} />);
    const ueber = screen.getByRole('heading', { name: 'Über Maria' }).closest('section') as HTMLElement;
    expect(within(ueber).getByText('Maria ist eine ruhige, einfühlsame Frau.')).toBeInTheDocument();
    const zeilen = [...ueber.querySelectorAll('.grid > div')].map((z) => z.textContent);
    expect(zeilen).toEqual([
      'NationalitätPolnisch',
      'FamilienstandVerwitwet',
      'PersönlichkeitEinfühlsam, ruhig, zuverlässig, herzlich',
      'HobbysBacken, Musik, Gartenarbeit',
      'Nichtraucherin',
      'FührerscheinNein',
      'Pflegeberuf erlerntNein',
      'Weitere QualifikationenMobilisierung, Wundversorgung',
    ]);
    // Jede Zeile gleich gebaut: beiger Kreis mit Symbol (aria-hidden), graue Zeile, dunkler Wert
    for (const kreis of ueber.querySelectorAll('.grid > div > span')) {
      expect(kreis.className).toContain('bg-pm-shell');
      expect(kreis).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('vor dem Speichern ohne Demenz-Grund: „Demenzbetreuung“ bleibt bei den Qualifikationen', () => {
    render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={{ personen: 2, demenz: null, inkontinenz: null, nacht: true, mobilitaet: 'rollstuhl' }} />);
    expect(screen.getByText('Demenzbetreuung, Mobilisierung, Wundversorgung')).toBeInTheDocument();
  });

  it('Rauchen nach Geschlecht, fehlende Angaben entfallen, ohne Text kein erfundener Ersatzsatz', () => {
    const p = { ...profil, smoking: 'yes_outside' as const, nationality: undefined, maritalStatus: undefined, qualifications: undefined, aboutDe: undefined, motivation: undefined, personalities: [], hobbies: [] };
    const r = render(<CustomerNurseModal nurse={{ ...voll, gender: 'male', profile: p }} onClose={() => {}} />);
    expect(screen.getByText('Raucher (nur draußen)')).toBeInTheDocument();
    for (const weg of ['Nationalität', 'Familienstand', 'Persönlichkeit', 'Hobbys', 'Weitere Qualifikationen', 'verfügt über']) {
      expect(screen.queryByText(new RegExp(weg)), weg).toBeNull();
    }
    r.unmount();
    render(<CustomerNurseModal nurse={{ ...voll, profile: { ...profil, smoking: undefined } }} onClose={() => {}} />);
    expect(screen.queryByText(/raucher/i)).toBeNull();
  });

  it('Erklärung der Sprachstufe klappt unter dem Kopf auf (Standardtexte), zweiter Tipp schließt', async () => {
    render(<CustomerNurseModal nurse={voll} onClose={() => {}} kundenBedarf={nachSpeichern} />);
    const info = screen.getByRole('button', { name: 'Was bedeutet Deutsch Gut?' });
    expect(info).toHaveAttribute('aria-expanded', 'false');
    // Zugeklappt kein aria-controls auf ein Element, das es nicht gibt.
    expect(info).not.toHaveAttribute('aria-controls');
    expect(document.querySelector('[data-sprachstufe]')).toBeNull();
    await userEvent.click(info);
    const erklaerung = document.querySelector('[data-sprachstufe]') as HTMLElement;
    expect(info).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(info.getAttribute('aria-controls')!)).toBe(erklaerung);
    expect(erklaerung.textContent).toContain('Die Verständigung im Alltag und in der Pflege funktioniert in der Regel zuverlässig.');
    expect(erklaerung.textContent).toContain('Eine grobe Orientierung — kein Sprach-Zertifikat.');
    expect(erklaerung.textContent).not.toContain('Einzelne Wörter');
    // unter dem Kopf, vor dem Kasten „Warum … passt“
    expect(erklaerung.compareDocumentPosition(document.querySelector('[data-passt-gruende]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(info);
    expect(document.querySelector('[data-sprachstufe]')).toBeNull();
    expect(info).not.toHaveAttribute('aria-controls');
  });

  it('Profil lädt: Platzhalter statt Angaben; KI-Text lädt: Hinweis mit Kreisel', () => {
    const r = render(<CustomerNurseModal nurse={nurse} profileLoading onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Über Maria' })).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    r.unmount();
    render(<CustomerNurseModal nurse={voll} aboutLoading onClose={() => {}} />);
    expect(screen.getByText('Wir bereiten Ihnen gerade eine persönliche Vorstellung von Maria vor…')).toBeInTheDocument();
    expect(screen.queryByText('Maria ist eine ruhige, einfühlsame Frau.')).toBeNull();
    expect(screen.getByText('Polnisch')).toBeInTheDocument();
  });
});

// Registry #126: Letzte Einsätze aus CaregiverDeparturesWithPagination. Seit 14.11.2026 je Einsatz eine Zeile wie im Bild
// und ohne Hinweis „Derzeit im Einsatz bei einem anderen Kunden“ (Martin: keine Verfügbarkeit).
describe('CustomerNurseModal – Letzte Einsätze', () => {
  it('je Einsatz: grau Zeitraum und Dauer, dunkel der Ort; über den Jahreswechsel mit beiden Jahren', () => {
    render(<CustomerNurseModal nurse={voll} onClose={() => {}} />);
    const abschnitt = screen.getByRole('heading', { name: 'Letzte Einsätze' }).closest('section') as HTMLElement;
    expect(within(abschnitt).getByText('10.01. bis 20.03.2026 · 10 Wochen').className).toContain('text-pm-muted');
    expect(within(abschnitt).getByText('München')).toBeInTheDocument();
    expect(within(abschnitt).getByText('15.12.2024 bis 20.02.2025 · 10 Wochen')).toBeInTheDocument();
    expect(abschnitt.textContent).not.toContain('80331');
  });

  it('gerade woanders im Einsatz, ohne abgeschlossene: kein Abschnitt, kein Hinweis auf Verfügbarkeit', () => {
    render(<CustomerNurseModal nurse={{ ...nurse, onOtherJob: true }} onClose={() => {}} />);
    expect(screen.queryByText('Letzte Einsätze')).toBeNull();
    expect(screen.queryByText(/Derzeit im Einsatz/)).toBeNull();
  });

  it('ohne Einsätze: kein Abschnitt und keine Stufen-Erklärung mehr', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} />);
    expect(screen.queryByText('Letzte Einsätze')).toBeNull();
    expect(screen.queryByText(/Noch kein Einsatz über Primundus/)).toBeNull();
  });

  it('Abfrage gescheitert: sichtbarer Hinweis', () => {
    render(<CustomerNurseModal nurse={{ ...nurse, einsaetzeError: 'boom' }} onClose={() => {}} />);
    expect(screen.getByText('Die Einsätze können wir gerade nicht abrufen.')).toBeInTheDocument();
  });

  it('Referenzen früherer Familien als letzte Zeile, Link zur PDF', () => {
    render(<CustomerNurseModal nurse={{ ...voll, referencePdfUrl: 'https://example.invalid/ref.pdf' }} onClose={() => {}} />);
    const link = screen.getByRole('link', { name: /Referenzen/ });
    expect(link).toHaveAttribute('href', 'https://example.invalid/ref.pdf');
    expect(link.textContent).toContain('Empfehlungen früherer Familien');
    const abschnitt = screen.getByRole('heading', { name: 'Letzte Einsätze' }).closest('section') as HTMLElement;
    expect(abschnitt.querySelector('.grid')!.lastElementChild).toBe(link);
  });

  it('nur Referenzen, keine Einsätze: die Zeile ohne die Überschrift „Letzte Einsätze“', () => {
    render(<CustomerNurseModal nurse={{ ...nurse, referencePdfUrl: 'https://example.invalid/ref.pdf' }} onClose={() => {}} />);
    expect(screen.getByRole('link', { name: /Referenzen/ })).toBeInTheDocument();
    expect(screen.queryByText('Letzte Einsätze')).toBeNull();
  });
});

describe('CustomerNurseModal – Interesse', () => {
  it('Hinweis ohne Koralle-Fläche (Regel Martin 14.11.2026: keine roten Flächen), Wortlaut wie bisher', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} hasInterest onInvite={vi.fn(async () => {})} />);
    const titel = screen.getByText('Maria hat Interesse signalisiert');
    const kasten = titel.closest('div') as HTMLElement;
    expect(kasten.className).toContain('bg-pm-paper');
    expect(kasten.className).not.toMatch(/coral|bg-red|text-red|#F/);
  });

  it('neben dem Interesse-Kasten kein zweiter Satz „Laden Sie … ein“ über den Knöpfen; „Einladen“ bleibt', () => {
    render(<CustomerNurseModal nurse={nurse} onClose={() => {}} hasInterest onInvite={vi.fn(async () => {})} onDeclineMatch={() => {}} />);
    expect(screen.queryByText('Laden Sie Maria ein, sich zu bewerben.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(blatt().textContent!.match(/Laden Sie Maria ein/g)).toHaveLength(1);
  });
});
