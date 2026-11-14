/** @vitest-environment jsdom */
// Minimal-Einstieg vor dem ersten Speichern der Pflegesituation (Registry #147; Martin 07.11.2026 zum Mockup „Minimal“: „Ja,
// alle drei“). Stand 13.11.2026 (Registry #162) mit Registry #163 vom 14.11.2026 (Martin: „Im Portal fehlt der Text und
// Button unter den PKs … einladen zur Bewerbung … Dann Popup, wenn Daten noch fehlen“):
//   - Reihenfolge: Kopf mit Testsieger statt „Hilfe“ → „Guten Tag, …“ klein → Titel „Ihr Preis für die Betreuung zu Hause“
//     → Preiskarte mit „Warum Primundus?“ über den Punkten → „Ihre Pflegekräfte-Auswahl“ mit Anzahl und Satz, Zeilen ohne
//     Preis und ohne Knopf, darunter der Kasten „Ihre Angaben sind noch unvollständig“ mit Satz und grünem Knopf →
//     Pflegesituation (Titel über der Karte, „Betreuung für 1 Person“ oben in der Karte) → Marta „Lieber persönlich beraten
//     lassen?“ → So geht es weiter → Fragen → Marta „Noch Fragen?“; dazu der Kontakt-Reiter rechts (Panel: Anrufen, WhatsApp)
//   - kein fester Knopf, nirgends ein Knopf „Bewerbungen erhalten“ vor dem Speichern
//   - Platzhalterzeilen ohne Text und ohne Knopf, solange die Liste lädt (auch ohne Kasten)
//   - Einladen über das Profil: „Zur Bewerbung einladen“ öffnet das Fenster „{Name} einladen“ (#145) und merkt vor; die Zeile
//     zeigt dann grün „Eingeladen“, über dem Formular steht die Vormerkzeile; nach dem ersten Speichern lädt der Lauf #145
//     die Vorgemerkten ein
//   - Messpunkte: Knopf im Kasten als Quelle `hauptknopf`, in „So geht es weiter“ als `schritte`, im Fenster als
//     `einladen_fenster`; „Zur Bewerbung einladen“ als `einladen_getippt` (Quelle `profil`) und `einladung_vorgemerkt`;
//     „Details“ als `kosten_aufgeklappt`, Profil wie die Karte (`profil_geoeffnet`, Quelle `karte`)
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCaregiver, sampleCustomer, sampleMatching, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { vormerkSchluessel } from '../../lib/vormerkungen';
import {
  ABLAUF_GUTE_PHASE, EinstiegMinimal, FEST_TITEL, FEST_ZEILE, FORMULAR_TITEL, KOPF_PUNKTE, KOPF_TITEL, LISTE_KNOPF, LISTE_TITEL,
  LISTE_UNVOLLSTAENDIG, LISTE_WARUM, LISTE_ZEILE, MARTA_BERATUNG_TITEL, WARUM_TITEL, formularKopf, zeilenFakten,
} from '../../components/portal/EinstiegMinimal';
import { FAQ_MINIMAL } from '../../components/portal/FaqListe';
import type { Nurse } from '../../types';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    // Jeder Test mit eigenem Token (Sitzungs-Dedupe der Meldungen je Token). Lead wie im Rechner: eine Person, Pflegegrad 3.
    // Token mit „ohnetel“: Lead ohne Rückrufnummer (Kontakt in drei Schritten, Registry #76). Token mit „ehepaar“:
    // Betreuung für zwei Personen. Token mit „gespeichert“: Pflegesituation schon abgeschickt, am Lead ein eigener Bogen
    // (eine Person, mobil, nur Stuhlinkontinenz), damit man sieht, welche Quelle das Profil nimmt.
    fetchLeadByToken: vi.fn(async (token: string) => token.startsWith('token-mi-')
      ? { lead: {
        ...defaultLead, token, telefon: token.includes('ohnetel') ? null : defaultLead.telefon,
        kalkulation: { ...defaultLead.kalkulation, formularDaten: { ...defaultLead.kalkulation.formularDaten, betreuung_fuer: token.includes('ehepaar') ? 'ehepaar' : '1-person' } },
        ...(token.includes('gespeichert') ? { patient_form_at: '2026-09-24T10:00:00Z', patient_form: { startDate: '2099-11-15', anzahl: '1', mobilitaet: 'Selbstständig mobil', demenz: 'Nein', inkontinenz: 'Stuhlinkontinenz', nacht: 'Nein' } } : {}),
      } as unknown as import('../../lib/supabase').Lead, error: null }
      : { lead: null, error: 'Token nicht gefunden' }),
    fetchNotfallTelefon: vi.fn(async () => null),
  };
});
vi.mock('../../lib/einladenWiederholung', async () => ({
  ...(await vi.importActual<typeof import('../../lib/einladenWiederholung')>('../../lib/einladenWiederholung')),
  EINLADEN_ABSTAND_MS: 5,
}));
vi.mock('../../lib/toastWarteschlange', async () => ({
  ...(await vi.importActual<typeof import('../../lib/toastWarteschlange')>('../../lib/toastWarteschlange')),
  DANK_DAUER_MS: 2500,
}));

import CustomerPortalPage from '../../pages/CustomerPortalPage';

beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  Element.prototype.scrollIntoView = vi.fn();
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }
});
beforeEach(() => {
  localStorage.clear();
  (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
});
// Martas Erreichbarkeit hängt an der Uhrzeit (8–20 Uhr): Tests, die sie prüfen, stellen die Uhr; danach wieder echt.
afterEach(() => { vi.useRealTimers(); });
const uhrzeit = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

// Zwei Vorschläge: Helena K. (50002, Empfehlung, mehr Einsätze, steht oben) und Emilia W. (50003).
const emilia = { ...sampleMatching, id: 10002, is_best_matching: false, caregiver: { ...sampleCaregiver, id: 50003, first_name: 'Emilia', last_name: 'Wójcik', hp_total_jobs: 3 } };
const zweiVorschlaege = () => ({ JobOfferMatchingsWithPagination: { total: 2, data: [sampleMatching, emilia] } });
const ohneBewerbung = { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) };
const lesen = [
  http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
  http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
];
const nebenlaeufer = http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
  const body = await request.clone().json() as { action?: string };
  if (body.action === 'updateJobOfferDates') return HttpResponse.json({ data: { UpdateJobOfferDates: { id: 7001 } } });
  if (body.action === 'generateJobDescription') return HttpResponse.json({ data: { description: null } });
  return undefined;
});
const ort = { searchLocations: () => ({ LocationsWithPagination: { data: [{ id: 4711, location: 'München', zip_code: '80331', country_code: 'DE' }] } }) };
const vollerEntwurf = (token: string) => localStorage.setItem(`patient_${token}`, JSON.stringify({
  _isDraft: true,
  anzahl: '1', geschlecht: 'Weiblich',
  mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
  plz: '80331', ort: 'München',
  wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '2099-12-01',
  wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
}));
type Meldung = { token?: string; event?: string; metadata?: Record<string, unknown>; notify?: boolean };
/** Der frühere feste Knopf (bis 13.11.2026). Vor dem Speichern darf es ihn nirgends mehr geben. */
const HAUPTKNOPF = /^Bewerbungen erhalten/;
/** Satz im Kasten unter der Liste (Registry #163; bis dahin über der Formularkarte mit „die Situation“), „ca. 2 Minuten“ mit
 *  geschützten Leerzeichen. */
const LISTE_SATZ = 'Beschreiben Sie kurz die Pflegesituation. So verstehen die Pflegekräfte, worauf es bei Ihnen ankommt, und können sich unverbindlich bewerben. Das dauert ca.\u00a02\u00a0Minuten.';
const NBSP = '\u00a0';
/** Tipp auf eine feste, preisrelevante Angabe. */
const PREIS_SATZ = 'Diese Angabe bestimmt den Preis. Ändern kann sie Ihre Beraterin, dann schicken wir Ihnen ein neues Angebot.';
const davor = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts;
const zeilen = () => [...document.querySelectorAll('[data-pflegekraft-zeile]')] as HTMLElement[];
const zeileVon = (vorname: string) => zeilen().find((z) => z.textContent?.startsWith(`${vorname},`)) as HTMLElement;
/** Was man sieht (ohne Text nur für Vorleseprogramme) und was vorgelesen wird (ohne aria-hidden). */
const ohne = (el: Element, selektor: string) => { const k = el.cloneNode(true) as Element; k.querySelectorAll(selektor).forEach((x) => x.remove()); return k.textContent; };
const sichtbar = (el: Element) => ohne(el, '.sr-only');
const vorgelesen = (el: Element) => ohne(el, '[aria-hidden="true"]');
/** Alle Vormerkungen im Gerät (Schlüssel `pm_vorgemerkt_<token>`), egal für welches Token. */
const vorgemerktImSpeicher = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
  .filter((k) => k.startsWith(vormerkSchluessel('')));
/** Knopf „Zur Bewerbung einladen“ im Profilfenster (nur im Minimal-Einstieg vor dem Speichern); null = Profilfenster zu. */
const knopfEinladen = () => document.querySelector('[data-profil-einladen]') as HTMLElement | null;
const profilfenster = () => knopfEinladen()!.closest('.pointer-events-auto') as HTMLElement;
/** Profilfenster über das X oben rechts schließen (der Knopf hat kein Label, darum über sein Zeichen). */
const profilSchliessen = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click([...profilfenster().querySelectorAll('button')].find((b) => b.querySelector('.lucide-x'))!);
  await waitFor(() => expect(knopfEinladen()).toBeNull());
};
/** Profil der Pflegekraft öffnen, „Zur Bewerbung einladen“, im Fenster „Später“: vorgemerkt. */
const vormerkenUeberProfil = async (user: ReturnType<typeof userEvent.setup>, vorname: string) => {
  await user.click(within(zeileVon(vorname)).getByRole('button'));
  await waitFor(() => expect(knopfEinladen()).not.toBeNull(), { timeout: 5000 });
  await user.click(knopfEinladen()!);
  const fenster = await screen.findByRole('dialog', { name: new RegExp(`^${vorname} .+ einladen$`) });
  await user.click(within(fenster).getByRole('button', { name: 'Später' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
};
/** Die weiße Formularkarte (Rahmen) in der Pflegesituation. */
const formularKarte = () => within(document.getElementById('patientendaten')!).getByRole('progressbar').closest('.rounded-card') as HTMLElement;

describe('Minimal-Einstieg vor dem ersten Speichern (Registry #147)', () => {
  it('Reihenfolge und Wortlaut: Kopf mit Testsieger, Gruß, Titel, Preiskarte mit „Warum Primundus?“, Pflegekräfte-Auswahl als Zeilen ohne Preis und ohne Knopf, Kasten mit Knopf unter der Liste, Kontakt, kein fester Knopf; darunter Formular, Marta-Beratung, So geht es weiter, Fragen, Marta', async () => {
    uhrzeit('2026-11-09T10:00:00+01:00'); // Montag 10 Uhr: Marta erreichbar
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-reihe');
    render(<CustomerPortalPage />);

    const h1 = await screen.findByRole('heading', { level: 1, name: KOPF_TITEL }, { timeout: 5000 });
    // Gruß klein über dem Titel, kein Heading mehr (Martin 13.11.: „Guten Tag, Frau Müller muss kleiner“).
    const gruss = document.querySelector('[data-kopf-gruss]') as HTMLElement;
    expect(gruss.textContent).toBe('Guten Tag, Frau Testerin');
    expect(gruss.tagName).toBe('P');
    expect(davor(gruss, h1)).toBe(true);
    // Kopf: rechts „6× Testsieger“ (fett) / „DIE WELT“ mit Siegel, kein „Hilfe“.
    const kopf = document.querySelector('[data-testsieger-kopf]') as HTMLElement;
    expect(kopf.closest('nav')).not.toBeNull();
    expect(within(kopf).getByText('6× Testsieger').tagName).toBe('B');
    expect(kopf.textContent).toBe('6× TestsiegerDIE\u00a0WELT');
    expect(within(kopf).getByAltText('Testsieger Die Welt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hilfe' })).toBeNull();

    // Preiskarte (Kopf 13.11.): Preis zuerst, „Details“, darunter „Warum Primundus?“ über den vier Punkten mit Haken, dann die
    // Kennzahlen; „Ihr persönliches Angebot“ steht nicht mehr im Portal. Die Zeile „Nach Zuschüssen …“ fehlt hier: Die Posten
    // der Testkalkulation (2.800 − 347) passen nicht zum Eigenanteil 1.800, und dann steht lieber nichts als eine falsche
    // Zahl. Keine Chips mehr („Eine Person“, „Pflegegrad 3“).
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    // Die Preiskarte hat keinen eigenen Namen (über aria-labelledby las ein Vorleseprogramm den Titel zweimal).
    expect(karte.hasAttribute('aria-labelledby')).toBe(false);
    // Einzige Überschrift der Karte: „Warum Primundus?“ als h2 (Martin 13.11.: „statt des Striches unter den Punkte …
    // Warum Primundus oder so?“). getByRole scheitert bei mehr als einer.
    const warum = within(karte).getByRole('heading');
    expect(warum.tagName).toBe('H2');
    expect(warum.textContent).toBe('Warum Primundus?');
    expect(WARUM_TITEL).toBe('Warum Primundus?');
    expect(warum).toHaveAttribute('data-kopf-warum');
    expect(screen.queryByText('Ihr persönliches Angebot')).toBeNull();
    const preis = within(karte).getByText(/^2\.800 €/);
    expect(sichtbar(preis)).toBe('2.800 € / Monat');
    expect(vorgelesen(preis)).toBe('2.800 € pro Monat');
    // Kein Hinweis auf Zusatzkosten oben (Martin 08.11.: „Ich will das mit den Fahrtkosten da alles nicht haben“), er steht
    // unter „Details“.
    expect(karte.textContent).not.toMatch(/Reisekosten/);
    expect(karte.querySelector('[data-nach-zuschuessen]')).toBeNull();
    expect(karte.textContent).not.toMatch(/Eine Person|Pflegegrad 3/);
    expect(within(karte).getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'false');
    // Vier gleichwertige kurze Punkte im Wortlaut Martins (13.11.: „Punkte ändern zu: Bestpreisgarantie, Keine
    // Vermittlungsgebühren, Tägliche Kündigung, Taggenaue Abrechnung“), die Garantie zuerst und antippbar.
    const garantie = karte.querySelector('[data-garantie]') as HTMLElement;
    expect(within(garantie).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Bestpreisgarantie', 'Keine Vermittlungsgebühren', 'Tägliche Kündigung', 'Taggenaue Abrechnung']);
    expect(KOPF_PUNKTE).toEqual(['Keine Vermittlungsgebühren', 'Tägliche Kündigung', 'Taggenaue Abrechnung']);
    // Die bisherigen Punkte stehen nur noch in der Angebotsmail.
    expect(karte.textContent).not.toMatch(/Keine Vorauszahlung|Keine Mindestlaufzeit/);
    expect(within(garantie).getByRole('button', { name: /^Bestpreisgarantie/ })).toBeInTheDocument();
    const vertrauen = karte.querySelector('[data-vertrauen]') as HTMLElement;
    expect(vertrauen.tagName).toBe('DL');

    // Pflegekräfte-Auswahl (Martin 13.11.: „man soll sehen: Ihre Pflegekräfte-Auswahl“) mit Anzahl, darunter der Satz.
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const abschnitt = document.getElementById('pflegekraefte')!;
    expect(within(abschnitt).getByRole('heading', { level: 2 }).textContent).toBe('Ihre Pflegekräfte-Auswahl2');
    expect(LISTE_TITEL).toBe('Ihre Pflegekräfte-Auswahl');
    const listeZeile = abschnitt.querySelector('[data-liste-zeile]') as HTMLElement;
    expect(listeZeile.tagName).toBe('P');
    expect(listeZeile.textContent).toBe('Diese Pflegekräfte sind verfügbar und passen zu Ihrer Anfrage.');
    expect(LISTE_ZEILE).toBe(listeZeile.textContent);
    // Jede Zeile ist EIN Knopf über die ganze Breite: rundes Foto (72 px), „Vorname, Alter“, „N Jahre Erfahrung“, „Deutsch
    // Gut“, Pfeil rechts; kein Preis und kein Knopf „Einladen“ (Martin 13.11.: „der Preis würde ich da rausnehmen und einladen
    // erstmal auch“; eingeladen wird seit #163 im Profil). Empfehlung oben.
    const [erste, zweite] = zeilen();
    expect(erste.textContent).toMatch(/^Helena, \d+5 Jahre ErfahrungDeutsch Gut$/);
    expect(zweite.textContent).toMatch(/^Emilia, \d+5 Jahre ErfahrungDeutsch Gut$/);
    for (const z of zeilen()) {
      const knoepfe = within(z).getAllByRole('button');
      expect(knoepfe).toHaveLength(1);
      expect(z.firstElementChild).toBe(knoepfe[0]);
      expect(knoepfe[0]).toHaveAccessibleName(/^(Helena|Emilia)\b.*Deutsch Gut$/);
      expect(z.querySelector('[data-preis]')).toBeNull();
      expect(z.textContent).not.toMatch(/€|Einladen|Eingeladen/);
      // Rundes Foto wie heute (Name steht daneben, darum alt="").
      const foto = z.querySelector('img')!;
      expect(foto).toHaveAttribute('src', 'https://example.test/avatar.jpg');
      expect(foto).toHaveAttribute('alt', '');
      for (const k of ['h-[72px]', 'w-[72px]', 'rounded-full']) expect(foto.className).toContain(k);
      // Pfeil rechts, für Vorleseprogramme ausgeblendet.
      const pfeil = knoepfe[0].lastElementChild!;
      expect(pfeil.getAttribute('class')).toContain('lucide-chevron-right');
      expect(pfeil).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.queryAllByRole('button', { name: /Einladen|Eingeladen/ })).toHaveLength(0);
    // Unter der Liste der Kasten (Registry #163, Martin 14.11.: „Im Portal fehlt der Text und Button unter den PKs“; wie im Bild
    // vom 13.11. vormittags): Hinweis mit Zeichen, Satz, EIN grüner Knopf mit Pfeil nach unten. Im Abschnitt also drei Knöpfe.
    const kasten = abschnitt.querySelector('[data-liste-knopf]') as HTMLElement;
    const unvollstaendig = kasten.querySelector('[data-liste-unvollstaendig]') as HTMLElement;
    expect(unvollstaendig.textContent).toBe('Ihre Angaben sind noch unvollständig');
    expect(LISTE_UNVOLLSTAENDIG).toBe(unvollstaendig.textContent);
    expect(unvollstaendig.className).toContain('text-pm-amber-ink');
    expect(unvollstaendig.querySelector('svg')!.getAttribute('class')).toContain('lucide-alert-circle');
    expect(unvollstaendig.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    const kastenSatz = kasten.querySelector('[data-liste-warum]') as HTMLElement;
    expect(kastenSatz.textContent).toBe(LISTE_SATZ);
    expect(LISTE_WARUM).toBe(LISTE_SATZ);
    const kastenKnopf = within(kasten).getByRole('button');
    expect(kastenKnopf.textContent).toBe('Pflegesituation vervollständigen');
    expect(LISTE_KNOPF).toBe(kastenKnopf.textContent);
    expect(kastenKnopf.className).toContain('bg-pm-green');
    expect(kastenKnopf.querySelector('svg')!.getAttribute('class')).toContain('lucide-arrow-down');
    expect(kastenKnopf.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(abschnitt.querySelectorAll('button')).toHaveLength(3);
    // Nicht mehr im ersten Bild: Titel, Satz und Empfehlungszeile von #145, große Karten.
    expect(screen.queryByText('Ihr Angebot zur 24-Stunden-Betreuung')).toBeNull();
    expect(screen.queryByText('Laden Sie ein, wer Ihnen gefällt. Dafür beschreiben Sie kurz die Pflegesituation.')).toBeNull();
    expect(screen.queryByText('Unsere Empfehlung für Sie')).toBeNull();
    expect(document.querySelector('.rounded-card.cursor-pointer')).toBeNull();

    // Kein fester Knopf mehr (Martin 13.11.: „button nicht hier schon anzeigen, weil zu fordernd gleich mit bewerbungen zu
    // kommen“): nirgends ein Knopf „Bewerbungen erhalten“, auch nicht seine Unterzeile.
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(screen.queryAllByRole('button').filter((b) => /Bewerbungen erhalten/.test(b.textContent ?? ''))).toEqual([]);
    expect(screen.queryByText(FEST_TITEL)).toBeNull();
    expect(screen.queryByText(FEST_ZEILE)).toBeNull();
    expect(document.querySelector('[data-fester-knopf-anker]')).toBeNull();
    expect(screen.queryByText('Rückruf vereinbaren')).toBeNull();

    // Kontakt-Reiter wie in der CG-App: Tipp öffnet das Panel mit Marta, Anrufen und WhatsApp (Martin 08.11.).
    const reiter = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter).toHaveAccessibleName('Marta Kapcio, Ihre Beraterin: anrufen oder schreiben');
    await userEvent.setup().click(reiter);
    const panel = await screen.findByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' });
    expect(within(panel).getByText('täglich 8–20 Uhr')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /anrufen: 089 200 000 830$/ })).toHaveAttribute('href', 'tel:+4989200000830');
    // Kleine Karte neben dem Reiter mit Siegel und Sterne (Martin 08.11.: „viel zu groß … den Testsieger und die Sterne da …
    // schön platzieren“).
    expect(within(panel).getByText('6× Testsieger')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /4,9.*126 Bewertungen/ })).toHaveAttribute('href', 'https://primundus.de/erfahrungen');
    // Sterne und Siegel getrennt (Martin 08.11.: „du kannst nicht die Sterne einfach bei den Testsieger reinpacken“).
    expect(panel.querySelector('[data-marta-siegel]')!.textContent).toBe('6× TestsiegerDIE WELT');
    expect(panel.querySelector('[data-marta-sterne]')!.contains(panel.querySelector('[data-marta-siegel]'))).toBe(false);
    expect(within(panel).getByRole('link', { name: /per WhatsApp schreiben$/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/4989200000830/);
    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Schließen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Pflegesituation direkt unter der Liste: Titel über der Karte auf dem Seitengrund (Martin 13.11.: „Titel nicht doppeln“,
    // „Pflegesituation vervollständigen finde ich ganz gut“); der Satz steht seit #163 nur im Kasten darüber. Keine Kostenkarte
    // mehr (ihre Aufstellung steht unter „Details“).
    const pflegesituation = document.getElementById('patientendaten')!;
    const formularKopfAussen = pflegesituation.querySelector('[data-formular-kopf-aussen]') as HTMLElement;
    expect(within(formularKopfAussen).getByRole('heading', { level: 2 }).textContent).toBe('Pflegesituation vervollständigen');
    expect(FORMULAR_TITEL).toBe('Pflegesituation vervollständigen');
    expect(screen.getAllByRole('heading', { name: 'Pflegesituation vervollständigen' })).toHaveLength(1);
    expect(formularKopfAussen.querySelector('p')).toBeNull();
    expect(formularKopfAussen.textContent).not.toMatch(/Beschreiben Sie kurz/);
    expect(document.body.textContent!.split('Beschreiben Sie kurz die Pflegesituation. So verstehen')).toHaveLength(2);
    expect(formularKopf()).toEqual({ titel: FORMULAR_TITEL, zeile: '', aussen: true });
    expect(within(pflegesituation).queryByText('Für Ihre Bewerbungen')).toBeNull();
    expect(screen.queryByText(/Danach können Sie Pflegekräfte einladen/)).toBeNull();
    // Die Karte: Taupe-Rahmen statt Koralle, „Weiter“ und Fortschrittsbalken grün, kein Strich über der Knopfleiste.
    const formKarte = formularKarte();
    expect(formKarte.contains(formularKopfAussen)).toBe(false);
    expect(formKarte.className).toContain('ring-pm-taupe-light');
    expect(formKarte.className).not.toContain('ring-pm-coral');
    for (const k of ['[&_[data-mess=weiter]]:!bg-pm-green', '[&_[role=progressbar]>span]:!bg-pm-green', '[&_[data-knopfleiste]]:border-t-0']) {
      expect(formKarte.className).toContain(k);
    }
    // Oben in der Karte die Personenzahl mit Schloss (fest, preisrelevant), darunter „Schritt 1 von 4 · Zur Person“ und EIN
    // dünner Balken, halb so weit wie ein ganzer Schritt (erste Hälfte von Schritt 1).
    const personen = within(formKarte).getByRole('button', { name: 'Betreuung für 1\u00a0Person' });
    expect(personen.closest('[data-personenzahl]')).not.toBeNull();
    expect(personen.querySelector('.lucide-lock')).toHaveAttribute('aria-hidden', 'true');
    const schritt = within(formKarte).getByText(/Schritt 1 von 4/);
    expect(schritt.parentElement!.textContent).toBe('Schritt 1 von 4 · Zur Person');
    const balken = within(formKarte).getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '1');
    expect((balken.firstElementChild as HTMLElement).style.width).toBe('12.5%');
    // Der Knopf steht fest UNTER dem Formular, er klebt nicht (Martin 08.11.: „nicht mehr Flugding“); bis zum letzten
    // Schritt heißt er „Weiter →“.
    const formKnopf = within(formKarte).getByRole('button', { name: /^Weiter →$/ });
    expect(formKnopf).toHaveAttribute('data-mess', 'weiter');
    expect(formKnopf.closest('[data-knopfleiste]')!.className).not.toContain('sticky');
    // Erste Formularseite kurz: nur das Geschlecht im bisherigen Wortlaut; das Feld „Anzahl zu betreuender Personen“ gibt es
    // nicht mehr (die Anzahl steht oben in der Karte), Geburtsjahr usw. erst auf der zweiten Seite.
    expect(within(pflegesituation).queryByText('Anzahl zu betreuender Personen')).toBeNull();
    expect(within(pflegesituation).getByText('Geschlecht')).toBeInTheDocument();
    expect(within(pflegesituation).getByRole('button', { name: 'Weiblich' })).toBeInTheDocument();
    expect(within(pflegesituation).queryByText('Geburtsjahr')).toBeNull();
    expect(within(pflegesituation).queryByText('Wer wird betreut?')).toBeNull();
    expect(screen.queryByText('Ihre Betreuungskosten')).toBeNull();
    // Keine Trennstriche zwischen den Feldern (Martin 13.11.: „das mit den Strichen wirkt so, als wäre das Formular noch
    // unterteilt“).
    expect((formKarte.querySelector('[data-field="geschlecht"]')!.parentElement as HTMLElement).className).toContain('[&_[data-field]]:border-t-0');

    // Unter der Karte: Speicherhinweis, Marta mit Beratung (ohne Siegel und Sterne, die stehen im Kopf), So geht es weiter
    // wie in der guten Phase, Fragen, Marta.
    const gespeichert = screen.getByText('Ihre Eingaben bleiben auf diesem Gerät gespeichert.');
    const martaBeratung = document.querySelector('[data-marta-beratung]') as HTMLElement;
    expect(within(martaBeratung).getByText('Lieber persönlich beraten lassen?')).toBeInTheDocument();
    expect(MARTA_BERATUNG_TITEL).toBe('Lieber persönlich beraten lassen?');
    expect(within(martaBeratung).queryByAltText('Testsieger DIE WELT')).toBeNull();
    expect(martaBeratung.querySelector('a[href="https://primundus.de/erfahrungen"]')).toBeNull();
    expect(within(martaBeratung).getByRole('link', { name: /anrufen: 089 200 000 830$/ })).toHaveAttribute('href', 'tel:+4989200000830');
    expect(within(martaBeratung).getByRole('link', { name: /per WhatsApp schreiben$/ })).toBeInTheDocument();
    const ablauf = document.querySelector('[data-ablauf-gute-phase]') as HTMLElement;
    const soGehts = within(ablauf).getByRole('heading', { level: 2, name: 'So geht es weiter' });
    expect(document.querySelector('[data-ablauf-minimal]')).toBeNull();
    const fragen = screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' });
    const marta = screen.getByText('Noch Fragen?');
    const reihe = [
      gruss, h1, karte, preis, warum, garantie, vertrauen, abschnitt, listeZeile, erste, zweite, kasten, unvollstaendig, kastenSatz,
      kastenKnopf, pflegesituation, formularKopfAussen, formKarte, personen, schritt, formKnopf, gespeichert, martaBeratung, soGehts, fragen, marta,
    ];
    for (let i = 1; i < reihe.length; i++) expect(davor(reihe[i - 1], reihe[i])).toBe(true);
    // Wortlaut-Regeln: nie „Betreuungskräfte“, nie „vermitteln“.
    expect(document.body.textContent).not.toMatch(/Betreuungskräfte|vermitteln/);
  }, 20_000);

  it('Platzhalterzeilen ohne Text und ohne Knopf, solange die Liste lädt; Überschrift und Satz stehen schon da, kein fester Knopf; danach die Zeilen mit Anzahl', async () => {
    let freigeben: () => void = () => {};
    const freigabe = new Promise<void>((r) => { freigeben = r; });
    server.use(
      // listMatchings hält, bis der Test freigibt; danach fällt die Anfrage zum Standard durch.
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
        const body = await request.clone().json() as { action?: string };
        if (body.action === 'listMatchings') await freigabe;
        return undefined;
      }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-laedt');
    render(<CustomerPortalPage />);
    await screen.findByRole('heading', { level: 1, name: KOPF_TITEL }, { timeout: 5000 });
    const platzhalter = () => [...document.querySelectorAll('[data-platzhalter]')] as HTMLElement[];
    await waitFor(() => expect(platzhalter()).toHaveLength(5), { timeout: 5000 });
    for (const p of platzhalter()) {
      expect(p.textContent).toBe('');
      // Gleiche Form wie eine Zeile: Kreis wie das Foto (72 px), rechts nur ein schmaler Strich wie der Pfeil, keine
      // Knopf-Pille mehr (13.11.2026: „Einladen“ ist weg).
      expect(p.querySelector('button')).toBeNull();
      expect((p.firstElementChild as HTMLElement).className).toContain('h-[72px]');
      expect((p.lastElementChild as HTMLElement).className).toContain('w-2.5');
      expect(p.innerHTML).not.toMatch(/w-\[10[48]px\]|rounded-\[10px\]/);
    }
    expect(document.querySelector('ul[aria-busy="true"]')).not.toBeNull();
    const abschnitt = document.getElementById('pflegekraefte')!;
    expect(within(abschnitt).getByRole('heading', { level: 2 }).textContent).toBe('Ihre Pflegekräfte-Auswahl');
    expect(abschnitt.querySelector('[data-liste-zeile]')!.textContent).toBe(LISTE_ZEILE);
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(abschnitt.querySelectorAll('button')).toHaveLength(0);
    expect(zeilen()).toHaveLength(0);

    freigeben();
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    expect(platzhalter()).toHaveLength(0);
    expect(within(abschnitt).getByRole('heading', { level: 2 }).textContent).toBe('Ihre Pflegekräfte-Auswahl2');
  }, 20_000);

  it('Zeilen ohne Preis und ohne Knopf; das Profil lädt mit „Zur Bewerbung einladen“ ein: Fenster „{Name} einladen“ (#145), „Später“, grün „Eingeladen“ in der Zeile, Vormerkzeile über dem Formular, der Fenster-Knopf führt ins Formular; vor dem Speichern niemand eingeladen', async () => {
    let einladungen = 0;
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege, inviteCaregiver: () => { einladungen += 1; return { StoreRequest: { id: 1 } }; } } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-profil');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    for (const z of zeilen()) {
      expect(within(z).queryByRole('button', { name: /Einladen|Eingeladen/ })).toBeNull();
      expect(z.querySelector('[data-preis]')).toBeNull();
      expect(z.querySelector('[data-zeile-eingeladen]')).toBeNull();
      expect(z.textContent).not.toMatch(/€/);
    }

    // Tipp auf die Zeile (sie ist ein einziger Knopf) öffnet das Profil; Messpunkt wie bei der Karte.
    await user.click(within(zeileVon('Emilia')).getByRole('button'));
    await waitFor(() => expect(knopfEinladen()).not.toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(meldungen.find((m) => m.event === 'profil_geoeffnet')?.metadata).toEqual({ caregiver_id: 50003, quelle: 'karte', vor_speichern: true }));
    // Statt „Nein danke“ und „Einladen“ EIN Knopf „Zur Bewerbung einladen“ (Martin 14.11.: „wenn man ein Profil öffnet,
    // dann muss dort nicht Button mit vervollständigen sein, sondern einladen zur Bewerbung oder so“), seit dem neuen Profil
    // in Koralle (Martin 14.11.2026: Grün nur für Knöpfe zu „Pflegesituation vervollständigen“); darüber der graue Satz.
    const profil = profilfenster();
    // (Name im Profil aus dem vollen Profil der Testdaten: getCaregiver liefert dort immer dieselbe Pflegekraft.)
    expect(within(profil).getByText(/^Laden Sie \S+ ein, sich zu bewerben\.$/)).toBeInTheDocument();
    // „Warum … zu Ihnen passt“ vor dem Speichern nur aus dem Rechner (eine Person, nachts gelegentlich, Rollstuhl);
    // Demenz und Inkontinenz fragt der Rechner nicht ab (lib/passtZuIhnen.ts).
    await waitFor(() => expect([...profil.querySelectorAll('[data-passt-gruende] li')].map((li) => li.textContent))
      .toEqual(['Erfahrung mit Einsätzen in der Nacht', 'Erfahrung mit Rollstuhl']));
    expect(within(profil).queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(within(profil).queryByRole('button', { name: 'Einladen' })).toBeNull();
    expect(within(profil).queryByRole('button', { name: 'Pflegesituation vervollständigen' })).toBeNull();
    expect(document.querySelector('[data-profil-zum-formular]')).toBeNull();
    const knopf = knopfEinladen()!;
    expect(knopf.tagName).toBe('BUTTON');
    expect(knopf.textContent).toBe('Zur Bewerbung einladen');
    expect(knopf.className).toContain('bg-pm-coral');
    expect(knopf.className).not.toContain('bg-pm-green');
    const zeichen = knopf.querySelector('svg')!;
    expect(zeichen.getAttribute('class')).toContain('lucide-user-plus');
    expect(zeichen).toHaveAttribute('aria-hidden', 'true');

    // Tipp: Profil zu, Fenster „Emilia W. einladen“ (Martin: „Dann Popup, wenn Daten noch fehlen“; Wortlaut wie #145, der
    // Knopf darin grün wie die Seite), Emilia vorgemerkt. Messpunkte still, ohne Namen.
    await user.click(knopf);
    const fenster = await screen.findByRole('dialog', { name: 'Emilia W. einladen' });
    expect(knopfEinladen()).toBeNull();
    expect(within(fenster).getByText('Damit Emilia W. sieht, ob der Einsatz passt, braucht es ein paar Angaben zur Pflegesituation, zum Beispiel:')).toBeInTheDocument();
    expect(within(fenster).getByText('Das dauert etwa 2 Minuten. Danach laden wir Emilia W. für Sie ein. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.')).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Pflegesituation vervollständigen' }).className).toContain('bg-pm-green');
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-mi-profil'))!)).toEqual([50003]);
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladen_getippt')?.metadata).toEqual({ caregiver_id: 50003, quelle: 'profil', vor_speichern: true }));
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'einladung_vorgemerkt').map((m) => m.metadata)).toEqual([{ caregiver_id: 50003 }]));
    for (const m of meldungen.filter((x) => ['einladen_getippt', 'einladung_vorgemerkt'].includes(x.event ?? ''))) expect(m.notify).toBe(false);

    // „Später“: Die Zeile zeigt grün „Eingeladen“ mit Haken unter den Angaben und bleibt EIN Knopf; über dem Formular die
    // Vormerkzeile.
    await user.click(within(fenster).getByRole('button', { name: 'Später' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const emilia = zeileVon('Emilia');
    expect(emilia).toHaveAttribute('data-vorgemerkt');
    expect(within(emilia).getAllByRole('button')).toHaveLength(1);
    const eingeladen = emilia.querySelector('[data-zeile-eingeladen]') as HTMLElement;
    expect(eingeladen.textContent).toBe('Eingeladen');
    expect(eingeladen.className).toContain('text-pm-green-deep');
    expect(eingeladen.querySelector('svg')!.getAttribute('class')).toContain('lucide-check');
    expect(eingeladen.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(zeileVon('Helena').querySelector('[data-zeile-eingeladen]')).toBeNull();
    const vormerkZeile = document.querySelector('[data-vormerk-zeile]') as HTMLElement;
    expect(vormerkZeile.textContent).toBe(`Nach dem Speichern laden wir Emilia${NBSP}W. für Sie ein.`);
    expect(davor(document.getElementById('patientendaten')!, vormerkZeile)).toBe(true);
    expect(davor(vormerkZeile, screen.getByText(/Schritt 1 von 4/))).toBe(true);

    // Noch einmal über das Profil: dasselbe Fenster, sein Knopf springt zum Formular (Quelle einladen_fenster); keine zweite
    // Vormerkung, keine zweite Meldung.
    await user.click(within(emilia).getByRole('button'));
    await waitFor(() => expect(knopfEinladen()).not.toBeNull(), { timeout: 5000 });
    await user.click(knopfEinladen()!);
    const wieder = await screen.findByRole('dialog', { name: 'Emilia W. einladen' });
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    await user.click(within(wieder).getByRole('button', { name: 'Pflegesituation vervollständigen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(gescrollt().map((e) => e.id)).toContain('patientendaten'));
    await waitFor(() => expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.metadata).toEqual({ quelle: 'einladen_fenster', vor_speichern: true }));
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-mi-profil'))!)).toEqual([50003]);
    expect(meldungen.filter((m) => m.event === 'einladung_vorgemerkt')).toHaveLength(1);
    // Vor dem Speichern lädt niemand ein.
    expect(einladungen).toBe(0);
  }, 20_000);

  it('Knopf im Kasten unter der Liste springt zum Formular (Messpunkt zur_pflegesituation, Quelle hauptknopf, still)', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-kasten');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const kastenKnopf = within(document.querySelector('[data-liste-knopf]') as HTMLElement).getByRole('button', { name: LISTE_KNOPF });
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    await user.click(kastenKnopf);
    await waitFor(() => expect(gescrollt().map((e) => e.id)).toContain('patientendaten'));
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'zur_pflegesituation').map((m) => m.metadata)).toEqual([{ quelle: 'hauptknopf', vor_speichern: true }]));
    expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.notify).toBe(false);
  }, 20_000);

  it('Knopf in „So geht es weiter“ springt zum Formular (Messpunkt zur_pflegesituation, Quelle schritte); drei Schritte im Wortlaut der guten Phase, der erste grün', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-schritte');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });

    // Wie in der guten Phase (f062df3), unter dem Formular (Martin 13.11.: „in der ersten Fassung hatten wir das mit einem
    // grünen Button. Pflegesituation vervollständigen“). Ohne „einladen“, ohne „Kostenrechner“.
    const ablauf = document.querySelector('[data-ablauf-gute-phase]') as HTMLElement;
    expect(ablauf.tagName).toBe('SECTION');
    expect(within(ablauf).getByRole('heading', { level: 2 }).textContent).toBe('So geht es weiter');
    const schritte = within(ablauf).getAllByRole('listitem');
    const wortlaut = [
      ['Pflegesituation vervollständigen', 'Beschreiben Sie kurz die Situation, damit die Pflegekräfte wissen, worauf es bei Ihnen ankommt. Das dauert ca.\u00a02\u00a0Minuten, einiges ist aus Ihren bisherigen Angaben schon übernommen.'],
      ['Bewerbungen innerhalb von 60\u00a0Minuten erhalten', 'Passende Pflegekräfte bewerben sich bei Ihnen, mit Profil, Erfahrung und Anreisedatum. Für Sie kostenfrei und unverbindlich.'],
      ['Auswählen und starten', 'Sie wählen in Ruhe aus, erst danach schließen Sie den Vertrag. Wir übernehmen den Rest, Anreise schon ab 3\u00a0Tagen möglich.'],
    ];
    expect(schritte.map((li) => [...li.querySelectorAll('p')].map((p) => p.textContent))).toEqual(wortlaut);
    expect(ABLAUF_GUTE_PHASE.map((s) => [s.titel, s.text])).toEqual(wortlaut);
    expect(schritte.map((li) => li.querySelector('span')!.textContent)).toEqual(['1', '2', '3']);
    // Schritt 1 ist der aktuelle: mint hinterlegt, Nummer grün, Titel dunkelgrün; nur er hat einen Knopf.
    expect(schritte[0]).toHaveAttribute('aria-current', 'step');
    expect(schritte[0].className).toContain('bg-pm-mint');
    expect(schritte[0].querySelector('span')!.className).toContain('bg-pm-green');
    expect(schritte[0].querySelector('p')!.className).toContain('text-pm-green-deep');
    for (const li of schritte.slice(1)) {
      expect(li).not.toHaveAttribute('aria-current');
      expect(li.querySelector('button')).toBeNull();
    }
    expect(ablauf.textContent).not.toMatch(/einlad|Kostenrechner/i);
    // Den alten Ablauf (AblaufMinimal mit „erledigt“) gibt es im Portal nicht mehr.
    expect(document.querySelector('[data-ablauf-minimal]')).toBeNull();
    expect(within(ablauf).queryByLabelText('erledigt')).toBeNull();
    expect(document.body.textContent).not.toContain('Angebot und passende Pflegekräfte sofort sehen');

    const link = ablauf.querySelector('[data-ablauf-link]') as HTMLElement;
    expect(schritte[0].contains(link)).toBe(true);
    expect(link.tagName).toBe('BUTTON');
    expect(link.textContent).toBe('Pflegesituation vervollständigen');
    expect(link.className).toContain('bg-pm-green');
    const pfeil = link.querySelector('svg')!;
    expect(pfeil.getAttribute('class')).toContain('lucide-arrow-up');
    expect(pfeil).toHaveAttribute('aria-hidden', 'true');
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    await user.click(link);
    await waitFor(() => expect(gescrollt().map((e) => e.id)).toContain('patientendaten'));
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'zur_pflegesituation').map((m) => m.metadata)).toEqual([{ quelle: 'schritte', vor_speichern: true }]));
    expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.notify).toBe(false);
  }, 20_000);

  it('„Details“ klappt die Kostenaufstellung in der Angebotskarte auf und wieder zu (Messpunkt kosten_aufgeklappt einmal je Öffnen)', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-details');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    const knopf = within(karte).getByRole('button', { name: 'Details' });
    expect(within(karte).queryByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeNull();

    await user.click(knopf);
    expect(knopf).toHaveAttribute('aria-expanded', 'true');
    const details = karte.querySelector('[data-angebot-details]') as HTMLElement;
    expect(within(details).getByText('Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).')).toBeInTheDocument();
    expect(within(details).getByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeInTheDocument();
    expect(within(details).getByRole('link', { name: /Mustervertrag als PDF herunterladen/ })).toBeInTheDocument();
    // Ohne Testsieger-Zeile (steht schon im Kopf und unten in der Karte).
    expect(within(details).queryByAltText('Testsieger Die Welt')).toBeNull();
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'kosten_aufgeklappt')).toHaveLength(1));

    await user.click(knopf);
    expect(karte.querySelector('[data-angebot-details]')).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(meldungen.filter((m) => m.event === 'kosten_aufgeklappt')).toHaveLength(1);
  }, 20_000);

  // Prüfung Code 13.11.2026: Der Messpunkt war nur im Rückweg `?einstieg=alt` geprüft (messpunkte.test.tsx).
  it('„Bestpreisgarantie“ im Kopf öffnet ihr Fenster und meldet bestpreis_geoeffnet einmal (still, ohne Personendaten)', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-bestpreis');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const garantie = document.querySelector('[data-kopf] [data-garantie]') as HTMLElement;
    await user.click(within(garantie).getByRole('button', { name: /^Bestpreisgarantie/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Bestpreisgarantie' });
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'bestpreis_geoeffnet')).toHaveLength(1));
    const meldung = meldungen.find((m) => m.event === 'bestpreis_geoeffnet')!;
    expect(meldung.token).toBe('token-mi-bestpreis');
    expect(meldung.notify).toBe(false);
    expect(Object.keys(meldung.metadata ?? {}).every((feld) => ['quelle', 'vor_speichern'].includes(feld))).toBe(true);
    await user.click(within(fenster).getAllByRole('button', { name: 'Schließen' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bestpreisgarantie' })).toBeNull());
    expect(window.location.search).toBe('?token=token-mi-bestpreis');
  }, 20_000);

  it('Einstiegsseite: „Betreuung für 1 Person“ oben in der Karte statt Feld Anzahl, dazu das Geschlecht; ohne Antwort hält der Knopf mit Hinweis, die Antwort führt von selbst zur zweiten Hälfte von Schritt 1, „Zurück“ wieder zurück', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-einstieg');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(document.getElementById('pflegesituation-formular')).not.toBeNull(), { timeout: 5000 });
    const formular = document.getElementById('patientendaten')!;
    await within(formular).findByRole('button', { name: 'Betreuung für 1\u00a0Person' }, { timeout: 5000 });
    expect(within(formular).queryByText('Anzahl zu betreuender Personen')).toBeNull();
    expect(within(formular).getByText('Geschlecht')).toBeInTheDocument();
    // „Weiter →“ unter dem Formular ohne Antwort: Hinweis über dem Knopf, die Seite bleibt.
    await user.click(within(formular).getByRole('button', { name: /^Weiter →$/ }));
    expect(await screen.findByRole('button', { name: 'Geschlecht fehlt' })).toBeInTheDocument();
    expect(within(formular).queryByText('Geburtsjahr')).toBeNull();
    // Antwort antippen: kurz die Auswahl, dann von selbst die zweite Hälfte von Schritt 1, ohne Geschlecht; die Personenzahl
    // bleibt oben in der Karte stehen, ein Feld „Anzahl“ kommt auch hier nicht.
    await user.click(within(formular).getByRole('button', { name: 'Weiblich' }));
    expect(await within(formular).findByText('Geburtsjahr', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(formular).getByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect((within(formular).getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('25%');
    expect(within(formular).getByRole('button', { name: 'Betreuung für 1\u00a0Person' })).toBeInTheDocument();
    expect(within(formular).queryByText('Anzahl zu betreuender Personen')).toBeNull();
    expect(within(formular).queryByText('Geschlecht')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Geschlecht fehlt' })).toBeNull();
    // „Zurück“ in der Schrittzeile führt zur ersten Seite, die Antwort ist noch gewählt.
    await user.click(within(formular).getByRole('button', { name: 'Zurück' }));
    expect(await within(formular).findByText('Geschlecht')).toBeInTheDocument();
    expect(within(formular).queryByText('Anzahl zu betreuender Personen')).toBeNull();
    expect(within(formular).getByRole('button', { name: 'Weiblich' })).toHaveAttribute('aria-pressed', 'true');
    // Mit Antwort geht der Knopf weiter.
    await user.click(within(formular).getByRole('button', { name: /^Weiter →$/ }));
    expect(await within(formular).findByText('Geburtsjahr')).toBeInTheDocument();
  }, 20_000);

  it('Formularkopf: „Betreuung für 1 Person“ bzw. beim Ehepaar „Betreuung für 2 Personen“ mit Schloss oben in der Karte; Tipp zeigt den Preis-Satz, zweiter Tipp schließt ihn', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    const user = userEvent.setup();
    const faelle = [
      { token: 'token-mi-personen', wortlaut: 'Betreuung für 1\u00a0Person', baender: [] as string[] },
      { token: 'token-mi-ehepaar', wortlaut: 'Betreuung für 2\u00a0Personen', baender: ['Person 1', 'Person 2'] },
    ];
    for (const { token, wortlaut, baender } of faelle) {
      window.history.replaceState({}, '', `/?token=${token}`);
      const { unmount } = render(<CustomerPortalPage />);
      const formKarte = await waitFor(() => formularKarte(), { timeout: 5000 });
      // Martin 13.11.: „1 Person oder 2 ist eine wichtige Info, die gut sichtbar sein muss“. Geschütztes Leerzeichen zwischen
      // Zahl und „Person(en)“, damit die Angabe nie umbricht.
      const kopf = formKarte.querySelector('[data-personenzahl]') as HTMLElement;
      const knopf = within(kopf).getByRole('button');
      expect(knopf.textContent).toBe(wortlaut);
      expect(knopf).toHaveAccessibleName(wortlaut);
      expect(knopf.textContent).toMatch(/\d\u00a0Person(en)?$/);
      expect(knopf.querySelector('.lucide-lock')).toHaveAttribute('aria-hidden', 'true');
      expect(knopf.querySelector('.lucide-users')).toHaveAttribute('aria-hidden', 'true');
      // Oben in der Karte, über „Schritt 1 von 4“ und dem Balken.
      expect(davor(kopf, within(formKarte).getByText(/Schritt 1 von 4/))).toBe(true);
      expect(davor(kopf, within(formKarte).getByRole('progressbar'))).toBe(true);
      // Kein Feld „Anzahl zu betreuender Personen“ und kein fester Wert „1 Person“ / „2 Personen“ als Feld.
      expect(within(formKarte).queryByText('Anzahl zu betreuender Personen')).toBeNull();
      expect(within(formKarte).queryByText(/^[12]\sPerson(en)?$/)).toBeNull();
      // Beim Ehepaar je Person ein Band „Person 1“ / „Person 2“ mit dem Geschlecht, ohne Trennlinien.
      const baenderIst = [...formKarte.querySelectorAll('[data-person-kopf]')] as HTMLElement[];
      expect(baenderIst.map((b) => b.querySelector('p')!.textContent)).toEqual(baender);
      for (const b of baenderIst) expect(b.className).not.toMatch(/border/);
      expect(within(formKarte).getAllByText('Geschlecht')).toHaveLength(Math.max(baender.length, 1));
      // Tipp erklärt, warum die Angabe fest ist; zweiter Tipp schließt den Satz.
      expect(knopf).toHaveAttribute('aria-expanded', 'false');
      expect(within(kopf).queryByText(PREIS_SATZ)).toBeNull();
      await user.click(knopf);
      expect(knopf).toHaveAttribute('aria-expanded', 'true');
      expect(within(kopf).getByText(PREIS_SATZ)).toBeInTheDocument();
      await user.click(knopf);
      expect(knopf).toHaveAttribute('aria-expanded', 'false');
      expect(within(kopf).queryByText(PREIS_SATZ)).toBeNull();
      unmount();
    }
  }, 30_000);

  it('vor dem Speichern steht nirgends „Kostenrechner“ und „einladen“ nur im Knopf „Zur Bewerbung einladen“ des Profils: Profilfenster zu und offen, auch mit „Details“, Bestpreisgarantie, Marta und allen Fragen aufgeklappt', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-woerter');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    await waitFor(() => expect(formularKarte()).toBeTruthy(), { timeout: 5000 });
    // Martin 13.11.: „Kein Mensch weiß, was ein Kostenrechner ist“. „Einladen“ gibt es seit #163 wieder, aber nur als Knopf im
    // Profil (und im Fenster danach); die Seite selbst und die Fragen sprechen nicht davon. Geprüft wird der ganze Text der
    // Seite ohne diesen Knopf, sichtbar und nur vorgelesen (auch „Einladung“, „eingeladen“).
    const verboten = /einlad|eingeladen|Kostenrechner/i;
    const pruefen = (wann: string) => {
      expect(ohne(document.body, '.sr-only, [data-profil-einladen]'), wann).not.toMatch(verboten);
      expect(ohne(document.body, '[data-profil-einladen]'), wann).not.toMatch(verboten);
    };
    pruefen('Profilfenster zu');

    await user.click(within(zeileVon('Helena')).getByRole('button'));
    await waitFor(() => expect(knopfEinladen()).not.toBeNull(), { timeout: 5000 });
    expect(knopfEinladen()!.textContent).toBe('Zur Bewerbung einladen');
    pruefen('Profilfenster offen');
    await profilSchliessen(user);
    pruefen('Profilfenster wieder zu');

    await user.click(within(document.querySelector('[data-angebot-minimal]') as HTMLElement).getByRole('button', { name: 'Details' }));
    pruefen('Details offen');
    await user.click(within(document.querySelector('[data-garantie]') as HTMLElement).getByRole('button', { name: /^Bestpreisgarantie/ }));
    const bestpreis = await screen.findByRole('dialog', { name: 'Bestpreisgarantie' });
    pruefen('Bestpreisgarantie offen');
    await user.click(within(bestpreis).getAllByRole('button', { name: 'Schließen' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bestpreisgarantie' })).toBeNull());
    await user.click(document.querySelector('[data-kontakt-reiter]') as HTMLElement);
    const martaFenster = await screen.findByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' });
    pruefen('Marta offen');
    await user.click(within(martaFenster).getByRole('button', { name: 'Schließen' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' })).toBeNull());
    const faq =screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' }).parentElement as HTMLElement;
    await user.click(within(faq).getByRole('button', { name: /^\d+ weitere Fragen$/ }));
    for (const frage of within(faq).getAllByRole('button')) {
      await user.click(frage);
      pruefen(`Frage offen: ${frage.textContent}`);
    }
  }, 30_000);

  it('Häufige Fragen: „Ist das legal?“ und „Warum ist Primundus günstiger als andere?“ zuerst, sechs sichtbar; die Fragen zum Einladen fehlen', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-faq');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    const titel = await screen.findByRole('heading', { level: 2, name: 'Häufige Fragen' }, { timeout: 5000 });
    const liste = titel.parentElement as HTMLElement;
    const fragen = within(liste).getAllByRole('button').map((b) => b.textContent);
    expect(fragen.slice(0, 6)).toEqual([
      'Ist das legal?',
      'Warum ist Primundus günstiger als andere?',
      'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
      'Was übernimmt die Pflegekraft, was ein Pflegedienst?',
      'Was brauche ich zu Hause?',
      'Wie läuft die Betreuung ab?',
    ]);
    expect(fragen[6]).toMatch(/^\d+ weitere Fragen$/);
    const weitere = Number(fragen[6]!.match(/^\d+/)![0]);
    await user.click(within(liste).getByRole('button', { name: 'Warum ist Primundus günstiger als andere?' }));
    expect(within(liste).getByText('Weil kein Vermittler dazwischen steht: Primundus ist Direktanbieter, die Pflegekräfte sind bei Primundus angestellt. Eine Vermittlungsgebühr gibt es nicht. Dazu gilt unsere Bestpreisgarantie: Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot.')).toBeInTheDocument();
    // Nie „vermitteln“ für Primundus.
    expect(liste.textContent).not.toMatch(/vermitteln/);
    // Ohne die zwei Fragen zum „Einladen“ (seit #162, Martin 13.11.; #163 bringt das Einladen nur im Profil zurück, die Fragen
    // bleiben weg), auch nicht unter „weitere Fragen“.
    await user.click(within(liste).getByRole('button', { name: fragen[6]! }));
    const alle = within(liste).getAllByRole('button').map((b) => b.textContent);
    expect(alle).toHaveLength(6 + weitere);
    expect(alle).toEqual(FAQ_MINIMAL.map((f) => f.q));
    expect(alle).not.toContain('Was bedeutet „Einladen"?');
    expect(alle).not.toContain('Gehe ich mit dem Einladen einen Vertrag ein?');
    expect(alle.filter((q) => /einlad/i.test(q ?? ''))).toEqual([]);
  }, 20_000);

  it('nach dem ersten Speichern lädt der Minimal-Einstieg die Vorgemerkten ein (Lauf #145): die im Profil eingeladene und eine Vormerkung von einem früheren Besuch; Hinweis „… sind eingeladen.“, Messpunkt einladung_nach_speichern, danach die Ansicht nach dem Speichern', async () => {
    const TOKEN = 'token-mi-speichern';
    const eingeladen: number[] = [];
    const meldungen: Meldung[] = [];
    server.use(
      nebenlaeufer,
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: {
        ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
        inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1, caregiver_id: vars.caregiver_id } }; },
      } }),
    );
    vollerEntwurf(TOKEN);
    // Vormerkung von einem früheren Besuch (bis 13.11.2026 merkte „Einladen“ in der Zeile vor): Helena steht gleich beim Laden
    // als eingeladen da und wird nach dem Speichern mit eingeladen.
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50002]));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    expect(zeileVon('Helena').querySelector('[data-zeile-eingeladen]')).not.toBeNull();
    expect(document.querySelector('[data-vormerk-zeile]')!.textContent).toBe(`Nach dem Speichern laden wir Helena${NBSP}K. für Sie ein.`);
    // Emilia über ihr Profil dazu.
    await vormerkenUeberProfil(user, 'Emilia');
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([50002, 50003]);
    expect(document.querySelector('[data-vormerk-zeile]')!.textContent).toBe(`Nach dem Speichern laden wir Helena${NBSP}K. und Emilia${NBSP}W. für Sie ein.`);
    expect(eingeladen).toEqual([]);
    // Knopf unter dem Formular: „Weiter →“ (mit „Zurück“ klein in der Schrittzeile), im letzten Schritt „Speichern“
    // (Martin 10.11.2026: „letzter Schritt Button nur: Speichern“; vorher „Bewerbungen erhalten“).
    expect(screen.getByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Weiter →$/ }));
    expect(await screen.findByText(/Schritt 2 von 4/)).toBeInTheDocument();
    // Feste Werte mit der grauen Zeile „Aus Ihren bisherigen Angaben übernommen“ (Martin 13.11.: „Kein Mensch weiß, was ein
    // Kostenrechner ist … vorherigen Angaben übernommen“).
    expect(screen.getAllByText('Aus Ihren bisherigen Angaben übernommen').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Kostenrechner/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }));
    expect(await screen.findByText(/Schritt 4 von 4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Weiter →/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Speichern$/ }));

    // Nach dem Speichern lädt der Lauf #145 beide ein, in der Reihenfolge des Vormerkens, je genau einmal, und sagt es.
    const hinweis = await screen.findByText('Helena K. und Emilia W. sind eingeladen.', {}, { timeout: 8000 });
    expect(hinweis.textContent).toBe(`Helena${NBSP}K. und Emilia${NBSP}W. sind eingeladen.`);
    expect(hinweis.closest('[data-toast]')).not.toBeNull();
    expect(eingeladen).toEqual([50002, 50003]);
    expect(localStorage.getItem(vormerkSchluessel(TOKEN))).toBeNull();
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.metadata).toEqual({ anzahl: 2, ok: 2 }));
    expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.notify).toBe(false);
    expect(meldungen.filter((m) => m.event === 'caregiver_invited').map((m) => m.metadata?.caregiver_id)).toEqual([50002, 50003]);

    // Danach die Ansicht nach dem Speichern: weder Zeilen noch Minimal-Einstieg; die Navigationsleiste zeigt wieder „Hilfe“.
    expect(await screen.findByRole('button', { name: 'Hilfe' }, { timeout: 8000 })).toBeInTheDocument();
    expect(document.querySelector('[data-einstieg="minimal"]')).toBeNull();
    expect(zeilen()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(document.querySelector('[data-testsieger-kopf]')).toBeNull();
    await waitFor(() => expect(meldungen.find((m) => m.event === 'speichern_antwort')?.metadata).toMatchObject({ ergebnis: 'ok', vor_speichern: true }));
    // Keine zweite Runde.
    await new Promise((r) => setTimeout(r, 300));
    expect(eingeladen).toEqual([50002, 50003]);
    expect(meldungen.filter((m) => m.event === 'einladung_nach_speichern')).toHaveLength(1);
  }, 30_000);

  it('?einstieg=zuerst zeigt „Pflegekräfte zuerst“ (#145) unverändert, ohne Minimal-Einstieg', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-zuerst&einstieg=zuerst');
    render(<CustomerPortalPage />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' }, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Helena K.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector('[data-einstieg="minimal"]')).toBeNull();
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hilfe' })).toBeInTheDocument();
  }, 20_000);

  it('die Vorschau-Schalter ?warum=unten, ?formular=unten und ?weiter=koralle gibt es nicht mehr: die Seite bleibt wie der Standard', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-schalter&warum=unten&formular=unten&weiter=koralle');
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    // „Warum Primundus?“ über den Punkten.
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    expect(davor(karte.querySelector('[data-kopf-warum]')!, karte.querySelector('[data-garantie]')!)).toBe(true);
    // Formular direkt unter der Liste, „So geht es weiter“ darunter.
    const abschnitt = document.getElementById('pflegekraefte')!;
    const pflegesituation = await waitFor(() => document.getElementById('patientendaten')!, { timeout: 5000 });
    expect(abschnitt.parentElement!.nextElementSibling!.firstElementChild).toBe(pflegesituation);
    expect(davor(pflegesituation, document.querySelector('[data-ablauf-gute-phase]')!)).toBe(true);
    // „Weiter“ und Balken grün.
    const formKarte = await waitFor(() => formularKarte(), { timeout: 5000 });
    expect(formKarte.className).toContain('[&_[data-mess=weiter]]:!bg-pm-green');
    expect(formKarte.className).toContain('[&_[role=progressbar]>span]:!bg-pm-green');
  }, 20_000);
});

// Martin 14.11.2026: „dann gucken wir nicht, was sie gemacht hat, sondern was der Kunde wünscht“. Nach dem Speichern kommen
// die Gründe aus der gespeicherten Pflegesituation (bedarfFuerProfil, lib/passtZuIhnen.ts), nicht aus dem Rechner (dort:
// eine Person, Rollstuhl, nachts gelegentlich).
describe('Profil nach dem Speichern: „Warum … zu Ihnen passt“ aus der gespeicherten Pflegesituation', () => {
  /** Zwei Personen in mamamia: Demenz und Rollator bei der ersten, Harninkontinenz und Nacht bei der zweiten. */
  const zweiPatienten = [
    { id: 12001, dementia: 'yes', dementia_description: null, incontinence: null, incontinence_urine: null, incontinence_feces: null, night_operations: 'no', mobility_id: 3 },
    { id: 12002, dementia: 'no', dementia_description: null, incontinence: null, incontinence_urine: true, incontinence_feces: null, night_operations: 'up_to_1_time', mobility_id: 1 },
  ];
  const gruendeImProfil = async (status: string, token: string) => {
    server.use(...lesen, ...defaultHandlers({ proxy: {
      ...ohneBewerbung, listMatchings: zweiVorschlaege,
      getCustomer: () => ({ Customer: { ...sampleCustomer, status, patients: status === 'draft' ? [{ id: 12001, dementia: null, incontinence: null, mobility_id: 3 }] : zweiPatienten } }),
    } }));
    window.history.replaceState({}, '', `/?token=${token}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen().length).toBeGreaterThan(0), { timeout: 8000 });
    expect(document.querySelector('[data-einstieg="minimal"]')).toBeNull();
    await user.click(zeilen()[0].querySelector('button')!);
    // Profil nach dem Speichern: „Einladen“ im Fuß (nicht „Zur Bewerbung einladen“).
    const profil = await waitFor(() => {
      const blatt = document.querySelector('[data-passt-gruende]')?.closest('.pointer-events-auto') as HTMLElement | null;
      expect(blatt).not.toBeNull();
      return blatt!;
    }, { timeout: 5000 });
    expect(within(profil).getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(knopfEinladen()).toBeNull();
    return () => [...document.querySelectorAll('[data-passt-gruende] li')].map((li) => li.textContent);
  };

  it('mamamia (Status „active“) vor dem Bogen am Lead und vor dem Rechner; ein Bedarf zählt, wenn eine der beiden Personen ihn hat', async () => {
    const gruende = await gruendeImProfil('active', 'token-mi-gespeichert-mamamia');
    await waitFor(() => expect(gruende()).toEqual([
      'Erfahrung mit Demenz',
      'Erfahrung mit zwei Personen',
      'Erfahrung mit Inkontinenz',
      'Erfahrung mit Einsätzen in der Nacht',
      'Erfahrung mit Rollator',
    ]), { timeout: 5000 });
  }, 20_000);

  it('mamamia noch im Status „draft“ (nur Onboarding-Daten): der Bogen am Lead gilt', async () => {
    const gruende = await gruendeImProfil('draft', 'token-mi-gespeichert-entwurf');
    await waitFor(() => expect(gruende()).toEqual(['Erfahrung mit Inkontinenz']), { timeout: 5000 });
    // Nicht der Rechner (Rollstuhl, Nacht) und nicht der mamamia-Entwurf (Rollator).
    await new Promise((r) => setTimeout(r, 200));
    expect(gruende()).toEqual(['Erfahrung mit Inkontinenz']);
  }, 20_000);
});

describe('zeilenFakten (Registry #147)', () => {
  const kraft = (experienceYears: number, level: string) => ({ experienceYears, language: { level, bars: 0 } }) as Pick<Nurse, 'experienceYears' | 'language'>;
  it('„N Jahre Erfahrung“, „Deutsch Gut“ (Stufe wie auf der Karte, nie „grund“ klein); Einzahl, fehlende Angaben entfallen', () => {
    expect(zeilenFakten(kraft(7, 'Gut'))).toEqual(['7 Jahre Erfahrung', 'Deutsch Gut']);
    expect(zeilenFakten(kraft(11, 'Mittel'))).toEqual(['11 Jahre Erfahrung', 'Deutsch Mittel']);
    expect(zeilenFakten(kraft(1, 'Grund'))).toEqual(['1 Jahr Erfahrung', 'Deutsch Grund']);
    expect(zeilenFakten(kraft(0, 'Gut'))).toEqual(['Deutsch Gut']);
    expect(zeilenFakten(kraft(4, '—'))).toEqual(['4 Jahre Erfahrung']);
    expect(zeilenFakten(kraft(0, ''))).toEqual([]);
  });
});

describe('Leerzustände ohne Gedankenstrich (Registry #147)', () => {
  const leer = (gehalteneEinladungen: number) => render(
    <EinstiegMinimal
      anrede="Frau Testerin" lead={null} onBestpreis={() => {}} heimEigenanteil={0} heimQuelle=""
      laedt={false} zeilen={[]} gehalteneEinladungen={gehalteneEinladungen} vorschlaegeVorhanden bereitsBearbeitet={null}
      formular={<div />} sterne={null} vorgemerkte={[]} onAblaufZumFormular={() => {}}
    />,
  );
  it('„Ihre Auswahl ist eingeladen“: Punkt statt Gedankenstrich, sonst Wortlaut gleich', () => {
    leer(1);
    expect(screen.getByText('Ihre Auswahl ist eingeladen')).toBeInTheDocument();
    expect(screen.getByText(/^Die Pflegekräfte melden sich/).textContent).toBe(
      'Die Pflegekräfte melden sich meist innerhalb von 1–2 Tagen. Sobald Rückmeldungen da sind, sehen Sie sie hier. Meldet sich niemand, schlagen wir Ihnen automatisch weitere Pflegekräfte vor.',
    );
    expect(document.querySelector('[data-einstieg="minimal"]')!.textContent).not.toContain('—');
  });
  it('„Alle aktuellen Vorschläge bearbeitet“: Punkt statt Gedankenstrich, sonst Wortlaut gleich', () => {
    leer(0);
    expect(screen.getByText('Alle aktuellen Vorschläge bearbeitet')).toBeInTheDocument();
    expect(screen.getByText(/^Sie haben alle passenden Pflegekräfte/).textContent).toBe(
      'Sie haben alle passenden Pflegekräfte durchgesehen. Wir schlagen Ihnen in Kürze weitere vor. Sie hören von uns.',
    );
    expect(document.querySelector('[data-einstieg="minimal"]')!.textContent).not.toContain('—');
  });
  it('Preiskarte ohne Lead und ohne Sterne: Titel, Preis, Garantie; keine Zeile „Nach Zuschüssen“, Vertrauen ohne Sterne', () => {
    leer(0);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(KOPF_TITEL);
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    expect(karte.textContent).toMatch(/^3\.050 € \/ Monat/);
    expect(karte.querySelector('[data-nach-zuschuessen]')).toBeNull();
    expect(within(karte).getByRole('heading', { level: 2 }).textContent).toBe(WARUM_TITEL);
    expect(within(karte.querySelector('[data-garantie]') as HTMLElement).getAllByRole('listitem')).toHaveLength(4);
    const vertrauen = karte.querySelector('[data-vertrauen]') as HTMLElement;
    expect(vertrauen.children).toHaveLength(2);
    expect(vertrauen.textContent).toBe('Erfahrung20 JahreErfahrungTestsieger6× in FolgeTestsieger');
  });
});

describe('Angebotskarte mit Zuschüssen und Sternen (Fassung „CGA-Stil“, 08.11.)', () => {
  // Werte wie der Vorschau-Lead (PG 4, 3.050 €): Eigenanteil 3.050 − 800 − 295 − 333 = 1.622, Heim 3.364 − 1.622 = 1.742.
  const lead = {
    kalkulation: {
      bruttopreis: 3050, eigenanteil: 1621.75, aufschluesselung: [], formularDaten: { pflegegrad: 4, betreuung_fuer: 'ehepaar' },
      'zuschüsse': { gesamt: 1428.25, items: [
        { name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '', betrag_monatlich: 800, betrag_jaehrlich: 9600, typ: 'monatlich', hinweis: null, in_kalkulation: true },
        { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget', beschreibung: '', betrag_monatlich: 294.92, betrag_jaehrlich: 3539, typ: 'jaehrlich', hinweis: null, in_kalkulation: true },
        { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', beschreibung: '', betrag_monatlich: 333.33, betrag_jaehrlich: 4000, typ: 'jaehrlich', hinweis: null, in_kalkulation: true },
      ] },
    },
  } as unknown as import('../../lib/supabase').Lead;
  const zeigen = (heim: number) => render(
    <EinstiegMinimal
      anrede="Frau Müller" lead={lead} onBestpreis={() => {}} heimEigenanteil={heim} heimQuelle=""
      laedt={false} zeilen={[]} gehalteneEinladungen={0} vorschlaegeVorhanden bereitsBearbeitet={null}
      formular={<div />} sterne={{ schnitt: '4,9', anzahl: 126, wert: 4.9 } as never} vorgemerkte={[]} onAblaufZumFormular={() => {}}
    />,
  );
  it('grüne Zeile mit dem Eigenanteil, darunter der Pflegeheim-Vergleich; Sterne als erste Kennzahl', () => {
    zeigen(3364);
    expect(document.querySelector('[data-nach-zuschuessen]')!.textContent).toBe('Nach Zuschüssen ca. 1.622 € im Monat');
    expect(document.querySelector('[data-heimvergleich]')!.textContent).toBe('rund 1.742 € weniger als im Pflegeheim');
    const vertrauen = document.querySelector('[data-vertrauen]') as HTMLElement;
    // Gleiche Abstände zwischen den Spalten, rechts frei für Martas Reiter (Martin 08.11.: „Abstand muss besser passen“).
    expect(vertrauen.children).toHaveLength(3);
    expect(vertrauen.className).toContain('justify-between');
    expect(vertrauen.className).toContain('min-[360px]:pr-6');
    // Sichtbar unverändert: Wert groß, Beschriftung klein darunter.
    expect(sichtbar(vertrauen)).toBe('4,9126 Bewertungen20 JahreErfahrung6× in FolgeTestsieger');
    // Vorgelesen ohne Doppelung und mit Maßstab (Prüfung Wortlaut 13.11.): „Bewertung: 4,9 von 5 Sternen, 126 Bewertungen“.
    expect(vorgelesen(vertrauen)).toBe('Bewertung4,9 von 5 Sternen126 BewertungenErfahrung20 JahreTestsieger6× in Folge');
    // Spalten schrumpfen nie unter ihren Text (sonst lief er bei 320 px ineinander, Prüfung Code 13.11.). Werte 16 px fett,
    // Beschriftung 15 px grau (Martin 13.11.: „die unteren Punkte würde ich schon fett lassen“); unter 390 px je eine Stufe
    // kleiner (Wert 15, Beschriftung 14 px), unter 360 px darf nur die Beschriftung umbrechen, der Wert bleibt einzeilig.
    expect(vertrauen.className).toContain('whitespace-nowrap');
    for (const spalte of vertrauen.children) {
      expect(spalte.className).not.toContain('min-w-0');
      const [wert, wort] = spalte.querySelectorAll('dd');
      for (const k of ['text-[16px]', 'font-bold', 'text-pm-ink', 'max-[389px]:text-[15px]']) expect(wert.className).toContain(k);
      expect(wert.className).not.toContain('whitespace-normal');
      for (const k of ['text-[15px]', 'text-pm-muted', 'max-[389px]:text-[14px]', 'max-[359px]:whitespace-normal']) expect(wort.className).toContain(k);
      expect(wort.className).not.toContain('max-[389px]:text-[13px]');
    }
    // Kein Satz mehr zu zwei Personen, keine Chips.
    expect(document.body.textContent).not.toMatch(/für eine Person|Zwei Personen|Pflegegrad 4/);
  });
  // Martin 08.11.: „in der Arbeitszeit … so einen grünen Punkt … danach blenden wir Anrufen aus … nur noch WhatsApp aktiv“.
  it('Marta 8–20 Uhr: grüner Punkt, Anrufen und WhatsApp; danach grauer Punkt, Anrufen ausgegraut, Hinweis auf WhatsApp (Fenster und Kasten unten)', async () => {
    uhrzeit('2026-11-09T21:15:00+01:00'); // Montag 21:15 deutscher Zeit
    const { unmount } = zeigen(3364);
    const reiter = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter).toHaveAccessibleName('Marta Kapcio, Ihre Beraterin: per WhatsApp schreiben');
    expect(reiter.querySelector('[data-erreichbar]')).toBeNull();
    await userEvent.setup().click(reiter);
    const panel = await screen.findByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' });
    // Anrufen bleibt sichtbar, ausgegraut und ohne Link (Martin 08.11.: „nicht den Button wegnehmen … einfach nur rausgrauen“).
    expect(within(panel).queryByRole('link', { name: /anrufen/ })).toBeNull();
    expect(within(panel).getByText('Anrufen').closest('[data-anrufen-aus]')).toHaveAttribute('aria-disabled', 'true');
    expect(within(panel).queryByText('089 200 000 830')).toBeNull();
    expect(within(panel).getByText('Außerhalb der Geschäftszeiten können Sie Marta per WhatsApp schreiben.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /per WhatsApp schreiben$/ })).toBeInTheDocument();
    expect(within(panel).getByText('täglich 8–20 Uhr')).toBeInTheDocument();
    const kasten = screen.getByText('Noch Fragen?').parentElement as HTMLElement;
    expect(within(kasten).queryByRole('link', { name: /anrufen/ })).toBeNull();
    expect(kasten.querySelector('[data-anrufen-aus]')).toHaveAttribute('aria-disabled', 'true');
    expect(within(kasten).getByText('Außerhalb der Geschäftszeiten können Sie Marta per WhatsApp schreiben.')).toBeInTheDocument();
    expect(within(kasten).getByRole('link', { name: /per WhatsApp schreiben$/ })).toBeInTheDocument();
    unmount();

    uhrzeit('2026-07-01T06:30:00Z'); // Sommerzeit: 8:30 deutscher Zeit
    zeigen(3364);
    const reiter2 = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter2).toHaveAccessibleName('Marta Kapcio, Ihre Beraterin: anrufen oder schreiben');
    expect(reiter2.querySelector('[data-erreichbar]')).not.toBeNull();
    const kasten2 = screen.getByText('Noch Fragen?').parentElement as HTMLElement;
    expect(within(kasten2).getByRole('link', { name: /anrufen: 089 200 000 830$/ })).toBeInTheDocument();
  });
  it('ohne Vorteil gegenüber dem Heim kein Vergleich', () => {
    zeigen(1500);
    expect(document.querySelector('[data-nach-zuschuessen]')!.textContent).toBe('Nach Zuschüssen ca. 1.622 € im Monat');
    expect(document.querySelector('[data-heimvergleich]')).toBeNull();
  });
});

// Kopf 13.11.2026 (Martin: „Guten Tag, Frau Müller muss kleiner. Ihr persönliches Angebot muss … mehr in den Vordergrund
// oder Ihr Preis für die Betreuung zu Hause … das jetzige ist mir zu bunt … nach Zuschüssen ca. 1620 im Monat. Das kann von
// mir aus grün bleiben.“).
describe('Kopfbereich: Gruß klein, Titel groß, ruhige Preiskarte (Martin 13.11.2026)', () => {
  const lead = {
    kalkulation: {
      bruttopreis: 3050, eigenanteil: 1621.75, aufschluesselung: [], formularDaten: { pflegegrad: 4, betreuung_fuer: 'ehepaar' },
      'zuschüsse': { gesamt: 1428.25, items: [
        { name: 'pflegegeld', label: 'Pflegegeld', beschreibung: '', betrag_monatlich: 800, betrag_jaehrlich: 9600, typ: 'monatlich', hinweis: null, in_kalkulation: true },
        { name: 'entlastungsbudget_neu', label: 'Entlastungsbudget', beschreibung: '', betrag_monatlich: 294.92, betrag_jaehrlich: 3539, typ: 'jaehrlich', hinweis: null, in_kalkulation: true },
        { name: 'steuervorteil', label: 'Steuerliche Absetzbarkeit', beschreibung: '', betrag_monatlich: 333.33, betrag_jaehrlich: 4000, typ: 'jaehrlich', hinweis: null, in_kalkulation: true },
      ] },
    },
  } as unknown as import('../../lib/supabase').Lead;
  const zeigen = (anrede: string | null, onBestpreis = vi.fn(), onKostenAufgeklappt = vi.fn()) => {
    render(
      <EinstiegMinimal
        anrede={anrede} lead={lead} onBestpreis={onBestpreis} heimEigenanteil={3364} heimQuelle=""
        laedt={false} zeilen={[]} gehalteneEinladungen={0} vorschlaegeVorhanden bereitsBearbeitet={null}
        formular={<div />} sterne={{ schnitt: '4,9', anzahl: 126, wert: 4.9 } as never} vorgemerkte={[]} onAblaufZumFormular={() => {}}
        onKostenAufgeklappt={onKostenAufgeklappt}
      />,
    );
    return { onBestpreis, onKostenAufgeklappt };
  };

  it('Titel als h1 in zwei festen Zeilen, Gruß klein und grau darüber (kein Heading), dann Preis, grüne Zeile, „Warum Primundus?“, Punkte, Kennzahlen', () => {
    zeigen('Frau Müller');
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(KOPF_TITEL);
    // Wortlaut Martins; zwischen „zu“ und „Hause“ steht ein geschütztes Leerzeichen (\u00a0), damit „zu Hause“ nie getrennt
    // wird. Die Konstante selbst ist mit sichtbarer Schreibweise geprüft (Prüfung Code 13.11.: abgetippt wurde der Test rot).
    expect(KOPF_TITEL).toBe('Ihr Preis für die Betreuung zu\u00a0Hause');
    expect(KOPF_TITEL.replace(/\u00a0/g, ' ')).toBe('Ihr Preis für die Betreuung zu Hause');
    // Fester Umbruch nach „die“ (nicht nur text-wrap: balance, das iOS vor 17.4 nicht kennt).
    expect(h1.querySelectorAll('br')).toHaveLength(1);
    expect(h1.className).toContain('text-[28px]');
    const gruss = document.querySelector('[data-kopf-gruss]') as HTMLElement;
    expect(gruss.tagName).toBe('P');
    expect(gruss.textContent).toBe('Guten Tag, Frau Müller');
    expect(gruss.className).toContain('text-[15px]');
    expect(gruss.className).toContain('text-pm-muted');
    expect(screen.queryByRole('heading', { name: /Guten Tag/ })).toBeNull();
    expect(screen.queryByText('Ihr persönliches Angebot')).toBeNull();

    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    // Kein zweiter Name für die Karte (sonst liest ein Vorleseprogramm den Titel doppelt, Prüfung Wortlaut 13.11.).
    expect(karte.hasAttribute('aria-labelledby')).toBe(false);
    // Eine linke Kante mit der Überschrift der Liste: 16 px Innenrand auf allen Breiten (Prüfung Gestaltung 13.11.).
    expect(karte.className).toContain('px-4');
    expect(karte.className).not.toMatch(/px-5/);
    expect((document.querySelector('[data-kopf-gruss]')!.parentElement as HTMLElement).className).toContain('px-4');
    const preis = karte.querySelector('[data-kopf-preis]') as HTMLElement;
    expect(sichtbar(preis)).toBe('3.050 € / Monat');
    expect(vorgelesen(preis)).toBe('3.050 € pro Monat');
    // Unter 360 px kleiner, sonst ragt „Details“ bei 320 px über den Rand (Prüfung Code 13.11.).
    expect(preis.className).toContain('max-[359px]:text-[34px]');
    // Grün bleibt („Das kann von mir aus grün bleiben“), darunter der Heim-Vergleich.
    const gruen = karte.querySelector('[data-nach-zuschuessen]') as HTMLElement;
    expect(gruen.textContent).toBe('Nach Zuschüssen ca. 1.622 € im Monat');
    expect(gruen.className).toContain('text-pm-green');
    const heim = karte.querySelector('[data-heimvergleich]') as HTMLElement;
    expect(heim.textContent).toBe('rund 1.742 € weniger als im Pflegeheim');
    // Kostensatz nur hinter „Details“ (Martin 08.11.: „so clean wie möglich“).
    expect(karte.textContent).not.toMatch(/Reisekosten|Kost und Logis/);

    // „Warum Primundus?“ als kleine graue h2 über den Punkten, statt der Trennlinie (Martin 13.11.).
    const warum = within(karte).getByRole('heading', { level: 2 });
    expect(warum.textContent).toBe(WARUM_TITEL);
    expect(warum).toHaveAttribute('data-kopf-warum');
    for (const k of ['text-[15px]', 'font-normal', 'text-pm-muted']) expect(warum.className).toContain(k);
    // „zu bunt“: kein Mintkasten, dunkle Schrift, grüne Haken; die vier Punkte im Wortlaut Martins vom 13.11.
    const garantie = karte.querySelector('[data-garantie]') as HTMLElement;
    expect(garantie.className).not.toMatch(/bg-pm-mint|rounded-\[14px\]/);
    const punkte = within(garantie).getAllByRole('listitem');
    expect(punkte.map((li) => li.textContent)).toEqual(['Bestpreisgarantie', ...KOPF_PUNKTE]);
    expect(punkte.map((li) => li.textContent)).toEqual(['Bestpreisgarantie', 'Keine Vermittlungsgebühren', 'Tägliche Kündigung', 'Taggenaue Abrechnung']);
    for (const li of punkte) {
      expect(li.className).toContain('text-pm-ink');
      expect(li.querySelector('svg')!.getAttribute('class')).toContain('text-pm-green');
    }
    const vertrauen = karte.querySelector('[data-vertrauen]') as HTMLElement;
    expect(sichtbar(vertrauen)).toBe('4,9126 Bewertungen20 JahreErfahrung6× in FolgeTestsieger');
    expect(vorgelesen(vertrauen)).toBe('Bewertung4,9 von 5 Sternen126 BewertungenErfahrung20 JahreTestsieger6× in Folge');

    const reihe = [gruss, h1, karte, preis, gruen, heim, warum, garantie, vertrauen];
    for (let i = 1; i < reihe.length; i++) expect(davor(reihe[i - 1], reihe[i])).toBe(true);
  });

  it('ohne Anrede nur „Guten Tag“', () => {
    zeigen(null);
    expect(document.querySelector('[data-kopf-gruss]')!.textContent).toBe('Guten Tag');
  });

  it('„Details“ klappt Kostensatz und Aufstellung in der Preiskarte auf (Messpunkt einmal je Öffnen) und wieder zu', async () => {
    const { onKostenAufgeklappt } = zeigen('Frau Müller');
    const user = userEvent.setup();
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    const knopf = within(karte).getByRole('button', { name: 'Details' });
    expect(knopf.getAttribute('aria-expanded')).toBe('false');
    expect(knopf.getAttribute('aria-controls')).toBe('angebot-details');
    await user.click(knopf);
    expect(knopf.getAttribute('aria-expanded')).toBe('true');
    const details = document.getElementById('angebot-details') as HTMLElement;
    expect(karte.contains(details)).toBe(true);
    expect(within(details).getByText('Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).')).toBeTruthy();
    expect(onKostenAufgeklappt).toHaveBeenCalledTimes(1);
    await user.click(knopf);
    expect(document.getElementById('angebot-details')).toBeNull();
    expect(onKostenAufgeklappt).toHaveBeenCalledTimes(1);
  });

  it('Tipp auf „Bestpreisgarantie“ öffnet ihr Fenster über onBestpreis (Knopf, kein Link nach außen)', async () => {
    const { onBestpreis } = zeigen('Frau Müller');
    const knopf = within(document.querySelector('[data-garantie]') as HTMLElement).getByRole('button', { name: /^Bestpreisgarantie/ });
    expect(knopf.tagName).toBe('BUTTON');
    expect(knopf.closest('a')).toBeNull();
    expect(within(knopf).getByLabelText('Mehr Infos')).toBeTruthy();
    await userEvent.setup().click(knopf);
    expect(onBestpreis).toHaveBeenCalledTimes(1);
  });
});
