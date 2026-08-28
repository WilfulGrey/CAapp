# Customer portal flow — kostenrechner → CAapp → mamamia

Dokument referencyjny: dokładny przepływ danych od momentu, w którym klient
otwiera kalkulator Primundus, do momentu w którym CAapp zaproszenie pielęgniarki
trafia do mamamii. Jeden source of truth — jeśli kod się rozjedzie z tym
dokumentem, dokument do aktualizacji.

Stan kodu: `integration/mamamia-onboarding`, ostatnie sweepy K1–K7 (kwiecień–maj 2026).

---

## Spis treści

1. [Architektura — schemat blokowy](#architektura--schemat-blokowy)
2. [Stage A: kostenrechner (`project 3/`)](#stage-a-kostenrechner-project-3)
3. [Wiersz `leads` po Stage A](#wiersz-leads-po-stage-a)
4. [Stage B: CAapp boot (`src/`)](#stage-b-caapp-boot-src)
5. [Edge Function `onboard-to-mamamia`](#edge-function-onboard-to-mamamia)
6. [Edge Function `mamamia-proxy` — wszystkie akcje](#edge-function-mamamia-proxy--wszystkie-akcje)
7. [Round-tripy do mamamii — sumarycznie](#round-tripy-do-mamamii--sumarycznie)
8. [Security boundaries](#security-boundaries)
9. [Powiązane dokumenty](#powiązane-dokumenty)

---

## Architektura — schemat blokowy

```
┌────────────────────────────────────────────────────────────────────────────────┐
│   USER (browser)                                                               │
└──┬─────────────────────────────────────────────────────────────────────────────┘
   │ 1. wypełnia 10 pytań
   ▼
┌─────────────────────────────┐
│  KOSTENRECHNER              │
│  kostenrechner-beta         │
│  (Next.js, project 3/)      │
└──┬──────────────────────────┘
   │ 2. POST /api/angebot-anfordern
   │    { vorname, email, telefon, kalkulation { formularDaten {...} } }
   ├─► Supabase: INSERT/UPDATE leads
   │   fire-and-forget: SMTP Eingangsbestätigung + +15min PDF
   │   zwraca { leadId, token, portalUrl }
   │
   │ 3. window.location.assign(portalUrl)
   ▼
┌─────────────────────────────┐
│  CAapp                      │
│  caapp-beta/?token=X        │
│  (Vite/React, src/)         │
└──┬──────────────────────────┘
   │ 4. GET /rest/v1/leads?token=eq.X  ──►  Supabase.leads
   │ 5. POST /functions/v1/onboard-to-mamamia { token }
   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EDGE FUNCTION  onboard-to-mamamia                                           │
│                                                                              │
│  ① fetchLead(token, service role)                                            │
│  ② if mamamia_customer_id IS NOT NULL  →  CACHE HIT, return                  │
│  ③ CACHE MISS:                                                               │
│     LoginAgency      ───►  MAMAMIA /graphql/auth                             │
│     Locations(plz)   ───►  MAMAMIA /graphql                                  │
│     StoreCustomer    ───►  MAMAMIA /graphql   (formularDaten + lead.* + def) │
│     StoreJobOffer    ───►  MAMAMIA /graphql                                  │
│     UPDATE leads SET mamamia_*                                               │
│  ④ Sign session JWT → Set-Cookie session=…; HttpOnly; SameSite=None          │
└────┬─────────────────────────────────────────────────────────────────────────┘
     │ 6. response { customer_id, job_offer_id } + cookie
     ▼
┌─────────────────────────────┐
│  CAapp (renders portal)     │
└──┬──────────────────────────┘
   │ 7. wszystkie kolejne wywołania przez proxy z cookie
   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EDGE FUNCTION  mamamia-proxy   (verify cookie → dispatch action)            │
│                                                                              │
│  READS   getCustomer / getJobOffer / listApplications / listMatchings        │
│          listInvitedCaregiverIds / getCaregiver / searchLocations            │
│                                                                              │
│  WRITES  updateCustomer (Save patient form, + PRESERVE_QUERY)                │
│          rejectApplication / storeConfirmation                               │
│                                                                              │
│  ───►  MAMAMIA /graphql  (Bearer agency-jwt server-side only)                │
│                                                                              │
│  WRITE inviteCaregiver  ───►  MAMAMIA /backend/graphql  (panel/Sanctum)      │
└──────────────────────────────────────────────────────────────────────────────┘

Trust boundary: agency-jwt NIGDY nie trafia do przeglądarki.
Browser ↔ edge function:  HttpOnly cookie session=<JWT>, SameSite=None, Secure.
Edge function ↔ mamamia:  Bearer <agency-jwt>, refreshed via LoginAgency.
```

---

## Stage A: kostenrechner (`project 3/`)

Next.js 13 SSR, deployowane na `kostenrechner-beta.onrender.com` z brancha
`integration/mamamia-onboarding`.

### Co user wypełnia (10 kroków)

> ⚠️ **Stale (stan sprzed PR #428, Funnel-Redesign 10.08.):** wizard ma dziś
> Warm-up-Frage („Für wen suchen Sie Betreuung?", nie trackowana jako step)
> + 8 pytań + Kontaktformular (`totalSteps = 9`); `careStartTiming` wypadł
> z wizarda (pyta o niego patient form w CAapp). Tabela niżej opisuje
> nadal poprawnie ZBIERANE POLA (formularDaten), ale numeracja kroków
> jest historyczna.

`project 3/components/calculator/MultiStepForm.tsx`:

| # | Pole | Wartości |
|---|---|---|
| 1 | `careStartTiming` | `sofort` / `2-4-wochen` / `1-2-monate` / `unklar` |
| 2 | `patientCount` | `1-person` / `ehepaar` |
| 3 | `householdOthers` | `ja` / `nein` (inne niż patientCount — to inne ne-pacjenty w domu) |
| 4 | `pflegegrad` | `0` / `1` / `2` / `3` / `4` / `5` |
| 5 | `mobility` | `mobil` / `rollator` / `rollstuhl` / `bettlaegerig` |
| 6 | `nachteinsaetze` | `nein` / `gelegentlich` / `taeglich` / `mehrmals` |
| 7 | `deutschkenntnisse` | `grundlegend` / `kommunikativ` / `sehr-gut` (label w UI: **„Gut"**, 450 €/Mo → `level_3`; wyższy grad „Sehr gut" 600 €/Mo = `level_4` NIE jest wybieralny w formularzu — tylko SA-Portal) |
| 8 | `fuehrerschein` | `ja` / `nein` |
| 9 | `geschlecht` (preferowana opiekunka, NIE płeć pacjenta) | `egal` / `weiblich` / `maennlich` |
| 10 | Kontakt | `vorname`, `email`, `telefon`, `accept_privacy` |

### Tracking Stage A (analytics_*, Bug #33)

`lib/analytics.ts` pisze bezpośrednio (anon key) do `analytics_sessions` /
`analytics_events` / `analytics_conversions`. Wizard-Events:
`warmup_answered`, `step_view` / `step_complete` (step 1–9, step 9 =
`contact_form`), `step_back`.

- **`step_complete(9)` = ERFOLGREICHER Submit** (seit Bug #33). Feuert nicht
  mehr in `handleNext` (dort feuerte es auch bei fehlgeschlagener
  Validierung), sondern nach Server-Erfolg in `handleSubmit` — zusammen mit
  der `angebot_angefordert`-Conversion in EINEM `navigator.sendBeacon` an
  `/api/analytics/critical-event` (Fallback `fetch keepalive`). Grund: der
  Sofort-Redirect ins Portal killte vorher ~50 % dieser Inserts.
- **Redirect ist GTM-sicher:** `dataLayer.push('angebot_erfolgreich')` mit
  `eventCallback` + `eventTimeout: 700` + Safety-`setTimeout(900)` vor
  `window.location.assign` — der Google-Ads-Conversion-Tag (GTM) bekommt
  Zeit zu feuern, Adblocker blockieren nur den Tag, nie den Redirect.
- **Ad-Parameter:** `gclid`/`wbraid`/`gbraid`/`utm_term`/`utm_content` aus
  der Landing-URL landen per best-effort Update auf `analytics_sessions`
  (utm_source/medium/campaign standen schon im Insert) + in sessionStorage
  `_prim_ad_params` für den Lead-Submit. Setup: [google-ads-tracking.md](google-ads-tracking.md).

**Czego kalkulator NIE zbiera** (ważne — dlatego onboard wstrzykuje defaulty,
a patient form w CAapp dopełnia później):

- `anrede` pacjenta (Frau/Herr) — onboard fallback do `"female"`
- waga, wzrost pacjenta — onboard wstrzykuje `DEFAULT_WEIGHT="61-70"`,
  `DEFAULT_HEIGHT="161-170"`
- demencja, inkontynencja, lift_id (Heben erforderlich)
- adres / PLZ / Ort — patient form wypełni przez `updateCustomer`
- gearbox (Schaltung/Automatik) — onboard wstrzykuje `"automatic"`, patient
  form nadpisuje przez `wunschGetriebe`
- haushalt, urbanisation, wohnungstyp, unterbringung, internet, Pflegedienst,
  Tiere — onboard wstrzykuje hardkodowane defaulty (patrz tabela §5)

### Submit kalkulatora

`project 3/app/result/page.tsx:140`:

```http
POST /api/angebot-anfordern
Content-Type: application/json

{
  "vorname":  "<imię>",
  "email":    "<email>",
  "telefon":  "<phone | null>",
  "careStartTiming": "<sofort|...>",
  "kalkulation": {
    "bruttopreis":      <number>,
    "eigenanteil":      <number>,
    "zuschüsse":        { "items": [...], "gesamt": <number> },
    "aufschluesselung": [{ kategorie, antwort, label, aufschlag }, ...],
    "formularDaten": {
      "betreuung_fuer":    "1-person" | "ehepaar",
      "pflegegrad":        <number>,
      "weitere_personen":  "ja" | "nein",
      "mobilitaet":        "<state.mobility>",
      "nachteinsaetze":    "<state.nightCare>",
      "deutschkenntnisse": "<state.germanLevel>",
      "erfahrung":         "<state.experience>",
      "fuehrerschein":     "<state.driving>",
      "geschlecht":        "<state.gender>"
    }
  }
}
```

### Co robi `/api/angebot-anfordern`

`project 3/app/api/angebot-anfordern/route.ts:62`:

1. Walidacja `vorname` / `email` / `kalkulation`
2. Split `vorname` → `vorname` + `nachname`, detect `anrede` z imienia
   (`detectGenderFromName`)
3. **`findOrCreateLead(email, 'angebot_requested', {...})`** — upsert do
   Supabase `leads`:
   - email już istnieje → `isUpgrade=true`, nowy token
   - nowy email → `isNew=true`, status `angebot_requested`
   - generuje `token` (32 znaki, **14 dni TTL**)
   - **`source`** = `body.quelle || 'rechner'` (27.08.2026). Formularz nic nie
     wysyła ⇒ `'rechner'`; czat Prii na `/sofortangebot` wysyła `'pria-chat'`
     (`app/api/pria/lead/route.ts`). Ustawiane TYLKO przy pierwszym insercie —
     wracający lead zachowuje swoje pierwotne źródło.
4. **Fire-and-forget** (klient na nie nie czeka):
   - Eingangsbestätigung przez Ionos SMTP
   - `scheduleAngebotsEmail` → POST do edge function `schedule-email`
     z `delay_minutes: 15` (PDF z ofertą)
   - `info@primundus.de` notification — wiersz **„Kam über"** w sekcji
     Kontaktdaten pokazuje, z której strony przyszło zapytanie
     (`getTeamNotificationTemplate(lead, status, { quelle })`; bez `quelle`
     fallback na `lead.source`, więc maile o późniejszych statusach też
     pokazują pochodzenie). Powód: podczas testu landing page zespół musi
     widzieć w mailu, czy klient wypełnił formularz, czy rozmawiał z Prią.
   Ten sam `source` napędza blok *Über welche Seite kam der Lead?* w porannym
   raporcie (`supabase/functions/daily-analytics-report`, pole `leadsBySource`):
   od 28.08.2026 jako WYKRES slupkowy zamiast tabeli (decyzja Marcina: tabele
   z maila wylatuja). Obok niego dwa dalsze wykresy: *Leads je Tag* z podzialem
   na leady z wypelnionym profilem i bez (`fetchLeadCohorts` - grupowanie po
   dniu PRZYJSCIA leada, nie po dniu wypelnienia profilu; ostatnie dwa slupki
   moga jeszcze urosnac) oraz conversion dzien po dniu. Blok trzech wariantow
   testu znika, gdy zadna ze stron czatu nie miala ruchu. To INNY wymiar niż `wizardOpenedBySource` w tym samym
   raporcie: tamto to PRZYCISK otwierający wizard, to jest STRONA, z której
   przyszło zapytanie.
5. Build `portalUrl = ${NEXT_PUBLIC_PORTAL_URL}/?token=<lead.token>`

### Response

```json
{
  "success": true,
  "leadId":  "<uuid>",
  "isNew":   true,
  "isUpgrade": false,
  "emailDispatched": true,
  "token":   "<32-char-token>",
  "portalUrl": "https://caapp-beta.onrender.com/?token=<token>",
  "message": "Angebot angefordert"
}
```

### Hand-off

`project 3/app/result/page.tsx`: `window.location.assign(portalUrl)`
**bez success screen, bez countdown** (Bug #12 fix). Klient natychmiast
ląduje w CAapp z tokenem w URL.

E-mail z linkiem leci równolegle (Eingangsbestätigung), ale **nie jest drogą
przejścia** — klient nie czeka na maila.

---

## Wiersz `leads` po Stage A

Supabase project `ycdwtrklpoqprabtwahi`, tabela `leads`:

```
id                    uuid                    -- lead.id z findOrCreateLead
email                 <email>
vorname, nachname     <parsed>
anrede                <detected from vorname>
telefon               <phone | null>
status                'angebot_requested'     -- pełen cykl: info_requested |
                                              -- angebot_requested | folge_einsatz |
                                              -- vertrag_abgeschlossen |
                                              -- betreuung_beauftragt | nicht_interessiert
token                 <32 chars>              -- magic-link
token_expires_at      now() + 14 days
token_used            false
care_start_timing     sofort | 2-4-wochen | 1-2-monate | unklar
kalkulation           jsonb                   -- całe `kalkulation` z body API

-- mamamia onboarding cache (wypełnione przez onboard-to-mamamia)
mamamia_customer_id   integer  NULL
mamamia_job_offer_id  integer  NULL
mamamia_user_token    text     NULL
mamamia_onboarded_at  timestamptz NULL

-- follow-up discovery (Bug #25, cron detect-caregiver-events)
mamamia_jobs_checked_at timestamptz NULL      -- ostatnia sonda "czy Mamamia
                                              -- otworzyła nowy job?" (takt 6h)

-- Google-Ads-Attribution (Bug #33, migracja 20260814090000)
gclid                 text NULL               -- Google-Klick-ID z landing-URL
wbraid, gbraid        text NULL               -- iOS-Varianty klick-ID
```

**Klick-IDs (Bug #33):** `MultiStepForm` schickt beim Submit
`adParams` (sessionStorage `_prim_ad_params`, befüllt von
`lib/analytics.ts` aus der Landing-URL). Die Route allowlistet
`gclid`/`wbraid`/`gbraid` (≤200 Zeichen) und schreibt sie als
**separates best-effort Update** nach `findOrCreateLead` — Lead-Erstellung
scheitert nie an fehlenden Spalten, Re-Submit mit neuer Klick-ID
überschreibt (letzter Klick gewinnt). Zweck: Offline-Conversion-Import
qualifizierter Leads zu Google Ads — Setup-Anleitung in
[google-ads-tracking.md](google-ads-tracking.md).

**Status `folge_einsatz` (Bug #25):** ustawiany WYŁĄCZNIE przez fazę discovery
crona detect — lead z zamkniętym statusem (`vertrag_abgeschlossen` /
`betreuung_beauftragt`) lub wygasłym tokenem, dla którego Mamamia otworzyła
NOWY job `geplant`. Lead wraca do active-setu crona (skan Bewerbungen + maile,
**także z wygasłym tokenem** — martwy link w mailu ⇒ ExpiredLinkScreen ⇒
self-service „Neuen Link senden", działa bo `folge_einsatz` ∉ CLOSED_STATUSES;
świadomie ZERO auto-przedłużania tokenu). Poziom w `statusOrder` = 2 (jak
`angebot_requested`) — ponowny submit kalkulatora aktualizuje istniejący lead
zamiast tworzyć drugi wiersz. `nicht_interessiert` nigdy nie wchodzi do
discovery. Audit: event `folge_einsatz_detected` w `lead_events`.

```

-- stage-B fields ("Betreuung beauftragen" form, nie używane w MVP)
patient_zip           NULL
patient_anrede/vorname/nachname/street/city  NULL
```

Kolumny `mamamia_*` dodane migracją
[`20260423120000_add_mamamia_ids_to_leads.sql`](../supabase/migrations/20260423120000_add_mamamia_ids_to_leads.sql).

---

## Stage B: CAapp boot (`src/`)

Vite + React 18 + TS, `caapp-beta.onrender.com/?token=X`.

### B.1 Pobranie leada (Supabase REST z anon key)

`src/pages/CustomerPortalPage.tsx:49` → `src/lib/supabase.ts:62`:

```http
GET https://ycdwtrklpoqprabtwahi.supabase.co/rest/v1/leads?select=*&token=eq.<token>
apikey: <anon>
Authorization: Bearer <anon>
```

Zwraca cały wiersz `leads`. Tani (~150–300 ms).

### B.2 Onboard do mamamii

`src/hooks/useMamamiaSession.ts:51` → `src/lib/mamamia/client.ts:44`:

```http
POST https://ycdwtrklpoqprabtwahi.supabase.co/functions/v1/onboard-to-mamamia
credentials: include
apikey: <anon>
Authorization: Bearer <anon>
Content-Type: application/json

{ "token": "<lead.token>" }
```

(szczegóły co edge function robi → §5)

### B.3 Wszystkie kolejne wywołania → `mamamia-proxy`

`src/lib/mamamia/client.ts:68`:

```http
POST https://ycdwtrklpoqprabtwahi.supabase.co/functions/v1/mamamia-proxy
credentials: include      ← cookie session=<JWT>
apikey: <anon>
Authorization: Bearer <anon>
Content-Type: application/json

{ "action": "<name>", "variables": {...} }
```

(szczegóły poszczególnych akcji → §6)

---

## Edge Function `onboard-to-mamamia`

Lokalizacja: `supabase/functions/onboard-to-mamamia/`. Wywoływana przez CAapp
przy każdym otwarciu portalu (cache-aware).

### Sekwencja ([onboard.ts:151](../supabase/functions/onboard-to-mamamia/onboard.ts:151))

#### ① Lookup leada (Supabase service role)

```sql
SELECT * FROM leads
 WHERE token = '<token>'
   AND token_expires_at > now()
```

Brak wiersza → 401 `invalid-token`.

#### ② Cache hit guard

Jeśli `lead.mamamia_customer_id IS NOT NULL` AND `mamamia_job_offer_id IS NOT
NULL` → return natychmiast `{ customer_id, job_offer_id }`. **Kroki ③–⑥
poniżej lecą TYLKO przy pierwszym wejściu klienta.**

**Wybór joba sesji (Multi-Job):** `job_offer_id` w sesji ≠ ślepo
`lead.mamamia_job_offer_id`:
1. jawny deeplink `?job=<lead_jobs.id>` (przegląd `?view=jobs`) → ten job
   (ownership-check po lead_id; obcy/nieznany → fallback niżej) — Variant A;
2. bez deeplinka → **AKTYWNY job = najnowszy `status='geplant'` z `lead_jobs`**
   (Opcja B, Dachs 8899 2026-07-22 — klient z gebuchtym starym jobem ma lądować
   na nowym einsatzu z jego Bewerbungami, nie na BookedScreen starej PK);
3. brak geplant / błąd lookupu → `lead.mamamia_job_offer_id` (fail-soft,
   Portal-Eintritt nigdy nie pęka). Front dodatkowo: `pickFinalConfirmedJob`
   jest STRICT per job sesji (fc innego joba nie kaperuje aktywnego), a link
   „Alle meine Einsätze" renderuje się też bez `?job=`, gdy lead ma >1 job.

**Deeplinki w mailach (Bug #25):** wszystkie maile o Bewerbungach doklejają
`&job=<lead_jobs.id>` do linku portalu — Mail A/B/C przez bridge
(`appendJobParam` w `project 3/lib/portal-url.ts` + lookup `lead_jobs` po
`metadata.mamamia_job_offer_id`), remindery przez `send-scheduled-emails`
(kopia helpera w `followupJobs.ts` — edge fn nie może importować z `lib/`).
Fail-soft: brak wiersza w mirrorze ⇒ plain link ⇒ i tak ląduje na najnowszym
geplant (punkt 2 wyżej). Metafora Michała: token = klucz do mieszkania,
`?job=` = pokój.

#### ③ LoginAgency (auth do mamamii, BEZ tokena)

```http
POST https://backend.beta.mamamia.app/graphql/auth
Content-Type: application/json

{
  "query": "mutation LoginAgency($email: String!, $password: String!, $remember: Boolean!) {
    LoginAgency(email: $email, password: $password, remember: $remember) {
      id name email token
    }
  }",
  "variables": {
    "email":    "<MAMAMIA_AGENCY_EMAIL>",
    "password": "<MAMAMIA_AGENCY_PASSWORD>",
    "remember": true
  }
}
```

Response:
```json
{ "data": { "LoginAgency": {
  "id": <agency-employee-id>,
  "name": "Primundus",
  "email": "<MAMAMIA_AGENCY_EMAIL>",
  "token": "<agency-jwt>"
}}}
```

JWT cachowany w pamięci edge function (per-instance) — kolejne onboardy
w tym samym warmupie reusują (`getOrRefreshAgencyToken` w
`_shared/mamamiaClient.ts`).

#### ④ Locations(search) — lookup PLZ

```http
POST https://backend.beta.mamamia.app/graphql
Authorization: Bearer <agency-jwt>

{
  "query": "query Locations($search: String!) {
    Locations(search: $search) { id zip_code location country_code }
  }",
  "variables": { "search": "<plz>" }
}
```

PLZ czytany z `lead.patient_zip` (zwykle null bo to stage-B) lub z
`formularDaten.{plz, postleitzahl, postal_code, zip, zip_code}` (kostenrechner
też nie wysyła). **W MVP zwykle PLZ = null** → `lookupLocationId` zwraca
`null` → `location_id` w StoreCustomer pozostaje null; patient form save
wypełni przez `UpdateCustomer.location_id` lub `location_custom_text`.

#### ⑤ StoreCustomer (minimalny payload — Bug #13 refactor)

[onboard.ts:STORE_CUSTOMER](../supabase/functions/onboard-to-mamamia/onboard.ts:49),
payload budowany w
[mappers.ts:buildCustomerInput](../supabase/functions/onboard-to-mamamia/mappers.ts):

```http
POST https://backend.beta.mamamia.app/graphql
Authorization: Bearer <agency-jwt>
```

**Bug #13 refactor (2026-05-07):** wcześniej onboard wysyłał ~25 hardkodowanych
defaultów żeby Customer od razu wpadł w `status='active'`. Klient widział je
jako preselect w patient form jakby je sam wybrał (narusza CLAUDE.md §1).
Po refactorze ZOSTAJE w payloadzie tylko to czego kalkulator faktycznie
zbiera + business defaulty (NIE pytania do klienta). Customer ląduje jako
`status='draft'`; patient form save (UpdateCustomer) flippa go na `'active'`
z prawdziwymi danymi. Verified live: Customer 7651 (`/tmp/test-minimal-storecustomer.mjs`).

**Variables — wszystkie pola w payloadzie:**

| Pole | Źródło | Komentarz |
|---|---|---|
| `first_name`, `last_name` | `lead.patient_*` (stage B) lub fallback `lead.vorname/nachname` | identity |
| `email`, `phone` | `lead.email`, `lead.telefon` | identity |
| `location_id` | wynik `Locations(plz)` lub `null` | tylko gdy stage-B podała PLZ |
| `language_id` | **stała `1`** (German) | business default |
| `visibility` | **stała `"public"`** | business default |
| `commission_agent_salary` | **stała `300`** | Primundus baseline (panel rejects 0) |
| `care_budget`, `monthly_salary` | `lead.kalkulation.bruttopreis` | real |
| `arrival_at` | derived z `care_start_timing` przez `OFFSET_DAYS` (sofort=+7d, 2-4-wochen=+21d, 1-2-monate=+45d, unklar=+30d) | derivation z real |
| `other_people_in_house` | `formularDaten.weitere_personen === "ja" ? "yes" : "no"` | real |
| `gender` (caregiver wish mirror) | `formularDaten.geschlecht` (`weiblich`→`female`, `maennlich`→`male`, `egal`→`not_important`) | real |
| `patients[]` | patrz tabela niżej | real care attrs |
| `customer_caregiver_wish` | `gender`/`germany_skill`/`driving_license` z formularDaten + `is_open_for_all: false` | real preferences |

**`patients[]`** ([mappers.ts:buildPatients](../supabase/functions/onboard-to-mamamia/mappers.ts)):

| Patient field | Źródło |
|---|---|
| `care_level` | `formularDaten.pflegegrad` lub default `2` |
| `mobility_id` | `MOBILITY_MAP[formularDaten.mobilitaet]` lub default `1` (mobil=1, gehstock=2, gehfaehig/gehhilfe/rollator=3, rollstuhl=4, bettlaegerig=5) |
| `lift_id` | derived z mobility (≥4 → 1=Yes, else 2=No) |
| `tool_ids` | derived z mobility (5→`[4,6]`, 4→`[3]`, 3→`[2]`, default `[1]`) |
| `night_operations` | `mapNightOperations`: nein→no, gelegentlich→occasionally, taeglich→up_to_1_time, mehrmals→more_than_2 |
| `year_of_birth` | tylko jeśli `formularDaten.geburtsjahr` jest number (w praktyce kalkulator nie wysyła) |

**Drugi pacjent** dorzucany TYLKO gdy `formularDaten.betreuung_fuer === "ehepaar"`
— dziedziczy care attrs Person 1 (kalkulator zbiera ONE set odpowiedzi dla pary).
`weitere_personen=="ja"` to INNE pytanie i NIE produkuje drugiego pacjenta.

**Co NIE leci w onboard payload (deferred do patient form save / acceptance):**

| Pole | Gdzie ląduje |
|---|---|
| `accommodation`, `caregiver_accommodated`, `urbanization_id`, `equipment_ids`, `day_care_facility`, `pets`, `is_pet_*`, `internet`, `has_family_near_by`, `smoking_household`, `job_description{,_de,_en,_pl}` | `UpdateCustomer` przy patient form save |
| patient: `weight`, `height`, `gender`, `dementia`, `incontinence_*`, `smoking`, `lift_description*`, `night_operations_description*`, `dementia_description*` | `UpdateCustomer` |
| wish: `smoking`, `shopping`, `tasks{,_de,_en,_pl}`, `shopping_be_done{,_de,_en,_pl}`, `driving_license_gearbox` | `UpdateCustomer.customer_caregiver_wish` |
| `customer_contract`, `invoice_contract`, `customer_contacts[]` | `StoreConfirmation` przy acceptance time (real contract identity z `AngebotPruefenModal` step 2) |

**Mamamia schema-level defaulty** (NIE od nas, ale wracają z `getCustomer`):
- `pets = "no_information"` — odróżnialne od user-pick (user picks → `pets="no"`)
- `caregiver_accommodated = "room_premises"` — TA SAMA wartość co user-pick;
  reverse mapper suppressuje gdy `Customer.status='draft'`. Patrz CLAUDE.md
  „Mamamia integration — gotchas i lekcje" §8.

Response:
```json
{ "data": { "StoreCustomer": {
  "id": <numeric>,
  "customer_id": "ts-18-<id>",
  "status": "draft"
}}}
```

#### ⑥ StoreJobOffer

```http
POST https://backend.beta.mamamia.app/graphql
Authorization: Bearer <agency-jwt>

{
  "query": "mutation StoreJobOffer(...) { StoreJobOffer(...) { id job_offer_id title status } }",
  "variables": {
    "customer_id":         <z StoreCustomer.id>,
    "service_agency_id":   18,
    "title":               "Primundus — <lead.nachname>",
    "description":         "Auto-created from Primundus kostenrechner",
    "salary_offered":      <lead.kalkulation.bruttopreis>,
    "salary_commission":   300,
    "visibility":          "public",
    "arrival_at":          "<YYYY-MM-DD>"
  }
}
```

Response:
```json
{ "data": { "StoreJobOffer": {
  "id": <numeric>,
  "job_offer_id": "ts-18-<cust>-<n>",
  "title": "...",
  "status": "search"
}}}
```

#### ⑦ Persist cache w Supabase

```sql
UPDATE leads SET
  mamamia_customer_id  = <StoreCustomer.id>,
  mamamia_job_offer_id = <StoreJobOffer.id>,
  mamamia_user_token   = <agency-jwt>,
  mamamia_onboarded_at = now()
WHERE id = <lead.id>
```

#### ⑦½ Push tokenu portalu do Mamamii (`UpdateCustomerToken` — best-effort)

Po zapisaniu cache onboard lustrzenie kopiuje `lead.token` (magic-link portalu) na
rekord klienta w Mamamii — mutacja **panel-only** `UpdateCustomerToken(id, token)`
przez sesję agency Sanctum (`${MAMAMIA_PANEL_URL}/graphql`, ta sama ścieżka co
`inviteCaregiver`). Cel: zespół Mamamii może po tokenie otworzyć portal klienta
(`kundenportal.primundus.de/?token=…`) i pomóc wypełnić formularz pacjenta. Odczyt
po stronie MM: query `CustomerToken(id)`.

- **Panel-only** — mutacji NIE ma na agency `/graphql` (zweryfikowane Mamamia MCP).
- **onboard czyta teraz `MAMAMIA_PANEL_URL`** (wcześniej tylko `mamamia-proxy`); bootstrap
  throw'uje gdy brak (Święta zasada nr 1).
- **Best-effort** — awaria panelu jest łapana (`console.warn`) i NIE blokuje onboardu.
  Wykonuje się tylko przy cache-miss. Kod:
  [onboard.ts:pushCustomerToken](../supabase/functions/onboard-to-mamamia/onboard.ts).

#### ⑧ Sign session JWT + Set-Cookie

[index.ts:71-90](../supabase/functions/onboard-to-mamamia/index.ts:71):

```http
HTTP 200 OK
Set-Cookie: session=<JWT>; HttpOnly; Secure; SameSite=None; Path=/
Content-Type: application/json

{ "customer_id": <int>, "job_offer_id": <int> }
```

JWT signed `SESSION_JWT_SECRET`em, payload:
```ts
{ customer_id, job_offer_id, lead_id, email }
```

`SameSite=None` jest **krytyczne** — CAapp i edge function są na różnych
domenach (`caapp-beta.onrender.com` vs `*.supabase.co`), default `Lax`
zignorowałby cookie cross-domain.

---

## Edge Function `mamamia-proxy` — wszystkie akcje

Lokalizacja: `supabase/functions/mamamia-proxy/`. Browser ↔ proxy: cookie
session HttpOnly. Proxy ↔ mamamia: agency-jwt (server-side only).

[index.ts:34](../supabase/functions/mamamia-proxy/index.ts:34) waliduje cookie,
dispatcher w [actions.ts:413-425](../supabase/functions/mamamia-proxy/actions.ts:413)
woła GraphQL.

Każda akcja waliduje **ownership**: zapytania ograniczone do
`session.customer_id` / `session.job_offer_id`, mutacje na cudzych
applications/jobs zwracają 403.

### READS

#### `getCustomer`
GraphQL: `Customer(id: $id)` z całym setem pól potrzebnych do prefilla
patient form (patrz [operations.ts:26](../supabase/functions/mamamia-proxy/operations.ts:26))
— customer + patients[] + customer_caregiver_wish + customer_contracts[] + equipments[].

`$id` wymuszany z `session.customer_id`.

#### `getJobOffer`
GraphQL: `JobOffer(id: $id)` —
`id, job_offer_id, status, title, salary_offered, arrival_at, departure_at,
applications_count, confirmations_count, created_at`.

`$id` z `session.job_offer_id`.

#### `listApplications`
GraphQL: `JobOfferApplicationsWithPagination(job_offer_id, limit, page)` —
zwraca `{ total, data: [{ application + caregiver }] }`. Mamamia zwraca
`AnonymousApplication` dla customer-side queries (agency-side fields jak
`rejected_at` / `is_active` strippowane).

`application.message` (hinweis rekrutera, np. „Die Pflegekraft reist mit
einem Hund") idzie **VERBATIM** do klienta — box „Hinweis der Agentur"
na karcie Bewerbung i w AngebotPruefenModal (krok 1, amber). Decyzja
Michała 2026-07-22 (Registry #22): zero filtrów i zero LLM-redakcji —
wcześniejsza warstwa (`application_intros` + Anthropic w proxy) została
usunięta; tabela została w DB, ale nikt jej nie czyta. Za treść pola
odpowiada Mamamia/rekruterzy.

> **⛔ AKTUALNIE WYŁĄCZONE** (2026-07-31, Registry #23 — część rekruterów
> wpisała tam treści nie dla klienta). Proxy **strippuje `message`** z
> odpowiedzi, dopóki nie ustawisz secretu `SHOW_APPLICATION_MESSAGE=1`
> (per env, bez redeployu). Wyłączone = pole nie opuszcza proxy, front nie
> ma czego renderować.

#### `listMatchings`
GraphQL: `JobOfferMatchingsWithPagination(job_offer_id, limit, page, filters, order_by)`
— zwraca `{ total, data: [{ id, percentage_match, is_show, is_best_matching, caregiver }] }`.

`JobOfferMatchingFiltersInputType` ma TYLKO boolean status flagi
(`is_request`, `is_like`, `is_match`, `is_rejected`) — **brak filtru po
gender/language**. Filtrowanie `wunschGeschlecht` po stronie frontendu.

#### `listInvitedCaregiverIds`
GraphQL: `JobOfferMatchingsWithPagination(filters: { is_request: true })`.
Proxy spłaszcza odpowiedź do `{ caregiver_ids: [<int>, ...] }`. Używane
do seedowania statusu `'invited'` po F5 / pierwszym wejściu.

#### `getCaregiver`
GraphQL: `Caregiver(id: $id)` z pełnym setem pól (nationality, hobbies,
personalities, mobilities, languagables, recent_assignments, avatar). Backed
przez frontend `caregiverCache` (TTL) — `prefetchCaregivers` woła ten endpoint
dla wszystkich widocznych matchings od razu po onboardzie.

#### `searchLocations`
GraphQL: `LocationsWithPagination(search, limit, page)` —
`{ data: [{ id, location, zip_code, country_code }] }`. Używane przez
autocomplete PLZ w patient form.

### WRITES

#### `updateCustomer` — Save patient form

**Dwa rzeczy się dzieją server-side zanim mutacja poleci do mamamii:**

1. **Strict allowlist pól** ([actions.ts:280-304](../supabase/functions/mamamia-proxy/actions.ts:280)).
   Allowlistowane top-level: `first_name, last_name, email, phone, location_id,
   location_custom_text, urbanization_id, job_description, accommodation,
   caregiver_accommodated, other_people_in_house, has_family_near_by,
   smoking_household, internet, day_care_facility, caregiver_time_off, pets,
   is_pet_dog, is_pet_cat, is_pet_other, equipment_ids, patients,
   customer_caregiver_wish`.
   Wewnątrz `customer_caregiver_wish` osobna whitelista: `gender, germany_skill,
   driving_license, driving_license_gearbox, smoking, shopping, tasks, tasks_de,
   other_wishes, other_wishes_de`.

2. **`PRESERVE_QUERY` auto-injection**
   ([actions.ts:330-406](../supabase/functions/mamamia-proxy/actions.ts:330)):
   mamamia traktuje pominięte associations jako **wyzeruj**. Proxy re-fetcha
   aktualny `Customer.equipments` jeśli klient nie podał `equipment_ids`,
   i per-patient `tools` dla pacjentów bez explicit `tool_ids`. Bez tego
   pierwszy patient form save kasowałby Wyposażenie (TV/Bathroom) +
   Pomoce (Rollator/Walking-stick).

Mutacja do mamamii:
```graphql
mutation UpdateCustomer(
  $id: Int, $first_name: String, $last_name: String, $email: String, $phone: String,
  $location_id: Int, $location_custom_text: String, $urbanization_id: Int,
  $job_description: String,
  $accommodation: String, $caregiver_accommodated: String,
  $other_people_in_house: String, $has_family_near_by: String,
  $smoking_household: String, $internet: String, $day_care_facility: String,
  $caregiver_time_off: String,
  $pets: String, $is_pet_dog: Boolean, $is_pet_cat: Boolean, $is_pet_other: Boolean,
  $equipment_ids: [Int],
  $patients: [PatientInputType],
  $customer_caregiver_wish: CustomerCaregiverWishInputType
) {
  UpdateCustomer(...) { id customer_id }
}
```

`$id` wymuszany z `session.customer_id`.

⚠️ **Mutacja WYMAGA `patients[]` w body** — bez tego Mamamia pada
z `"Internal server error"` i WSZYSTKIE inne pola też nie zapiszą się
(failure jest atomic). Mapper zawsze emituje `patches.patients` przynajmniej
z `id`.

**Bug #13a — Pola które patientFormMapper musi sam wypełnić** (form ich nie
zbiera ale Mamamia panel UI pokazuje jako puste / błędne):

- **weight/height format**: form używa en-dash `"70–90 kg"`, Mamamia panel
  dropdown enum używa ASCII hyphen — mapper normalizuje en-dash → hyphen
  (`"70-90 kg"`) przed wysłaniem.
- **`night_operations_description{,_de,_en,_pl}`**: gdy `night_operations !== 'no'`,
  mapper generuje 3-locale standardowy placeholder. Form nie ma free-text
  dla nocnych zadań; bez placeholdera Mamamia panel pokazuje pole opisu jako puste.
- **`job_description` auto-summary**: zawsze prepended do `job_description`,
  generowany z Pflegegrad/mobility/demenz/inkontinenz/nacht (DE only —
  Mamamia UpdateCustomer mutation nie ma `_de/_en/_pl` variants).
  Diagnosen + Pflegedienst segments dopisują się po summary.
- **`wish.shopping = 'no'`**: zawsze ustawiane (form nie pyta). Prod-most-common 43%.
- **`equipment_ids = [1, 2]`** (TV + Bathroom): zawsze ustawiane (form nie pyta).
  Najczęstszy zestaw w active prod.

#### `rejectApplication`
Najpierw proxy weryfikuje że `application_id` należy do `session.job_offer_id`:
```graphql
query AssertAppBelongs($job_offer_id: Int!) {
  JobOfferApplicationsWithPagination(job_offer_id: $job_offer_id, limit: 100, page: 1) {
    data { id }
  }
}
```
Potem:
```graphql
mutation RejectApplication($id: Int, $reject_message: String) {
  RejectApplication(id: $id, reject_message: $reject_message) {
    id rejected_at reject_message
  }
}
```

⚠️ Mamamia **nie ma mutacji do cofania** decline — żadnego `restore`/`unreject`/
`undo`. Decline jest finalne (przycisk „rückgängig machen" usunięty w K5).

#### `storeConfirmation` — akceptacja zgłoszenia (binding)

> **⚠️ REFACTOR 2026-07-22:** portal NIE woła już tej akcji z przeglądarki.
> Akcept wykonuje server-side sekwencja `sync-acceptance` (edge fn triggerowana
> przez bridge po atomowym zapisie acceptance; cron detect-caregiver-events jako
> gwarant): 1. UpdateCustomer(customer_contract) → 2. StoreConfirmation →
> 3. render PDF → 4. upload do MM po przetworzeniu confirmation. Pełny opis:
> [docs/vertrag-flow.md](vertrag-flow.md). Akcja w proxy ZOSTAJE (kompat dla
> starych zakeszowanych bundli — guard final_confirmation zapobiega dublom).

Też `assertApplicationBelongsToSession`. Pola `contract_patient` /
`contract_contact` przechodzą przez whitelisty `CONTRACT_PATIENT_ALLOWED`
i `CONTRACT_CONTACT_ALLOWED` ([actions.ts:159-189](../supabase/functions/mamamia-proxy/actions.ts:159)).

```graphql
mutation StoreConfirmation(
  $application_id: Int, $message: String, $is_confirm_binding: Boolean,
  $contract_patient: ContractPatientInputType,
  $contract_contact: ContractContactInputType,
  $patient_contracts: [ContractPatientInputType],
  $contract_contacts: [ContractContactInputType],
  $update_customer: Boolean,
  $file_tokens: [String]
) {
  StoreConfirmation(...) { id application_id is_confirm_binding }
}
```

Pola `contract_*` mapują 1:1 z step-2 `AngebotPruefenModal` w UI.

#### `inviteCaregiver` — innym kanałem (panel/Sanctum)

**Jedyna akcja która NIE używa zwykłego `/graphql`** — używa Mamamia panel
(Sanctum SPA) login + impersonate (`_shared/mamamiaPanelClient.ts`):

```graphql
mutation StoreRequest($caregiver_id: Int, $job_offer_id: Int, $message: String) {
  StoreRequest(...) { id caregiver_id job_offer_id message created_at }
}
```

Endpoint: panel `/graphql` z secret `MAMAMIA_PANEL_URL` (np.
`https://beta.mamamia.app/backend` na beta, `https://portal.mamamia.app/backend`
na preprod). Panel SPA Mamamii żyje na **osobnym subdomain'ie per tenant**,
nie da się derive'ować z `MAMAMIA_ENDPOINT` host'a. Wartość ustalana per-tenant
przez inspekcję DevTools Network w żywym panelu (Bug #17). Auth: agency-only
session cookie z osobnego loginu (Sanctum CSRF + `XSRF-TOKEN`).

Tło: K5/K6 historia. `SendInvitationCaregiver` jest customer-side mutacją
(wymaga customer JWT — niedostępny). `StoreRequest` na zwykłym `/graphql`
zwraca `Unauthorized` dla agency tokena. Panel-mode session pozwala — pod
warunkiem że Customer ma `status='active'` ORAZ JobOffer też jest active
(co osiągamy przez setting `Customer.arrival_at` w onboard).

### Tabela podsumowująca

| Action | Rodzaj | Endpoint mamamii | Auth |
|---|---|---|---|
| `getCustomer` | read | `/graphql` | agency-jwt |
| `getJobOffer` | read | `/graphql` | agency-jwt |
| `listApplications` | read | `/graphql` | agency-jwt |
| `listMatchings` | read | `/graphql` | agency-jwt |
| `listInvitedCaregiverIds` | read | `/graphql` | agency-jwt |
| `getCaregiver` | read | `/graphql` | agency-jwt |
| `searchLocations` | read | `/graphql` | agency-jwt |
| `updateCustomer` | write | `/graphql` | agency-jwt |
| `rejectApplication` | write | `/graphql` | agency-jwt |
| `storeConfirmation` | write | `/graphql` | agency-jwt |
| `inviteCaregiver` | write | **`/backend/graphql`** | **panel/Sanctum** |
| `generateCaregiverGermanDescription` | write (LLM) | `/graphql` | agency-jwt |

---

## Round-tripy do mamamii — sumarycznie

| Scenariusz | Wywołania mamamii | Czas |
|---|---|---|
| Pierwsze wejście klienta (cache miss) | 4 onboard (LoginAgency + Locations + StoreCustomer + StoreJobOffer) + panel push (csrf + LoginAgency + UpdateCustomerToken, best-effort) + ~5 readów (getCustomer, getJobOffer, listApplications, listMatchings, listInvitedCaregiverIds) | ~6–10 s |
| Drugie wejście (cache hit) | 0 onboard + ~5 readów | ~1 s |
| Save patient form | PRESERVE_QUERY (1 read) + UpdateCustomer (1 write) | ~500 ms–1 s |
| Akceptacja zgłoszenia | AssertAppBelongs (1 read) + StoreConfirmation (1 write) | ~500 ms–1 s |
| Zaproszenie pielęgniarki | panel LoginAgency + StoreRequest (2 round-tripy, inny kanał) | ~1–2 s |

---

## Security boundaries

```
Browser   ←─── HttpOnly cookie session=<JWT>; SameSite=None; Secure ───→  Edge Functions
Browser   ←─── apikey + Authorization Bearer (anon, public) ──────────→  Supabase REST
Edge Fn   ←─── service role key (env, server-side) ─────────────────→  Supabase admin
Edge Fn   ←─── Bearer agency-jwt (refreshed via LoginAgency) ────────→  Mamamia /graphql
Edge Fn   ←─── Sanctum session cookie (agency login) ────────────────→  Mamamia /backend/graphql
```

**Krytyczne:**
- `MAMAMIA_AGENCY_EMAIL` / `MAMAMIA_AGENCY_PASSWORD` / agency-jwt ZAWSZE
  server-side (env w Supabase secrets). NIGDY w przeglądarce.
- `SUPABASE_SERVICE_ROLE_KEY` ZAWSZE server-side. Używany w
  `onboard-to-mamamia` do bypass RLS przy lookup leada po tokenie.
- Cookie `session` musi mieć `SameSite=None; Secure; HttpOnly` — bez tego
  cross-domain (caapp-beta ↔ supabase.co) cichaczem nie wysyła.
- `mamamia-proxy` waliduje **ownership** każdej operacji
  (`session.customer_id` / `session.job_offer_id`). Klient nie może czytać/pisać
  cudzych danych.
- Allowlisty pól (`UPDATE_CUSTOMER_ALLOWED`, `WISH_ALLOWED`,
  `CONTRACT_PATIENT_ALLOWED`, `CONTRACT_CONTACT_ALLOWED`) chronią przed
  injectowaniem nieoczekiwanych pól od klienta.

---

## Powiązane dokumenty

- [CLAUDE.md](../CLAUDE.md) — project rules + gotchas (`patients[]` required, PRESERVE_QUERY,
  `SameSite=None`, etc.) + bug fixes registry (#1–#12)
- [customer-job-creation-flow.md](../customer-job-creation-flow.md) (repo root) — agency-side flow
  (SADASH manual customer/job creation) — INNE niż ten dokument
- [docs/integration-blockers.md](integration-blockers.md) — log discoveries 2026-04
  (rozstrzygnięte enum gotchas: `night_operations`, `accommodation`, etc.)
- [docs/patient-form-mapping-audit-2026-04-28.md](patient-form-mapping-audit-2026-04-28.md)
  — per-field audit (25/25 ok)
- [docs/mamamia-customer-fields-map.md](mamamia-customer-fields-map.md) — DB schema dump
  + fill-rates
- [caregiver-filtering-pipeline.md](../caregiver-filtering-pipeline.md) (repo root) — jak Mamamia
  matcher filtruje cgs

---

## Maintenance — kiedy aktualizować ten dokument

- Nowa akcja w `mamamia-proxy/actions.ts` → dodać do tabeli §6
- Zmiana w `onboard-to-mamamia/mappers.ts` (nowy default lub zmiana mapowania)
  → zaktualizować tabelę w §5 ⑤
- Nowy step w `MultiStepForm.tsx` → tabela w §2
- Zmiana migracji `leads` (nowe kolumny `mamamia_*` lub `patient_*`) → §3
- Zmiana `SESSION_JWT_SECRET` payload shape → §5 ⑧
