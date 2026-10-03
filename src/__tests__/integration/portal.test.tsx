/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '../../../test/mocks/server';
import { http, HttpResponse, delay } from 'msw';
import {
  defaultHandlers,
  defaultLead,
  sampleMatching,
  TEST_LEAD_TOKEN,
  TEST_JOB_OFFER_ID,
  bridgeHandler,
  proxyHandler,
  sampleCustomer,
} from '../../../test/fixtures/mamamia-mocks';

// Mock Supabase helpers — Supabase-js uses a fetch impl that doesn't route
// through MSW under Node 18 / jsdom. Edge Function calls (onboard-to-mamamia,
// mamamia-proxy) still use globalThis.fetch and ARE intercepted by MSW.
vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<typeof import('../../lib/supabase')>('../../lib/supabase');
  return {
    ...actual,
    fetchLeadByToken: vi.fn(async (token: string) => {
      if (token === TEST_LEAD_TOKEN) {
        return { lead: defaultLead as unknown as import('../../lib/supabase').Lead, error: null };
      }
      // Schon abgesendet (Proxy hat `patient_form_at` gesetzt), neues Gerät.
      // Kompakt-Einstieg Runde 4: Lead ohne Zuschüsse in der Kalkulation (keine Eigenanteil-Zeile).
      if (token === 'token-ohne-zuschuesse') {
        return { lead: { ...defaultLead, token, kalkulation: { ...defaultLead.kalkulation, 'zuschüsse': { gesamt: 0, items: [] } } } as unknown as import('../../lib/supabase').Lead, error: null };
      }
      if (token === 'token-abgesendet') {
        return { lead: { ...defaultLead, token, patient_form_at: '2026-09-24T10:00:00Z', patient_form: { startDate: '2099-11-15' } } as unknown as import('../../lib/supabase').Lead, error: null };
      }
      return { lead: null, error: 'Token nicht gefunden' };
    }),
  };
});

import CustomerPortalPage from '../../pages/CustomerPortalPage';

// jsdom doesn't implement URL.createObjectURL / scrollTo — portal's PDF download
// and scrollTo-on-click accesses these. Stub lightly.
beforeAll(() => {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock');
  window.scrollTo = vi.fn();
  // …und kein Element.scrollTo (das Portal scrollt nach dem Absenden nach oben).
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo;
  // jsdom kennt scrollIntoView nicht — das Formular scrollt beim Schrittwechsel
  // und beim Sprung zum ersten fehlenden Feld dorthin.
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom has no IntersectionObserver for lucide-react / popup positioning
  if (!('IntersectionObserver' in window)) {
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  }
});

function setLocation(search: string) {
  // jsdom allows assigning to window.location.search via setter trick
  window.history.replaceState({}, '', `/${search}`);
}

describe('Portal integration: golden paths', () => {
  // ─── Path 1: Happy (accept application) ─────────────────────────────────

  it('happy path: token → review → accept → bridge POST + BookedScreen', async () => {
    // MVP flow: acceptance does NOT call Mamamia STORE_CONFIRMATION; it
    // POSTs to the kostenrechner bridge with event=application_accepted_internal.
    // Bridge writes lead_application_acceptances + fires team mail.
    let bridgePayload: { token?: string; event?: string; metadata?: unknown } | null = null;

    // bridgeHandler with capture FIRST so it takes priority over the
    // default no-op bridge handler bundled in defaultHandlers().
    server.use(
      bridgeHandler((body) => {
        bridgePayload = body;
      }),
      ...defaultHandlers({}),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Wait for the pending-applications card to render with "Angebot prüfen"
    const reviewBtn = await screen.findByRole('button', { name: /^Angebot prüfen$/ }, { timeout: 5000 });

    // Rekruter-Hinweis (application.message) VERBATIM — schon auf der Karte
    // (Registry #22: kein LLM, kein Filter; Fixture-Text 1:1 durch den vollen
    // Pfad proxy → mapper → UI).
    expect(screen.getByText('Test application message')).toBeTruthy();

    await user.click(reviewBtn);

    // …und im Modal an der Entscheidungsstelle (dort amber hervorgehoben).
    await waitFor(() => expect(screen.getAllByText('Test application message').length).toBeGreaterThan(1));

    // Schritt 1 = Angebot/Konditionen → weiter zu „Ihre Angaben" (Schritt 2).
    await user.click(await screen.findByRole('button', { name: /Weiter →/ }));

    // Schritt 2 = Angaben. Vorbelegung wie bisher (Martin 29.09.2026: nichts am
    // Datenfluss ändern): Name der Kontaktperson leer — und genau das steht jetzt
    // oben in der Liste „was fehlt".
    const kp = within(await screen.findByRole('region', { name: /Kontaktperson/ }));
    expect(kp.getByLabelText(/^Vorname/)).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Kontaktperson: Vorname · Nachname' })).toBeInTheDocument();

    await user.type(kp.getByLabelText(/^Vorname/), 'Max');
    await user.type(kp.getByLabelText(/^Nachname/), 'Kontakt');
    expect(screen.getByText('Alle Pflichtangaben vorhanden.')).toBeInTheDocument();
    await user.clear(kp.getByLabelText(/^Telefon/));
    await user.type(kp.getByLabelText(/^Telefon/), '+49 89 12345');
    await user.clear(kp.getByLabelText(/^E-Mail/));
    await user.type(kp.getByLabelText(/^E-Mail/), 'max@kontakt.de');

    await user.click(screen.getByRole('button', { name: 'Weiter zur Unterschrift' }));

    // Schritt 3 = Vertrag: Name tippen = Unterschrift,
    // beide Pflicht-Häkchen, dann rechtsverbindlich unterschreiben.
    await user.type(await screen.findByPlaceholderText('Vor- und Nachname'), 'Max Kontakt');
    await user.click(screen.getByText(/Ich habe den gesamten Vertragsinhalt gelesen/));
    await user.click(screen.getByText(/Ich stimme ausdrücklich zu/));
    await user.click(screen.getByRole('button', { name: /Vertrag jetzt unterschreiben/i }));

    // BookedScreen rendered (copy includes "Pflegekraft gebucht!" substring)
    await waitFor(
      () => expect(screen.getByText(/Pflegekraft gebucht!/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    // Bridge called with event=application_accepted_internal + contract data
    await waitFor(() => expect(bridgePayload).not.toBeNull(), { timeout: 1000 });
    expect(bridgePayload!.event).toBe('application_accepted_internal');
    const meta = bridgePayload!.metadata as Record<string, unknown>;
    expect((meta.contract_contact as Record<string, unknown>).vorname).toBe('Max');
    expect((meta.contract_contact as Record<string, unknown>).nachname).toBe('Kontakt');
    // Multi-Job (Bug #25): der Accept trägt den Job der Session — Bridge-
    // Dedupe für Mail C ist damit job-scoped (2. Buchung mailt wieder).
    expect(meta.mamamia_job_offer_id).toBe(TEST_JOB_OFFER_ID);
  }, 15000);

  // ─── Path 2: Decline (reject application) ───────────────────────────────

  it('decline path: reject with message → moved to Bereits bearbeitet', async () => {
    let rejectCalled = false;
    let capturedMessage: string | undefined;

    server.use(
      ...defaultHandlers({
        proxy: {
          rejectApplication: (vars) => {
            rejectCalled = true;
            capturedMessage = vars.reject_message as string | undefined;
            return { RejectApplication: { id: 333, rejected_at: '2026-04-24T11:00Z', reject_message: vars.reject_message ?? null } };
          },
        },
      }),
    );

    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Wait for "Angebot prüfen" to confirm initial AppCards rendered
    await screen.findByRole('button', { name: /^Angebot prüfen$/ }, { timeout: 5000 });

    // Click "Ablehnen" on the application card
    const declineBtns = screen.getAllByRole('button', { name: /^Ablehnen$/ });
    await user.click(declineBtns[0]);

    // Confirm modal appears — wait for its unique textarea placeholder
    const msgTextarea = await screen.findByPlaceholderText(/passt leider nicht/i, {}, { timeout: 3000 });
    await user.type(msgTextarea, 'Nie pasuje profilem');

    // The last "Ablehnen" button is the red confirm inside modal
    const finalDeclineBtns = screen.getAllByRole('button', { name: /^Ablehnen$/ });
    await user.click(finalDeclineBtns[finalDeclineBtns.length - 1]);

    // "Bereits bearbeitet" section appears only when doneApps > 0
    await waitFor(
      () => expect(screen.getByText(/Bereits bearbeitet/i)).toBeInTheDocument(),
      { timeout: 3000 },
    );
    expect(rejectCalled).toBe(true);
    expect(capturedMessage).toBe('Nie pasuje profilem');
  }, 15000);

  // ─── Path 3: Invite matched caregiver ───────────────────────────────────

  it('invite path: 0 applications + invite match → Einladung gesendet', async () => {
    let inviteCaregiverId: number | null = null;

    server.use(
      ...defaultHandlers({
        proxy: {
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          listMatchings: () => ({ JobOfferMatchingsWithPagination: { total: 1, data: [sampleMatching] } }),
          inviteCaregiver: (vars) => {
            inviteCaregiverId = vars.caregiver_id as number;
            // Backend now returns the persisted Request row (StoreRequest
            // mutation under panel-flow agency-only session). Match real
            // proxy response shape so future readers see the truth.
            return {
              StoreRequest: {
                id: 999,
                caregiver_id: vars.caregiver_id as number,
                job_offer_id: 16235,
                message: null,
                created_at: '2026-04-28T09:43:44.000000Z',
              },
            };
          },
        },
      }),
    );

    // Panel-style flow lives in the Edge Function — browser doesn't need
    // to verify anything before clicking Einladen.
    // Strict invite-gate (since 2026-05-09) blocks Einladen until
    // patient profile is saved. AngebotCard hydrates `saved` from this
    // localStorage entry on mount → patientSaved=true → gate opens.
    localStorage.setItem(
      `patient_${TEST_LEAD_TOKEN}`,
      JSON.stringify({ _isDraft: false }),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // findByRole polls until the element appears — handles the async
    // session bootstrap (mmReady flips from false to true).
    const inviteBtn = await screen.findByRole(
      'button', { name: /^Einladen$/i }, { timeout: 5000 },
    );
    await user.click(inviteBtn);

    // After click: MatchCard awaits the real mutation (no fake setTimeout).
    // The mutation hits MSW which records caregiver_id immediately.
    await waitFor(() => expect(inviteCaregiverId).toBe(sampleMatching.caregiver.id), {
      timeout: 5000,
    });
  }, 15_000);

  // ─── Angaben ändern nach dem Absenden (Martin 25.09.: „sobald man irgendwas
  //     anklickt, lädt die ganze Seite neu") ─────────────────────────────────

  it('gespeicherter, bei mamamia aktiver Kunde ändert eine Angabe: die Seite kippt nicht in „nicht gespeichert“', async () => {
    server.use(
      ...defaultHandlers({
        proxy: {
          getCustomer: () => ({ Customer: { ...sampleCustomer, status: 'active' } }),
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        },
      }),
    );
    localStorage.setItem(`patient_${TEST_LEAD_TOKEN}`, JSON.stringify({ _isDraft: false, geschlecht: 'Weiblich' }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Formular über den Kopf „Pflegesituation ✓ Vollständig" öffnen.
    const kopf = await screen.findByRole('button', { name: /Pflegesituation.*Vollständig/ }, { timeout: 5000 });
    await user.click(kopf);
    const chip = await screen.findByRole('button', { name: 'Männlich' }, { timeout: 5000 });

    // Jeden Text mitschreiben, den die Seite zeigt — auch kurz aufblitzende:
    // beide Renders laufen im selben Durchlauf, deshalb die ALTEN Werte der
    // Textknoten und die eingefügten Knoten aus den Mutation-Records lesen.
    const titel: string[] = [];
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData' && r.oldValue) titel.push(r.oldValue);
        r.addedNodes.forEach((n) => titel.push(n.textContent ?? ''));
      }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, characterDataOldValue: true });
    await user.click(chip);
    await new Promise((r) => setTimeout(r, 50));
    mo.disconnect();

    expect(titel.some((t) => t.includes('Ihr persönliches Angebot') || t.includes('Ihr Angebot zur'))).toBe(false);
    expect(screen.getByRole('button', { name: /Pflegesituation.*Vollständig/ })).toBeInTheDocument();
  }, 15_000);

  it('erstes Absenden, dann gleich eine Angabe ändern: die Seite bleibt „abgesendet“ (mmCustomer noch „draft“)', async () => {
    // Review 25.09.: `useCustomer` lädt nach dem Speichern nicht neu, der Status
    // bleibt in dieser Sitzung „draft". Vorher kippte die erste Änderung die Seite
    // zurück in den Ausgangszustand, und der Knopf hieß wieder „Bewerbungen erhalten".
    server.use(
      ...defaultHandlers({
        proxy: {
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          searchLocations: () => ({ LocationsWithPagination: { data: [{ id: 4711, location: 'München', zip_code: '80331', country_code: 'DE' }] } }),
        },
      }),
    );
    localStorage.setItem(
      `patient_${TEST_LEAD_TOKEN}`,
      JSON.stringify({
        _isDraft: true,
        anzahl: '1', geschlecht: 'Weiblich',
        mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
        plz: '80331', ort: 'München',
        wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '2099-12-01',
        wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
      }),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Kompakt-Einstieg: Das Formular klappt im Kasten „So geht es weiter" unter Schritt 2 auf.
    await user.click(await screen.findByRole('button', { name: 'Jetzt vervollständigen →' }, { timeout: 5000 }));
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    }
    await user.click(await screen.findByRole('button', { name: /^Bewerbungen erhalten$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();

    // Angaben öffnen und eine Angabe ändern.
    await user.click(screen.getByRole('button', { name: /Angaben ansehen oder ändern/ }));
    await user.click(await screen.findByRole('button', { name: 'Männlich' }, { timeout: 5000 }));
    expect(screen.getByText('Ihre Suche läuft')).toBeInTheDocument();
    expect(screen.queryByText('Ihr persönliches Angebot')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' })).toBeNull();

    // Letzter Schritt: nur noch „Änderungen speichern", kein zweites Anfragen.
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    }
    expect(screen.queryByRole('button', { name: /^Bewerbungen erhalten$/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Änderungen speichern$/ })).toBeInTheDocument();
  }, 20_000);

  it('schon abgesendet, neues Gerät, mamamia noch unbekannt: nie der Ausgangszustand', async () => {
    // Review 25.09.: Bis mamamia antwortete, sahen wiederkehrende Kunden ohne
    // lokalen Vermerk das Angebot mit offenem Formular („Unvollständig").
    server.use(
      ...defaultHandlers({
        proxy: {
          getCustomer: () => ({ Customer: { ...sampleCustomer, status: 'draft' } }),
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        },
      }),
    );
    const titel: string[] = [];
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => titel.push(n.textContent ?? ''));
    });
    mo.observe(document.body, { subtree: true, childList: true });
    setLocation('?token=token-abgesendet');
    render(<CustomerPortalPage />);
    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();
    mo.disconnect();
    // Der Ladebildschirm davor sagt „Gleich sehen Sie Ihr persönliches Angebot" — der zählt nicht.
    const kopfAngebot = (t: string) =>
      (t.includes('Ihr persönliches Angebot') && !t.includes('Gleich sehen Sie')) || t.includes('Ihr Angebot zur');
    expect(titel.some(kopfAngebot)).toBe(false);
    // Auch der Kasten für Neukunden darf nicht kurz aufblitzen (Registry #102: `!schonAbgesendet`).
    expect(titel.some((t) => t.includes('Noch 2 Minuten bis zum Einladen'))).toBe(false);
    // …und der Kompakt-Einstieg auch nicht (Schritt „Angebot erstellt", Hinweis „Vor dem Einladen").
    expect(titel.some((t) => t.includes('Angebot erstellt') || t.includes('Vor dem Einladen') || t.includes('Vielen Dank für Ihre Anfrage'))).toBe(false);
    // Wunschstart aus dem gespeicherten Formular, nicht aus mamamia `arrival_at`.
    expect(screen.getByText(/Wunschstart 15\.11\./)).toBeInTheDocument();
  }, 15_000);

  it('gebucht, Link aus Mail B (view=application), Annahmen kommen später: keine „aktive Bewerbung“, kein zweites „Angebot prüfen“', async () => {
    // Review 25.09.: mamamia führt die Bewerbung noch als „neu", die Annahme
    // kommt aus listAcceptedApplications. Kam die später, zeigte die Seite erst
    // „Sie haben eine aktive Bewerbung" und öffnete „Angebot prüfen".
    server.use(
      http.post('*/functions/v1/mamamia-proxy', async ({ request }) => {
        const body = await request.clone().json() as { action: string };
        if (body.action !== 'listAcceptedApplications') return undefined;
        await delay(300);
        return HttpResponse.json({ data: { application_ids: [333], rows: [{ application_id: 333, caregiver_id: 50001, accepted_at: '2026-09-20T10:00:00Z', contract_snapshot: null }] } });
      }),
      ...defaultHandlers({}),
    );
    const titel: string[] = [];
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => titel.push(n.textContent ?? ''));
    });
    mo.observe(document.body, { subtree: true, childList: true });
    setLocation(`?token=${TEST_LEAD_TOKEN}&view=application`);
    render(<CustomerPortalPage />);
    await screen.findByText(/Pflegekraft gebucht!/i, {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 400));
    mo.disconnect();
    expect(titel.some((t) => t.includes('Sie haben eine aktive Bewerbung'))).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Angebot prüfen' })).toBeNull();
  }, 15_000);

  // ─── Startseiten-Punkte + Sprunglink goto=anfragen (Martin 26.09.) ───────

  it('Kostenblock zeigt die vier Punkte der Startseite, nicht mehr die alte Liste', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    expect(await screen.findByText('Kein Vertrag vor Ihrer Auswahl', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Keine Vermittlungsgebühr')).toBeInTheDocument();
    expect(screen.getByText('Täglich kündbar, taggenau abgerechnet')).toBeInTheDocument();
    expect(screen.queryByText('Erst auswählen, dann buchen')).toBeNull();
    expect(screen.queryByText('Tagesgenaue Abrechnung')).toBeNull();
  }, 15_000);

  const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);

  it('goto=anfragen, noch nicht abgesendet: öffnet die Pflegesituation', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}&goto=anfragen`);
    render(<CustomerPortalPage />);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'), { timeout: 5000 });
    // Kompakt-Einstieg: Das Formular steht offen im Kasten „So geht es weiter" unter Schritt 2 …
    const region = screen.getByRole('region', { name: 'So geht es weiter' });
    expect(await within(region).findByText(/Schritt 1 von 4/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(region).queryByRole('button', { name: 'Jetzt vervollständigen →' })).toBeNull();
    // … und gesprungen wird genau einmal.
    await new Promise((r) => setTimeout(r, 300));
    expect(gescrollt().filter((id) => id === 'patientendaten')).toHaveLength(1);
  }, 15_000);

  it('goto=anfragen, schon abgesendet: springt zum Stand, Formular bleibt zu', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({
      proxy: {
        getCustomer: () => ({ Customer: { ...sampleCustomer, status: 'active' } }),
        listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
      },
    }));
    setLocation('?token=token-abgesendet&goto=anfragen');
    render(<CustomerPortalPage />);
    await waitFor(() => expect(gescrollt()).toContain('stand'), { timeout: 5000 });
    expect(screen.queryByText(/Schritt 1 von 4/)).toBeNull();
  }, 15_000);

  // ─── Kompakt-Einstieg vor dem ersten Absenden (Vorschlag 03.10.2026, KompaktEinstieg.tsx) ────────
  // Ersetzt den Kasten „Noch 2 Minuten“ (Registry #102), die Knöpfe je Karte, den Formularkopf
  // „Jetzt konkrete Bewerbungen erhalten“ und die Liste „So geht es weiter“ (Registry #109).
  // Runde 3 (Geschäftsführer): EIN Kasten „So geht es weiter“ mit drei Schritten direkt nach der
  // Kostenkarte; die vier Punkte, Testsieger und Sterne wieder IN der Kostenkarte.

  // Text ohne geschütztes Leerzeichen (vor dem „·“ der Zeile 3 steht eins).
  const text = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ');

  it('Neukunde: Kasten „So geht es weiter“ direkt nach der Kostenkarte, drei Schritte; der Knopf öffnet das Formular unter Schritt 2, ohne Sprung', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    const region = await screen.findByRole('region', { name: 'So geht es weiter' }, { timeout: 5000 });
    const kasten = within(region);
    // Runde 5: Titel wie der Betreff der Angebotsmail, Einleitung direkt darunter, über der Kostenkarte.
    const titel = screen.getByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' });
    expect(within(titel).getByText('24-Stunden-Betreuung').className).toContain('whitespace-nowrap');
    const einleitung = titel.nextElementSibling as HTMLElement;
    expect(einleitung.tagName).toBe('P');
    expect(einleitung.textContent).toBe(
      'Vielen Dank für Ihre Anfrage. Hier sehen Sie, was eine bei uns angestellte Betreuungskraft bei Ihnen zu Hause kostet, wie es weitergeht und welche Pflegekräfte zu Ihren Angaben passen.',
    );
    // Direkt nach der Kostenkarte, vor den Pflegekräften.
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift')!;
    expect(einleitung.compareDocumentPosition(karte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(karte.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(screen.getByText('Für Sie ausgewählt')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const schritte = kasten.getAllByRole('listitem');
    expect(schritte).toHaveLength(3);
    expect(schritte[0].textContent).toBe('Erledigt: Angebot erstellt');
    expect(schritte[1].getAttribute('aria-current')).toBe('step');
    expect(within(schritte[1]).getByText('Pflegesituation vervollständigen')).toBeInTheDocument();
    expect(within(schritte[1]).getByText('Dauert etwa 2 Minuten, vieles ist schon ausgefüllt. Unverbindlich: Ein Vertrag entsteht erst, wenn Sie sich für eine Pflegekraft entscheiden.')).toBeInTheDocument();
    expect(within(schritte[2]).getByText('Pflegekräfte einladen und Bewerbungen erhalten')).toBeInTheDocument();
    expect(within(schritte[2]).getByText('Passende Pflegekräfte bewerben sich bei Ihnen mit Foto, Erfahrung, Anreisedatum und Preis.')).toBeInTheDocument();
    expect(within(schritte[2]).queryByRole('button')).toBeNull();

    // Weg: Sterne unter der Überschrift, Fortschrittszeile, Kasten „Ihr nächster Schritt“, die alte
    // Liste „So geht es weiter“ (nur noch EIN Titel), „Noch 2 Minuten“, die Frage „Passt Ihnen …?“.
    expect(screen.getByRole('heading', { level: 1 }).closest('div')?.querySelector('a[href="https://primundus.de/erfahrungen"]')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Ihr Fortschritt' })).toBeNull();
    expect(screen.queryByText('Ihr nächster Schritt')).toBeNull();
    expect(screen.getAllByText('So geht es weiter')).toHaveLength(1);
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    expect(screen.queryByText('Passt Ihnen das Angebot?')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vielleicht später' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Jetzt konkrete Bewerbungen erhalten' })).toBeNull();
    expect(screen.queryByText(/Schritt 1 von 4/)).toBeNull();

    await userEvent.click(within(schritte[1]).getByRole('button', { name: 'Jetzt vervollständigen →' }));
    expect(await within(schritte[1]).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(kasten.queryByRole('button', { name: 'Jetzt vervollständigen →' })).toBeNull();
    // Kein Sprung: Der Knopf steht im Kasten, das Formular klappt darunter auf.
    expect(gescrollt()).not.toContain('patientendaten');
  }, 15_000);

  it('Neukunde: Kostenkarte mit Preis, kleiner Zeile, vier Punkten, Testsieger und Sternen; Aufklapper mit Kosten-Satz und Heimvergleich, ohne zweiten Testsieger', async () => {
    server.use(
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'So geht es weiter' }, { timeout: 5000 });
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift') as HTMLElement;
    const inKarte = within(karte);
    // Preis mit „im Monat" (das zweite „im Monat" steht in der Eigenanteil-Zeile).
    expect(text(inKarte.getByText('2.800 €').parentElement!)).toBe('2.800 €im Monat');
    expect(inKarte.getByText(/inkl\. Steuern, Gebühren und Sozialabgaben/)).toBeInTheDocument();
    // Die vier Punkte wieder in der Karte.
    const punkt = inKarte.getByText('Kein Vertrag vor Ihrer Auswahl');
    expect(inKarte.getByText('Keine Vermittlungsgebühr')).toBeInTheDocument();
    expect(inKarte.getByText('Täglich kündbar, taggenau abgerechnet')).toBeInTheDocument();
    expect(inKarte.getByText(/Bestpreisgarantie/)).toBeInTheDocument();
    // Runde 4: Eigenanteil zwischen kleiner Zeile und den Punkten, aus derselben Rechnung wie die
    // Aufstellung (defaultLead: 2.800 € − Pflegegeld 347 € = 2.453 €), nur mit dem Posten, der ihn senkt.
    const kleineZeile = inKarte.getByText(/inkl\. Steuern, Gebühren und Sozialabgaben/);
    const eigenanteil = inKarte.getByText(/^Ihr Eigenanteil:/);
    expect(text(eigenanteil)).toBe('Ihr Eigenanteil: ca. 2.453 € im Monat');
    expect(text(eigenanteil.nextElementSibling!)).toBe('nach Pflegegeld · So rechnen wir ›');
    expect(kleineZeile.compareDocumentPosition(eigenanteil) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(eigenanteil.compareDocumentPosition(punkt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Darunter Testsieger (Runde 5: „6× Testsieger DIE WELT", Erfahrung und Einsätze), dann die
    // Sterne — nicht neben dem Preis. Kein eigenes Bestpreisgarantie-Siegel mehr.
    const siegel = inKarte.getByRole('img', { name: 'Testsieger DIE WELT' });
    expect(punkt.compareDocumentPosition(siegel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const testsieger = inKarte.getByText(/^6× Testsieger/);
    expect(testsieger.tagName).toBe('B');
    expect(text(testsieger)).toBe('6× Testsieger DIE WELT');
    expect(text(testsieger.parentElement!)).toBe('6× Testsieger DIE WELTÜber 20 Jahre Erfahrung · über 60.000 Einsätze');
    expect(inKarte.queryByText(/Preis & Qualität/)).toBeNull();
    expect(inKarte.queryByRole('img', { name: /Bestpreisgarantie/ })).toBeNull();
    const sterne = await within(karte).findByRole('link', { name: /4,9 von 5 aus 126 Bewertungen/ }, { timeout: 5000 });
    expect(siegel.compareDocumentPosition(sterne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Die Garantie bleibt als vierter Punkt; „Mehr Infos" öffnet das Pop-up.
    await userEvent.click(inKarte.getByRole('button', { name: 'Mehr Infos' }));
    const sheet = await screen.findByRole('dialog', { name: 'Bestpreisgarantie' });
    await userEvent.click(within(sheet).getAllByRole('button', { name: 'Schließen' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bestpreisgarantie' })).toBeNull());

    // Kosten-Satz und Heimvergleich nur im Aufklapper; dort kein zweiter Testsieger.
    expect(screen.queryByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeNull();
    expect(screen.queryByText(/Zuhause statt Pflegeheim/)).toBeNull();
    const aufklapper = inKarte.getByRole('button', { name: 'Alle Kosten im Überblick' });
    expect(sterne.compareDocumentPosition(aufklapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(aufklapper);
    expect(inKarte.getByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeInTheDocument();
    expect(inKarte.getByText(/Zuhause statt Pflegeheim/)).toBeInTheDocument();
    expect(inKarte.getAllByRole('img', { name: 'Testsieger DIE WELT' })).toHaveLength(1);
    expect(inKarte.getAllByText(/6× Testsieger/)).toHaveLength(1);
  }, 15_000);

  it('Neukunde: „So rechnen wir ›" öffnet „Alle Kosten im Überblick" und springt zu „Was bleibt für Sie übrig" — dort dieselbe Zahl', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'So geht es weiter' }, { timeout: 5000 });
    expect(screen.queryByText('Was bleibt für Sie übrig')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'So rechnen wir ›' }));
    const rechnung = document.getElementById('eigenanteil-rechnung')!;
    expect(within(rechnung).getByText('Was bleibt für Sie übrig')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weniger anzeigen' })).toBeInTheDocument();
    await waitFor(() => expect(gescrollt()).toContain('eigenanteil-rechnung'));
    // Dieselbe Rechnung: „Ihr Eigenanteil" in der Aufstellung = Betrag in der Zeile am Preis.
    const zeile = within(rechnung).getByText('Ihr Eigenanteil').parentElement!;
    expect(text(zeile)).toBe('Ihr Eigenanteil2.453 €');
    expect(text(screen.getByText(/^Ihr Eigenanteil:/))).toContain('ca. 2.453 €');
  }, 15_000);

  it('Neukunde ohne Zuschüsse in der Kalkulation: keine Eigenanteil-Zeile', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation('?token=token-ohne-zuschuesse');
    render(<CustomerPortalPage />);
    await screen.findByRole('region', { name: 'So geht es weiter' }, { timeout: 5000 });
    expect(screen.queryByText(/^Ihr Eigenanteil:/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'So rechnen wir ›' })).toBeNull();
    // Der Rest der Karte steht unverändert.
    expect(screen.getByText('Kein Vertrag vor Ihrer Auswahl')).toBeInTheDocument();
    const karte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift') as HTMLElement;
    expect(within(karte).getByRole('img', { name: 'Testsieger DIE WELT' })).toBeInTheDocument();
  }, 15_000);

  it('Neukunde: Pflegekräfte als Zeilen ohne Knöpfe und ohne Sterne — Deutsch mit Punkten, Erfahrung · Einsätze bei uns', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    // Zahl = tatsächlich gezeigte Pflegekräfte, Einzahl bei einer.
    expect(await screen.findByRole('heading', { name: '1 passende Pflegekraft' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Für Sie ausgewählt')).toBeInTheDocument();
    const zeile = screen.getByRole('button', { name: 'Profil von Helena K. ansehen' });
    expect(within(zeile).getByText('Unsere Empfehlung')).toBeInTheDocument();
    expect(within(zeile).getByText('Deutsch gut')).toBeInTheDocument();
    expect(zeile.querySelectorAll('span.bg-pm-taupe')).toHaveLength(3);
    expect(text(zeile)).toContain('5 Jahre Erfahrung · 15 Einsätze bei uns');
    expect(zeile.textContent).not.toContain('★');
    // Keine Knöpfe je Pflegekraft mehr.
    expect(screen.queryByRole('button', { name: 'Profil vervollständigen & einladen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Einladen' })).toBeNull();
  }, 15_000);

  it('Neukunde: Hinweis „Vor dem Einladen: Pflegesituation vervollständigen →“ öffnet das Formular im Kasten und springt dorthin', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    const titel = await screen.findByRole('heading', { name: '1 passende Pflegekraft' }, { timeout: 5000 });
    const hinweis = screen.getByRole('button', { name: 'Vor dem Einladen: Pflegesituation vervollständigen →' });
    expect(titel.compareDocumentPosition(hinweis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await userEvent.click(hinweis);
    const region = screen.getByRole('region', { name: 'So geht es weiter' });
    expect(await within(region).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(gescrollt()).toContain('patientendaten');
  }, 15_000);

  it('Neukunde: die Zeile öffnet das Profil, „Einladen“ dort führt in den Kasten, ohne Einladung', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    let einladungen = 0;
    server.use(...defaultHandlers({
      proxy: {
        listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        inviteCaregiver: () => { einladungen += 1; return { SendInvitationCaregiver: true }; },
      },
    }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Profil von Helena K. ansehen' }, { timeout: 5000 }));
    const einladen = await screen.findByRole('button', { name: 'Einladen' }, { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Nein danke' })).toBeInTheDocument();
    await userEvent.click(einladen);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));
    expect(await within(screen.getByRole('region', { name: 'So geht es weiter' })).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(einladungen).toBe(0);
  }, 15_000);

  // ─── Nach dem Absenden ohne sichtbare Pflegekraft (Martin 25.09.) ────────

  it('gespeichert, keine Bewerbung, keine Pflegekraft: „Ihre Suche läuft“ und ein Leer-Zustand statt nackter Überschrift', async () => {
    server.use(
      ...defaultHandlers({
        proxy: {
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          listMatchings: () => ({ JobOfferMatchingsWithPagination: { total: 0, data: [] } }),
        },
      }),
    );
    localStorage.setItem(`patient_${TEST_LEAD_TOKEN}`, JSON.stringify({ _isDraft: false }));
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);

    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Stand heute')).toBeInTheDocument();
    expect(await screen.findByText('Gerade keine weiteren Vorschläge', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Bewerbungen bekommen Sie trotzdem per E.Mail/)).toBeInTheDocument();
    // „So geht es weiter" ersetzt der Stand.
    expect(screen.queryByText('So geht es weiter')).toBeNull();
  }, 15_000);

  // ─── Path 3: Einsatzort-Wall (Registry #65) ─────────────────────────────

  it('einsatzort wall: unauflösbare PLZ → kein updateCustomer, zurück auf Schritt 3', async () => {
    // Der Entwurf-Fall: PLZ 5-stellig UND Ort gefüllt, also kommt
    // der Kunde durch das Formular bis „Speichern" — erst Mamamia sagt, dass es
    // die PLZ nicht gibt (Default-Mock: searchLocations → []). Ohne location_id
    // stempelt Mamamia einen Platzhalter und der Kunde sieht „Vollständig" für
    // ein Profil, das nirgends steht; deshalb wird gar nicht gespeichert.
    let updateCustomerCalls = 0;
    // Achtung: defaultHandlers() enthält bereits einen proxyHandler und steht
    // in server.use() zuerst — ein zweiter proxyHandler dahinter käme nie dran.
    server.use(
      ...defaultHandlers({
        proxy: {
          // Ohne offene Bewerbung rendert das Portal den Patientenbogen (sonst
          // steht dort „Angebot prüfen").
          listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
          updateCustomer: () => {
            updateCustomerCalls += 1;
            return { UpdateCustomer: { id: 9001, customer_id: 'ts-18-9001' } };
          },
        },
      }),
    );

    localStorage.setItem(
      `patient_${TEST_LEAD_TOKEN}`,
      JSON.stringify({
        _isDraft: true,
        anzahl: '1', geschlecht: 'Weiblich',
        mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
        plz: '50348', ort: 'Lüdinghausen',
        wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Dorf/Land', startDate: '2026-12-01',
        wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
      }),
    );
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // Durch die vier Schritte — der Entwurf ist vollständig, also lässt jeder
    // „Weiter" durch; der Einsatzort fällt erst beim Speichern auf.
    // Kompakt-Einstieg: zuerst das Formular im Kasten „So geht es weiter" öffnen.
    await user.click(await screen.findByRole('button', { name: 'Jetzt vervollständigen →' }, { timeout: 5000 }));
    for (let i = 0; i < 3; i++) {
      const weiter = await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 });
      await user.click(weiter);
    }
    const speichern = await screen.findByRole('button', { name: /^Bewerbungen erhalten$/ }, { timeout: 5000 });
    await user.click(speichern);

    // Der Kunde bekommt den Satz zu sehen — und zwar auf Schritt 3, wo das Feld
    // steht, nicht auf Schritt 4, wo er geklickt hat.
    await waitFor(
      () => expect(screen.getAllByText(/kennen wir keinen Einsatzort/).length).toBeGreaterThan(0),
      { timeout: 5000 },
    );
    // Der Satz nennt die PLZ, um die es geht.
    expect(screen.getAllByText(/50348/).length).toBeGreaterThan(0);
    // Und wir stehen wieder auf Schritt 3, wo das Feld ist — nicht auf 4.
    expect(screen.getByPlaceholderText('PLZ oder Ort eingeben')).toBeTruthy();
    // Nichts ist nach Mamamia gegangen.
    expect(updateCustomerCalls).toBe(0);
    // Und der Entwurf ist nicht als „fertig" markiert worden.
    expect(JSON.parse(localStorage.getItem(`patient_${TEST_LEAD_TOKEN}`) || '{}')._isDraft)
      .not.toBe(false);
  }, 15_000);
});
