# CAapp — Project rules for Claude

## 🩸 Święta zasada nr 1: NO DUMB DATA, NO SOFT FALLBACKS

**Albo coś działa, albo nie.** Nie oszukujemy się sami hardkodowanymi
stub-danymi, demo modami, fixture fallbackami w środku produkcyjnego kodu,
ani mockami które „wyglądają jak działający portal" gdy realny backend leży.

### Zakazane

- Hardcodowane listy (nurses, applications, matchings, customers, offers,
  itd.) jako **fallback** gdy real data nie przychodzi — inicjalny `useState`,
  `?? MOCK_X`, `|| FAKE_Y`, `catch { return SEED }`.
- Komponenty które renderują „coś" z dumb-data gdy hook zwraca pustkę /
  błąd / `ready=false`. Milczący fallback = bug-masker.
- Pliki typu `src/data/*.ts` z seedami które trafiają do bundla produkcyjnego.
- Demo mode z hardkodem. Demo = real backend z test-accountem, nie inline
  fixture.
- Testowe fixtury w `test/` i `supabase/functions/*/_tests/` SĄ OK — one
  izolują test. Ale NIE importowane z `src/` do runtime'u.

### Wymagane

- Real backend or visible failure. Jeśli Mamamia nie odpowiada, pokazujemy
  błąd (toast / banner / error screen), **nie** mocka.
- Loading states dopóki real data leci. `null` / `[]` / empty state są
  dozwolone, ale tylko gdy to **prawdziwy stan** (brak aplikacji = pusta
  sekcja, nie 3 fake Anny).
- Error states gdy hook zwraca `error`. Widoczne dla usera.
- Feature flag typu `VITE_USE_MAMAMIA=0` (jeśli w ogóle) wyłącza FEATURE,
  nie zastępuje realnych danych fake'ami.

### Dlaczego to ma znaczenie

Soft fallback zamienia ewidentny bug w ciche kłamstwo. Portal pokazał
„Anna K. · Marta W. · 3 Bewerbungen aktiv!" gdy faktyczne `listApplications`
zwracało `[]` — bug z `SameSite=Lax` cookie był niewidoczny, bo demo
data udawała produkcję. To godziny debugowania które nie powinny się
wydarzyć.

Naruszenie tej zasady = regression. Review + rewrite.

---

## 🩸 Święta zasada nr 2: DOKUMENTACJA ŻYJE Z KODEM

**Każda zmiana dotykająca data flow / integracji / mappingu / schemy ZOBOWIĄZUJE
do aktualizacji dokumentacji w tym samym PR-ze.** Nie ma „zaktualizuję jutro".
Nie ma „dopiszę po review". Doc-drift jest gorszy niż brak dokumentacji — bo
ludzie ufają temu co przeczytają, a stare dokumenty kłamią z autorytetem.

### Pliki które MUSZĄ być w sync z kodem

| Co zmieniłeś | Plik(i) do aktualizacji |
|---|---|
| Nowy step w `MultiStepForm.tsx` lub zmiana wartości pola | [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §2 (Stage A) + §5 ⑤ (jeśli mapping do mamamii się zmienia) |
| Zmiana w `findOrCreateLead` lub schema `leads` | [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §3 |
| Nowy default lub zmiana mapowania w `onboard-to-mamamia/mappers.ts` | [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §5 ⑤ + Recent bug fixes registry (poniżej) |
| Nowa akcja w `mamamia-proxy/actions.ts` lub zmiana allowlisty | [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §6 + tabela podsumowująca |
| Zmiana `SESSION_JWT_SECRET` payload shape | [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §5 ⑧ |
| Nowy mamamia gotcha (np. nowy enum, validation, hidden requirement) | CLAUDE.md sekcja „Mamamia integration — gotchas i lekcje" + jeśli ma to wpływ na flow → [docs/customer-portal-flow.md](docs/customer-portal-flow.md) |
| Nowy anti-pattern (coś co nie zadziałało i nie chcemy żeby ktoś znów próbował) | CLAUDE.md sekcja „Anti-patterns" |
| Nowe pole w `PatientForm` interface lub `mapMamamiaCustomerToPatientForm` | CLAUDE.md sekcja „Field mapping reference" + [docs/customer-portal-flow.md](docs/customer-portal-flow.md) §6 (`getCustomer` / `updateCustomer`) |
| Bugfix (każdy) | CLAUDE.md sekcja „Recent bug fixes — registry" — kolejny numer, plik(i), one-line fix highlight |
| Nowa edge function lub usunięcie istniejącej | CLAUDE.md sekcja „Kluczowe pliki" + [docs/customer-portal-flow.md](docs/customer-portal-flow.md) (jeśli wpływa na browser↔mamamia path) |

### Sekcje samo-aktualizujące się

`docs/customer-portal-flow.md` ma dedykowaną sekcję „Maintenance — kiedy
aktualizować ten dokument" — przeczytaj ją zanim zaczniesz tam pisać; nie
duplikuj reguł.

### PR checklist (rozszerzenie istniejącej)

Każdy PR dotykający kodu w `src/` lub `supabase/functions/` lub `project 3/`
musi zawierać:

- [ ] zaktualizowano `docs/customer-portal-flow.md` (jeśli punkt z tabeli powyżej dotyczy)
- [ ] zaktualizowano CLAUDE.md (gotchas / anti-patterns / bug fixes registry)
- [ ] vitest + deno tests pass
- [ ] e2e curl recipe przeszedł na becie (gdy zmiana dotyka mamamii)

PR bez tych aktualizacji = block. Review pyta o nie pierwszym komentarzem.

### Co to znaczy w praktyce dla Claude

Gdy user prosi o zmianę kodu:
1. Implementacja
2. Testy
3. **Aktualizacja dokumentacji** — zawsze w tym samym turnie, nie „później"
4. Verification

Gdy user prosi o samą dokumentację (audit / opis / „co tu się dzieje") —
sprawdzaj `docs/customer-portal-flow.md` PIERWSZY zanim zaczniesz czytać kod.
To źródło prawdy. Jeśli dokument się nie zgadza z kodem, dokument jest stary —
zaktualizuj go w tym samym turnie.

---

## Architektura — co gdzie żyje

Repo to **monorepo z dwoma aplikacjami** + Supabase Edge Functions. Każda
zmiana z reguły dotyka kilku warstw — wiedz która jest jaka, żeby nie
duplikować logiki.

### Dwie aplikacje

| App | Stack | Rola | Branch deploy |
|---|---|---|---|
| **`project 3/`** | Next.js 13, React, Tailwind | Calculator (Primundus 24h-Pflege Kostenrechner) — public landing, lead-capture wizard, pricing config, magic-link email | `kostenrechner-beta` |
| **`/` (root)** | Vite + React 18 + TS, Tailwind | CA app (Kundenportal) — token-gated portal gdzie customer wypełnia patient form, ogląda zaproponowane PK, akceptuje/odrzuca aplikacje | `caapp-beta` |

Oba na Render free-tier (`render.yaml`), branch `integration/mamamia-onboarding`,
auto-deploy po push.

### Kontrakt handoff

Calculator → CA app:
1. User wypełnia wizard w project 3 (`MultiStepForm.tsx`, 10 kroków).
2. Step 10 submit → `POST /api/angebot-anfordern` → tworzy/upserts lead w
   Supabase `leads`, generuje `token`, wysyła Eingangsbestätigung email.
3. Response zwraca `{ leadId, token, portalUrl: "https://caapp-beta...?token=X" }`.
4. **Direct redirect** — `window.location.assign(portalUrl)`. Brak
   ekranu podziekowania, brak countdown. Brak portalUrl = throw (deploy bug
   widoczny, nie ukryty fallback).

CA app → Mamamia:
1. CAapp ładuje się z `?token=X`.
2. Frontend POST `/functions/v1/onboard-to-mamamia` z `{ token }`.
3. Edge Function: lazy-onboard — jeśli lead nie ma jeszcze
   `mamamia_customer_id`, tworzy customer w Mamamia (StoreCustomer mutation),
   zapisuje `customer_id` + `job_offer_id` do leada, sets HttpOnly session
   cookie (`SESSION_JWT_SECRET`-signed, 24h, SameSite=None bo cross-domain).
4. Wszystkie kolejne wywołania (`mamamia-proxy/getCustomer`, `listApplications`,
   `updateCustomer`, etc.) używają tego cookie.

### Supabase

- **Project ref:** `ycdwtrklpoqprabtwahi`
- **URL:** `https://ycdwtrklpoqprabtwahi.supabase.co`
- **Tabele:**
  - `leads` — lead z token + kalkulacja + opcjonalnie patient_* fields ze stage B
  - `pricing_config`, `subsidies_config`, `subsidies_values` — kalkulator pricing
- **Edge Functions:**
  - `onboard-to-mamamia` — token → lazy-create Mamamia customer + cookie
  - `mamamia-proxy` — generic GraphQL passthrough z whitelist akcji
  - (calculator side: `kalkulation-berechnen`, `angebot-anfordern`,
    `send-scheduled-emails` — w project 3, nie tutaj)

### Mamamia (external panel)

- **GraphQL:** `https://beta.mamamia.app/...` (URL w secret `MAMAMIA_ENDPOINT`)
- **Panel UI (agency):** `https://beta.mamamia.app/backend`
- **Auth:** agency token refreshed via `MAMAMIA_AGENCY_EMAIL` /
  `MAMAMIA_AGENCY_PASSWORD` — ZAWSZE server-side. Nigdy nie wystawiać
  agency credentials do browsera.
- **Customer ID space:** numeric `Customer.id` + readable `customer_id`
  string (`ts-18-7641` for Primundus).

---

## Stack

- **Frontend (CAapp):** React 18 + TypeScript 5 + Vite 5 + Tailwind 3
- **Frontend (calculator):** Next.js 13 + React + Tailwind
- **Backend:** Supabase (Postgres + Edge Functions Deno 2.7)
- **External API:** Mamamia GraphQL BFF przez Edge Functions
- **Testing:** Vitest 3 + React Testing Library + MSW (jsdom) dla frontu;
  `deno task test` dla Edge Functions
- **Deploy:** Render Blueprint (`render.yaml`), branch
  `integration/mamamia-onboarding`, auto-deploy po push

---

## Kluczowe pliki — gdzie co żyje

### Frontend CAapp (`src/`)

| Plik | Co robi |
|---|---|
| `src/pages/CustomerPortalPage.tsx` | Główna strona portalu — token gate, layout, sekcje (Angebot, Patientendaten, Bewerbungen, Match) |
| `src/components/portal/AngebotCard.tsx` | **Patient form** (4-step wizard). Najgrubszy plik — geschlecht/anzahl/pflegegrad, mobility, wohnsituation, Wünsche zur PK. Save → mamamia-proxy.updateCustomer |
| `src/components/portal/AppCard.tsx` / `AppCardDone.tsx` / `MatchCard.tsx` | Karty Bewerbungen + Matchings |
| `src/components/portal/shared.ts` | `PatientForm` interface, `nurseLevel`, helpers |
| `src/components/portal/CustomSelect.tsx` | Custom dropdown używany w całym AngebotCard |
| `src/lib/supabase.ts` | Supabase client + `Lead` interface + `prefillPatientFromLead` (formularDaten → form) + display helpers (greeting, careStartLabel) |
| `src/lib/mamamia/client.ts` | Wrapper na supabase functions invoke |
| `src/lib/mamamia/mappers.ts` | **Mamamia → form** reverse mapping. Caregiver cards, customer prefill (`mapMamamiaCustomerToPatientForm`), enums |
| `src/lib/mamamia/patientFormMapper.ts` | **Form → Mamamia** mapping. `mapPatientFormToUpdateCustomerInput` — patient form save → UpdateCustomer payload |
| `src/lib/mamamia/types.ts` | `MamamiaCustomer`, `MamamiaCaregiverFull`, etc. — server-side response shapes |
| `src/lib/mamamia/hooks.ts` | React hooks (`useMamamiaCustomer`, `useMamamiaApplications`, etc.) |

### Calculator (`project 3/`)

| Plik | Co robi |
|---|---|
| `project 3/components/calculator/MultiStepForm.tsx` | 10-step wizard. Submit → `/api/angebot-anfordern` → redirect to portalUrl |
| `project 3/lib/calculator-context.tsx` | `CalculatorState`, types (`Driving`, `Mobility`, `NightCare`, etc.), pricing fetch |
| `project 3/app/api/angebot-anfordern/route.ts` | Tworzy/updates lead, generuje token, wysyła email, zwraca portalUrl |
| `project 3/app/api/kalkulation-berechnen/route.ts` | Server-side pricing calculation z `pricing_config` |
| `project 3/lib/email-template.ts` | Eingangsbestätigung HTML + plain text |
| `project 3/lib/pdf-generator.ts` | Angebots PDF dla follow-up email (15min delay) |

### Edge Functions (`supabase/functions/`)

| Folder | Co robi |
|---|---|
| `_shared/cors.ts` | Allowed origins (Render beta + localhost) |
| `_shared/session.ts` + `sessionTypes.ts` | JWT session token (`SESSION_JWT_SECRET`-signed), cookie helpers |
| `_shared/mamamiaClient.ts` | Mamamia GraphQL client (agency token refresh, runGraphQL) |
| `_shared/mamamiaPanelClient.ts` | Panel-specific endpoints (StoreRequest dla inviteCaregiver) |
| `_shared/rateLimit.ts` | In-memory rate limit per IP |
| `onboard-to-mamamia/index.ts` | HTTP handler — token + verify + onboard or cache hit |
| `onboard-to-mamamia/onboard.ts` | StoreCustomer + StoreJobOffer + Locations(search) flow |
| `onboard-to-mamamia/mappers.ts` | **formularDaten → Mamamia input** (`buildCustomerInput`, `buildPatients`, `buildCaregiverWish`, `mapNightOperations`, `mapMobilityToId`, etc.) |
| `onboard-to-mamamia/types.ts` | `FormularDaten`, `Lead`, `CustomerInput`, `CaregiverWishInput` |
| `mamamia-proxy/index.ts` | HTTP handler — verify session + dispatch action + run GraphQL |
| `mamamia-proxy/actions.ts` | Whitelisted actions (`getCustomer`, `updateCustomer`, `listMatchings`, `inviteCaregiver`, `rejectApplication`, `storeConfirmation`, etc.). Każda waliduje ownership przez `session.customer_id` |
| `mamamia-proxy/operations.ts` | GraphQL queries/mutations (`GET_CUSTOMER`, `UPDATE_CUSTOMER`, `PRESERVE_QUERY`, etc.) |

### Tests

| Folder | Suite |
|---|---|
| `src/__tests__/` | Vitest (frontend) — `mamamia/`, `integration/`, `supabase.test.ts`. **146 cases** (stan na 2026-05-07) |
| `supabase/functions/onboard-to-mamamia/_tests/` | Deno (Edge Function) — `mappers.test.ts`, `onboard.test.ts`, `session.test.ts`. **133 cases** |
| `supabase/functions/mamamia-proxy/_tests/` | Deno — `actions.test.ts`, `handler.test.ts`. **31 cases** |

### Deploy / Infra

| Plik | Co robi |
|---|---|
| `render.yaml` | Blueprint dla obu serwisów (caapp-beta + kostenrechner-beta) |
| `.env.local` | Local dev — VITE_SUPABASE_URL/ANON_KEY (NIE commit) |
| `tsconfig.json` / `tsconfig.build.json` | Production build pomija test files |

### Docs

W `docs/` żyją source-of-truth notatki o Mamamia:
- `mamamia-customer-fields-map.md` — DB schema dump + fill-rates (active vs draft) — przyda się przy *każdym* mapping audicie
- `integration-blockers.md` — log rozstrzygniętych enum gotchas (`night_operations`, `accommodation`, etc.)
- `matrix-10-end-to-end-2026-04-29.md` — historyczny e2e walkthrough
- `patient-form-mapping-audit-2026-04-28.md` — pierwszy mapping audit
- `caregiver-filtering-pipeline.md` — jak Mamamia matcher filtruje cgs

---

## Lead lifecycle (data flow)

```
┌─────────────────────────────────────────────────────────────────┐
│  STAGE A — calculator (project 3)                                │
└─────────────────────────────────────────────────────────────────┘

  User opens kostenrechner-beta.onrender.com
       │
       ▼
  MultiStepForm — 10 steps:
    1. care_start_timing       (sofort | 2-4-wochen | 1-2-monate | unklar)
    2. patient_count           (1-person | ehepaar)
    3. household_others        (ja | nein)  ← OTHER non-patient ppl, NOT 2nd patient
    4. pflegegrad              (0..5)
    5. mobility                (mobil | rollator | rollstuhl | bettlaegerig)
    6. nachteinsaetze          (nein | gelegentlich | taeglich | mehrmals)
    7. deutschkenntnisse       (grundlegend | kommunikativ | sehr-gut)
    8. fuehrerschein           (ja | nein)  ← gearbox NOT collected here, lives in CAapp
    9. geschlecht              (egal | weiblich | maennlich) ← preferred CAREGIVER gender
   10. contact form            (vorname, email, telefon, accept_privacy)
       │
       ▼
  POST /api/angebot-anfordern
   - server-side kalkulacja przez /api/kalkulation-berechnen
   - upsert lead w Supabase z formularDaten + kalkulacja
   - generate token (32 chars, 14 days expiry)
   - send Eingangsbestätigung email (Ionos SMTP) — fire-and-forget
   - schedule +15min Angebots PDF email (send-scheduled-emails Edge Fn)
   - return { leadId, token, portalUrl, isNew, isUpgrade }
       │
       ▼
  window.location.assign(portalUrl)  ← direct, no thank-you screen


┌─────────────────────────────────────────────────────────────────┐
│  STAGE B — CA app (caapp-beta)                                   │
└─────────────────────────────────────────────────────────────────┘

  CustomerPortalPage loads with ?token=X
       │
       ▼
  POST /functions/v1/onboard-to-mamamia { token }
   - verify token in Supabase leads (not expired, not used flag toggle...)
   - if mamamia_customer_id already set → cache hit, just refresh session cookie
   - else: build CustomerInput from lead.kalkulation.formularDaten:
       * StoreCustomer (Mamamia GraphQL) → numeric Customer.id
       * StoreJobOffer (creates the matching job) → JobOffer.id
       * Locations(search) by PLZ if available
       * UpdateCustomerOnboarding to bump status
     persist customer_id + job_offer_id back to lead
   - sign session JWT with { customer_id, job_offer_id, lead_id, email }
   - set HttpOnly Secure SameSite=None cookie (cross-domain critical)
   - return { customer_id, job_offer_id }
       │
       ▼
  Portal renders:
   - Angebot card (price, arrival_at) — from JobOffer
   - Patientendaten card — opens AngebotCard 4-step wizard
   - Bewerbungen list — from listApplications
   - Match card — from listMatchings (caregiver suggestions)
       │
       ▼
  User wypełnia patient form (AngebotCard)
   - draft autosaved to localStorage on every edit
   - Save → mapPatientFormToUpdateCustomerInput → POST /functions/v1/mamamia-proxy
       { action: "updateCustomer", variables: { ...patch, patients: [{id: ...}] } }
   - proxy: verify session, run UPDATE_CUSTOMER mutation
       │
       ▼
  User klika "Pflegekraft einladen" / "Annehmen" / "Ablehnen"
   - inviteCaregiver / storeConfirmation / rejectApplication via proxy
```

---

## Mamamia integration — gotchas i lekcje

Mamamia to external system z idiosynkrazjami. Te są utrwalone w kodzie
ale łatwo na nie znów wpaść.

### 1. UpdateCustomer wymaga `patients[]` w body

Bez tego mutation pada z `"Internal server error"` (validator side).
**WSZYSTKIE inne pola też nie zapiszą się** — failure jest atomic.

Patient form mapper zawsze emituje `patches.patients = patients` (line ~432
w `patientFormMapper.ts`). Direct curl test bez `patients[]` da false-negative.

```bash
# DZIAŁA
'{"action":"updateCustomer","variables":{"phone":"+49...","patients":[{"id":13076}]}}'

# PADA z "Internal server error"
'{"action":"updateCustomer","variables":{"phone":"+49..."}}'
```

### 2. Niektóre DB columns NIE są w UpdateCustomer mutation input

Tylko dlatego że `Customer.day_care_facility_description` (i locale variants)
istnieją w DB i czytalne via `Customer { day_care_facility_description }` —
NIE znaczy że są settable via mutation. Próba dodania nowych `$variables`
do mutation łamie WSZYSTKIE updateCustomer calls.

**Pattern:** dla pól nie-w-mutation, używamy istniejących writable fields jak
`job_description` (free-text) z prefix-segmentem (`Pflegedienst: ...`),
łączonym separatorem ` | ` z innymi segmentami (`Diagnosen: ...`).
Reverse mapper splituje po segmencie.

### 3. PRESERVE_QUERY — proxy auto-injektuje stale fields

UpdateCustomer w Mamamia traktuje **omitted association inputs jako wipe**.
Klient wysyła patch tylko z 3 polami → Mamamia kasuje `equipments` i
patient `tools` które wcześniej były wypełnione.

`mamamia-proxy/actions.ts:updateCustomer` automatycznie:
- Re-fetcha current `equipment_ids` jeśli nie podane
- Re-fetcha per-patient `tool_ids` dla pacjentów bez explicit `tool_ids`

Nie próbuj omijać — bez tego patient form save kasuje "Wyposażenie
zakwaterowania" i "Pomoce" pierwszym Save.

### 4. Patient `id` threading

UpdateCustomer.patients[] BEZ `id` → Mamamia traktuje jako new patient,
ale niektóre pola (night_operations, incontinence) są **silently dropped**.
Z `id` te same pola lądują poprawnie.

`AngebotCard` zawsze pobiera existing patient ids z mmCustomer i przekazuje
do mappera przez `existingPatientIds` opt.

### 5. Calculator nie zbiera `anrede` pacjenta

Marcin's calculator zadaje pytania o pflegegrad/mobility/etc., ale nigdy
o `Frau/Herr` pacjenta. Onboard mapper używa fallback `"female"` bo
Mamamia wymaga gender na patient. To znaczy:

- Form prefill domyślnie pokazałby "Weiblich" w dropdownie Geschlecht
  → nieintencjonalny preselect
- Fix (Bug #6): `mapMamamiaCustomerToPatientForm` przyjmuje opcję
  `patientGenderKnown`. Gdy `false`, ustawia `geschlecht=''` żeby user
  świadomie wybrał. AngebotCard ustawia flagę z `lead.patient_anrede ||
  lead.anrede || lead.anrede_text`.

Ten sam pattern jest podstawą **suppression of onboard defaults** —
patrz Bug #11 (DEFAULT_WEIGHT/HEIGHT).

### 6. `customer.status` lifecycle

Onboard tworzy customer ze `status='draft'`. Patient form save eskaluje
do `'active'` gdy minimum-required fields są ustawione (panel-side check
`checkSuperJob3`). Bez `'active'` matchings nie palą się publicznie.

### 7. SameSite=None cookie (cross-domain)

CAapp to `caapp-beta.onrender.com`, Edge Functions to
`ycdwtrklpoqprabtwahi.supabase.co`. Cookie set przez Edge Fn musi mieć:
- `Secure` (HTTPS only)
- `SameSite=None` (cross-domain allowed)
- `HttpOnly` (no JS access)
- `Path=/`

`SameSite=Lax` (browser default) cichaczem zignoruje cookie. Frontend
fetch używa `credentials: 'include'`.

### 8. Mamamia schema-level defaults (NOT from us)

Mamamia auto-fills 2 fields with schema defaults when `StoreCustomer` ships
without them — even after Bug #13 minimal-payload refactor. Verified live
2026-05-07 via `/tmp/test-minimal-storecustomer.mjs` (Customer 7651):

- `pets = "no_information"` → reverse mapper `mamamiaPetsToForm` already
  emits `''` for this value (clean separation: user-pick "Keine" maps to
  `pets="no"`, distinct from schema-default).
- `caregiver_accommodated = "room_premises"` → SAME enum value as user
  picking "Zimmer in den Räumlichkeiten" (no clean separation). Reverse
  mapper suppresses ONLY when `Customer.status='draft'` (= patient form
  not saved yet); after save, status flips to 'active' and the value
  surfaces normally.

If Mamamia schema adds another auto-default to a field whose user-pick
range overlaps (no separable enum like `no_information`), apply the same
status-gated suppression pattern in `src/lib/mamamia/mappers.ts`.

### 9. Bot detection / rate limit

Mamamia panel rate-limit'uje agency calls (~60 req/min/account po naszym
shared agency). Heavy bursty operations (np. invite 50 caregivers w pętli)
muszą być sequenced. `mamamia-proxy` ma własny in-memory rate limit per IP.

---

## Field mapping reference

To jest source-of-truth co gdzie jest collected i jak mapowane przez
warstwy. Mapping audit w `docs/patient-form-mapping-audit-2026-04-28.md`
+ live-verified.

### Calculator → onboard → Mamamia (formularDaten path)

| Calculator field | formularDaten key | Mamamia target | Notes |
|---|---|---|---|
| careStartTiming | (lead.care_start_timing) | JobOffer.arrival_at = now + delta | sofort=+7d, 2-4-wochen=+21d, 1-2-monate=+45d, unklar=+30d |
| patientCount=ehepaar | betreuung_fuer | 2 patients in `customer.patients[]` | Person 2 inherits Person 1's care attrs (Bug #2) |
| householdOthers | weitere_personen | customer.other_people_in_house | "ja"→"yes" |
| pflegegrad | pflegegrad (int) | patient.care_level | direct passthrough |
| mobility | mobilitaet | patient.mobility_id (1..5) | mobil=1, rollator=3, rollstuhl=4, bettlaegerig=5 |
| nightCare | nachteinsaetze | patient.night_operations | nein=no, gelegentlich=occasionally, taeglich=`up_to_1_time`, **mehrmals=more_than_2** (Bug #1) |
| germanLevel | deutschkenntnisse | wish.germany_skill | grundlegend=level_2, kommunikativ=level_3, sehr-gut=level_4 |
| driving | fuehrerschein | wish.driving_license | ja=yes, nein/egal=not_important |
| (gearbox — NOT in calc) | — | wish.driving_license_gearbox | onboard defaultuje "automatic"; user nadpisuje przez patient form (`wunschGetriebe`) |
| gender | geschlecht | wish.gender | weiblich=female, maennlich=male, egal=not_important |
| name (vorname) | (lead.vorname) | customer.first_name | direct |
| email | (lead.email) | customer.email | direct |

**Onboard injects defaults** dla missing required fields:
- `DEFAULT_WEIGHT="61-70"`, `DEFAULT_HEIGHT="161-170"` na każdy patient
  (Mamamia matcher wymaga). Bug #11 fix: reverse mapper detects
  pair-exact i zwraca `''` → form pokazuje empty (są optional).
- `lift_id` derived z mobility — wheelchair/bedridden=1 (lift required),
  else=2.
- `tool_ids` — minimum 1 z mobility-derived set, NIGDY id=7 (Inne).
- `gender` patient — fallback "female" gdy lead.anrede missing
  (Marcin's calc nie zbiera).

### Patient form (AngebotCard) → Mamamia (UpdateCustomer)

| Form field | PatientForm key | Mamamia target | Notes |
|---|---|---|---|
| Anzahl | anzahl | (drives patients[] length) | "1" or "2" |
| Geschlecht (Person 1/2) | geschlecht / p2_geschlecht | patient.gender | Weiblich=female, Männlich=male |
| Geburtsjahr | geburtsjahr / p2_geburtsjahr | patient.year_of_birth | int |
| Pflegegrad | pflegegrad / p2_pflegegrad | patient.care_level | "Pflegegrad N" → N |
| Gewicht | gewicht / p2_gewicht | patient.weight | bucket "61-70" + " kg" suffix |
| Größe | groesse / p2_groesse | patient.height | bucket "161-170" + " cm" suffix |
| Mobilität | mobilitaet / p2_mobilitaet | patient.mobility_id | label → id (MOBILITY_BY_LABEL map) |
| Heben erforderlich | heben / p2_heben | patient.lift_id | Ja=1, Nein=2 |
| Demenz | demenz / p2_demenz | patient.dementia + dementia_description | Nein=no, Leichtgradig/Mittelgradig/Schwer=yes + 4-locale description |
| Inkontinenz | inkontinenz / p2_inkontinenz | patient.incontinence + incontinence_feces + incontinence_urine | 3-bool combo |
| Nachteinsätze | nacht / p2_nacht | patient.night_operations | label → enum (Nein=no, Gelegentlich=occasionally, "Bis zu 1 Mal"=up_to_1_time, "Mehr als 2"=more_than_2) |
| PLZ + Ort | plz + ort | customer.location_id (or location_custom_text) | Locations(search) lookup; fallback to `${plz} ${ort}` |
| Wohnungstyp | wohnungstyp | customer.accommodation | Einfamilienhaus=single_family_house, Wohnung=apartment, Andere=other |
| Urbanisierung | urbanisierung | customer.urbanization_id | Großstadt=3, Kleinstadt=2, Dorf=1 |
| Familie nahe | familieNahe | customer.has_family_near_by | Ja/Nein |
| Pflegedienst | pflegedienst | customer.day_care_facility | Ja/Geplant=yes, Nein=no |
| Pflegedienst Häufigkeit + Aufgaben | pflegedienstHaeufigkeit + pflegedienstAufgaben | customer.job_description (segmented) | Format: `Pflegedienst: {freq}: {tasks}`, joined to other segments z ` \| `. Internal task separator: `; ` (NIE `, ` bo labels mają commas inside parens). |
| Tiere | tiere | customer.pets + is_pet_dog/cat/other | Keine=pets:no; Hund/Katze/Andere=pets:yes + flag |
| Unterbringung | unterbringung | customer.caregiver_accommodated | Zimmer in den Räumlichkeiten=room_premises, etc. |
| Internet | internet | customer.internet | Ja/Nein |
| Wunsch-Geschlecht PK | wunschGeschlecht | wish.gender | Egal=not_important, Weiblich=female, Männlich=male |
| Rauchen erlaubt | rauchen | wish.smoking | Ja=yes_outside, Nein=no |
| Wunsch-Getriebe | wunschGetriebe | wish.driving_license_gearbox | Schaltung=manual, Automatik/Egal=automatic. **Tylko shown gdy** mmCustomer.wish.driving_license=yes |
| Aufgaben PK | aufgaben | wish.tasks + tasks_de | free-text |
| Sonstige Wünsche | sonstigeWuensche | wish.other_wishes + other_wishes_de | free-text |
| Diagnosen | diagnosen | customer.job_description (segmented) | Format: `Diagnosen: {text}` |

### Reverse path (Mamamia → form prefill)

`mapMamamiaCustomerToPatientForm(cust, opts)` w `src/lib/mamamia/mappers.ts`.

**Suppression rules** żeby user nie widział "phantom data" wstrzykniętej
przez onboard:
- `gewicht`/`groesse` na patient: jeśli para `(weight=61-70, height=161-170)`
  → emit `''` (sentinel match → DEFAULT pair → user nigdy nie wpisał).
- `geschlecht` patient: gdy `opts.patientGenderKnown !== true` → emit `''`
  (calculator nie zbiera anrede).
- `wunschGetriebe`: `manual` → "Schaltung", `automatic` → `''` (suppress
  onboard's permissive default, user musi explicitly wybrać).

**mm-rehydrate "isDefault" check** w `AngebotCard.tsx`:

Gdy mmCustomer arrives async, merge fresh values z reverse mapper TYLKO do
pól które są: `null/empty` LUB znanym onboard-default sentinel:
- mobilitaet === 'Rollstuhlfähig' (calculator default)
- nacht === 'Nein' (calculator default)
- haushalt === 'Ehepartner/in' (calculator default)
- pflegegrad lub p2_pflegegrad === single digit (`/^\d$/` — calculator
  prefill stores raw "3" zanim Mamamia upgrade'uje na "Pflegegrad 3")

**`userDirty` ref** — set przez user-driven `updatePatient`. Programmatic
merges (mm-rehydrate) skipują gdy `userDirty.current` jest `true`.

---

## Recent bug fixes — registry

Wszystkie z 2026-04 → 2026-05. Lista ma być wyczerpana — jak coś znów
"już raz było widać", sprawdź tu zanim debugujesz od zera.

| # | Co | Plik(i) | Fix highlight |
|---|---|---|---|
| 1 | `nachteinsaetze='mehrmals'` mapowane do `'1_2_times'` zamiast `'more_than_2'` | onboard mappers.ts:`mapNightOperations` | Added "mehrmals" → "more_than_2" |
| 2 | Person 2 (couple) miał hardcoded defaults (care_level=2) zamiast inherited z Person 1 | onboard mappers.ts:`buildPatients` | Person 2 dziedziczy care_level/mobility_id/lift_id/tool_ids/night_operations/dementia |
| 3 | `prefillPatientFromLead` `nachtMap` brak kluczy `taeglich`/`mehrmals` (fallback do "Nein") | src/lib/supabase.ts | Added `taeglich='Bis zu 1 Mal'`, `mehrmals='Mehr als 2'` |
| 4 | `prefillPatientFromLead` `mobMap` brak `rollator`/`gehstock` z NEW calculator | src/lib/supabase.ts | Added rollator='Rollatorfähig', gehstock='Am Gehstock' |
| 5 | Couple — `p2_pflegegrad`/`p2_mobilitaet`/`p2_nacht` undefined → fallback Pflegegrad 2 | src/lib/supabase.ts:`prefillPatientFromLead` | Emit p2_* gdy `betreuung_fuer='ehepaar'` |
| 6 | Geschlecht Person 1 default → 'weiblich' mimo że calculator nie pyta o anrede | src/lib/mamamia/mappers.ts + AngebotCard | `patientGenderKnown` opt — gdy false, geschlecht='' |
| 7 | `careStartLabel` brak kluczy `2-4-wochen`/`1-2-monate`/`unklar` z NEW calc | src/lib/supabase.ts | Added new calculator values |
| 8 | (REJECTED — moved to Bug #12) Originally added gearbox sub-question to calculator step 8 | — | Refactored: gearbox lives in CAapp patient form |
| 9 | (REJECTED in original form) Originally added `day_care_facility_description{,_de,_en,_pl}` do UpdateCustomer mutation. Mamamia GraphQL nie akceptuje tych pól → wszystkie updateCustomer calls padały. | mamamia-proxy/operations.ts | Pivoted: pflegedienst description ląduje w `job_description` segmencie `Pflegedienst: {freq}: {tasks}` |
| 10 | Person 2 pokazywał "4" zamiast "Pflegegrad 4" | AngebotCard.tsx mm-rehydrate | Extended digit-default regex check do `p2_pflegegrad` |
| 11 | Gewicht/Größe auto-prefilled DEFAULT_WEIGHT/HEIGHT z onboard | src/lib/mamamia/mappers.ts | Detect pair-exact `('61-70', '161-170')` → emit `''` |
| 12 | Gearbox question + Success screen z calculator-a | project 3/components/calculator/MultiStepForm + AngebotCard | Gearbox → CAapp patient form (`wunschGetriebe`); Success screen wycięty (direct redirect) |
| 13 | **Phantom data w patient form** — onboard wstrzykiwał ~25 hardkodowanych defaultów (`weight=61-70`, `height=161-170`, `accommodation=single_family_house`, `urbanization_id=2`, `internet=yes`, `caregiver_accommodated=room_premises`, `equipment_ids=[1,2]`, `day_care_facility=no`, `has_family_near_by=not_important`, `pets=no_information`, `smoking_household=no`, patient `gender=female`/`dementia=no`/`incontinence=false`/`smoking=false`, wish `smoking=yes_outside`/`shopping=no`/`tasks="Grundpflege..."`/`shopping_be_done="Nach Absprache"`/`driving_license_gearbox=automatic`, plus 4-locale auto-strings dla lift/night/dementia descriptions, plus `customer_contract`/`invoice_contract`/`customer_contacts`). Klient widział je jako preselect w formularzu jakby je sam wybrał — narusza świętą zasadę nr 1 | onboard-to-mamamia/mappers.ts + onboard.ts (mutation `$variables`), src/lib/mamamia/mappers.ts (drop weight/height pair sentinel + patientGenderKnown opt + gearbox-automatic suppression; add status-gated `caregiver_accommodated="room_premises"` schema-default suppression), AngebotCard.tsx (drop `patientGenderKnown` arg), tests | Wszystkie defaulty wycięte z onboardu — Customer ląduje jako `status='draft'`, patient form save flippa go na `'active'` przez `UpdateCustomer` z prawdziwymi danymi. Contracts (customer_contract / invoice_contract / customer_contacts) deferred do `StoreConfirmation` (acceptance time). Verified live: `/tmp/test-minimal-storecustomer.mjs` (Customer 7651). Bonus: 1 round-trip mniej w onboard (StoreCustomer payload znacznie mniejszy). |
| 13a | **Patient form save — pola które Mamamia panel pokazywał jako puste** (follow-up do #13). Po wycięciu phantom-defaults z onboardu, panel UI Customer 7653 pokazywał: (1) waga/wzrost niewyrenderowane mimo że stored (form używał en-dash `–`, panel dropdown enum używa ASCII hyphen `-`); (2) `night_operations_description` puste (form nie ma free-text dla nocnych zadań); (3) `job_description` puste (form nie ma "krótki opis sytuacji"); (4) `wish.shopping` puste (form nie pyta); (5) `equipments` puste (form nie pyta) | src/lib/mamamia/patientFormMapper.ts | (1) `normalizeBucket(s)` zamienia `–` → `-` w weight/height przed wysłaniem; (2) `standardNightOpsDescription(no)` generuje 3-locale placeholder gdy `night_operations !== 'no'`; (3) `buildJobDescriptionSummary(form)` generuje DE auto-summary z Pflegegrad/mobility/demenz/inkontinenz/nacht — prepended do existing diagnoses+pflegedienst segments; (4) `wish.shopping = 'no'` ustawiany zawsze (prod-most-common 43%); (5) `patch.equipment_ids = [1, 2]` ustawiany zawsze (TV + Bathroom). Verified live: `/tmp/test6-resave-bug13a.mjs` na Customer 7653. |
| 13b | **Patient form save — `tool_ids` rozjeżdża się z `mobility_id` po edycji**. Na Customer 7655 patient[1]: couple-onboard ustawił obu pacjentom `mobility_id=5 (bedridden) + tools=[4,6] (hoist+bed)`. User w patient form zmienił Person 2 na `mobility_id=1 (mobile)`, ale `tools=[4,6]` zostały — niemożliwa kombinacja na panelu Mamamii. Przyczyna: `patientFormMapper.buildPatient` aktualizował tylko `mobility_id`, NIE wysyłał `tool_ids` → proxy `PRESERVE_QUERY` re-fetcha aktualne tools z bazy i je re-injectuje | src/lib/mamamia/patientFormMapper.ts (`deriveToolIds(mobility_id)` mirror onboard `mapToolIds`) | `buildPatient` zawsze wysyła `tool_ids = deriveToolIds(mobility_id)` gdy mobility jest ustawiana — nadpisuje stale tools fresh derivation. NEVER include id 7 (Others) — triggeruje required free-text "Jakie inne narzędzia są używane?". |
| 13c | **Patient form save — `lift_description` puste mimo `Heben erforderlich = Ja`**. Panel Mamamii "Kiedy potrzebne jest podnoszenie?" wymaga niepustego opisu, ale form ma tylko Ja/Nein bez free-text dla szczegółów transferu. Symptom: na Customer 7656 (Test7) pole `lift_description` zostawało null mimo `lift_id=1` | src/lib/mamamia/patientFormMapper.ts (`standardLiftDescription(liftId)`) | `buildPatient` ustawia 3-locale placeholder `lift_description{,_de,_en,_pl}` gdy `lift_id === 1` (Yes — lift required). Skipped dla `lift_id === 2` (No). Analogicznie do `night_operations_description` z #13a. |

---

## Testing — jak uruchomić co

### Frontend (Vitest, jsdom)

```bash
# Wszystko
npx vitest run

# Watch mode podczas dev
npx vitest

# Coverage
npm run test:coverage
```

Suites:
- `src/__tests__/mamamia/mappers.test.ts` — Mamamia → form reverse mapper
- `src/__tests__/mamamia/patientFormMapper.test.ts` — form → Mamamia
- `src/__tests__/mamamia/matchingsRanking.test.ts` — caregiver list ranking
- `src/__tests__/mamamia/caregiverCache.test.ts` — TTL cache
- `src/__tests__/supabase.test.ts` — `prefillPatientFromLead`, `careStartLabel`, helpers
- `src/__tests__/integration/portal.test.tsx` — RTL+MSW golden paths
  (token → review → accept; decline path)

### Edge Functions (Deno)

```bash
# Onboard
cd supabase/functions/onboard-to-mamamia && deno task test

# Proxy
cd supabase/functions/mamamia-proxy && deno task test
```

### TypeScript build check

```bash
npx tsc --noEmit -p tsconfig.build.json
```

Pre-existing errors w `project 3/` (next/navigation, lucide-react CircleCheck)
to nie nasze — projekt 3 ma inną tsconfig. Skupić się na `src/` clean.

### TDD paradigm

- **Logika (mappers, hooks, edge functions):** TDD red/green/refactor.
  Najpierw test failujący, potem fix, potem refactor.
- **UI:** RTL+MSW integration tests dla golden paths. NIE smoke tests
  które duplikują integration coverage.
- Testy fixture w `test/fixtures/leads.ts` są reużywalne — `baseLead`,
  `herrLead`, `familieLead`, `bareLead`.

---

## Deploy workflow

### Frontend (auto)

`git push origin integration/mamamia-onboarding` → Render auto-builds:
- `caapp-beta` (Vite static) — ~1.5min
- `kostenrechner-beta` (Next.js SSR) — ~2-3min

Render dashboard: pokazuje build logs. Jeśli build padnie, Render trzyma
poprzednią wersję live.

### Edge Functions (manual)

```bash
npx supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi
```

Często musisz zdeployować **OBA** (`onboard-to-mamamia` + `mamamia-proxy`)
gdy zmiany dotyczą shared modules w `_shared/`.

### Supabase secrets

```bash
# Lista
npx supabase secrets list --project-ref ycdwtrklpoqprabtwahi

# Set
npx supabase secrets set KEY=value --project-ref ycdwtrklpoqprabtwahi

# Unset
npx supabase secrets unset KEY --project-ref ycdwtrklpoqprabtwahi
```

Podstawowe secrets (NIGDY nie commitować):
- `MAMAMIA_AGENCY_EMAIL` / `MAMAMIA_AGENCY_PASSWORD`
- `MAMAMIA_AUTH_ENDPOINT` / `MAMAMIA_ENDPOINT`
- `SESSION_JWT_SECRET`
- `OPENAI_API_KEY` (jeśli używamy)

### DEBUG_PROXY

Set `DEBUG_PROXY=1` żeby `mamamia-proxy` zwrócił real upstream error message
zamiast generic `"upstream failed"`. Use case: diagnosing GraphQL schema
issues z Mamamia (jak Bug #9 deploy regression).

```bash
npx supabase secrets set DEBUG_PROXY=1 --project-ref ycdwtrklpoqprabtwahi
# ... debug ...
npx supabase secrets unset DEBUG_PROXY --project-ref ycdwtrklpoqprabtwahi
```

### Render API

Brak — w razie potrzeby Render dashboard. Auto-deploy z GitHub push, więc
zwykle wystarczy patrzeć w Render dashboard 2-3min po push.

---

## E2e verification recipe (curl + cookies)

Dla zmian dotyczących Mamamia integration, najszybsza weryfikacja
end-to-end:

```bash
SUPA_URL="https://ycdwtrklpoqprabtwahi.supabase.co"
ANON=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2)

# 1. Submit nowy lead via calculator API
TS=$(date +%s)
curl -sS -X POST "https://kostenrechner-beta.onrender.com/api/angebot-anfordern" \
  -H "Content-Type: application/json" \
  -d "{
    \"vorname\": \"Test E2e\",
    \"email\": \"e2e-${TS}@mailinator.com\",
    \"careStartTiming\": \"sofort\",
    \"kalkulation\": {
      \"bruttopreis\": 3200,
      \"eigenanteil\": 1700,
      \"formularDaten\": {
        \"betreuung_fuer\": \"1-person\",
        \"pflegegrad\": 3,
        \"weitere_personen\": \"nein\",
        \"mobilitaet\": \"rollator\",
        \"nachteinsaetze\": \"gelegentlich\",
        \"deutschkenntnisse\": \"kommunikativ\",
        \"fuehrerschein\": \"ja\",
        \"geschlecht\": \"weiblich\"
      }
    }
  }"
# → response: {"success":true,"leadId":"...","token":"XYZ","portalUrl":"https://caapp-beta.../?token=XYZ"}

# 2. Onboard lead → tworzy Mamamia customer + cookie
TOKEN="..."  # z odpowiedzi powyżej
curl -sS -X POST "$SUPA_URL/functions/v1/onboard-to-mamamia" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" \
  -H "Authorization: Bearer $ANON" \
  -c /tmp/test.cookies \
  -d "{\"token\":\"$TOKEN\"}"
# → {"customer_id":7641,"job_offer_id":16281}

# 3. Read customer state
curl -sS -X POST "$SUPA_URL/functions/v1/mamamia-proxy" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -b /tmp/test.cookies \
  -d '{"action":"getCustomer"}' | python3 -m json.tool

# 4. Update customer (REQUIRES patients[] — see gotcha #1)
PATIENT_ID=$(curl -sS -X POST "$SUPA_URL/functions/v1/mamamia-proxy" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -b /tmp/test.cookies \
  -d '{"action":"getCustomer"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['Customer']['patients'][0]['id'])")

curl -sS -X POST "$SUPA_URL/functions/v1/mamamia-proxy" \
  -H "Content-Type: application/json" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -b /tmp/test.cookies \
  -d "{
    \"action\":\"updateCustomer\",
    \"variables\":{
      \"customer_caregiver_wish\": {\"driving_license_gearbox\":\"manual\"},
      \"patients\":[{\"id\":$PATIENT_ID}]
    }
  }"
# → {"data":{"UpdateCustomer":{"id":7641,"customer_id":"ts-18-7641"}}}
```

Mamailinator inbox: https://www.mailinator.com/v4/public/inboxes.jsp?to=e2e-XXX
do sprawdzenia Eingangsbestätigung.

---

## Browser MCP — jak debugować portal live

Beta deploy ma session/cookie behavior tylko-przez-przeglądarkę. Z
`mcp__Claude_in_Chrome__*` można:

```
1. tabs_context_mcp { createIfEmpty: true }   # nowa karta w MCP grupie
2. navigate { url: "https://caapp-beta.../?token=XYZ", tabId }
3. read_network_requests { tabId, urlPattern: "mamamia-proxy" }
4. javascript_tool — hook fetch żeby wyciągnąć captured response:
     window.__captured = []
     const o = window.fetch
     window.fetch = async (...a) => {
       const res = await o.apply(this, a)
       try {
         const url = typeof a[0] === 'string' ? a[0] : a[0].url
         if (url?.includes('mamamia-proxy')) {
           window.__captured.push({ body: a[1]?.body, response: await res.clone().text() })
         }
       } catch {}
       return res
     }
```

**Gotcha:** F5 reset hooks. Ustaw hook PRZED akcją która triggeruje
fetch.

`form_input` (set value programatically) NIE triggers React onChange — React
state nie aktualizuje się. Użyj `triple_click + type` lub `left_click + key`
żeby zasymulować user input. Albo prościej — wywołaj API bezpośrednio
przez curl/fetch.

---

## Convention checklist (commits, PRs)

### Commit messages

- Prefix: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`,
  `docs:`, `chore:`, `infra(scope):`
- Scope krótki: `mapping`, `form`, `calc`, `api`, `email`, `cors`, `bug-9`,
  `auth`, etc.
- Body: 2-3 zdania DLACZEGO, nie tylko CO. Kod sam mówi co zostało zmienione.
- Dla bugfixów: numer błędu + cytat z user feedback / steps to reproduce
  + observed vs expected.
- Stopka: zawsze `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

### Czego NIE commitować

- `.env.local` (gitignored)
- `dist/`, `node_modules/` (gitignored)
- `*.cookies` test files w `/tmp/`
- Service-role keys, agency credentials
- Pliki `*.tsx.bak` / `*.tsx.broken` (cleanup before commit)

### PR template (gdy będzie używany)

```markdown
## Summary
- 2-3 bullets co zmieniło

## Test plan
- [ ] vitest passes (146+ tests)
- [ ] deno onboard tests pass (133+)
- [ ] deno proxy tests pass (31+)
- [ ] e2e curl recipe na beta przeszedł
- [ ] manual smoke przez UI (gdy zmiana dotyka form)
```

---

## Często-pytane pytania (dla nowej sesji)

### "Gdzie jest [pole X] mappowane?"

1. Calculator pyta? → `project 3/components/calculator/MultiStepForm.tsx`
2. CAapp form pyta? → `src/components/portal/AngebotCard.tsx` step UI
3. Lead → Mamamia (onboard)? → `supabase/functions/onboard-to-mamamia/mappers.ts`
4. Form → Mamamia (UpdateCustomer)? → `src/lib/mamamia/patientFormMapper.ts`
5. Mamamia → form prefill? → `src/lib/mamamia/mappers.ts`
6. Display string in portal? → `src/lib/supabase.ts` (helpers) lub
   inline w komponencie

### "updateCustomer pada z 'Internal server error', co robić?"

Sprawdź body — czy zawiera `patients[]`? Bez tego Mamamia odrzuca cały
payload. Patrz Mamamia gotcha #1.

Jeśli z `patients[]` też pada — dodano nowe `$variable` do UPDATE_CUSTOMER
mutation? Sprawdź Mamamia GraphQL schema czy field jest writable.
Niewidoczne w mutation = wszystkie updateCustomer calls falą.

Włącz `DEBUG_PROXY=1` żeby zobaczyć real error.

### "Form pokazuje phantom data, customer się skarży"

Sprawdź czy to nie onboard-default sentinel:
- DEFAULT_WEIGHT="61-70" + DEFAULT_HEIGHT="161-170" → reverse mapper powinien suppressować
- DEFAULT_GENDER="female" gdy patientGenderKnown=false → suppressowane
- driving_license_gearbox="automatic" → suppressowane (Bug #12)

Jeśli widzisz nowy phantom field — dodaj sentinel detection w
`src/lib/mamamia/mappers.ts`.

### "Test pada lokalnie ale nie na CI / vice versa"

- Frontend Vitest jest jsdom-based, nie real browser. Niektóre ipv6
  / network features nie działają.
- MSW mocks żyją w `test/setup.ts`. Sprawdź czy nie kolidują z fetch'em.
- Edge Function tests używają fake `fetchFn` injected — jeśli kod woła
  `fetch` bezpośrednio zamiast `deps.fetchFn`, test pominie network mock.

### "Jak uruchomić nową Edge Function locally?"

```bash
# Wymagana Docker lokalnie
npx supabase start
# Function dev z hot reload
npx supabase functions serve <name>
# Test
curl http://localhost:54321/functions/v1/<name> -d '{...}'
```

W praktyce zwykle prościej deploy na beta i test live (curl recipe).

### "Skąd wziąć current customer_id z istniejącego token?"

```bash
# Onboard w trybie cache-hit (lead juz ma mamamia_customer_id)
curl ... /functions/v1/onboard-to-mamamia -d '{"token":"..."}'
# → returns {"customer_id":N,"job_offer_id":M}
```

Lub w Supabase SQL editor:
```sql
SELECT mamamia_customer_id, mamamia_job_offer_id
FROM leads WHERE token = '...';
```

---

## Anti-patterns (NIE rób tak)

- ❌ Dodawanie nowych `$variables` do `UPDATE_CUSTOMER` mutation **bez
  weryfikacji że Mamamia przyjmuje** te pola na input. Pierwsza próba
  Bug #9 zabiła wszystkie updateCustomer w produkcji.
- ❌ Mock data jako "tymczasowy fallback" — patrz Święta zasada nr 1.
- ❌ Calculator field który duplikuje informację już zbieraną przez
  patient form (jak gearbox było). Jeden source of truth — calculator
  zbiera tylko to co potrzebne do KALKULACJI ceny.
- ❌ Auto-redirect z `setTimeout` zamiast `window.location.assign` od razu.
  User nie potrzebuje "thank you" przed redirectem.
- ❌ Read-only display pola który user CHCE móc edytować. Jeśli wartość
  ma sens tylko dla user-input, nie pokazuj sztucznie wpisanej (np.
  Pflegegrad raw "3" zamiast "Pflegegrad 3" z Mamamia).
- ❌ Hardcoded customer/patient IDs w testach które łatwo zdezaktualizują się.
  Używaj fixture builders (`makeForm`, `makeCustWithGender`) z overrides.
- ❌ Nowe pola w `customer_caregiver_wish` bez dodania ich do
  `WISH_ALLOWED` w `mamamia-proxy/actions.ts`. Allowlist filtruje
  silently — patch wygląda OK ale field nie dochodzi do Mamamia.
- ❌ Branch operacje na `main` lub `master` — pracujemy na
  `integration/mamamia-onboarding`. Production nie istnieje jeszcze.

---

## Open questions / known limitations

- **Email transport:** Eingangsbestätigung jest blocked z Render po Ionos
  (deliverability issue). Workaround był rozważany (Resend) ale celowo
  niewdrożony — `send-scheduled-emails` Edge Function ma własny SMTP
  niezablokowany. Patrz commits z 2026-04 dla kontekstu.
- **Admin panel:** w `project 3/app/admin/` istnieje ale nie cherry-picked
  z Marcin's fork — inny statuses.ts, inny StatusDropdown. Nie ruszać
  bez świadomej decyzji.
- **Vertrag flow (`/betreuung-beauftragen`):** explicitly dropped w cherry-pick
  decision. Customer flow kończy się patient form save → Mamamia matching.
  In-app contract editing było duplikatem CA app patient form.
- **Migration to new Supabase project:** `ptdlgmpuqgbydglqnjgd` istnieje
  (Marcin's fork) ale nie używamy. Nasza beta na `ycdwtrklpoqprabtwahi`.
