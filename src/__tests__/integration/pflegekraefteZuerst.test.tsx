/** @vitest-environment jsdom */
// „Pflegekräfte zuerst“ vor dem ersten Speichern der Pflegesituation (Registry #145, Martin 03.11.2026: „Preis oben,
// kurze Hemmnisnehmer … Und dann sofort Pflegekräfte … Und dann geht's weiter“).
//   - Reihenfolge: Kopf → Kostenkarte kompakt → Pflegekräfte (ohne Kasten) → Pflegesituation → So geht es weiter → Fragen → Marta
//   - „Einladen“ ohne Schloss, Tipp → Fenster „{Name} einladen“, Pflegekraft vorgemerkt (Zustand + localStorage je Token)
//   - Zeile über dem Formular „Nach dem Speichern laden wir {Name} für Sie ein.“
//   - nach dem ersten erfolgreichen Speichern automatisch eingeladen (bisheriger Weg inviteCaregiver), Hinweis, Vormerkungen weg
//   - automatisch: 6 stille Versuche bei mamamias Sperre nach dem Speichern (von Hand weiter 3), einladenWiederholung.ts
//   - Messpunkte einladung_vorgemerkt / einladung_nach_speichern; Rückweg ?einstieg=alt
//   Nachbesserung 2 (03.11.2026): Martins Satz „Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.“ im Fenster und
//   in der Zeile der Pflegesituation; Etikett „6× Testsieger DIE WELT“ unter dem Siegel; der Dank nach dem Speichern bleibt
//   stehen, der Hinweis folgt danach (Toast role="status"); Namen mit geschütztem Leerzeichen; höchstens so viele
//   Vormerkungen wie Einladungen frei sind, abgelehnte/ausgeblendete verlieren sie; Vormerkungen nur im Modus.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { defaultHandlers, defaultLead, sampleCaregiver, sampleMatching, bridgeHandler } from '../../../test/fixtures/mamamia-mocks';
import { vormerkSchluessel } from '../../lib/vormerkungen';

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    // Jeder Test mit eigenem Token: Der Sitzungs-Dedupe der Meldungen (leadEvents.ts) gilt je Token.
    // „…-gespeichert“: Pflegesituation schon gespeichert (Proxy hat patient_form_at gesetzt) — die Seite nach dem Speichern.
    fetchLeadByToken: vi.fn(async (token: string) => token.startsWith('token-pz-')
      ? { lead: { ...defaultLead, token, ...(token.endsWith('-gespeichert') ? { patient_form_at: '2026-11-03T08:00:00Z' } : {}) } as unknown as import('../../lib/supabase').Lead, error: null }
      : { lead: null, error: 'Token nicht gefunden' }),
    fetchNotfallTelefon: vi.fn(async () => null),
  };
});

// Wiederholungen bei mamamias Sperre nach dem Speichern: Anzahl echt (3 von Hand, 6 automatisch), Abstand 5 ms statt 5 s.
vi.mock('../../lib/einladenWiederholung', async () => ({
  ...(await vi.importActual<typeof import('../../lib/einladenWiederholung')>('../../lib/einladenWiederholung')),
  EINLADEN_ABSTAND_MS: 5,
}));
// Der Dank nach dem ersten Speichern steht 2,5 s statt 7 s — lang genug, um zu sehen, dass der Hinweis des automatischen
// Einladens ihn nicht ersetzt, kurz genug für die Tests.
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
beforeEach(() => { localStorage.clear(); });

// Zwei Vorschläge: Helena K. (50002, Empfehlung — mehr Einsätze) und Emilia W. (50003).
const emilia = { ...sampleMatching, id: 10002, is_best_matching: false, caregiver: { ...sampleCaregiver, id: 50003, first_name: 'Emilia', last_name: 'Wójcik', hp_total_jobs: 3 } };
const zweiVorschlaege = () => ({ JobOfferMatchingsWithPagination: { total: 2, data: [sampleMatching, emilia] } });
const ohneBewerbung = { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) };
const lesen = [
  http.get('https://kostenrechner.primundus.de/api/lead-event', () => HttpResponse.json({ events: [] })),
  http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
];
const ZEILE = 'Laden Sie ein, wer Ihnen gefällt. Dafür beschreiben Sie kurz die Pflegesituation.';
const SECHZIG = 'Erste Rückmeldungen kommen häufig innerhalb von 60 Minuten.';
const DANK = 'Vielen Dank! Passende Pflegekräfte können sich jetzt bei Ihnen bewerben.';
const NBSP = '\u00A0';
// Der Toast-Rahmen (role="status", aria-live="polite") steht immer im DOM; sein Text ist der gerade sichtbare Hinweis.
const toastRahmen = () => document.querySelector('[data-toast]') as HTMLElement;
const davor = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);
// Vollständiger Entwurf, damit „Weiter“ dreimal durchlässt und „Speichern“ speichert (wie „letzter Schritt“ in portal.test).
const vollerEntwurf = (token: string) => localStorage.setItem(`patient_${token}`, JSON.stringify({
  _isDraft: true,
  anzahl: '1', geschlecht: 'Weiblich',
  mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
  plz: '80331', ort: 'München',
  wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '2099-12-01',
  wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
}));
// Nebenläufer des Speicherns (Startdatum, KI-Text) wie in Produktion erfolgreich — sonst überschreibt ihre Fehlermeldung
// („Startdatum konnte nicht aktualisiert werden …“) den Hinweis, um den es hier geht. Andere Aktionen fallen durch.
const nebenlaeufer = http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
  const body = await request.clone().json() as { action?: string };
  if (body.action === 'updateJobOfferDates') return HttpResponse.json({ data: { UpdateJobOfferDates: { id: 7001 } } });
  if (body.action === 'generateJobDescription') return HttpResponse.json({ data: { description: null } });
  return undefined;
});
const ort = { searchLocations: () => ({ LocationsWithPagination: { data: [{ id: 4711, location: 'München', zip_code: '80331', country_code: 'DE' }] } }) };
// mamamias kurze Sperre direkt nach dem Speichern (Registry #102): Proxy antwortet 502 mit category „authorization“.
// Die ersten `sperre` Einladungen scheitern so, danach fällt die Anfrage zum Standard (Erfolg) durch.
const einladenMitSperre = (sperre: number, zaehler: { versuche: number }) => http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
  const body = await request.clone().json() as { action?: string };
  if (body.action !== 'inviteCaregiver') return undefined;
  zaehler.versuche += 1;
  if (zaehler.versuche <= sperre) return HttpResponse.json({ error: 'panel StoreRequest: Unauthorized [http=200 cat=authorization]', category: 'authorization' }, { status: 502 });
  return undefined;
});
type Meldung = { token?: string; event?: string; metadata?: Record<string, unknown>; notify?: boolean };
// Grenze 5 je Stunde und Batch-Reveal (Pool = 5 − Einladungen der letzten 24 h): Stand der Einladungen wie vom Proxy.
const einladungsStand = (used: number, used24h: number) => http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
  const body = await request.clone().json() as { action?: string };
  if (body.action !== 'getInviteRateState') return undefined;
  return HttpResponse.json({ data: { used, used_24h: used24h, limit: 5, window_minutes: 60, oldest_at: null, retry_after_seconds: 0, blocked: used >= 5 } });
});
const speichernBisZumEnde = async (user: ReturnType<typeof userEvent.setup>) => {
  for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
  await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
};
const zeilenText = () => document.querySelector('[data-vormerk-zeile]')?.textContent ?? null;

describe('Pflegekräfte zuerst vor dem ersten Speichern (Registry #145)', () => {
  it('Reihenfolge: Kopf, Kostenkarte kompakt, sofort die Pflegekräfte ohne Kasten, Pflegesituation, So geht es weiter, Fragen, Marta', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-pz-reihe');
    render(<CustomerPortalPage />);

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' }, { timeout: 5000 });
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift') as HTMLElement;
    // Preis groß, Testsieger-Siegel klein daneben, darunter einzeilig das Etikett „6× Testsieger DIE WELT“ (Nachbesserung 2:
    // genau dieser Wortlaut, „DIE WELT“ mit geschütztem Leerzeichen, kein weiterer Text), Satz und Bestpreisgarantie wie bisher.
    const preis = within(karte).getByText('2.800 €');
    expect(preis.className).toContain('whitespace-nowrap');
    const siegel = within(karte).getByAltText('Testsieger Die Welt');
    const etikettSpalte = siegel.closest('[data-testsieger-etikett]') as HTMLElement;
    expect(etikettSpalte.parentElement).toBe(preis.parentElement);
    // Gegenprüfung 03.11.: die Zeile darf nie breiter als die Karte werden (360 px ragte das Etikett in den Rand, 320 px
    // aus der Karte). Unter 375 px Preis 40 px, notfalls rutscht Siegel+Etikett unter den Preis (Maße: portal_lage.json).
    expect(preis.parentElement!.className).toContain('flex-wrap');
    expect(preis.className).toContain('text-[40px]');
    expect(preis.className).toContain('min-[375px]:text-[46px]');
    expect(siegel.className).toContain('h-12');
    const etikett = within(etikettSpalte).getByText('6× Testsieger DIE WELT');
    expect(etikett.textContent).toBe(`6× Testsieger DIE${NBSP}WELT`);
    expect(etikett.className).toContain('whitespace-nowrap');
    expect(etikettSpalte.textContent).toBe(etikett.textContent);
    expect(davor(siegel, etikett)).toBe(true);
    expect(within(karte).getByText('Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).')).toBeInTheDocument();
    expect(within(karte).getByRole('button', { name: /^Bestpreisgarantie/ })).toBeInTheDocument();
    // Die vier Punkte im Wortlaut, als 2×2.
    const punkte = within(karte).getByText('Täglich kündbar').closest('ul')!;
    expect(punkte.className).toContain('grid-cols-2');
    // Nicht die Startseiten-Punkte.
    expect(screen.queryByText('Kein Vertrag vor Ihrer Auswahl')).toBeNull();
    expect(screen.queryByText('Täglich kündbar, taggenau abgerechnet')).toBeNull();
    // Weiche Trennzeichen (U+00AD), nur beim Umbruch sichtbar, zählen nicht zum Wortlaut. Martin 03.11.: Hemmungen nehmen,
    // zum Profil animieren; „Erst auswählen, dann buchen“ und „Tagesgenaue Abrechnung“ sind raus.
    expect([...punkte.querySelectorAll('li')].map((li) => li.textContent?.replace(/\u00AD/g, '').replace(/\u00A0/g, ' '))).toEqual([
      'Einladen kostenlos und unverbindlich', 'Erste Rückmeldungen häufig in 60 Minuten', 'Täglich kündbar', 'Keine Vermittlungsgebühr',
    ]);
    expect(punkte.textContent).toContain('60\u00A0Minuten');
    expect(within(karte).queryByText('Erst auswählen, dann buchen')).toBeNull();
    expect(within(karte).queryByText('Tagesgenaue Abrechnung')).toBeNull();
    // „Kosten erst …“, Heimvergleich und Testsieger-Zeile erst im Aufklapper, oben, vor der Aufstellung.
    expect(screen.queryByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeNull();
    expect(screen.queryByText(/^Zuhause statt Pflegeheim/)).toBeNull();
    // Zugeklappt nur das Etikett unter dem Siegel; die Testsieger-Zeile mit „20 Jahre Erfahrung“ steht im Aufklapper.
    expect(within(karte).getAllByText(/6× Testsieger/)).toEqual([etikett]);
    expect(within(karte).queryByText(/20 Jahre Erfahrung/)).toBeNull();
    await userEvent.click(within(karte).getByRole('button', { name: 'Alle Kosten im Überblick' }));
    const kostenErst = within(karte).getByText('Kosten erst, wenn die Pflegekraft da ist.');
    const heim = within(karte).getByText(/^Zuhause statt Pflegeheim/);
    const testsieger = within(karte).getAllByText(/6× Testsieger/).filter((e) => e !== etikett)[0];
    const betreuung = within(karte).getAllByText('Betreuung')[0];
    expect(davor(kostenErst, heim) && davor(heim, testsieger) && davor(testsieger, betreuung)).toBe(true);
    expect(within(karte).getByText('Mustervertrag als PDF herunterladen')).toBeInTheDocument();

    // Sofort danach die Pflegekräfte: neue Zeile, kein Kasten, kein „Warum? Mehr“.
    const abschnitt = document.getElementById('pflegekraefte')!;
    expect(within(abschnitt).getByText('Für Sie ausgewählt')).toBeInTheDocument();
    expect(within(abschnitt).getByRole('heading', { level: 2, name: 'Passende Pflegekräfte' })).toBeInTheDocument();
    expect(within(abschnitt).getByText(ZEILE)).toBeInTheDocument();
    const helena = await screen.findByText('Helena K.', {}, { timeout: 5000 });
    expect(screen.queryByText('Noch 2 Minuten bis zu Ihren Bewerbungen')).toBeNull();
    expect(screen.queryByText('Pflegesituation unvollständig')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Warum? Mehr' })).toBeNull();
    expect(screen.getByText('Unsere Empfehlung für Sie')).toBeInTheDocument();
    // „Einladen“ aktiv: Koralle, ohne Schloss, mind. 44 px.
    const knoepfe = screen.getAllByRole('button', { name: 'Einladen' });
    expect(knoepfe).toHaveLength(2);
    for (const k of knoepfe) {
      expect(k.querySelector('svg.lucide-lock')).toBeNull();
      expect(k.className).toContain('bg-pm-coral');
      expect(k.className).toContain('min-h-[44px]');
    }

    // Pflegesituation mit neuer Zeile, Formular offen.
    const kopf = document.getElementById('patientendaten')!;
    expect(within(kopf).getByText('Für Ihre Bewerbungen')).toBeInTheDocument();
    expect(within(kopf).getByRole('heading', { level: 2, name: 'Pflegesituation' })).toBeInTheDocument();
    expect(within(kopf).getByText('Unvollständig')).toBeInTheDocument();
    // Nachbesserung 2: Martins Satz wörtlich angehängt.
    expect(within(kopf).getByText(`Danach können Sie Pflegekräfte einladen und bekommen Bewerbungen. ${SECHZIG}`)).toBeInTheDocument();
    expect(screen.queryByText('Damit sich Pflegekräfte bewerben können. Vieles ist schon ausgefüllt.')).toBeNull();
    const schritt = screen.getByText(/Schritt 1 von 4/);
    // Ohne Vormerkung keine Zeile über dem Formular.
    expect(document.querySelector('[data-vormerk-zeile]')).toBeNull();

    const soGehts = screen.getByRole('heading', { level: 2, name: 'So geht es weiter' });
    const fragen = screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' });
    const marta = screen.getByText('Noch Fragen?');
    const reihe = [h1, karte, abschnitt, helena, kopf, schritt, soGehts, fragen, marta];
    for (let i = 1; i < reihe.length; i++) expect(davor(reihe[i - 1], reihe[i])).toBe(true);
  }, 20_000);

  it('Tipp auf „Einladen“: Fenster „{Name} einladen“ mit Wortlaut, Pflegekraft vorgemerkt (Karte, Zeile, localStorage); „Später“ schließt, der Knopf führt zum Formular', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    let einladungen = 0;
    const meldungen: Meldung[] = [];
    // Zuerst genannte Handler haben Vorrang (MSW `use`): die mitschreibende Bridge vor der aus defaultHandlers.
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege, inviteCaregiver: () => { einladungen += 1; return { StoreRequest: { id: 1 } }; } } }),
    );
    window.history.replaceState({}, '', '/?token=token-pz-fenster');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Emilia W.', {}, { timeout: 5000 });

    // Emilia W. (zweite Karte) einladen → Fenster mit ihrem Namen.
    const karteEmilia = () => screen.getByText('Emilia W.').closest('.rounded-card') as HTMLElement;
    await user.click(within(karteEmilia()).getByRole('button', { name: 'Einladen' }));
    const fenster = await screen.findByRole('dialog', { name: 'Emilia W. einladen' });
    expect(within(fenster).getByText('Damit Emilia W. sieht, ob der Einsatz passt, braucht es ein paar Angaben zur Pflegesituation, zum Beispiel:')).toBeInTheDocument();
    expect(within(fenster).getByText('Pflegegrad, Mobilität und Demenz')).toBeInTheDocument();
    expect(within(fenster).getByText('Einsätze in der Nacht')).toBeInTheDocument();
    expect(within(fenster).getByText('Wohnort, Unterbringung und Startdatum')).toBeInTheDocument();
    // Nachbesserung 2: zweiter Text mit Martins Satz wörtlich.
    expect(within(fenster).getByText(`Das dauert etwa 2 Minuten. Danach laden wir Emilia W. für Sie ein. ${SECHZIG}`)).toBeInTheDocument();
    expect(within(fenster).getByRole('button', { name: 'Pflegesituation vervollständigen' })).toBeInTheDocument();
    // Vorgemerkt: Zustand, localStorage je Token, Karte und Zeile über dem Formular.
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-pz-fenster'))!)).toEqual([50003]);
    await user.click(within(fenster).getByRole('button', { name: 'Später' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const vorgemerkt = within(karteEmilia()).getByRole('button', { name: 'Vorgemerkt ✓' });
    expect(within(karteEmilia()).queryByRole('button', { name: 'Einladen' })).toBeNull();
    expect(screen.getByText('Nach dem Speichern laden wir Emilia W. für Sie ein.')).toBeInTheDocument();
    const zeile = document.querySelector('[data-vormerk-zeile]')!;
    // Nachbesserung 2: der Name bricht nie mitten um (geschütztes Leerzeichen in „Emilia W.“).
    expect(zeile.textContent).toBe(`Nach dem Speichern laden wir Emilia${NBSP}W. für Sie ein.`);
    expect(davor(document.getElementById('patientendaten')!, zeile)).toBe(true);
    expect(davor(zeile, screen.getByText(/Schritt 1 von 4/))).toBe(true);

    // „Vorgemerkt ✓“ bleibt tippbar und öffnet das Fenster erneut; der Knopf darin springt zum Formular.
    await user.click(vorgemerkt);
    const wieder = await screen.findByRole('dialog', { name: 'Emilia W. einladen' });
    await user.click(within(wieder).getByRole('button', { name: 'Pflegesituation vervollständigen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(gescrollt()).toContain('patientendaten');

    // Zweite Vormerkung (Helena K.) → beide Namen in der Zeile, in der Reihenfolge des Vormerkens.
    const karteHelena = screen.getByText('Helena K.').closest('.rounded-card') as HTMLElement;
    await user.click(within(karteHelena).getByRole('button', { name: 'Einladen' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Helena K. einladen' })).getByRole('button', { name: 'Später' }));
    expect(screen.getByText('Nach dem Speichern laden wir Emilia W. und Helena K. für Sie ein.')).toBeInTheDocument();
    expect(document.querySelector('[data-vormerk-zeile]')!.textContent).toBe(`Nach dem Speichern laden wir Emilia${NBSP}W. und Helena${NBSP}K. für Sie ein.`);
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-pz-fenster'))!)).toEqual([50003, 50002]);

    // Messpunkte: je Pflegekraft einmal vorgemerkt, still und ohne Namen; der Fenster-Knopf meldet seine Quelle.
    await waitFor(() => expect(meldungen.filter((m) => m.event === 'einladung_vorgemerkt')).toHaveLength(2));
    expect(meldungen.filter((m) => m.event === 'einladung_vorgemerkt').map((m) => m.metadata)).toEqual([{ caregiver_id: 50003 }, { caregiver_id: 50002 }]);
    for (const m of meldungen.filter((x) => x.event === 'einladung_vorgemerkt')) expect(m.notify).toBe(false);
    await waitFor(() => expect(meldungen.find((m) => m.event === 'zur_pflegesituation')?.metadata).toEqual({ quelle: 'einladen_fenster', vor_speichern: true }));
    // Vor dem Speichern lädt niemand ein, und das alte Fenster gibt es nicht.
    expect(einladungen).toBe(0);
    expect(meldungen.some((m) => m.event === 'warum_geoeffnet')).toBe(false);
  }, 20_000);

  it('„Einladen“ im geöffneten Profil öffnet dasselbe Fenster mit dem Namen und merkt vor, das Profil geht zu', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-pz-profil');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await user.click(await screen.findByText('Helena K.', {}, { timeout: 5000 }));
    await screen.findByRole('button', { name: 'Nein danke' }, { timeout: 5000 });
    const imProfil = screen.getAllByRole('button', { name: 'Einladen' });
    await user.click(imProfil[imProfil.length - 1]);
    expect(await screen.findByRole('dialog', { name: 'Helena K. einladen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel('token-pz-profil'))!)).toEqual([50002]);
  }, 20_000);

  it('Vormerkung übersteht ein Neuladen (localStorage je Token); fremde Tokens zählen nicht', async () => {
    localStorage.setItem(vormerkSchluessel('token-pz-neuladen'), JSON.stringify([50003]));
    localStorage.setItem(vormerkSchluessel('token-pz-anderer'), JSON.stringify([50002]));
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-pz-neuladen');
    render(<CustomerPortalPage />);
    await screen.findByText('Emilia W.', {}, { timeout: 5000 });
    const karteEmilia = screen.getByText('Emilia W.').closest('.rounded-card') as HTMLElement;
    const karteHelena = screen.getByText('Helena K.').closest('.rounded-card') as HTMLElement;
    // Schon im ersten Render mit den Karten (kein kurzes „Einladen“).
    expect(within(karteEmilia).getByRole('button', { name: 'Vorgemerkt ✓' })).toBeInTheDocument();
    expect(within(karteHelena).getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    expect(screen.getByText('Nach dem Speichern laden wir Emilia W. für Sie ein.')).toBeInTheDocument();
  }, 20_000);

  it('nach dem ersten erfolgreichen Speichern: Vorgemerkte über den bisherigen Weg eingeladen, Hinweis „… sind eingeladen.“, Vormerkungen gelöscht, Messpunkt', async () => {
    const TOKEN = 'token-pz-speichern';
    const eingeladen: number[] = [];
    const meldungen: Meldung[] = [];
    let gespeichert = 0;
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      nebenlaeufer,
      ...lesen,
      ...defaultHandlers({ proxy: {
        ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
        updateCustomer: () => { gespeichert += 1; return { UpdateCustomer: { id: 9001, customer_id: 'ts-18-9001' } }; },
        inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1, caregiver_id: vars.caregiver_id } }; },
      } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Emilia W.', {}, { timeout: 5000 });
    // Beide vormerken (Emilia zuerst).
    for (const name of ['Emilia W.', 'Helena K.']) {
      const k = screen.getByText(name).closest('.rounded-card') as HTMLElement;
      await user.click(within(k).getByRole('button', { name: 'Einladen' }));
      await user.click(within(await screen.findByRole('dialog', { name: `${name} einladen` })).getByRole('button', { name: 'Später' }));
    }
    expect(eingeladen).toEqual([]);
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));

    const hinweis = await screen.findByText('Emilia W. und Helena K. sind eingeladen.', {}, { timeout: 8000 });
    // Nachbesserung 2: Namen im Toast mit geschütztem Leerzeichen, der Toast im Rahmen role="status".
    expect(hinweis.textContent).toBe(`Emilia${NBSP}W. und Helena${NBSP}K. sind eingeladen.`);
    expect(toastRahmen().contains(hinweis)).toBe(true);
    expect(gespeichert).toBe(1);
    // Nacheinander, in der Reihenfolge des Vormerkens, je genau einmal.
    expect(eingeladen).toEqual([50003, 50002]);
    expect(localStorage.getItem(vormerkSchluessel(TOKEN))).toBeNull();
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.metadata).toEqual({ anzahl: 2, ok: 2 }));
    // Der bisherige Weg meldet jede Einladung wie gewohnt an die Bridge (Team-Mail, Nachfass).
    expect(meldungen.filter((m) => m.event === 'caregiver_invited').map((m) => m.metadata?.caregiver_id)).toEqual([50003, 50002]);
    expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.notify).toBe(false);
    // Danach die Ansicht nach dem Speichern wie bisher, ohne „Vorgemerkt“.
    expect(screen.queryByRole('button', { name: 'Vorgemerkt ✓' })).toBeNull();
    expect(screen.queryByText(/^Nach dem Speichern laden wir/)).toBeNull();
  }, 30_000);

  it('eine Pflegekraft vorgemerkt: Hinweis „{Name} ist eingeladen.“', async () => {
    const TOKEN = 'token-pz-eine';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50002]));
    const eingeladen: number[] = [];
    server.use(
      nebenlaeufer,
      ...lesen,
      ...defaultHandlers({ proxy: {
        ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
        inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1 } }; },
      } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Helena K. für Sie ein.', {}, { timeout: 5000 });
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Helena K. ist eingeladen.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(eingeladen).toEqual([50002]);
  }, 30_000);

  it('Einladung scheitert: nur die bisher übliche Meldung, kein „ist eingeladen“, die Karte bleibt einladbar, Vormerkungen weg', async () => {
    const TOKEN = 'token-pz-fehler';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      nebenlaeufer,
      // inviteCaregiver lehnt ab (kein Wettlauf-Fehler → keine Wiederholung); alles andere fällt durch zum Standard.
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
        const body = await request.clone().json() as { action?: string };
        if (body.action === 'inviteCaregiver') return HttpResponse.json({ error: 'validation failed' }, { status: 400 });
        return undefined;
      }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Emilia W.', {}, { timeout: 5000 });
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.', {}, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.metadata).toEqual({ anzahl: 1, ok: 0 }));
    expect(screen.queryByText(/ist eingeladen\.$/)).toBeNull();
    expect(localStorage.getItem(vormerkSchluessel(TOKEN))).toBeNull();
    // Nach dem Speichern die heutige Karte: Emilia W. wieder mit „Einladen“.
    await waitFor(() => {
      const k = screen.getByText('Emilia W.').closest('.rounded-card') as HTMLElement;
      expect(within(k).getByRole('button', { name: 'Einladen' })).toBeInTheDocument();
    });
  }, 30_000);

  it('automatisch nach dem Speichern: hält mamamias Sperre länger aus (6 Versuche statt 3) — 4 × abgelehnt, dann „{Name} ist eingeladen.“', async () => {
    const TOKEN = 'token-pz-sperre';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    const zaehler = { versuche: 0 };
    const meldungen: Meldung[] = [];
    server.use(
      bridgeHandler((b) => { meldungen.push(b as Meldung); }),
      nebenlaeufer,
      einladenMitSperre(4, zaehler),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Emilia W. für Sie ein.', {}, { timeout: 5000 });
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Emilia W. ist eingeladen.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(zaehler.versuche).toBe(5);
    expect(screen.queryByText('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.')).toBeNull();
    await waitFor(() => expect(meldungen.find((m) => m.event === 'einladung_nach_speichern')?.metadata).toEqual({ anzahl: 1, ok: 1 }));
  }, 30_000);

  it('automatisch nach dem Speichern: nach 6 abgelehnten Versuchen nur die übliche Meldung, kein siebter', async () => {
    const TOKEN = 'token-pz-sperre-dauer';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    const zaehler = { versuche: 0 };
    server.use(nebenlaeufer, einladenMitSperre(99, zaehler), ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege } }));
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Emilia W. für Sie ein.', {}, { timeout: 5000 });
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(zaehler.versuche).toBe(6);
    expect(screen.queryByText(/ist eingeladen\.$/)).toBeNull();
  }, 30_000);

  it('Knopf von Hand nach dem Speichern: weiter 3 Versuche bei der Sperre (unverändert)', async () => {
    const TOKEN = 'token-pz-hand-gespeichert';
    const zaehler = { versuche: 0 };
    server.use(einladenMitSperre(99, zaehler), ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Emilia W.', {}, { timeout: 5000 });
    const k = screen.getByText('Emilia W.').closest('.rounded-card') as HTMLElement;
    await user.click(within(k).getByRole('button', { name: 'Einladen' }));
    expect(await screen.findByText('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(zaehler.versuche).toBe(3);
  }, 30_000);

  it('Rückweg ?einstieg=alt: die bisherige Seite unverändert (Kasten, Schloss, „Warum erst die Pflegesituation?“), nichts vorgemerkt', async () => {
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', '/?token=token-pz-alt&einstieg=alt');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    expect(await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(ZEILE)).toBeNull();
    expect(screen.getByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeInTheDocument();
    const einladen = screen.getAllByRole('button', { name: 'Einladen' });
    expect(einladen[0].querySelector('svg.lucide-lock')).not.toBeNull();
    await user.click(einladen[0]);
    expect(await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' })).toBeInTheDocument();
    expect(localStorage.getItem(vormerkSchluessel('token-pz-alt'))).toBeNull();
  }, 20_000);

  // ── Nachbesserung 2 (03.11.2026) ────────────────────────────────────────────────────────────────────────────────────
  it('Nachbesserung 2: der Dank nach dem Speichern bleibt stehen, „… sind eingeladen.“ kommt danach (Warteschlange); Toast mit role="status"', async () => {
    const TOKEN = 'token-pz-dank';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003, 50002]));
    const eingeladen: number[] = [];
    server.use(nebenlaeufer, ...lesen, ...defaultHandlers({ proxy: {
      ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
      inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1 } }; },
    } }));
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Emilia W. und Helena K. für Sie ein.', {}, { timeout: 5000 });
    // Der Rahmen steht schon leer da (aria-live braucht ein bestehendes Element), höflich, als Ganzes vorgelesen.
    const rahmen = toastRahmen();
    expect(rahmen.getAttribute('role')).toBe('status');
    expect(rahmen.getAttribute('aria-live')).toBe('polite');
    expect(rahmen.getAttribute('aria-atomic')).toBe('true');
    expect(rahmen.textContent).toBe('');
    await speichernBisZumEnde(user);
    await waitFor(() => expect(toastRahmen().textContent).toBe(DANK), { timeout: 5000 });
    // Beide Einladungen sind durch, während der Dank noch steht — bisher hätte der Hinweis ihn genau hier ersetzt.
    await waitFor(() => expect(eingeladen).toEqual([50003, 50002]), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 150));
    expect(toastRahmen().textContent).toBe(DANK);
    expect(screen.queryByText(/sind eingeladen\.$/)).toBeNull();
    // Nach dem Dank der Hinweis, im selben Rahmen, Namen ohne Umbruch in der Mitte.
    await waitFor(() => expect(toastRahmen().textContent).toBe(`Emilia${NBSP}W. und Helena${NBSP}K. sind eingeladen.`), { timeout: 5000 });
    expect(toastRahmen()).toBe(rahmen);
  }, 30_000);

  it('Nachbesserung 2: Fehlschlag beim automatischen Einladen — die übliche Meldung erst nach dem Dank', async () => {
    const TOKEN = 'token-pz-dank-fehler';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    let versuche = 0;
    server.use(
      nebenlaeufer,
      http.post('https://test.supabase.co/functions/v1/mamamia-proxy', async ({ request }) => {
        const body = await request.clone().json() as { action?: string };
        if (body.action === 'inviteCaregiver') { versuche += 1; return HttpResponse.json({ error: 'validation failed' }, { status: 400 }); }
        return undefined;
      }),
      ...lesen,
      ...defaultHandlers({ proxy: { ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege } }),
    );
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Emilia W. für Sie ein.', {}, { timeout: 5000 });
    await speichernBisZumEnde(user);
    await waitFor(() => expect(toastRahmen().textContent).toBe(DANK), { timeout: 5000 });
    await waitFor(() => expect(versuche).toBe(1), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 150));
    expect(toastRahmen().textContent).toBe(DANK);
    await waitFor(() => expect(toastRahmen().textContent).toBe('Einladung konnte nicht gesendet werden. Bitte kontaktieren Sie uns.'), { timeout: 5000 });
  }, 30_000);

  it('Nachbesserung 2: eine abgelehnte Karte verliert ihre Vormerkung (Zeile und localStorage)', async () => {
    const TOKEN = 'token-pz-ablehnen';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003, 50002]));
    server.use(...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Nach dem Speichern laden wir Emilia W. und Helena K. für Sie ein.', {}, { timeout: 5000 });
    // Helena K. im Profil ablehnen („Nein danke“).
    await user.click(screen.getByText('Helena K.'));
    await user.click(await screen.findByRole('button', { name: 'Nein danke' }, { timeout: 5000 }));
    await waitFor(() => expect(zeilenText()).toBe(`Nach dem Speichern laden wir Emilia${NBSP}W. für Sie ein.`));
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([50003]);
  }, 20_000);

  it('Nachbesserung 2: eine ausgeblendete Karte verliert ihre Vormerkung (Pool nach Einladungen der letzten 24 h nur 1)', async () => {
    const TOKEN = 'token-pz-ausgeblendet';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003, 50002]));
    server.use(einladungsStand(0, 4), ...lesen, ...defaultHandlers({ proxy: { ...ohneBewerbung, listMatchings: zweiVorschlaege } }));
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    render(<CustomerPortalPage />);
    // Genau eine Karte zu sehen; nur sie steht in der Zeile und bleibt im localStorage.
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^(Einladen|Vorgemerkt ✓)$/ })).toHaveLength(1), { timeout: 5000 });
    const sichtbar = screen.queryByText('Emilia W.') ? { name: 'Emilia', id: 50003 } : { name: 'Helena', id: 50002 };
    await waitFor(() => expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([sichtbar.id]));
    expect(zeilenText()).toBe(`Nach dem Speichern laden wir ${sichtbar.name}${NBSP}${sichtbar.name === 'Emilia' ? 'W.' : 'K.'} für Sie ein.`);
  }, 20_000);

  it('Nachbesserung 2: die Zeile nennt nie mehr Namen, als eingeladen werden können (noch 1 von 5 frei) — und genau die werden eingeladen', async () => {
    const TOKEN = 'token-pz-frei';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003, 50002]));
    const eingeladen: number[] = [];
    server.use(einladungsStand(4, 0), nebenlaeufer, ...lesen, ...defaultHandlers({ proxy: {
      ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
      inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1 } }; },
    } }));
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Helena K.', {}, { timeout: 5000 });
    // Beide Karten zu sehen, aber nur eine Einladung frei: Zeile und „Vorgemerkt ✓“ nur für Emilia W. (zuerst vorgemerkt).
    await waitFor(() => expect(zeilenText()).toBe(`Nach dem Speichern laden wir Emilia${NBSP}W. für Sie ein.`));
    const karteEmilia = screen.getByText('Emilia W.').closest('.rounded-card') as HTMLElement;
    const karteHelena = screen.getByText('Helena K.').closest('.rounded-card') as HTMLElement;
    expect(within(karteEmilia).getByRole('button', { name: 'Vorgemerkt ✓' })).toBeInTheDocument();
    // Helena K.: „Einladen“ verspricht nichts mehr — das Fenster „Warum erst die Pflegesituation?“ (Wortlaut Stand 75b8df8).
    await user.click(within(karteHelena).getByRole('button', { name: 'Einladen' }));
    const warum = await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' });
    expect(screen.queryByRole('dialog', { name: 'Helena K. einladen' })).toBeNull();
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([50003, 50002]);
    const schliessen = within(warum).getAllByRole('button', { name: 'Schließen' });
    await user.click(schliessen[schliessen.length - 1]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await speichernBisZumEnde(user);
    await waitFor(() => expect(toastRahmen().textContent).toBe(`Emilia${NBSP}W. ist eingeladen.`), { timeout: 8000 });
    expect(eingeladen).toEqual([50003]);
  }, 30_000);

  it('Nachbesserung 2: Vormerkungen nur im Modus „Pflegekräfte zuerst“ — ?einstieg=alt lädt sie nicht und lädt nach dem Speichern niemanden ein', async () => {
    const TOKEN = 'token-pz-alt-speichern';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    const eingeladen: number[] = [];
    server.use(nebenlaeufer, ...lesen, ...defaultHandlers({ proxy: {
      ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
      inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1 } }; },
    } }));
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}&einstieg=alt`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: 'Vorgemerkt ✓' })).toBeNull();
    expect(zeilenText()).toBeNull();
    await speichernBisZumEnde(user);
    await waitFor(() => expect(toastRahmen().textContent).toBe(DANK), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(eingeladen).toEqual([]);
    // Nicht angefasst: weder geladen noch gelöscht.
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([50003]);
  }, 30_000);

  it('Nachbesserung 2: auch ?einstieg=kompakt lädt keine Vormerkungen und lädt nach dem Speichern niemanden ein', async () => {
    const TOKEN = 'token-pz-kompakt-speichern';
    localStorage.setItem(vormerkSchluessel(TOKEN), JSON.stringify([50003]));
    const eingeladen: number[] = [];
    server.use(nebenlaeufer, ...lesen, ...defaultHandlers({ proxy: {
      ...ohneBewerbung, ...ort, listMatchings: zweiVorschlaege,
      inviteCaregiver: (vars) => { eingeladen.push(vars.caregiver_id as number); return { StoreRequest: { id: 1 } }; },
    } }));
    vollerEntwurf(TOKEN);
    window.history.replaceState({}, '', `/?token=${TOKEN}&einstieg=kompakt`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    const hinweis = await waitFor(() => { const h = document.getElementById('patientendaten'); if (!h) throw new Error('kein Hinweis'); return h; }, { timeout: 5000 });
    await user.click(await within(hinweis).findByRole('button', { name: 'Jetzt vervollständigen' }, { timeout: 5000 }));
    for (let i = 0; i < 3; i++) await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: /^(Speichern|Bewerbungen erhalten)$/ }, { timeout: 5000 }));
    await waitFor(() => expect(toastRahmen().textContent).toBe(DANK), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(eingeladen).toEqual([]);
    expect(JSON.parse(localStorage.getItem(vormerkSchluessel(TOKEN))!)).toEqual([50003]);
  }, 30_000);
});
