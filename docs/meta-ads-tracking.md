# Meta Ads (Facebook und Instagram) — Messkette

Stand: 23.11.2026. Schwesterdokument zu [openai-ads-tracking.md](openai-ads-tracking.md)
und [google-ads-tracking.md](google-ads-tracking.md).

## Was läuft

Anzeigen laufen im Meta-Werbeanzeigenmanager, Werbekonto „Primundus"
(`1357917132982741`, Business-Portfolio Primundus `1384211821436967`),
Kampagne „Primundus Start 11-2026 (Traffic)", Ziel Landingpage-Aufrufe auf
`kostenrechner.primundus.de`. Jede Anzeige hängt
`utm_source=facebook&utm_medium=paid_social&utm_campaign=meta-start-2026-11&utm_content={{ad.name}}`
an; der Rechner speichert diese Werte an jeder Anfrage (`lib/analytics.ts`
`AD_PARAM_KEYS` → `angebot-anfordern` `HERKUNFT_KEYS`), **auch ohne
Cookie-Zustimmung**. Das ist die vollständige Zählung der Meta-Anfragen; der
Pixel sieht nur die Besucher mit Marketing-Einwilligung.

| | |
|---|---|
| Pixel-ID | `2358395084910089` (Datensatz „Primundus Kostenrechner") |
| SDK | `https://connect.facebook.net/en_US/fbevents.js` |
| Lader | `project 3/app/layout.tsx`, Script-ID `meta-pixel-consent` |
| Ereignis | `project 3/lib/meta-pixel.ts` → `meldeMetaAnfrage()` |
| Auslöser | `components/calculator/MultiStepForm.tsx` und `app/result/page.tsx` (neben `meldeAnfrage` des OpenAI-Pixels), `public/pria.html` + generiertes `pria-widget.js` |
| Test | `src/__tests__/metaPixel.test.ts` |

## Einwilligung

Wie beim OpenAI-Pixel: Schalter **„Marketing"** des Cookie-Banners
(`primundus_cookie_consent`, zweite Quelle Cookie `pm_consent`). Ohne
Einwilligung wird `fbevents.js` **gar nicht geholt** — es setzt beim Start
`_fbp` (und mit `fbclid` in der URL `_fbc`). Deshalb gibt es auch **kein**
`<noscript>`-Bild aus Metas Standard-Schnipsel: das würde ohne jede Wahl senden.

- **Zustimmung** (beim Laden oder später über `cookie-consent-changed`) →
  laden, `set autoConfig false`, `init`, `PageView`.
- **Widerruf** → `consent revoke`; eine erneute Zustimmung → `consent grant`.

## Was an Meta geht

- `PageView` beim Laden des Pixels.
- `Lead` nach abgeschickter Anfrage: `{ value: 20, currency: 'EUR' }`, `eventID`
  = leadId. Wert = feste Staffelung aus `lib/oaiq.ts` (`WERT_ANFRAGE_EUR`), in
  **ganzen Euro** (anders als OpenAI, das Cent erwartet).

Nicht an Meta: Antworten aus dem Rechner (Pflegegrad, Mobilität, Nacht sind
Gesundheitsangaben), Name, E-Mail, Telefon, Preis. `autoConfig` ist aus, damit
das SDK nicht selbst Knopf-Klicks und Seitendaten einsammelt. Die automatische
erweiterte Abgleichung („Automatic Advanced Matching") liest Formularfelder aus
und wird im **Events Manager** geschaltet, nicht im Code — dort muss sie für
diesen Datensatz **aus** bleiben.

Datenschutzerklärung: `app/datenschutz/page.tsx` Abschnitt 8, Absatz
„Meta-Pixel".

## Sofortformular-Leads (Anfrage-Formular) — live seit 27.11.2026

Für Anzeigen mit Meta-Sofortformular („Anfrage“, ohne Begrüßungsseite) holt der
Kostenrechner die Leads selbst ab; Meta schickt sie nicht von sich aus. Jede
Minute (Martin 27.11.: Bestätigung sofort) ruft pg_cron `POST /api/cron/meta-leads` (Bearer = Service-Key wie
beim Portal-Abholer). Die Route holt mit `META_PAGE_TOKEN` den Seiten-Token,
liest alle Formulare der Seite `META_PAGE_ID` und je Formular die neuesten 100
Leads, und fügt sie in `fb_leads` ein (`id` = Lead-ID von Meta, Duplikate
ignoriert). Nur frisch eingefügte Leads lösen Mails aus: zuerst die
Bestätigung an den Lead (nur mit E-Mail und höchstens 72 h alt, damit die
erste Abholung keine alten Leads anschreibt), dann eine Team-Mail an
`META_LEADS_TO` mit einer Karte je Lead (Name, Telefon mit „Anrufen",
E-Mail, Zeitraum aus der Frage „Für wann planen Sie Unterstützung zu Hause?",
Eingang, Facebook/Instagram, Anzeige). Ohne `META_PAGE_ID`/`META_PAGE_TOKEN`
passiert nichts. Wortlaut: `META_LEAD_TEXTE` in
`project 3/lib/meta-leads-mails.ts`; Ablauf und Umgebung: Kopf von
`project 3/lib/meta-leads.ts`.

| | |
|---|---|
| Tabelle | `fb_leads` — Migration `supabase/migrations/20261125120000_fb_leads.sql` (RLS ohne Policies) |
| Cron | `supabase/migrations/20261125120100_setup_meta_leads_cron.sql` (jede Minute; lag bis zur Freigabe am 27.11.2026 in `supabase/nach-freigabe/`) |
| Route | `project 3/app/api/cron/meta-leads/route.ts` |
| Zugang | Env `META_PAGE_ID` + `META_PAGE_TOKEN` (Render) ODER Supabase-Vault `meta_page_id` + `meta_page_token` über RPC `get_meta_leads_secrets` (Migration `20261127190000`, nur service_role). Prod nutzt den Vault, weil die Render-Env des Prod-Kostenrechners nicht in Martins Render-Zugang liegt. Optional `META_LEADS_TO` (Standard info@primundus.de), `META_GRAPH_URL` nur für Tests |
| Test | `src/__tests__/metaLeads.test.ts` |

Live geschaltet am 27.11.2026 (Freigabe Martin), Stand und Lehren:

1. Formular „Primundus_Anfrage_DE (Stuhl, 27.11.)“ (id `2063543837689805`) auf der Seite `1384877164706432`, Typ „Höhere Lautstärke“, **Flexible Formularauslieferung AUS** (sonst darf Meta Kopfbild und Reihenfolge ändern). Kopfbild nur über „Begrüßung“ + „Hochgeladenes Bild“; Titel UND Beschreibung der Begrüßung sind Pflicht.
2. Seite: Nutzungsbedingungen für Lead Ads angenommen (`leadgen_tos_accepted`), sonst lassen sich keine Lead-Anzeigen veröffentlichen.
3. Token: Systemnutzer „Primundus Content-Loop“ (App 1524424276191925, Anwendungsfall „Anzeigen-Leads erfassen und verwalten“), Ablauf nie, mit `leads_retrieval`, `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`. Der Systemnutzer braucht auf der Seite die Aufgabe **„Leads“** (Unternehmenseinstellungen → Systemnutzer → Seite → Verwalten). Ohne sie liefert `/{form}/leads` stillschweigend `data: []`, obwohl `leads_count` > 0 ist.
4. **Feldnamen folgen der Formularsprache:** das deutsche Formular liefert `e-mail-adresse`, `vollständiger_name`, `telefonnummer` (nicht `email`/`full_name`/`phone_number`). `zuZeile` und `KONTAKT_FELDER` kennen beide; zusätzlich Teilwort-Suche (`mail`, `telefon`, `name`).
5. Testanfragen aus dem Lead-Ads-Testtool (developers.facebook.com/tools/lead-ads-testing) tragen Platzhalter („<test lead: dummy data for …>“, `test@meta.com`). Vor dem Einschalten der Abholung auf Prod löschen, sonst gehen Bestätigung und Team-Mail raus.
6. Reihenfolge auf Prod: Migrationen per `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi` (Tabelle, Cron, Vault-RPC), Vault-Einträge `meta_page_id` / `meta_page_token` per `vault.create_secret` (Management-API, Wert nie im Log), Merge, Prüfaufruf `curl -X POST -H "Authorization: Bearer <service_role>" https://kostenrechner.primundus.de/api/cron/meta-leads` ⇒ `{"configured":true,"forms":1,…}`. Staging hat keine Meta-Env ⇒ `{"configured":false}`.

## Offen

- **Server-Weg (Conversions API):** Meta hängt an jeden Anzeigenklick `fbclid`
  an. Der Rechner speichert es heute nicht (`AD_PARAM_KEYS`). Für eine
  Messung über die ca. 6 % mit Einwilligung hinaus wäre das der nächste
  Schritt — wie `oppref`/`openai-conversions` (Registry #64), mit eigener
  Datenschutzentscheidung.
