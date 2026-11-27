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

## Sofortformular-Leads (Anfrage-Formular) — ENTWURF, nicht live

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
| Cron | `supabase/nach-freigabe/20261125120100_setup_meta_leads_cron.sql` — liegt absichtlich NICHT in `migrations/` |
| Route | `project 3/app/api/cron/meta-leads/route.ts` |
| Env (Render, Kostenrechner) | `META_PAGE_ID`, `META_PAGE_TOKEN` (Geheimnis), optional `META_LEADS_TO` (Standard info@primundus.de), `META_GRAPH_URL` nur für Tests |
| Test | `src/__tests__/metaLeads.test.ts` |

Live schalten (Reihenfolge, nur nach Freigabe):

1. Migration `20261125120000_fb_leads.sql` per `scripts/apply-migrations.sh`
   (Staging, dann `ycdwtrklpoqprabtwahi`).
2. Code mergen (die Route ist ohne Meta-Env inert).
3. In Meta: Systemnutzer im Business-Portfolio mit Zugriff auf die Seite und
   Lead-Zugriff (Seiteneinstellungen → Lead-Zugriff), Token mit
   `leads_retrieval` (dazu `pages_show_list`, `pages_read_engagement`,
   `pages_manage_ads`) erzeugen.
4. Render-Env des Kostenrechners: `META_PAGE_ID`, `META_PAGE_TOKEN`,
   optional `META_LEADS_TO`. Einmal von Hand prüfen:
   `curl -X POST -H "Authorization: Bearer <service_role>" https://kostenrechner.primundus.de/api/cron/meta-leads`.
5. Cron-Datei nach `supabase/migrations/` verschieben und einspielen. Die
   Vault-Secrets `kostenrechner_url` und `supabase_service_role_key` gibt es
   schon (Portal-Abholer).

## Offen

- **Server-Weg (Conversions API):** Meta hängt an jeden Anzeigenklick `fbclid`
  an. Der Rechner speichert es heute nicht (`AD_PARAM_KEYS`). Für eine
  Messung über die ca. 6 % mit Einwilligung hinaus wäre das der nächste
  Schritt — wie `oppref`/`openai-conversions` (Registry #64), mit eigener
  Datenschutzentscheidung.
