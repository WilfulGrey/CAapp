/** @vitest-environment jsdom */
// Minimal-Einstieg vor dem ersten Speichern der Pflegesituation (Registry #147, Entwurf; Martin 07.11.2026 zum Mockup
// „Minimal“: „Ja, alle drei“).
//   - Reihenfolge im ersten Bild: Kopf mit Testsieger statt „Hilfe“ → „Guten Tag, …“ → kompakte Angebotskarte → „Passende
//     Pflegekräfte“ mit Anzahl als Zeilen → Hauptknopf → „Rückruf vereinbaren“ (Knopf, mit Rückrufnummer im Lead) →
//     Nummer und WhatsApp; darunter Pflegesituation mit Formular, Kostenkarte, So geht es weiter, Fragen, Marta
//   - „Rückruf vereinbaren“ schickt die Bitte an /api/rueckmeldung (Quelle portal_einstieg) und zeigt danach wörtlich die
//     Rückmeldeseite: „Danke, Marta ruft Sie an.“ bzw. „Das hat nicht geklappt“; ohne Rückrufnummer bleibt es ein tel:-Link
//   - Platzhalterzeilen ohne Text, solange die Liste lädt (Hauptknopf steht schon da)
//   - „Einladen“ in der Zeile = Logik aus #145 (Fenster, Vormerken, nach dem Speichern automatisch einladen)
//   - Messpunkte: fester Knopf als Quelle `hauptknopf`, „Details“ als `kosten_aufgeklappt`, Zeile wie die Karte (`karte`)
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCaregiver, sampleMatching, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { vormerkSchluessel } from '../../lib/vormerkungen';
import { EinstiegMinimal, zeilenFakten } from '../../components/portal/EinstiegMinimal';
import type { Nurse } from '../../types';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    // Jeder Test mit eigenem Token (Sitzungs-Dedupe der Meldungen je Token). Lead wie im Rechner: eine Person, Pflegegrad 3.
    // Token mit „ohnetel“: Lead ohne Rückrufnummer (Kontakt in drei Schritten, Registry #76).
    fetchLeadByToken: vi.fn(async (token: string) => token.startsWith('token-mi-')
      ? { lead: { ...defaultLead, token, telefon: token.includes('ohnetel') ? null : defaultLead.telefon, kalkulation: { ...defaultLead.kalkulation, formularDaten: { ...defaultLead.kalkulation.formularDaten, betreuung_fuer: '1-person' } } } as unknown as import('../../lib/supabase').Lead, error: null }
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

// Zwei Vorschläge: Helena K. (50002, Empfehlung — mehr Einsätze, steht oben) und Emilia W. (50003).
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
const HAUPTKNOPF = /^Pflegesituation vervollständigen/;
const davor = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts;
const zeilen = () => [...document.querySelectorAll('[data-pflegekraft-zeile]')] as HTMLElement[];
const zeileVon = (vorname: string) => zeilen().find((z) => z.textContent?.startsWith(`${vorname},`)) as HTMLElement;

describe('Minimal-Einstieg vor dem ersten Speichern (Registry #147)', () => {
  it('Reihenfolge und Wortlaut: Kopf mit Testsieger, Gruß, Angebotskarte, Pflegekräfte als Zeilen mit Anzahl, Hauptknopf, Rückruf, Nummer; darunter Formular, Kosten, So geht es weiter, Fragen, Marta', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-reihe');
    render(<CustomerPortalPage />);

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Guten Tag, Frau Testerin' }, { timeout: 5000 });
    // Kopf: rechts „6× Testsieger“ (fett) / „DIE WELT“ mit Siegel, kein „Hilfe“.
    const kopf = document.querySelector('[data-testsieger-kopf]') as HTMLElement;
    expect(kopf.closest('nav')).not.toBeNull();
    expect(within(kopf).getByText('6× Testsieger').tagName).toBe('B');
    expect(kopf.textContent).toBe('6× TestsiegerDIE WELT');
    expect(within(kopf).getByAltText('Testsieger Die Welt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hilfe' })).toBeNull();

    // Angebotskarte (Fassung „CGA-Stil“, Martin 08.11.): „Ihr persönliches Angebot“, Preis, „Details“, Kasten
    // Bestpreisgarantie mit vier Punkten, Vertrauen. Die Zeile „Nach Zuschüssen …“ fehlt hier: Die Posten der
    // Testkalkulation (2.800 − 347) passen nicht zum Eigenanteil 1.800, und dann steht lieber nichts als eine falsche Zahl.
    // Keine Chips mehr („Eine Person“, „Pflegegrad 3“).
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    expect(within(karte).getByRole('heading', { level: 2, name: 'Ihr persönliches Angebot' })).toBeInTheDocument();
    expect(within(karte).getByText(/^2\.800 €/).textContent).toBe('2.800 € / Monat');
    // Zusatzkosten klein direkt unter dem Preis (Martin 08.11.: „Ja, klein unter den Preis“).
    expect(karte.querySelector('[data-preis-hinweis]')!.textContent).toBe('Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).');
    expect(karte.querySelector('[data-nach-zuschuessen]')).toBeNull();
    expect(karte.textContent).not.toMatch(/Eine Person|Pflegegrad 3/);
    expect(within(karte).getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'false');
    // Vier gleichwertige Punkte, die Garantie zuerst mit „Mehr Infos“ (Martin: „Ist das unsere Bestpreisgarantie? Oder ist
    // das nur ein Punkt davon?“); „Keine Kündigungsfrist“ entfällt („Beides genügt.“).
    const garantie = karte.querySelector('[data-garantie]') as HTMLElement;
    expect(within(garantie).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Es gilt immer unsere BestpreisgarantieMehr Infos', 'Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit']);
    expect(within(garantie).getByRole('button', { name: 'Mehr Infos' })).toBeInTheDocument();

    // Pflegekräfte: Abschnitt mit Anzahl, Zeilen „Vorname, Alter“, „N Jahre Erfahrung“, „Deutsch Gut“, rechts der Preis des
    // Kunden und „Einladen“ (Martin 08.11.: „immer den Preis darstellen … und dann einladen“), Empfehlung oben.
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const abschnitt = document.getElementById('pflegekraefte')!;
    expect(within(abschnitt).getByRole('heading', { level: 2 }).textContent).toBe('Passende Pflegekräfte2');
    const [erste, zweite] = zeilen();
    // Preis ohne „/ Monat“ (Martin 08.11.).
    expect(erste.textContent).toMatch(/^Helena, \d+5 Jahre ErfahrungDeutsch Gut2\.800 €Einladen$/);
    expect(erste.querySelector('[data-preis]')!.textContent).toBe('2.800 €');
    expect(zweite.textContent).toMatch(/^Emilia, \d+5 Jahre ErfahrungDeutsch Gut2\.800 €Einladen$/);
    // Rundes Foto wie heute (Name steht daneben, darum alt="").
    expect(erste.querySelector('img')).toHaveAttribute('src', 'https://example.test/avatar.jpg');
    expect(erste.querySelector('img')!.className).toContain('rounded-full');
    expect(screen.getAllByRole('button', { name: 'Einladen' })).toHaveLength(2);
    // Nicht mehr im ersten Bild: Titel, Satz und Empfehlungszeile von #145, große Karten.
    expect(screen.queryByText('Ihr Angebot zur 24-Stunden-Betreuung')).toBeNull();
    expect(screen.queryByText('Laden Sie ein, wer Ihnen gefällt. Dafür beschreiben Sie kurz die Pflegesituation.')).toBeNull();
    expect(screen.queryByText('Unsere Empfehlung für Sie')).toBeNull();
    expect(document.querySelector('.rounded-card.cursor-pointer')).toBeNull();

    // Fester Knopf unten (sticky am Ende des ersten Teils), zwei Zeilen; davor Rückruf (Knopf: der Lead hat eine
    // Rückrufnummer) und Nummer/WhatsApp.
    const haupt = screen.getByRole('button', { name: HAUPTKNOPF });
    expect(haupt.textContent).toBe('Pflegesituation vervollständigenund Bewerbungen erhalten');
    expect(haupt.className).toContain('bg-pm-coral');
    expect(haupt.closest('[data-fester-knopf]')!.className).toContain('sticky bottom-0');
    const rueckruf = screen.getByRole('button', { name: 'Rückruf vereinbaren' });
    expect(screen.queryByRole('link', { name: 'Rückruf vereinbaren' })).toBeNull();
    const zeileTel = screen.getByText(/^oder anrufen, auch per/);
    expect(zeileTel.textContent).toBe('oder anrufen, auch per WhatsApp:089 200 000 830 (täglich 8–20 Uhr)');
    expect(within(zeileTel).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/4989200000830/);
    expect(within(zeileTel).getByRole('link', { name: '089 200 000 830' })).toHaveAttribute('href', 'tel:+4989200000830');

    // Darunter: Pflegesituation mit offenem Formular, So geht es weiter, Fragen, Marta. Keine Kostenkarte mehr (ihre
    // Aufstellung steht unter „Details“).
    const pflegesituation = document.getElementById('patientendaten')!;
    expect(within(pflegesituation).getByRole('heading', { level: 2, name: 'Pflegesituation' })).toBeInTheDocument();
    const schritt = screen.getByText(/Schritt 1 von 4/);
    expect(screen.queryByText('Ihre Betreuungskosten')).toBeNull();
    const soGehts = screen.getByRole('heading', { level: 2, name: 'So geht es weiter' });
    const fragen = screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' });
    const marta = screen.getByText('Noch Fragen?');
    const reihe = [h1, karte, abschnitt, zweite, rueckruf, zeileTel, haupt, pflegesituation, schritt, soGehts, fragen, marta];
    for (let i = 1; i < reihe.length; i++) expect(davor(reihe[i - 1], reihe[i])).toBe(true);
    // Wortlaut-Regeln: nie „Betreuungskräfte“, nie „vermitteln“.
    expect(document.body.textContent).not.toMatch(/Betreuungskräfte|vermitteln/);
    // Knopf rechts in jedem Zustand gleich breit (die Zeile hält ihre Höhe).
    for (const z of zeilen()) expect(within(z).getByRole('button', { name: 'Einladen' }).className).toContain('w-[88px]');
  }, 20_000);

  it('Platzhalterzeilen ohne Text, solange die Liste lädt; Hauptknopf steht schon da, danach die Zeilen mit Anzahl', async () => {
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
    await screen.findByRole('heading', { level: 1, name: 'Guten Tag, Frau Testerin' }, { timeout: 5000 });
    const platzhalter = () => [...document.querySelectorAll('[data-platzhalter]')];
    await waitFor(() => expect(platzhalter()).toHaveLength(5), { timeout: 5000 });
    for (const p of platzhalter()) expect(p.textContent).toBe('');
    expect(document.querySelector('ul[aria-busy="true"]')).not.toBeNull();
    expect(within(document.getElementById('pflegekraefte')!).getByRole('heading', { level: 2 }).textContent).toBe('Passende Pflegekräfte');
    expect(screen.getByRole('button', { name: HAUPTKNOPF })).toBeInTheDocument();
    expect(zeilen()).toHaveLength(0);

    freigeben();
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    expect(platzhalter()).toHaveLength(0);
    expect(within(document.getElementById('pflegekraefte')!).getByRole('heading', { level: 2 }).textContent).toBe('Passende Pflegekräfte2');
  }, 20_000);

  it('„Einladen“ in der Zeile: Fenster „{Name} einladen“, „Ausgewählt ✓“, Zeile über dem Formular, localStorage; Messpunkte wie bei der Karte', async () => {
    let einladungen = 0;
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege, inviteCaregiver: () => { einladungen += 1; return { StoreRequest: { id: 1 } }; } } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-einladen');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });

    await user.click(within(zeileVon('Emilia')).getByRole('button', { name: 'Einladen' }));
    const fenster = await screen.findByRole('dialog', { name: 'Emilia W. einladen' });
    await user.click(within(fenster).getByRole('button', { name: 'Später' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // „Ausgewählt“ statt „Vorgemerkt“ (Martin 08.11.: „sieht natürlich komisch aus“); nicht „Eingeladen“, verschickt wird
    // erst nach dem Speichern.
    const vorgemerkt = within(zeileVon('Emilia')).getByRole('button', { name: 'Ausgewählt ✓' });
    expect(vorgemerkt.textContent).toBe('Ausgewählt');
    // Gleich breit wie „Einladen“: die Zeile wird mit der Vormerkung nicht höher.
    expect(vorgemerkt.className).toContain('w-[88px]');
    expect(zeileVon('Emilia')).toHaveAttribute('data-vorgemerkt', 'true');
    expect(within(zeileVon('Helena')).getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(screen.getByText('Nach dem Speichern laden wir Emilia W. für Sie ein.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-mi-einladen'))!)).toEqual([50003]);

    // „Ausgewählt ✓“ öffnet das Fenster erneut; der Knopf darin springt zum Formular (Quelle einladen_fenster).
    await user.click(vorgemerkt);
    await user.click(within(await screen.findByRole('dialog', { name: 'Emilia W. einladen' })).getByRole('button', { name: 'Pflegesituation vervollständigen' }));
    await waitFor(() => expect(gescrollt().map((e) => e.id)).toContain('patientendaten'));

    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladung_vorgemerkt')?.metadata).toEqual({ caregiver_id: 50003 }));
    expect(meldungen.find((m) => m.event === 'einladen_getippt')?.metadata).toEqual({ caregiver_id: 50003, quelle: 'karte', vor_speichern: true });
    await waitFor(() => expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.metadata).toEqual({ quelle: 'einladen_fenster', vor_speichern: true }));
    expect(einladungen).toBe(0);
  }, 20_000);

  it('Hauptknopf springt zum offenen Formular (Messpunkt zur_pflegesituation, Quelle hauptknopf); Tipp auf die Zeile öffnet das Profil (Quelle karte)', async () => {
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-haupt');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    await waitFor(() => expect(gescrollt().map((e) => e.id)).toContain('patientendaten'));
    await waitFor(() => expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.metadata).toEqual({ quelle: 'hauptknopf', vor_speichern: true }));
    expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.notify).toBe(false);

    await user.click(within(zeileVon('Helena')).getByText((_, el) => el?.tagName === 'SPAN' && /^Helena, \d+$/.test(el.textContent ?? '')));
    await screen.findByRole('button', { name: 'Nein danke' }, { timeout: 5000 });
    await waitFor(() => expect(meldungen.find((m) => m.event === 'profil_geoeffnet')?.metadata).toEqual({ caregiver_id: 50002, quelle: 'karte', vor_speichern: true }));
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
    expect(within(details).getByText('Monatlich inkl. Steuern, Gebühren und Sozialabgaben.')).toBeInTheDocument();
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

  it('nach dem ersten erfolgreichen Speichern: die in den Zeilen Vorgemerkten werden eingeladen (Logik #145), danach die Ansicht nach dem Speichern', async () => {
    const TOKEN = 'token-mi-speichern';
    const eingeladen: number[] = [];
    server.use(
      nebenlaeufer,
      ...lesen,
      ...defaultHandlers({ proxy: {
        ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
        inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1, caregiver_id: vars.caregiver_id } }; },
      } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    await user.click(within(zeileVon('Helena')).getByRole('button', { name: 'Einladen' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Helena K. einladen' })).getByRole('button', { name: 'Später' }));
    expect(eingeladen).toEqual([]);
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));

    expect(await screen.findByText('Helena K. ist eingeladen.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(eingeladen).toEqual([50002]);
    expect(localStorage.getItem(vormerkSchluessel(TOKEN))).toBeNull();
    // Nach dem Speichern weder Zeilen noch Hauptknopf; die Navigationsleiste zeigt wieder „Hilfe“.
    expect(zeilen()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(document.querySelector('[data-testsieger-kopf]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hilfe' })).toBeInTheDocument();
  }, 30_000);

  it('„Rückruf vereinbaren“: genau ein POST mit Token und Quelle portal_einstieg, danach „Danke, Marta ruft Sie an.“ statt des Knopfs; Nummer bleibt', async () => {
    const TOKEN = 'token-mi-rueckruf-ok';
    const bitten: Record<string, unknown>[] = [];
    let freigeben: () => void = () => {};
    const freigabe = new Promise<void>((r) => { freigeben = r; });
    server.use(
      http.post('https://kostenrechner.primundus.de/api/rueckmeldung', async ({ request }) => {
        bitten.push(await request.json() as Record<string, unknown>);
        await freigabe;
        return HttpResponse.json({ ok: true });
      }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const haupt = screen.getByRole('button', { name: HAUPTKNOPF });
    const knopf = screen.getByRole('button', { name: 'Rückruf vereinbaren' });
    // Der Statusbereich steht schon vor dem Tipp leer im DOM (ein erst mit Text eingefügter Bereich wird von Screenreadern
    // unzuverlässig angesagt).
    const aktionen = document.querySelector('[data-aktionen-minimal]') as HTMLElement;
    const danke = within(aktionen).getByRole('status');
    expect(danke.textContent).toBe('');

    // Während der Anfrage gesperrt (aria-disabled, nicht disabled: der Fokus bleibt auf dem Knopf), ein Doppeltipp sendet
    // nicht zweimal; die Beschriftung bleibt.
    await user.click(knopf);
    await waitFor(() => expect(knopf).toHaveAttribute('aria-disabled', 'true'));
    expect(knopf).not.toBeDisabled();
    expect(knopf).toHaveAttribute('aria-busy', 'true');
    expect(document.activeElement).toBe(knopf);
    expect(knopf.textContent).toBe('Rückruf vereinbaren');
    await user.click(knopf);
    freigeben();

    // Derselbe Statusbereich bekommt den Dank; der Fokus geht auf den Dank an der Stelle des Knopfs (nicht auf die Seite).
    await waitFor(() => expect(danke.textContent).toBe('Danke, Marta ruft Sie an.'));
    expect(within(aktionen).getByRole('status')).toBe(danke);
    expect(document.activeElement).toBe(within(danke).getByText('Danke, Marta ruft Sie an.'));
    expect(screen.queryByRole('button', { name: 'Rückruf vereinbaren' })).toBeNull();
    expect(bitten).toEqual([{ token: TOKEN, aktion: 'rueckruf', quelle: 'portal_einstieg' }]);
    // Nummer und fester Knopf bleiben, in derselben Reihenfolge.
    expect(screen.getByRole('button', { name: HAUPTKNOPF })).toBe(haupt);
    const zeileTel = screen.getByText(/^oder anrufen, auch per/);
    expect(davor(danke, zeileTel)).toBe(true);
    expect(davor(zeileTel, haupt)).toBe(true);
    expect(document.body.textContent).not.toMatch(/Betreuungskräfte|vermitteln/);
  }, 20_000);

  it('„Rückruf vereinbaren“ ohne Erfolg (502): „Das hat nicht geklappt“ über dem weiter tippbaren Knopf, zweiter Tipp sendet erneut', async () => {
    let anzahl = 0;
    server.use(
      http.post('https://kostenrechner.primundus.de/api/rueckmeldung', () => {
        anzahl += 1;
        return anzahl === 1 ? HttpResponse.json({ error: 'Mail fehlgeschlagen' }, { status: 502 }) : HttpResponse.json({ ok: true });
      }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-rueckruf-fehler');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });

    const erster = screen.getByRole('button', { name: 'Rückruf vereinbaren' });
    await user.click(erster);
    const aktionen = document.querySelector('[data-aktionen-minimal]') as HTMLElement;
    const fehler = await within(aktionen).findByRole('alert');
    expect(fehler.textContent).toBe('Das hat nicht geklappt');
    const knopf = screen.getByRole('button', { name: 'Rückruf vereinbaren' });
    // Derselbe Knopf, wieder frei und weiter fokussiert (Tastatur kann sofort wiederholen).
    expect(knopf).toBe(erster);
    expect(knopf).not.toHaveAttribute('aria-disabled');
    expect(document.activeElement).toBe(knopf);
    expect(davor(fehler, knopf)).toBe(true);
    expect(screen.queryByText('Danke, Marta ruft Sie an.')).toBeNull();
    expect(screen.getByText(/^oder anrufen, auch per/)).toBeInTheDocument();

    await user.click(knopf);
    const status = within(aktionen).getByRole('status');
    await waitFor(() => expect(status.textContent).toBe('Danke, Marta ruft Sie an.'));
    expect(anzahl).toBe(2);
  }, 20_000);

  it('Lead ohne Rückrufnummer: „Rückruf vereinbaren“ bleibt ein Anruf-Link, kein POST', async () => {
    let bitten = 0;
    server.use(
      http.post('https://kostenrechner.primundus.de/api/rueckmeldung', () => { bitten += 1; return HttpResponse.json({ ok: true }); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }),
    );
    window.history.replaceState({}, '', '/?token=token-mi-ohnetel');
    render(<CustomerPortalPage />);
    await waitFor(() => expect(zeilen()).toHaveLength(2), { timeout: 5000 });
    const link = screen.getByRole('link', { name: 'Rückruf vereinbaren' });
    expect(link).toHaveAttribute('href', 'tel:+4989200000830');
    expect(screen.queryByRole('button', { name: 'Rückruf vereinbaren' })).toBeNull();
    expect(bitten).toBe(0);
  }, 20_000);

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
      formular={<div />} sterne={null} vorgemerkte={[]} onVervollstaendigen={() => {}}
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
  it('Angebotskarte ohne Lead und ohne Sterne: Titel, Preis, Garantie; keine Zeile „Nach Zuschüssen“, Vertrauen ohne Sterne', () => {
    leer(0);
    const karte = document.querySelector('[data-angebot-minimal]') as HTMLElement;
    expect(within(karte).getByRole('heading', { level: 2 }).textContent).toBe('Ihr persönliches Angebot');
    expect(karte.querySelector('[data-nach-zuschuessen]')).toBeNull();
    const vertrauen = karte.querySelector('[data-vertrauen]') as HTMLElement;
    expect(vertrauen.className).toContain('grid-cols-2');
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
      formular={<div />} sterne={{ schnitt: '4,9', anzahl: 126, wert: 4.9 } as never} vorgemerkte={[]} onVervollstaendigen={() => {}}
    />,
  );
  it('eine ruhige Zeile mit Eigenanteil und Pflegeheim-Vergleich; Sterne als erste Kennzahl', () => {
    zeigen(3364);
    expect(document.querySelector('[data-nach-zuschuessen]')!.textContent).toBe('Nach Zuschüssen ca. 1.622 €, rund 1.742 € weniger als im Pflegeheim');
    const vertrauen = document.querySelector('[data-vertrauen]') as HTMLElement;
    expect(vertrauen.className).toContain('grid-cols-3');
    expect(vertrauen.textContent).toBe('Bewertungen4,9126 BewertungenErfahrung20 JahreErfahrungTestsieger6× in FolgeTestsieger');
    // Kein Satz mehr zu zwei Personen, keine Chips.
    expect(document.body.textContent).not.toMatch(/für eine Person|Zwei Personen|Pflegegrad 4/);
  });
  it('ohne Vorteil gegenüber dem Heim kein Vergleich', () => {
    zeigen(1500);
    expect(document.querySelector('[data-nach-zuschuessen]')!.textContent).toBe('Nach Zuschüssen ca. 1.622 €');
  });
});
