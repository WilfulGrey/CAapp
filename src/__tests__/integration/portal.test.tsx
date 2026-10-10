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
      // Rückbau Registry #122: eigener Token, damit der Sitzungs-Schlüssel der Schritt-Meldungen frisch ist.
      if (token === 'token-rueckbau') {
        return { lead: { ...defaultLead, token } as unknown as import('../../lib/supabase').Lead, error: null };
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

    // Fassung 33: erst warten, bis die Seite den gespeicherten Stand zeigt (mamamia geladen), dann das Formular über die
    // Zeile „Ihre Pflegesituation · ✓ Vollständig" im Bereich „Angebot und Pflegesituation" öffnen. (Auf dem CI-Runner
    // war die Zeile sonst schon da, während mamamia noch lud.)
    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();
    const kopf = await screen.findByRole('button', { name: /Ihre Pflegesituation.*Vollständig/ }, { timeout: 5000 });
    await user.click(kopf);
    await waitFor(() => expect(screen.getByRole('button', { name: /Ihre Pflegesituation.*Vollständig/ })).toHaveAttribute('aria-expanded', 'true'), { timeout: 5000 });
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
    expect(screen.getByRole('button', { name: /Ihre Pflegesituation.*Vollständig/ })).toBeInTheDocument();
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

    // Rückbau Registry #122 (Stand 75b8df8): Das Formular steht vor dem Speichern offen auf der Seite, der letzte
    // Knopf heißt „Speichern".
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    }
    await user.click(await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 }));
    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();

    // Fassung 33: Angaben im Bereich „Angebot und Pflegesituation" öffnen und eine Angabe ändern.
    await user.click(await screen.findByRole('button', { name: /Ihre Pflegesituation/ }, { timeout: 5000 }));
    await user.click(await screen.findByRole('button', { name: 'Männlich' }, { timeout: 5000 }));
    expect(screen.getByText('Ihre Suche läuft')).toBeInTheDocument();
    expect(screen.queryByText('Ihr persönliches Angebot')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' })).toBeNull();

    // Letzter Schritt: nur noch „Änderungen speichern", kein zweites Anfragen (und nicht der Knopf von vor dem Speichern).
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    }
    expect(screen.queryByRole('button', { name: /^Bewerbungen erhalten$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Speichern$/ })).toBeNull();
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
    // …und der Kompakt-Einstieg auch nicht (Einleitung, Pflegekräfte-Bereich).
    expect(titel.some((t) => t.includes('Rund-um-Betreuung zu Hause') || t.includes('Ihre passenden Pflegekräfte') || t.includes('Ihre Pflegesituation ist noch nicht vollständig') || t.includes('Es fehlen noch Angaben zur Pflegesituation'))).toBe(false);
    // …und der Einstieg vor dem Speichern (Rückbau Registry #122, Stand 75b8df8) auch nicht.
    expect(titel.some((t) => t.includes('Noch 2 Minuten bis zu Ihren Bewerbungen') || t.includes('Pflegesituation unvollständig') || t.includes('Warum? Mehr'))).toBe(false);
    // Wunschstart aus dem gespeicherten Formular, nicht aus mamamia `arrival_at`.
    expect(screen.getByText(/Wunschstart:? 15\.11\./)).toBeInTheDocument();
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

  it('vor dem Speichern (Rückbau Registry #122): Kostenkarte mit den vier Haken aus Stand 75b8df8, nicht den Startseiten-Punkten', async () => {
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    expect(await screen.findByText('Erst auswählen, dann buchen', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Täglich kündbar')).toBeInTheDocument();
    expect(screen.getByText('Tagesgenaue Abrechnung')).toBeInTheDocument();
    expect(screen.getByText('Keine Vermittlungsgebühr')).toBeInTheDocument();
    expect(screen.queryByText('Kein Vertrag vor Ihrer Auswahl')).toBeNull();
    expect(screen.queryByText('Täglich kündbar, taggenau abgerechnet')).toBeNull();
  }, 15_000);

  const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);

  it('goto=anfragen, noch nicht abgesendet (Rückbau Registry #122): springt einmal zur Pflegesituation, erst wenn die Pflegekräfte stehen', async () => {
    const sprung = Element.prototype.scrollIntoView as unknown as { mockClear: () => void; mockImplementation: (f: (this: Element) => void) => void };
    sprung.mockClear();
    // Beim Sprung festhalten, ob die Liste noch lädt: Die Karten stehen ÜBER dem Formular und würden es sonst nach dem
    // Sprung nach unten schieben.
    const laedtBeimSprung: boolean[] = [];
    sprung.mockImplementation(function (this: Element) {
      if (this.id === 'patientendaten') laedtBeimSprung.push((document.body.textContent ?? '').includes('Wir laden Ihre Pflegekräfte'));
    });
    try {
      server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
      localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
      setLocation(`?token=${TEST_LEAD_TOKEN}&goto=anfragen`);
      render(<CustomerPortalPage />);
      await waitFor(() => expect(gescrollt()).toContain('patientendaten'), { timeout: 5000 });
      expect(laedtBeimSprung).toEqual([false]);
      // Stand 75b8df8: Abschnittskopf „Pflegesituation · Unvollständig", das Formular steht offen darunter.
      expect(screen.getByRole('heading', { level: 2, name: 'Pflegesituation' })).toBeInTheDocument();
      expect(await screen.findByText(/Schritt 1 von 4/, {}, { timeout: 5000 })).toBeInTheDocument();
      // … und gesprungen wird genau einmal.
      await new Promise((r) => setTimeout(r, 300));
      expect(gescrollt().filter((id) => id === 'patientendaten')).toHaveLength(1);
    } finally {
      sprung.mockImplementation(() => {});
    }
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

  // Text ohne geschütztes Leerzeichen (vor dem „·“ der Zeile 3 steht eins).
  const text = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ');

  // ─── Kompakt-Einstieg vor dem ersten Absenden: Fassung 30 (live 06.10. bis zum Rückbau Registry #122) ────────
  // Seit dem Rückbau nur noch per `?einstieg=kompakt` (Vergleich, Rückweg). Kopf mit Person, Titel, Sternen, Einleitung und
  // Testsieger; Angebotskarte (Kopfleiste, Leistung, Preis, vier Punkte); „So geht es weiter"; Abschnitt „1 Pflegesituation
  // ergänzen und Pflegekräfte einladen" mit Achtung-Hinweis und Karten. Der ältere Entwurf („ruhig") steht in kompaktRuhig.test.tsx.

  it('?einstieg=kompakt (Fassung 30): Kopf, Angebotskarte, „So geht es weiter“, Abschnitt 1 mit Achtung-Hinweis; „Jetzt vervollständigen“ öffnet das Formular im Hinweis', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(
      ...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
    );
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}&einstieg=kompakt`);
    render(<CustomerPortalPage />);
    const titel = await screen.findByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' }, { timeout: 5000 });
    expect(screen.getByText(/^Gerne übernehmen wir/)).toBeInTheDocument();
    expect(screen.getByText(/6× in Folge Testsieger/)).toBeInTheDocument();
    // Sternezeile im Kopf ohne Link, auch hier (Martin 10.10.: „nicht unterstrichen, damit man da nicht draufklickt").
    const kopfKompakt = titel.parentElement!;
    expect(await within(kopfKompakt).findByText((_, el) => el?.tagName === 'P' && el.textContent === '4,9 von 5 aus 126 Bewertungen', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(within(kopfKompakt).queryByRole('link', { name: /Bewertungen/ })).toBeNull();
    // Angebotskarte: Kopfleiste, Leistung, Preis, „Kosten im Überblick ›", vier Punkte.
    const karte = document.getElementById('angebot')!;
    expect(titel.compareDocumentPosition(karte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(karte).getByText(/^Ihr Angebot vom /)).toBeInTheDocument();
    expect(within(karte).getByText('Rund-um-Betreuung zu Hause')).toBeInTheDocument();
    expect(text(within(karte).getByText('2.800 €').parentElement!)).toBe('2.800 €im Monat');
    expect(within(karte).getByRole('button', { name: 'Kosten im Überblick ›' })).toBeInTheDocument();
    expect(within(karte).getByText('Kein Vertrag vor Ihrer Auswahl')).toBeInTheDocument();
    // „So geht es weiter" mit drei Schritten, darunter der Abschnitt mit derselben Überschrift wie Schritt 1.
    expect(screen.getByRole('heading', { level: 2, name: 'So geht es weiter' })).toBeInTheDocument();
    const abschnitt = screen.getByRole('heading', { level: 2, name: 'Pflegesituation ergänzen und Pflegekräfte einladen' });
    expect(abschnitt.id).toBe('pflegekraefte');
    const hinweis = document.getElementById('patientendaten')!;
    expect(within(hinweis).getByText('Achtung: Es fehlen noch Angaben zur Pflegesituation')).toBeInTheDocument();
    expect(screen.queryByText(/Schritt 1 von 4/)).toBeNull();
    // Der Knopf im Hinweis öffnet das Formular darin, ohne Sprung.
    await userEvent.click(within(hinweis).getByRole('button', { name: 'Jetzt vervollständigen' }));
    expect(await within(hinweis).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
    expect(within(hinweis).queryByRole('button', { name: 'Jetzt vervollständigen' })).toBeNull();
    expect(gescrollt()).not.toContain('patientendaten');
  }, 15_000);

  it('?einstieg=kompakt (Fassung 30): „Kosten im Überblick ›“ öffnet die Aufstellung mit „Was bleibt für Sie übrig“', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    server.use(...defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }) } }));
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}&einstieg=kompakt`);
    render(<CustomerPortalPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Kosten im Überblick ›' }, { timeout: 5000 }));
    const ueberblick = document.getElementById('kosten-ueberblick')!;
    expect(text(within(ueberblick).getByText('Betreuung').parentElement!)).toBe('Betreuung2.800 € / Monat');
    await waitFor(() => expect(gescrollt()).toContain('kosten-ueberblick'));
    expect(text(within(screen.getByText('Was bleibt für Sie übrig').parentElement!).getByText('Ihr Eigenanteil').parentElement!)).toBe('Ihr Eigenanteil2.453 €');
  }, 15_000);

  it('?einstieg=kompakt: die Zeile öffnet das Profil, „Einladen“ dort führt in den Hinweis zum Formular, ohne Einladung', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    let einladungen = 0;
    server.use(...defaultHandlers({
      proxy: {
        listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }),
        inviteCaregiver: () => { einladungen += 1; return { SendInvitationCaregiver: true }; },
      },
    }));
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}&einstieg=kompakt`);
    render(<CustomerPortalPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Profil von Helena K. ansehen' }, { timeout: 5000 }));
    const einladen = await screen.findByRole('button', { name: 'Einladen' }, { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Nein danke' })).toBeInTheDocument();
    await userEvent.click(einladen);
    await waitFor(() => expect(gescrollt()).toContain('patientendaten'));
    expect(await within(document.getElementById('patientendaten')!).findByText(/Schritt 1 von 4/)).toBeInTheDocument();
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
    // Fassung 33: „So geht es weiter" mit Stand statt „Stand heute".
    expect(screen.getByRole('heading', { level: 2, name: 'So geht es weiter' })).toBeInTheDocument();
    expect(screen.queryByText('Stand heute')).toBeNull();
    expect(await screen.findByText('Gerade keine weiteren Vorschläge', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Bewerbungen bekommen Sie trotzdem per E.Mail/)).toBeInTheDocument();
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
    // Rückbau Registry #122: Das Formular steht vor dem Speichern offen, der letzte Knopf heißt „Speichern".
    for (let i = 0; i < 3; i++) {
      const weiter = await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 });
      await user.click(weiter);
    }
    const speichern = await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 });
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

// ─── Rückbau Registry #122: vor dem ersten Speichern die Seite aus Stand 75b8df8 (EinstiegVorSpeichern.tsx) ──────────
// Seit #748 (25.09. 16:35) speicherten Google-Kunden in Stunde 1 nur noch 2 von 48 die Pflegesituation (vorher 42 von 151).
// Vor dem Speichern zeigt das Portal wieder den damaligen Stand, Kopf und Häufige Fragen wie heute (Martin 10.10.:
// „oben den neuen Teil besser … die Sterne … nicht unterstrichen … wie die Fragen ganz unten dargestellt sind … auch besser");
// danach bleibt alles wie heute.
describe('Einstieg vor dem ersten Speichern wie Stand 75b8df8 (Rückbau Registry #122)', () => {
  const ohneBewerbung = (proxy: Parameters<typeof defaultHandlers>[0] extends infer O ? O extends { proxy?: infer P } ? P : never : never = {}) =>
    defaultHandlers({ proxy: { listApplications: () => ({ JobOfferApplicationsWithPagination: { total: 0, data: [] } }), ...proxy } });
  const text = (el: Element) => (el.textContent ?? '').replace(/ /g, ' ');
  const gescrollt = () => (Element.prototype.scrollIntoView as unknown as { mock: { contexts: Element[] } }).mock.contexts.map((e) => e.id);

  it('Kopf wie heute (Sterne ohne Link), Kostenkarte, „Passende Pflegekräfte“ mit dem Kasten „Noch 2 Minuten bis zu Ihren Bewerbungen“, Karten mit „Einladen“ + Schloss, offenes Formular, „So geht es weiter“ und Marta wie damals, Häufige Fragen wie heute', async () => {
    server.use(
      ...ohneBewerbung(),
      http.get('https://primundus.de/api/bewertungen-stand', () => HttpResponse.json({ schnitt: '4,9', wert: 4.9, anzahl: 126 })),
    );
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    render(<CustomerPortalPage />);
    // Kopf wie im Kompakt-Einstieg: Initialen, „Guten Tag, …“, „Ihr persönlicher Bereich“, Titel, Sternezeile.
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' }, { timeout: 5000 });
    const kopfOben = h1.parentElement!;
    expect(within(kopfOben).getByText(/^Guten Tag, Frau .+$/).textContent).not.toMatch(/\.$/);
    expect(within(kopfOben).getByText('Ihr persönlicher Bereich')).toBeInTheDocument();
    expect(within(kopfOben).getByText('AT')).toBeInTheDocument();
    // Sternezeile ohne Link: nichts unterstrichen, nicht antippbar (Martin 10.10.).
    const sterne = await within(kopfOben).findByText((_, el) => el?.tagName === 'P' && el.textContent === '4,9 von 5 aus 126 Bewertungen', {}, { timeout: 5000 });
    expect(h1.compareDocumentPosition(sterne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(kopfOben).queryByRole('link')).toBeNull();
    expect(sterne.closest('a, button')).toBeNull();
    expect(sterne.innerHTML).not.toContain('underline');
    // Nicht übernommen: Einleitung, Testsieger-Block und Angebotskarte des Kompakt-Einstiegs; der alte Kopf ist weg.
    expect(screen.queryByText('Ihr persönliches Angebot')).toBeNull();
    expect(screen.queryByText(/^Gerne übernehmen wir/)).toBeNull();
    expect(screen.queryByText(/6× in Folge Testsieger/)).toBeNull();
    expect(screen.queryByText(/^Ihr Angebot vom /)).toBeNull();
    expect(screen.queryByText('Rund-um-Betreuung zu Hause')).toBeNull();
    // Kostenkarte (75b8df8) direkt nach dem Kopf, ohne über ihm zu liegen (kein -mt-6 mehr).
    const kostenkarte = screen.getByText('Ihre Betreuungskosten').closest('.shadow-lift')!;
    expect(kopfOben.compareDocumentPosition(kostenkarte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kostenkarte.parentElement!.className).not.toContain('-mt-6');
    // Kostenkarte (75b8df8): Preis, Satz, Bestpreisgarantie, vier Haken, „Kosten erst …“, Heimvergleich, Testsieger, Umschalter.
    expect(screen.getByText('Ihre Betreuungskosten')).toBeInTheDocument();
    expect(screen.getByText('2.800 €')).toBeInTheDocument();
    expect(screen.getByText('Monatlich inkl. Steuern, Gebühren und Sozialabgaben. Zzgl. Kost und Logis sowie Reisekosten (125 € pro Fahrt).')).toBeInTheDocument();
    expect(screen.getByText('Bestpreisgarantie')).toBeInTheDocument();
    expect(screen.getByText('Kosten erst, wenn die Pflegekraft da ist.')).toBeInTheDocument();
    expect(text(screen.getByText(/^Heim-Eigenanteil im 1\. Jahr/))).toBe('Heim-Eigenanteil im 1. Jahr 3.364 €, bei Ihnen nach Zuschüssen etwa 2.453 €. Quelle: vdek-Auswertung, Stand 1. Juli 2026.');
    expect(screen.getByRole('button', { name: 'Alle Kosten im Überblick' })).toBeInTheDocument();
    // „Passende Pflegekräfte“ mit „Warum? Mehr“ (Sprungziel goto=matches).
    expect(document.getElementById('pflegekraefte')!.textContent).toContain('Passende Pflegekräfte');
    expect(text(screen.getByText(/^Laden Sie ein, wer Ihnen gefällt\./))).toBe('Laden Sie ein, wer Ihnen gefällt. Wir bereiten die Bewerbungen vor. Das geht, sobald Ihre Pflegesituation vollständig ist. Warum? Mehr');
    // Kasten über den Karten.
    const kasten = (await screen.findByText('Noch 2 Minuten bis zu Ihren Bewerbungen', {}, { timeout: 5000 })).parentElement!;
    expect(within(kasten).getByText('Pflegesituation unvollständig')).toBeInTheDocument();
    expect(within(kasten).getByText('Vieles ist schon aus Ihrem Kostenrechner übernommen.')).toBeInTheDocument();
    expect(within(kasten).getByRole('button', { name: 'Pflegesituation vervollständigen' })).toBeInTheDocument();
    // Karten wie damals: Empfehlung als Zeile über der Karte, „Einladen“ mit Schloss.
    expect(screen.getByText('Unsere Empfehlung für Sie')).toBeInTheDocument();
    const einladen = screen.getAllByRole('button', { name: 'Einladen' });
    expect(einladen[0].querySelector('svg.lucide-lock')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Profil vervollständigen & einladen' })).toBeNull();
    // Abschnittskopf und das Formular OFFEN darunter, ohne Tipp.
    const kopf = document.getElementById('patientendaten')!;
    expect(within(kopf).getByRole('heading', { level: 2, name: 'Pflegesituation' })).toBeInTheDocument();
    expect(within(kopf).getByText('Für Ihre Bewerbungen')).toBeInTheDocument();
    expect(within(kopf).getByText('Unvollständig')).toBeInTheDocument();
    expect(within(kopf).getByText('Damit sich Pflegekräfte bewerben können. Vieles ist schon ausgefüllt.')).toBeInTheDocument();
    const schritt = screen.getByText(/Schritt 1 von 4/);
    expect(kopf.compareDocumentPosition(schritt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText('Ihre Eingaben bleiben auf diesem Gerät gespeichert.')).toBeInTheDocument();
    // „So geht es weiter“ wie damals, ohne Knopf.
    expect(screen.getByRole('heading', { level: 2, name: 'So geht es weiter' })).toBeInTheDocument();
    expect(screen.getByText('2 Minuten. Vieles ist schon ausgefüllt.')).toBeInTheDocument();
    expect(screen.getByText('Passende Pflegekräfte bewerben sich bei Ihnen. Gerne können Sie Ihre Favoriten einladen, sich zu bewerben.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jetzt vervollständigen →' })).toBeNull();
    // Häufige Fragen wie heute im Kompakt-Einstieg: Karte mit Deutsch-Niveaus und den drei Grundfragen, „10 weitere Fragen“,
    // dahinter zuerst die Bestpreis-Frage (#118). Kein Eyebrow „Gut zu wissen“ mehr.
    const faq = screen.getByRole('heading', { level: 2, name: 'Häufige Fragen' });
    expect(faq.id).toBe('faq-titel');
    expect(screen.queryByText('Gut zu wissen')).toBeNull();
    const faqKarte = faq.nextElementSibling as HTMLElement;
    expect(faqKarte.className).toContain('rounded-card');
    expect(within(faqKarte).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Was bedeuten die Deutsch-Niveaus (Grund, Mittel, Gut)?',
      'Was übernimmt die Pflegekraft, was ein Pflegedienst?',
      'Was brauche ich zu Hause?',
      'Wie läuft die Betreuung ab?',
      '10 weitere Fragen',
    ]);
    await userEvent.click(within(faqKarte).getByRole('button', { name: '10 weitere Fragen' }));
    expect(within(faqKarte).getAllByRole('button')[4].textContent).toBe('Ich habe ein günstigeres Angebot. Was kann ich tun?');
    // Marta mit Siegel wie damals.
    expect(screen.getByText('Noch Fragen?')).toBeInTheDocument();
    // Nicht da: Kompakt-Einstieg (#780) ohne seinen Kopf, Wortlaut #109, Satz über dem Knopf.
    expect(screen.queryByText('Achtung: Es fehlen noch Angaben zur Pflegesituation')).toBeNull();
    expect(screen.queryByText('Noch 2 Minuten bis zum Einladen')).toBeNull();
    expect(screen.queryByText('Jetzt konkrete Bewerbungen erhalten')).toBeNull();
    expect(screen.queryByText(/^Kostenlos und unverbindlich\. Ein Vertrag entsteht erst/)).toBeNull();
  }, 15_000);

  it('letzter Schritt: „Speichern“ mit „Zurück“ daneben, kein Satz darüber; jeder Schritt kommt beim Server an; nach dem Speichern der heutige Zustand', async () => {
    const schritte: number[] = [];
    let gespeichert = 0;
    server.use(
      bridgeHandler((b) => {
        if (b.event === 'patient_form_step') schritte.push((b.metadata as { step: number }).step);
        if (b.event === 'patient_data_saved') gespeichert += 1;
      }),
      ...ohneBewerbung({ searchLocations: () => ({ LocationsWithPagination: { data: [{ id: 4711, location: 'München', zip_code: '80331', country_code: 'DE' }] } }) }),
    );
    localStorage.setItem('patient_token-rueckbau', JSON.stringify({
      _isDraft: true,
      anzahl: '1', geschlecht: 'Weiblich',
      mobilitaet: 'Rollatorfähig', heben: 'Nein', demenz: 'Nein', nacht: 'Nein',
      plz: '80331', ort: 'München',
      wohnungstyp: 'Einfamilienhaus', urbanisierung: 'Großstadt', startDate: '2099-12-01',
      wunschGeschlecht: 'Weiblich', fuehrerschein: 'Nein',
    }));
    setLocation('?token=token-rueckbau');
    const user = userEvent.setup();
    render(<CustomerPortalPage />);
    expect(await screen.findByText(/Schritt 1 von 4/, {}, { timeout: 5000 })).toBeInTheDocument();
    for (let i = 0; i < 3; i++) {
      await user.click(await screen.findByRole('button', { name: /^Weiter →$/ }, { timeout: 5000 }));
    }
    const speichern = await screen.findByRole('button', { name: /^Speichern$/ }, { timeout: 5000 });
    const zurueck = screen.getByRole('button', { name: /^Zurück$/ });
    expect(zurueck.parentElement).toBe(speichern.parentElement);
    expect(speichern.parentElement!.className).toContain('grid-cols-[auto_1fr]');
    expect(speichern.className).not.toContain('whitespace-nowrap');
    // Kein Textlink „Zurück zu Schritt 3“ (die Fortschrittsbalken heißen „Zurück zu Schritt 1: …“).
    expect(screen.queryByRole('button', { name: /^Zurück zu Schritt \d$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Bewerbungen erhalten$/ })).toBeNull();
    expect(screen.queryByText(/^Kostenlos und unverbindlich/)).toBeNull();
    // Messung (Registry #122): jeder erreichte Schritt einmal, nicht nur der erste.
    await waitFor(() => expect(schritte).toEqual([1, 2, 3]));

    await user.click(speichern);
    expect(await screen.findByText('Ihre Suche läuft', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(gespeichert).toBe(1));
    // Nach dem Speichern der heutige Zustand (Fassung 33), nichts mehr vom Stand 75b8df8.
    expect(screen.getByRole('heading', { level: 2, name: 'So geht es weiter' })).toBeInTheDocument();
    expect(screen.getByText('Pflegesituation vollständig')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Angebot und Pflegesituation' })).toBeInTheDocument();
    expect(screen.queryByText('Noch 2 Minuten bis zu Ihren Bewerbungen')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Ihr Angebot zur 24-Stunden-Betreuung' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Warum? Mehr' })).toBeNull();
    expect(screen.queryByText('Für Ihre Bewerbungen')).toBeNull();
    // Die Karten sind wieder die von heute („V“): „Einladen“ ohne Schloss.
    expect(screen.queryAllByRole('button', { name: 'Einladen' }).some((b) => b.querySelector('svg.lucide-lock'))).toBe(false);
  }, 20_000);

  it('„Einladen“ mit Schloss, „Warum? Mehr“ und „Einladen“ im Profil öffnen „Warum erst die Pflegesituation?“ — keine Einladung; der Knopf darin springt zum Formular', async () => {
    (Element.prototype.scrollIntoView as unknown as { mockClear: () => void }).mockClear();
    let einladungen = 0;
    server.use(...ohneBewerbung({ inviteCaregiver: () => { einladungen += 1; return { SendInvitationCaregiver: true }; } }));
    localStorage.removeItem(`patient_${TEST_LEAD_TOKEN}`);
    setLocation(`?token=${TEST_LEAD_TOKEN}`);
    const user = userEvent.setup();
    render(<CustomerPortalPage />);

    // 1) „Einladen“ mit Schloss auf der Karte.
    await user.click((await screen.findAllByRole('button', { name: 'Einladen' }, { timeout: 5000 }))[0]);
    let sheet = await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' });
    expect(within(sheet).getByText('Die Pflegekräfte entscheiden anhand Ihrer Angaben, ob sie zu Ihnen passen und wann sie anreisen können. Zum Beispiel:')).toBeInTheDocument();
    expect(within(sheet).getByText('Pflegegrad, Mobilität und Demenz')).toBeInTheDocument();
    expect(within(sheet).getByText('Einsätze in der Nacht')).toBeInTheDocument();
    expect(within(sheet).getByText('Wohnort, Unterbringung und Startdatum')).toBeInTheDocument();
    expect(within(sheet).getByText('Ohne diese Angaben kann sich niemand bewerben. Das Ausfüllen dauert etwa 2 Minuten.')).toBeInTheDocument();
    await user.click(within(sheet).getAllByRole('button', { name: 'Schließen' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // 2) „Warum? Mehr“ → dasselbe Pop-up; „Pflegesituation vervollständigen“ darin schließt es und springt zum Formular.
    await user.click(screen.getByRole('button', { name: 'Warum? Mehr' }));
    sheet = await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' });
    await user.click(within(sheet).getByRole('button', { name: 'Pflegesituation vervollständigen' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(gescrollt()).toContain('patientendaten');

    // 3) Profil über die Karte, „Einladen“ dort → wieder das Pop-up, das Profil geht zu.
    await user.click(screen.getByText('Helena K.'));
    await screen.findByRole('button', { name: 'Nein danke' }, { timeout: 5000 });
    const imProfil = screen.getAllByRole('button', { name: 'Einladen' });
    await user.click(imProfil[imProfil.length - 1]);
    expect(await screen.findByRole('dialog', { name: 'Warum erst die Pflegesituation?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nein danke' })).toBeNull();
    expect(einladungen).toBe(0);
  }, 20_000);
});
