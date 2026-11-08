/** @vitest-environment jsdom */
// Minimal-Einstieg vor dem ersten Speichern der Pflegesituation (Registry #147, Entwurf; Martin 07.11.2026 zum Mockup
// „Minimal“: „Ja, alle drei“).
//   - Reihenfolge: Kopf mit Testsieger statt „Hilfe“ → „Guten Tag, …“ → Angebotskarte → „Passende Pflegekräfte“ mit Anzahl
//     als Zeilen → fester Knopf mit Kontakt-Reiter rechts (Panel: Anrufen, WhatsApp); darunter Pflegesituation mit Formular, So geht es
//     weiter, Fragen, Marta (Fassung „CGA-Stil“, Martin 08.11.)
//   - Platzhalterzeilen ohne Text, solange die Liste lädt (Hauptknopf steht schon da)
//   - „Einladen“ in der Zeile = Logik aus #145 (Fenster, Vormerken, nach dem Speichern automatisch einladen)
//   - Messpunkte: fester Knopf als Quelle `hauptknopf`, „Details“ als `kosten_aufgeklappt`, Zeile wie die Karte (`karte`)
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
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
// Martas Erreichbarkeit hängt an der Uhrzeit (8–20 Uhr): Tests, die sie prüfen, stellen die Uhr; danach wieder echt.
afterEach(() => { vi.useRealTimers(); });
const uhrzeit = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)); };

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
const HAUPTKNOPF = /^Bewerbungen erhalten/;
const davor = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts;
const zeilen = () => [...document.querySelectorAll('[data-pflegekraft-zeile]')] as HTMLElement[];
const zeileVon = (vorname: string) => zeilen().find((z) => z.textContent?.startsWith(`${vorname},`)) as HTMLElement;

describe('Minimal-Einstieg vor dem ersten Speichern (Registry #147)', () => {
  it('Reihenfolge und Wortlaut: Kopf mit Testsieger, Gruß, Angebotskarte, Pflegekräfte als Zeilen mit Anzahl, Kontakt, fester Knopf; darunter Formular, So geht es weiter, Fragen, Marta', async () => {
    uhrzeit('2026-11-09T10:00:00+01:00'); // Montag 10 Uhr: Marta erreichbar
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
    // Kein Hinweis auf Zusatzkosten oben (Martin 08.11.: „Ich will das mit den Fahrtkosten da alles nicht haben“), er steht
    // unter „Details“.
    expect(karte.textContent).not.toMatch(/Reisekosten/);
    expect(karte.querySelector('[data-nach-zuschuessen]')).toBeNull();
    expect(karte.textContent).not.toMatch(/Eine Person|Pflegegrad 3/);
    expect(within(karte).getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'false');
    // Vier gleichwertige kurze Punkte, die Garantie zuerst und antippbar; „Keine Kündigungsfrist“ entfällt („Beides genügt.“).
    const garantie = karte.querySelector('[data-garantie]') as HTMLElement;
    expect(within(garantie).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Bestpreisgarantie', 'Keine Vorauszahlung', 'Keine Vermittlungsgebühr', 'Keine Mindestlaufzeit']);
    expect(within(garantie).getByRole('button', { name: /^Bestpreisgarantie/ })).toBeInTheDocument();

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

    // Fester Knopf unten (Sticky-Anker am Ende des ersten Teils), kurz mit Martins Unterzeile; daran der Kontakt-Reiter wie in
    // der CG-App: Tipp öffnet das Panel mit Marta, Anrufen und WhatsApp (statt „Rückruf vereinbaren“, Martin 08.11.).
    const haupt = screen.getByRole('button', { name: HAUPTKNOPF });
    expect(haupt.textContent).toBe('Bewerbungen erhalten100% kostenfrei & unverbindlich');
    // Pfeil hinter dem Titel (Martin 08.11.), für Vorleseprogramme ausgeblendet.
    expect(haupt.querySelector('[data-pfeil]')).toHaveAttribute('aria-hidden', 'true');
    expect(haupt.className).toContain('bg-pm-coral');
    expect(haupt.closest('[data-fester-knopf]')!.className).toContain('sticky bottom-0');
    expect(screen.queryByText('Rückruf vereinbaren')).toBeNull();
    const reiter = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter).toHaveAccessibleName('Marta Kapcio, Ihre Beraterin: anrufen oder schreiben');
    await userEvent.setup().click(reiter);
    const panel = await screen.findByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' });
    expect(within(panel).getByText('täglich 8–20 Uhr')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: /anrufen: 089 200 000 830$/ })).toHaveAttribute('href', 'tel:+4989200000830');
    expect(within(panel).getByRole('link', { name: /per WhatsApp schreiben$/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/4989200000830/);
    await userEvent.setup().click(within(panel).getByRole('button', { name: 'Schließen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Darunter: Pflegesituation mit offenem Formular, So geht es weiter, Fragen, Marta. Keine Kostenkarte mehr (ihre
    // Aufstellung steht unter „Details“).
    const pflegesituation = document.getElementById('patientendaten')!;
    // Titel „Pflegesituation vervollständigen“ (Martin 08.11.: „was soll das heißen“).
    expect(within(pflegesituation).getByRole('heading', { level: 2, name: 'Pflegesituation vervollständigen' })).toBeInTheDocument();
    // Formular als weiße Karte (Titel und Satz oben in der Karte, kein Abschnittskopf mit „Für Ihre Bewerbungen“), EIN dünner
    // Fortschrittsbalken. Keine eigene Knopfleiste und kein „Weiter“: der eine feste Knopf steht hinter dem Formular und führt
    // durch die Schritte (Martin 08.11.: „Ich würde keinen Weiter-Button machen“).
    expect(within(pflegesituation).queryByText('Für Ihre Bewerbungen')).toBeNull();
    expect(within(pflegesituation).getByText('Danach können Sie Pflegekräfte einladen und bekommen Bewerbungen. Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.')).toBeInTheDocument();
    // Erste Seite = erste Hälfte von Schritt 1: Schrittzeile da, Balken halb so weit wie ein ganzer Schritt (Martin 08.11.:
    // „man sieht jetzt nicht, wie viele Schritte wir da haben … das würde ich schon irgendwie einblenden“).
    const balken = within(pflegesituation).getByRole('progressbar');
    expect(balken).toHaveAttribute('aria-valuenow', '1');
    expect((balken.firstElementChild as HTMLElement).style.width).toBe('12.5%');
    expect(pflegesituation.querySelector('[data-knopfleiste]')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Weiter/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: HAUPTKNOPF })).toHaveLength(1);
    // Erste Formularseite kurz (Martin 08.11.: „vielleicht nur eine Frage dort“): Anzahl fest (preisrelevant, „Personen …
    // können wir nicht ändern“), dazu nur das Geschlecht im bisherigen Wortlaut; Geburtsjahr usw. erst auf der zweiten Seite.
    const schritt = within(pflegesituation).getByText(/Schritt 1 von 4/);
    expect(within(pflegesituation).getByText('Anzahl zu betreuender Personen')).toBeInTheDocument();
    expect(within(pflegesituation).getByText('Geschlecht')).toBeInTheDocument();
    expect(within(pflegesituation).getByRole('button', { name: 'Weiblich' })).toBeInTheDocument();
    expect(within(pflegesituation).queryByText('Geburtsjahr')).toBeNull();
    expect(within(pflegesituation).queryByText('Wer wird betreut?')).toBeNull();
    expect(screen.queryByText('Ihre Betreuungskosten')).toBeNull();
    const soGehts = screen.getByRole('heading', { level: 2, name: 'So geht es weiter' });
    const fragen = screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' });
    const marta = screen.getByText('Noch Fragen?');
    // Variante B (Standard seit 08.11.): der Knopf steht als letztes Element der Seite und klebt bis dorthin unten.
    const reihe = [h1, karte, abschnitt, zweite, pflegesituation, schritt, soGehts, fragen, marta, haupt];
    for (let i = 1; i < reihe.length; i++) expect(davor(reihe[i - 1], reihe[i])).toBe(true);
    // Wortlaut-Regeln: nie „Betreuungskräfte“, nie „vermitteln“.
    expect(document.body.textContent).not.toMatch(/Betreuungskräfte|vermitteln/);
    // Knopf rechts in jedem Zustand gleich breit (die Zeile hält ihre Höhe).
    for (const z of zeilen()) expect(within(z).getByRole('button', { name: 'Einladen' }).className).toContain('w-[104px]');
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

  it('„Einladen“ in der Zeile: Fenster „{Name} einladen“, „Eingeladen ✓“, Zeile über dem Formular, localStorage; Messpunkte wie bei der Karte', async () => {
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
    // „Eingeladen“ statt „Vorgemerkt“ (Martin 08.11.: „sieht natürlich komisch aus“, abends: „muss auch eingeladen sein“).
    const vorgemerkt = within(zeileVon('Emilia')).getByRole('button', { name: 'Eingeladen ✓' });
    expect(vorgemerkt.textContent).toBe('Eingeladen');
    // Gleich breit wie „Einladen“: die Zeile wird mit der Vormerkung nicht höher.
    expect(vorgemerkt.className).toContain('w-[104px]');
    expect(zeileVon('Emilia')).toHaveAttribute('data-vorgemerkt', 'true');
    expect(within(zeileVon('Helena')).getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(screen.getByText('Nach dem Speichern laden wir Emilia W. für Sie ein.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-mi-einladen'))!)).toEqual([50003]);

    // „Eingeladen ✓“ öffnet das Fenster erneut; der Knopf darin springt zum Formular (Quelle einladen_fenster).
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

  it('Einstiegsseite: Anzahl fest und Geschlecht; ohne Antwort hält der Knopf mit Hinweis, die Antwort führt von selbst zur zweiten Hälfte von Schritt 1, „Zurück“ wieder zurück', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-einstieg');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await waitFor(() => expect(document.getElementById('pflegesituation-formular')).not.toBeNull(), { timeout: 5000 });
    const formular = document.getElementById('patientendaten')!;
    await within(formular).findByText('Anzahl zu betreuender Personen', {}, { timeout: 5000 });
    // Erster Tipp: ins Formular. Doppeltipp direkt danach zählt nicht (keine roten Felder, bevor das Formular zu sehen ist).
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    expect(screen.queryByRole('button', { name: 'Geschlecht fehlt' })).toBeNull();
    await new Promise((r) => setTimeout(r, 650)); // Tipp-Sperre nach dem Sprung ins Formular (0,6 s)
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    expect(await screen.findByRole('button', { name: 'Geschlecht fehlt' })).toBeInTheDocument();
    expect(within(formular).queryByText('Geburtsjahr')).toBeNull();
    // Antwort antippen: kurz die Auswahl, dann von selbst die zweite Hälfte von Schritt 1, ohne Anzahl und Geschlecht.
    await user.click(within(formular).getByRole('button', { name: 'Weiblich' }));
    expect(await within(formular).findByText('Geburtsjahr', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(formular).getByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect((within(formular).getByRole('progressbar').firstElementChild as HTMLElement).style.width).toBe('25%');
    expect(within(formular).queryByText('Anzahl zu betreuender Personen')).toBeNull();
    expect(within(formular).queryByText('Geschlecht')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Geschlecht fehlt' })).toBeNull();
    // „Zurück“ in der Schrittzeile führt zur ersten Seite, die Antwort ist noch gewählt.
    await user.click(within(formular).getByRole('button', { name: 'Zurück' }));
    expect(await within(formular).findByText('Anzahl zu betreuender Personen')).toBeInTheDocument();
    expect(within(formular).getByRole('button', { name: 'Weiblich' })).toHaveAttribute('aria-pressed', 'true');
    // Mit Antwort geht der Knopf weiter.
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    expect(await within(formular).findByText('Geburtsjahr')).toBeInTheDocument();
  }, 20_000);

  it('Häufige Fragen: „Ist das legal?“ und „Warum ist Primundus günstiger als andere?“ zuerst, sechs sichtbar', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-mi-faq');
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
    await userEvent.setup().click(within(liste).getByRole('button', { name: 'Warum ist Primundus günstiger als andere?' }));
    expect(within(liste).getByText('Weil kein Vermittler dazwischen steht: Primundus ist Direktanbieter, die Pflegekräfte sind bei Primundus angestellt. Eine Vermittlungsgebühr gibt es nicht. Dazu gilt unsere Bestpreisgarantie: Bei uns zahlen Sie nie mehr als für ein vergleichbares Angebot.')).toBeInTheDocument();
    // Nie „vermitteln“ für Primundus.
    expect(liste.textContent).not.toMatch(/vermitteln/);
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
    // EIN Knopf: erster Tipp springt ins Formular, die nächsten drei gehen weiter (mit „Zurück“ in der Schrittzeile), der
    // fünfte sendet ab. Der Reiter bleibt dabei sichtbar und eingeklappt.
    const reiter = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter).not.toHaveAttribute('data-eingeklappt');
    await user.click(await screen.findByRole('button', { name: HAUPTKNOPF }, { timeout: 5000 }));
    await new Promise((r) => setTimeout(r, 650)); // Tipp-Sperre nach dem Sprung ins Formular (0,6 s)
    expect(screen.getByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(reiter).toHaveAttribute('data-eingeklappt', 'true');
    expect(screen.queryByRole('button', { name: 'Zurück' })).toBeNull();
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    expect(await screen.findByText(/Schritt 2 von 4/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(await screen.findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));
    expect(await screen.findByText(/Schritt 4 von 4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Weiter|Speichern)/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: HAUPTKNOPF }));

    expect(await screen.findByText('Helena K. ist eingeladen.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(eingeladen).toEqual([50002]);
    expect(localStorage.getItem(vormerkSchluessel(TOKEN))).toBeNull();
    // Nach dem Speichern weder Zeilen noch Hauptknopf; die Navigationsleiste zeigt wieder „Hilfe“.
    expect(zeilen()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: HAUPTKNOPF })).toBeNull();
    expect(document.querySelector('[data-testsieger-kopf]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hilfe' })).toBeInTheDocument();
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
      formular={<div />} sterne={{ schnitt: '4,9', anzahl: 126, wert: 4.9 } as never} vorgemerkte={[]} onVervollstaendigen={() => {}}
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
    expect(vertrauen.textContent).toBe('Bewertungen4,9126 BewertungenErfahrung20 JahreErfahrungTestsieger6× in FolgeTestsieger');
    // Kein Satz mehr zu zwei Personen, keine Chips.
    expect(document.body.textContent).not.toMatch(/für eine Person|Zwei Personen|Pflegegrad 4/);
  });
  // Martin 08.11.: „in der Arbeitszeit … so einen grünen Punkt … danach blenden wir Anrufen aus … nur noch WhatsApp aktiv“.
  it('Marta 8–20 Uhr: grüner Punkt, Anrufen und WhatsApp; danach grauer Punkt und nur WhatsApp (Fenster und Kasten unten)', async () => {
    uhrzeit('2026-11-09T21:15:00+01:00'); // Montag 21:15 deutscher Zeit
    const { unmount } = zeigen(3364);
    const reiter = document.querySelector('[data-kontakt-reiter]') as HTMLElement;
    expect(reiter).toHaveAccessibleName('Marta Kapcio, Ihre Beraterin: per WhatsApp schreiben');
    expect(reiter.querySelector('[data-erreichbar]')).toBeNull();
    await userEvent.setup().click(reiter);
    const panel = await screen.findByRole('dialog', { name: 'Marta Kapcio, Ihre Beraterin' });
    expect(within(panel).queryByRole('link', { name: /anrufen/ })).toBeNull();
    expect(within(panel).queryByText('089 200 000 830')).toBeNull();
    expect(within(panel).getByRole('link', { name: /per WhatsApp schreiben$/ })).toBeInTheDocument();
    expect(within(panel).getByText('täglich 8–20 Uhr')).toBeInTheDocument();
    const kasten = screen.getByText('Noch Fragen?').parentElement as HTMLElement;
    expect(within(kasten).queryByRole('link', { name: /anrufen/ })).toBeNull();
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
