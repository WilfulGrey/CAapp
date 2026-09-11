# OpenAI Ads (Werbung in ChatGPT) — Messkette

Stand: 02.09.2026. Schwesterdokument zu [google-ads-tracking.md](google-ads-tracking.md).

## Was läuft

Anzeigen laufen im **OpenAI Anzeigenmanager (Beta)**, Werbekonto
„PRIMUNDUS Sp. z o.o." (`adacct_6a9acf3a5c608199897366e0c6878409`, Login
ads@primundus.de, angelegt 04.09.2026). Ziel ist `kostenrechner.primundus.de`
— nicht der Apex. Der Apex hat **kein** Pixel, leitet aber Besucher mit
`utm_source=chatgpt` per 307 in den Rechner weiter (primundus.de,
`next.config.js`), falls eine Anzeige doch auf die Startseite zeigt.

> Stillgelegt am 09.09.2026: das zweite Werbekonto
> `adacct_6a9684a2460881929cf18c4f7133dc57` („PRIMUNDUS Sp. z o.o", Login
> martin@wyzzi.net, Kampagne auf den Apex, Land Deutschland und deshalb nicht
> verifizierbar). Dessen Pixel `6BMzErvmnYg7ibnpXriwfU` stand bis dahin im
> Code — Ereignisse davor liefen ins falsche Konto.

| | |
|---|---|
| Pixel-ID | `8xPJTVXAKBvkNquUUUvoXE` („Kostenrechner Pixel") |
| SDK | `https://bzrcdn.openai.com/sdk/oaiq.min.js` |
| Lader | `project 3/app/layout.tsx`, Script-ID `oaiq-consent` |
| Ereignis | `project 3/lib/oaiq.ts` → `meldeAnfrage()` |
| Auslöser | `project 3/app/result/page.tsx`, direkt neben `dataLayer.push({event:"angebot_erfolgreich"})` |
| Test | `src/__tests__/oaiq.test.ts` (Cross-App-Import, läuft im Pflicht-Check) |

## Einwilligung

Der Pixel hängt am Schalter **„Marketing"** des Cookie-Banners
(`primundus_cookie_consent`, Feld `consent.marketing`). Dieser Schalter
existierte seit jeher im Banner, hat bis zum 02.09.2026 aber nichts geladen.

Anders als bei GA4 wird das SDK **ohne Einwilligung gar nicht geholt**, nicht
etwa geladen und stummgeschaltet: es legt beim Start eigene Kennungen an
(Cookie + localStorage), und die dürfen vor der Entscheidung des Besuchers
nicht entstehen.

Daraus folgt eine bewusste Asymmetrie:

- **Zustimmung** (beim Laden der Seite oder später über
  `cookie-consent-changed`) → SDK laden, `init`, `consent: true`.
- **Widerruf** → das SDK liegt schon im Speicher und lässt sich nicht mehr
  entladen. Es bekommt `consent: false` und stellt das Senden ein.

Weil `window.oaiq` ohne Einwilligung schlicht nicht existiert, ist die
Funktionsprüfung in `meldeAnfrage()` **gleichzeitig das Consent-Gate**. Es gibt
genau eine Stelle, an der die Einwilligung ausgewertet wird (den Lader) — keine
zweite Bedingung, die davon abdriften könnte.

## Ereignisnamen sind nicht frei wählbar

Das SDK bildet Namen fest auf Typen ab und **verwirft Unbekanntes still** — ein
Tippfehler wäre also unsichtbar. Aus dem ausgelieferten Bundle gelesen
(02.09.2026):

| Name | Typ |
|---|---|
| `appointment_scheduled` | `customer_action` |
| `checkout_started` | `contents` |
| `contents_viewed` | `contents` |
| `custom` | `custom` |
| `items_added` | `contents` |
| **`lead_created`** | **`customer_action`** ← unser Ereignis |
| `order_created` | `contents` |
| `page_viewed` | `contents` |
| `registration_completed` | `customer_action` |
| `subscription_created` | `plan_enrollment` |
| `trial_started` | `plan_enrollment` |

`customer_action` nimmt **nur** `type`, `amount`, `currency` an. Der vierte
Parameter (eventOptions) kennt `event_id`, `custom_event_name`, `opt_out`.
Währung muss dreistellig sein (`/^[A-Za-z]{3}$/`).

Der Beispielschnipsel im Einrichtungsdialog zeigt `registration_completed` —
das ist für uns falsch, wir erzeugen keine Registrierungen.

## Textlängen: die Felder lügen

Die Zähler am Feld zeigen 50 (Titel) und 100 (Beschreibung). Die Warnung
„Der Anzeigentext wird in einigen Platzierungen möglicherweise abgeschnitten"
kommt aber **weit früher**. Am 03.09.2026 im Anzeigenmanager ausgemessen:

| Feld | Feldlimit | **ohne Warnung** |
|---|---|---|
| Titel | 50 | **≤ 24 Zeichen** (ab 25 Warnung) |
| Beschreibung | 100 | **≤ 48 Zeichen** (ab 49 Warnung) |

Es zählt die **Zeichenzahl, nicht die Breite** — 40 schmale „i" lösen die
Warnung aus, 20 breite „W" nicht. Beide Felder werden unabhängig voneinander
bewertet.

Wer die Grenze überschreitet, verliert das Satzende in der ChatGPT-Antwort —
und damit meistens genau die Aussage, wegen der die Anzeige geschrieben wurde.
Praktisch heißt das: **die Pointe muss in die ersten 24 bzw. 48 Zeichen.**

## Warum 20 € und nicht der Eigenanteil

`WERT_ANFRAGE_EUR = 20` folgt Martins fester Staffelung (Anfrage 20, Profil 90,
Buchung 250) — dieselbe wie bei Google Ads.

Der Eigenanteil aus der Kalkulation wäre an der Stelle greifbar (die eigene
Analytik schreibt ihn mit) und liegt bei 2.000–3.000 €. Als Conversion-Wert
würde er dem Gebotssystem erzählen, ein teurer Pflegefall sei uns mehr wert als
ein günstiger. Ist er nicht: die Marge entsteht später, nicht am Formular. Ein
Test in `oaiq.test.ts` nagelt den Wert fest.

## Kanal-Attribution am Lead (seit 09.09.2026)

Google-Leads erkennt man an `leads.gclid/wbraid/gbraid`. ChatGPT-Klicks bringen
seit dem 11.09.2026 nachweislich eine Klick-Kennung mit — OpenAI hängt
`?oppref=…&olref=…` an jeden Anzeigenklick (GA4: 41 von 42 Landings; unsere
`analytics_sessions.landing_page` speichert nur den Pfad, deshalb war das dort
unsichtbar). Dazu die UTM-Werte, die die Anzeigengruppe anhängt
(`utm_source=chatgpt&utm_medium=cpc&utm_campaign=24h_pflege&utm_content={ad_id}&utm_term={ad_group_id}`).
Deshalb merkt sich `lib/analytics.ts` seit dem 09.09. neben den Klick-IDs auch
`utm_source/medium/campaign` in `sessionStorage` (`_prim_ad_params`), und
`angebot-anfordern/route.ts` schreibt alle fünf UTM-Werte per best-effort
Update auf den Lead (Migration `20260909110000_leads_utm_herkunft.sql`,
nullable Spalten `leads.utm_*`).

Auswertung: `leads.utm_source = 'chatgpt'` = ChatGPT-Lead, `gclid/wbraid/gbraid`
= Google-Lead, Rest = organisch/direkt. Sitzungen je Kanal stehen wie bisher in
`analytics_sessions.utm_source`. Skript für den Vergleich beider Kanäle:
`.claude/skills/sea-lauf/scripts/kanal_vergleich.py` (Ausgaben, Klicks,
Sitzungen, Leads, Profile, Kosten je Lead).

## Serverseitig: Conversions API über `oppref` (seit 11.09.2026)

**Befund 11.09.:** 72 ChatGPT-Sitzungen, 0 Leads, 0 Conversions im Manager.
Selbst wenn Leads kämen, sähe OpenAI sie fast nie: der Pixel lädt nur mit
Marketing-Einwilligung (6 von 72 Sitzungen). Google hat für dasselbe Problem
den Offline-Upload mit der gclid — OpenAI hat die **Conversions API**
(`POST https://bzr.openai.com/v1/events?pid=<Pixel-ID>`, `Authorization:
Bearer <Conversion-Schlüssel>`, Doku developers.openai.com/ads/conversions-api).

Kette:

| Schritt | Wo |
|---|---|
| `oppref` aus der Landing-URL merken (sessionStorage `_prim_ad_params`, wie gclid) | `project 3/lib/analytics.ts` (`AD_PARAM_KEYS`) |
| … an den Lead schreiben (best-effort Update, Spalte `leads.oppref`) | `app/api/angebot-anfordern/route.ts` (`HERKUNFT_KEYS`), Migration `20260911123000` |
| alle 15 Minuten `lead_created` je Lead mit `oppref` melden, Buchführung in `openai_conversion_uploads` | Edge Function `supabase/functions/openai-conversions` (pg_cron `openai-conversions`) |

Das Ereignis trägt **nur** `id` (= lead_id, dedupliziert mit dem Pixel-`event_id`),
`type: lead_created`, `timestamp_ms`, `oppref`, `source_url`, `action_source: web`
und `data {customer_action, 2000, EUR}`. **Keine Personendaten** — kein
`user`-Objekt, keine gehashte E-Mail, keine IP. Das ist bewusst dieselbe
Grenze wie beim Google-Upload; das `user`-Objekt der API (E-Mail/Telefon
SHA-256) bleibt eine Entscheidung mit Datenschutztext, nicht ein Default.

Betrieb: Schlüssel = Supabase-Secret `OPENAI_ADS_CAPI_KEY` (Manager → Conversions
→ Conversion-Schlüssel → „Neuen Schlüssel erstellen"; Staging hat keinen →
Function antwortet `{skipped}`). Vertragstest ohne Speichern:
`{"validateOnly": true}`; nur zählen: `{"dryRun": true}`. 400/404/422 =
`permanent_failure` mit Notiz, 401/403/429/5xx/Netz = nächster Lauf.
Cron-Fenster 6 Tage (die API nimmt 7).

## Wert in der kleinsten Einheit (Cent)

`amount` ist laut Conversions-API-Doku die **kleinste Einheit** („4200 =
$42.00"), und das Pixel teilt sich die Datenform. Bis zum 11.09.2026 ging im
Pixel `20` mit — OpenAI las 0,20 € je Anfrage. Seitdem `WERT_ANFRAGE_MINOR =
2000` in `lib/oaiq.ts`, `public/pria.html` und `capi.ts` (Test nagelt alle drei
auf 2000 fest).

## Wo `lead_created` gemeldet wird (seit 10.09.2026)

An **drei** Stellen, immer erst nach erfolgreichem Anlegen des Leads und vor
dem Redirect ins Portal:

| Pfad | Stelle |
|---|---|
| Wizard (Kostenrechner) | `components/calculator/MultiStepForm.tsx`, direkt vor dem dataLayer-Push `angebot_erfolgreich` — `meldeAnfrage(window.oaiq, leadId)` |
| Pria-Chat | `public/pria.html` (→ `pria-widget.js`), Inline-Aufruf mit denselben Werten wie `meldeAnfrage` — Name, Typ und Betrag dort synchron halten |
| alte `/result`-Seite | `app/result/page.tsx` — historisch, der Wizard erreicht sie seit dem Direkt-Redirect nicht mehr |

**Befund 10.09.2026 (Tages-Check):** Bis dahin stand der Aufruf NUR auf der
`/result`-Seite. Ergebnis: eine Woche Kampagne, ~50 Klicks, Datenquelle
„Kostenrechner Pixel" mit **0 Ereignissen** — das SDK sendet von sich aus nur
`sdk_init`/`diagnostic`, keine Seitenaufrufe, und die drei Warnhinweise im
Manager („Keine aktuellen Conversion-Ereignisse") waren die Folge. Der
Redirect ist kein Problem: das SDK schickt mit `fetch keepalive` und
`sendBeacon` bei `pagehide`.

**Regel:** Jeder neue Lead-Pfad (Chat, Formular, Landingpage) meldet
`lead_created` selbst — der Pixel sieht nichts automatisch.

## Was noch offen ist

1. **Ziel der Kampagne steht auf „Klicks", nicht „Conversions".** Ohne
   gemessene Conversions kann das Gebotssystem nicht darauf optimieren.
   Umstellen, sobald der Pixel auf prod meldet — Conversion-Ereignis im
   Anzeigenmanager unter Tools → Conversions anlegen, dann Kampagnenziel.
2. **UTM.** Anzeigen und Anzeigengruppe tragen
   `utm_source=chatgpt&utm_medium=cpc&utm_campaign=openai_ads&utm_content={ad_id}&utm_term={ad_group_id}`.
   Damit ist ChatGPT-Traffic in GA4 und der eigenen Analytik sauber getrennt —
   anders als der Google-Traffic, der jahrelang ohne UTM lief und in „google /
   organisch" verschwand.
3. **Rückkanal seit 11.09.2026 für die Anfrage** (`openai-conversions`, siehe
   oben). Noch offen: qualifizierte Leads (Profil) und Buchungen wie bei
   Google nachmelden — die API kennt dafür `custom`-Ereignisse mit
   `custom_event_name`; erst sinnvoll, wenn die Kampagne auf Conversions
   optimiert.
4. **Apex** (`primundus.de`) hat kein Pixel. Ein Besucher, der von der Anzeige
   auf den Kostenrechner kommt und dann zum Apex wechselt, ist für OpenAI weg.
   Solange die Anzeigen nur auf den Rechner zeigen, ist das folgenlos.
