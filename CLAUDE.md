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

## 🩸 ŚWIĘTA ZASADA NR 1.5: NIGDY NIE WYMYŚLAJ MAPOWAŃ ENUM ZA BACKEND

**ZAKAZANE — KONKRETNE PRZYKŁADY:**

- `kalkulator pflegegrad=0` → `mapuję na care_level=1` "bo Mamamia enum to
  pewnie 1-5" — **NIE!** Sprawdź pierwszy czy Mamamia ma natywne `0` /
  `null` / `"none"` / "Keine" w panelu/enum.
- `form picked "Kein/e"` → `wysyłam care_level=1 + tag w job_description`
  jako round-trip workaround — **NIE!** To fałszuje dane: agency widzi
  "Pflegegrad 1" zamiast "Kein". To bezpośrednie naruszenie ŚWIĘTEJ
  ZASADY NR 1 (NO DUMB DATA, NO SOFT FALLBACKS).
- `Mamamia odrzuca moje założone X` → `mapuję na "closest valid Y"` —
  **NIE!** Albo Y jest semantycznie tym samym co X (= legalne mapowanie),
  albo nie i wtedy zmieniamy UX (wycinamy opcję z form), nie fałszujemy
  wartości.

**OBOWIĄZKOWA WERYFIKACJA przed jakimkolwiek "default fallback" /
"workaround mapping":**

1. **Otwórz panel Mamamia** (browser MCP, screenshot od user-a) i zobacz
   jakie opcje dropdown faktycznie ma. "Keine" / "0" / "Brak" widoczne?
   To jest natywna wartość enum, użyj jej.
2. **GraphQL introspection** — sprawdź `__type(name: "PatientInputType")
   { inputFields { name type { ... } } }` żeby zobaczyć czy field jest
   nullable / jaki ma enum values.
3. **Live test na becie** — wyślij raw value (0, null, omitted) i zobacz
   czy mutation zwraca error vs success. Sandbox safe.
4. **Zapytaj user-a** — "Czy panel Mamamia ma opcję X?" — jedno pytanie
   < długi commit message tłumaczący hack.

**Anti-pattern z incydentu 2026-05-07** (Bug #13e — Test77): wymyśliłem
że "Kein/e" → `care_level=1` + sentinel tag w `job_description`. User:
"w mamamia mam opcje keine!!!!!" — Mamamia panel od początku miał
natywną opcję dla "no Pflegegrad". Hack stał się ślepym mappingiem
fałszującym dane. Round-tripping przez sentinel tag w innym polu to
**szczególnie obrzydliwy anti-pattern** — buduje kruchy ad-hoc protokół
ponad źle zaprojektowanym mapperem.

**Naruszenie tej zasady = block + rewrite + szczerze przeprosić user-a.**

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
| Zmiana w `.github/workflows/*` lub wymaganiach branch protection | CLAUDE.md sekcja „GitHub workflow (PR / CI / branch protection)" — tabela reguł + status check names |
| Nowe wymagania środowiskowe (env var / `.env*` / Render secret) | ONBOARDING.md (§2 / §3) + jeśli runtime → CLAUDE.md sekcja „Deploy workflow" → „Supabase secrets" |

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

### 🏷️ Naming convention — "beta" to NIE jedno

W projekcie słowo "beta" oznacza **dwie różne rzeczy** zależnie od kontekstu.
Zawsze rozróżniaj zanim coś zmienisz / zdiagnozujesz:

| Termin | Co to | Gdzie żyje | Aktualny stan |
|---|---|---|---|
| **Nasz beta Render slot** | Środowisko staging dla *naszego* deploy'u — `caapp` + `kostenrechner` na Render free-tier (zrename'owane z `caapp-beta` / `kostenrechner-beta` 2026-05-14). Produkcyjne custom domains: `kundenportal.primundus.de` (CAapp) + `kostenrechner.primundus.de` (calculator). Render slot URLs (`caapp.onrender.com`, `kostenrechner.onrender.com`) działają jako fallback. | `render.yaml`, `kundenportal.primundus.de` / `kostenrechner.primundus.de`, branch `integration/mamamia-onboarding` | Live, nasz preprod |
| **Mamamia beta tenant** | Mamamia development environment — separate DB, separate user accounts, separate schema seed | `https://backend.beta.mamamia.app/graphql` (URL hostuje Mamamia) | Forward-going (newer schema features, np. plural `customer_contracts`) |
| **Mamamia preprod tenant** | Mamamia "real prod" environment — legacy schema, separate DB | `https://backend.prod.mamamia.app/graphql` (URL hostuje Mamamia, ale nazwa myli — to ich production-grade tenant, my używamy jako preprod) | **Aktualnie podpięte** (od 2026-05-11), Bug #15 + #16 fixe tu zlokalizowane |
| **Mamamia prod** | Mamamia true-production (real customers) — kiedyś będziemy chcieli się tam podpiąć | TBD, prawdopodobnie ten sam endpoint co preprod ale inny agency account z prawdziwymi danymi | Jeszcze nie używamy |

**Konwencja w kodzie/komentarzach:**
- "beta" bez kwantyfikatora = **nasz Render slot** (default w tym repo)
- "Mamamia beta" / "beta tenant" / "beta.mamamia.app" = **Mamamia dev environment**
- "Mamamia preprod" / "prod Mamamia" / "backend.prod.mamamia.app" = **nasz aktualny target** (Mamamia production-grade tenant używany przez nasz beta slot)

**Implikacja:**
- Mamamia beta i preprod **MAJĄ różne schema** (Bug #16). Nie zakładaj że są spójne.
- Nasze Render slot nazewnictwo (`caapp`, `kostenrechner` — wcześniej `*-beta`) odzwierciedla **nasze** dev/staging stage, niezależnie od tego pod jakim Mamamia tenantem aktualnie hostujemy.
- Aktualnie: nasz `caapp` (Render) → Supabase Edge Functions → Mamamia **preprod** (NIE Mamamia beta).

### Dwie aplikacje

| App | Stack | Rola | Render service | Production URL |
|---|---|---|---|---|
| **`project 3/`** | Next.js 13, React, Tailwind | Calculator (Primundus 24h-Pflege Kostenrechner) — public landing, lead-capture wizard, pricing config, magic-link email | `kostenrechner` | `kostenrechner.primundus.de` |
| **`/` (root)** | Vite + React 18 + TS, Tailwind | CA app (Kundenportal) — token-gated portal gdzie customer wypełnia patient form, ogląda zaproponowane PK, akceptuje/odrzuca aplikacje | `caapp` | `kundenportal.primundus.de` |

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

- **GraphQL (aktualnie używany, "Mamamia preprod"):**
  `https://backend.prod.mamamia.app/graphql` (URL w secret `MAMAMIA_ENDPOINT`).
  Nazwa myli — to nie *nasza* produkcja, to Mamamia production-grade
  tenant którego używamy jako preprod. Switch z beta tenanta wykonany
  2026-05-11 (patrz Bug #15 + #16).
- **GraphQL (Mamamia beta tenant, NIE aktualnie używany):**
  `https://backend.beta.mamamia.app/graphql` — forward-going dev env
  z newer schema. Dostępny dla porównań schema (jak Bug #16) jeśli
  potrzeba zdebugować rozjazdy.
- **Panel UI (agency):** `https://backend.prod.mamamia.app/...` (preprod
  panel). Beta panel pod `https://backend.beta.mamamia.app/...`.
- **Auth:** agency token refreshed via `MAMAMIA_AGENCY_EMAIL` /
  `MAMAMIA_AGENCY_PASSWORD` — ZAWSZE server-side. Nigdy nie wystawiać
  agency credentials do browsera. Każdy tenant (beta vs preprod) ma
  **osobne credentials** — agency w beta to inny user niż w preprod.
- **Customer ID space:** numeric `Customer.id` + readable `customer_id`
  string. Per-tenant osobne auto-incrementy — `Customer.id=8420` w
  preprod to inny customer niż `Customer.id=8420` w beta. Patrz §"Naming
  convention" wyżej + Bug #15 (ServiceAgency ID per-tenant).
- **ServiceAgency ID (Primundus):** preprod=`3`, beta=`18`. Hardcoded
  per env w `supabase/functions/onboard-to-mamamia/onboard.ts:PRIMUNDUS_AGENCY_ID`.

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
- **CI:** GitHub Actions (`.github/workflows/test.yml`) — vitest +
  2× deno na każdy PR. Branch protection wymaga 3 status checks
  green + 1 approving review przed merge.

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
| `src/__tests__/` | Vitest (frontend) — `mamamia/`, `integration/`, `supabase.test.ts`. **163 cases** (stan na 2026-05-08, CI commit d17ac93) |
| `supabase/functions/onboard-to-mamamia/_tests/` | Deno (Edge Function) — `mappers.test.ts`, `onboard.test.ts`, `session.test.ts`, `handler.test.ts`. **124 cases** |
| `supabase/functions/mamamia-proxy/_tests/` | Deno — `actions.test.ts`, `handler.test.ts`. **31 cases** |

### Deploy / Infra

| Plik | Co robi |
|---|---|
| `render.yaml` | Blueprint dla obu serwisów (caapp-beta + kostenrechner-beta) |
| `.env.local` | Local dev — VITE_SUPABASE_URL/ANON_KEY (NIE commit) |
| `.env.example` | Template dla CAapp `.env.local` — bezpieczne klucze + komentarze |
| `project 3/.env.example` | Template dla calculator `.env` — j.w. |
| `tsconfig.json` / `tsconfig.build.json` | Production build pomija test files |
| `.github/workflows/test.yml` | CI — vitest + 2× deno tests na PR/push do `integration/mamamia-onboarding` |
| `.github/pull_request_template.md` | Auto-load template przy każdym PR (Summary / Why / Test plan / Documentation updates) |
| `ONBOARDING.md` | Operations manual dla nowego dev'a — clone do PR w 30-60 min |

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
| germanLevel | deutschkenntnisse | wish.germany_skill | grundlegend=**level_1**, kommunikativ=**level_2**, sehr-gut=level_4 (updated 2026-05-12, level_3 świadomie pomijany — agency picks manually). **No soft default** — mapper throws na unknown/missing value (Święta zasada nr 1). |
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
- `tool_ids` — mobility-derived. `mobility=1 (mobil)` → `[]` (pacjent samodzielny, brak Hilfsmittel). `mobility=2 (Gehstock)` → `[1 walking stick]`. `mobility=3 (rollator)` → `[2 rollator]`. `mobility=4 (wheelchair)` → `[3 wheelchair]`. `mobility=5 (bedridden)` → `[4 hoist, 6 care bed]`. NIGDY id=7 (Inne) — triggeruje required free-text "Jakie inne narzędzia są używane?".
- `gender` patient — fallback "female" gdy lead.anrede missing
  (Marcin's calc nie zbiera).

### Patient form (AngebotCard) → Mamamia (UpdateCustomer)

| Form field | PatientForm key | Mamamia target | Notes |
|---|---|---|---|
| Anzahl | anzahl | (drives patients[] length) | "1" or "2" |
| Geschlecht (Person 1/2) | geschlecht / p2_geschlecht | patient.gender | Weiblich=female, Männlich=male |
| Geburtsjahr | geburtsjahr / p2_geburtsjahr | patient.year_of_birth | int |
| Pflegegrad | pflegegrad / p2_pflegegrad | patient.care_level | "Pflegegrad N" → N |
| Gewicht | gewicht / p2_gewicht | patient.weight | middle = bucket "61-70" + " kg" (strip on send). Edges (Bug #17b): "Unter 50 kg"↔"40-50", "Über 100 kg"↔"> 100" (ze spacją!) |
| Größe | groesse / p2_groesse | patient.height | middle = bucket "161-170" + " cm" (strip on send). Edges (Bug #17b): "Unter 151 cm"↔"140-150", "Über 190 cm"↔"190+" (bez spacji) |
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
| 13d | **Patient form save — panel "Lokalizacja opieki" puste mimo wpisanego PLZ+Ort**. patientFormMapper wysyłał tylko `location_custom_text` (np. `"80332 Munchen"`) bo `mapPatientFormToUpdateCustomerInput` nie resolwowało PLZ → location_id. Mamamia panel dropdown wymaga canonicznego `location_id` z tabeli Locations — `location_custom_text` jest fallbackiem manual-entry. Symptom: Customer 7655 (Test66) miał `location_id=null + location_custom_text="80332 Munchen"`, panel pokazywał lokalizację jako pustą | src/pages/CustomerPortalPage.tsx (onSaveToMamamia) | Przed `mapPatientFormToUpdateCustomerInput`, gdy `form.plz` matchuje `/^\d{4,5}$/`, callMamamia('searchLocations', {search: plz}) → wybierz pierwszy match z `country_code='DE'` → przekaż jego `id` jako `locationId` opt do mappera. Mapper preferuje `locationId` → `location_id`; lookup failure swallow → fallback do `location_custom_text` (defense in depth). |
| 13e | **Pflegegrad 0 ("Kein/e") nie round-trippuje**. Kalkulator pozwala wybrać `pflegegrad: 0` (klient bez oficjalnej einstufung), ale: (1) prefill ignorował 0 (`fd.pflegegrad ? ... : undefined` — falsy check); (2) form save z "Kein/e" → `parsePflegegrad` zwracał `null` → patientFormMapper omittował `care_level` → Mamamia trzymała stare 2. Symptom: Customer 7658 (Test77) wybrał Kein/e w formularzu, panel pokazywał care_level=2 | src/lib/supabase.ts (`prefillPatientFromLead`), src/lib/mamamia/patientFormMapper.ts (`parsePflegegrad`, `buildJobDescriptionSummary`, `buildPatient`), src/lib/mamamia/mappers.ts (`mamamiaPatientToForm`), supabase/functions/onboard-to-mamamia/{mappers,types}.ts | **Mamamia natywnie wspiera "Keine" jako `care_level: null`** (zweryfikowane live 2026-05-07 na Customer 7658 po ręcznym ustawieniu "brak" w panelu). Forward 1:1: kostenrechner `pflegegrad=0` → onboard `care_level: null` → Mamamia "Keine". Form "Kein/e" → patientFormMapper `care_level: null` → Mamamia "Keine". Reverse mapper: `care_level === null` → `"Kein/e"`. Sygnatury zwracają `number \| null`; `PatientInput.care_level: number \| null`. **Pierwsza wersja tego fixa wymyśliła hack `care_level=1 + sentinel tag w job_description`** — fałszowała dane (agency widział "Pflegegrad 1" zamiast "Keine"). User scolded; reguła zapisana drukowanymi w "ŚWIĘTA ZASADA NR 1.5". |
| 13f | **Weight/height — Mamamia stores raw bucket bez " kg"/" cm" suffixu, w 10-step granularity**. Live verify 2026-05-07 na Customer 7658 po ręcznym pickowaniu w panelu: weight=`"71-80"`, height=`"171-180"` (NIE `"71-80 kg"`, NIE `"70-90"` 20-step). Nasza form miała 20-step granularity z " kg" suffixem + en-dash → triple mismatch z Mamamia panel dropdown enum | src/components/portal/AngebotCard.tsx (form options), src/lib/mamamia/patientFormMapper.ts (`normalizeBucket`) | Form options 10-step grain: weight `['Unter 50 kg', '51-60 kg', '61-70 kg', '71-80 kg', '81-90 kg', '91-100 kg', '101-110 kg', 'Über 110 kg']`, height `['Unter 151 cm', '151-160 cm', '161-170 cm', '171-180 cm', '181-190 cm', 'Über 190 cm']`. UI zachowuje " kg"/" cm" suffix dla czytelności. `normalizeBucket` strip suffix przed wysłaniem (`/\s*(?:kg\|cm)$/`) + zachowany en-dash → ASCII fallback dla legacy drafts. Reverse mapper bez zmian — już dodaje " kg"/" cm" gdy missing. |
| 13g | **Hardkodowany "mind. B1" w step 4 patient form (Sprachniveau)** — pole price-relevant read-only, ale label nie odzwierciedlał faktycznej wartości z `mmCustomer.customer_caregiver_wish.germany_skill` (która może być level_2/4 jeśli klient wybrał grundlegend/sehr-gut, lub manual panel pick A1/A2). Symptom: Test77 z `deutschkenntnisse=sehr-gut` (level_4) nadal widział "mind. B1" | src/lib/mamamia/mappers.ts (`germanySkillLabel`), src/components/portal/AngebotCard.tsx | Helper `germanySkillLabel(level)` mapuje enum → label DE: `level_0→"A1"`, `level_1→"A2"`, `level_2→"mind. A2"`, `level_3→"mind. B1"`, `level_4→"mind. C1"`, `not_important→"Egal"`. AngebotCard step 4 czyta dynamicznie z `mmCustomer?.customer_caregiver_wish?.germany_skill`, fallback `"—"` gdy missing. |
| 13h | **Saved state resetuje się po peek-and-close lub refresh**. Patient Save → "Vollständig ausgefüllt" zielone ✓. Click w chevron żeby podejrzeć (lub F5) → wraca do "Unvollständig". Przyczyna: `onClick={() => { setPatientOpen(o => !o); setSaved(false); }}` na chevronie ustawiał `saved=false` niezależnie od interakcji, autosave effect potem zapisywał `_isDraft: true` do localStorage — następny refresh czytał draft state | src/components/portal/AngebotCard.tsx | (1) Chevron onClick toggluje tylko `patientOpen`, NIE rusza `saved`. (2) `updatePatient` (wrapper na user-driven setPatient) dorzuca `setSaved(false)` — tylko realne edycje wracają do draft mode. Sequence po fixie: Save → saved=true + `_isDraft=false`; chevron peek → saved zostaje true; edit → saved=false + autosave `_isDraft=true`; refresh czyta `_isDraft=false` → "Vollständig". |
| 13i | **Mobilne iOS WebKit (Safari + Chrome) blokuje session cookie po onboard** — opiekunki nie ładują się na iPhone/iPad mimo że strona renderuje się poprawnie. Desktop OK. Symptom: Customer 7659 (Test iPhone) miał 6 matchings w Mamamii, na iPhone Chrome lista pielęgniarek pusta. Przyczyna: ITP w iOS WebKit drop cross-site session cookie z `*.supabase.co` na top-level `caapp-beta.onrender.com` mimo `SameSite=None; Secure` — onboard ustawia cookie ale browser nie odsyła go na proxy calls → 401 → matchings hooks empty | supabase/functions/_shared/session.ts | **Pierwsza próba** dodała `Partitioned` attribute (CHIPS) — niewystarczające w incognito iOS WebKit (cookie nadal drop). Patrz #13j dla pełnego fixa. |
| 13j | **#13i fix #1 (Partitioned cookie) niewystarczający dla iOS WebKit incognito** — diagnostyka via `?debug=1` overlay (#13j-debug) na Test iPhone Customer 7659 pokazała: `cookie raw: (empty)`, `mmSession: ready=true`, ale wszystkie proxy calls 401 `{"error":"no session"}`. iOS WebKit incognito mode aggressively drops third-party cookies regardless of `Partitioned`. | supabase/functions/onboard-to-mamamia/index.ts (response body), supabase/functions/mamamia-proxy/index.ts (header read), supabase/functions/_shared/cors.ts (Allow-Headers), src/lib/mamamia/client.ts (sessionStorage + header send) | Header-based session token (cookie zostaje jako transparent fallback dla desktop). (1) Onboard zwraca `session_token: jwt` w JSON body (obok `customer_id`/`job_offer_id`). (2) Frontend `client.ts` stashuje token w `sessionStorage[mamamia_session_token]` po onboard, forwarduje jako `X-Session-Token` header na każdym proxy call. (3) Proxy reads `x-session-token` header pierwsze, fallback do cookie (backward compat). (4) CORS Access-Control-Allow-Headers extended z `x-session-token`. Działa w incognito + każdym browserze niezależnie od ITP. Token gone gdy tab close (sessionStorage scope). |
| 13j-debug | **Mechanizm debug dla iOS issues bez DevTools dostępu**. Bez Mac Safari → iPhone remote debug, ślepe spekulacje (Bug #13i Partitioned cookie nie pomogło) | src/pages/CustomerPortalPage.tsx (debug overlay) | URL z `?debug=1` aktywuje fixed-bottom panel z czarnym tłem + zielonym monospace text. Pokazuje: token, document.cookie raw, userAgent, lead/mmSession state, każdy hook (mmCustomer/JobOffer/Apps/Matchings/invitedCaregivers) loading/error/data. User screenshotuje, sysłalem fixy oparte o konkrety. Production bez `?debug=1` nie widzi. |
| 13l | **Mamamia panel "Lokalizacja opieki" nie zaciągało się mimo Customer.location_id ustawionego**. Bug #13d ustawia top-level `Customer.location_id` przez searchLocations lookup, ALE panel "Lokalizacja opieki" reads z `customer_contracts[].location_id` (osobny wiersz). Bug #13 wyciął contracts z onboardu (delegated to acceptance) → patient form save tworzy customer.location_id, ale customer_contracts stays []. Empirical verification 2026-05-07 na Customer 7661 (testiphone2): user wpisał ręcznie "01108 Marsdorf" w panel → Mamamia auto-stworzyła 2 contracts (patient_contact + contract_contact) z location_id. Diff potwierdził że panel reads from contracts | supabase/functions/mamamia-proxy/operations.ts (UPDATE_CUSTOMER args), supabase/functions/mamamia-proxy/actions.ts (UPDATE_CUSTOMER_ALLOWED), src/lib/mamamia/patientFormMapper.ts (MappedCustomerPatch + emit contracts) | UPDATE_CUSTOMER mutation: dodać `$patient_contracts: [CustomerContractInputType]` + `$invoice_contract: CustomerContractInputType`. UPDATE_CUSTOMER_ALLOWED: dodać te pola do whitelisty. patientFormMapper: gdy `opts.locationId` resolved, emit `patient_contracts: [{contact_type:"patient_contact", location_id}]` + `invoice_contract: {contact_type:"contract_contact", location_id}`. Sanity test 2026-05-07 na Customer 7659: HTTP 200, contracts utworzone z `location_id=14380`. NIE wysyłamy innych pól contractu (name, street, salutation) — patient form ich nie zbiera, ustaje przy acceptance via StoreConfirmation. Edge: jeśli user manualnie wpisał inne pola contractu w panelu między Save calls, nasz Save je nadpisuje (Mamamia replaces contract list). Akceptowalne dla MVP. |
| 13k | **Pflegedienst description nie zaciągało się w Mamamia panel "Jak często i jakie zadania wykonuje Pflegedienst?"** — patientFormMapper pakował frequency+tasks w `job_description` jako `Pflegedienst: <freq>: <tasks>` segment, bo gotcha #2 (2026-05-05) mówiło że dedicated args ŁAMIĄ mutation. **Schema się zmieniło od 2026-05-05** — zweryfikowane live 2026-05-07: introspection pokazała 4 dedicated args na `UpdateCustomer`, sanity test na Customer 7659 wpisał wartości i mutation HTTP 200. ŚWIĘTA ZASADA NR 1.5: gotchas też podlegają empirycznej weryfikacji okresowo | supabase/functions/mamamia-proxy/operations.ts (UPDATE_CUSTOMER + GET_CUSTOMER), supabase/functions/mamamia-proxy/actions.ts (UPDATE_CUSTOMER_ALLOWED), src/lib/mamamia/patientFormMapper.ts, src/lib/mamamia/mappers.ts (reverse), src/lib/mamamia/types.ts | (1) UPDATE_CUSTOMER mutation: dodać 4 args `day_care_facility_description{,_de,_en,_pl}`. (2) GET_CUSTOMER select: dodać te same. (3) UPDATE_CUSTOMER_ALLOWED whitelist: dodać. (4) patientFormMapper: gdy pflegedienst=Ja, wysyłać do dedykowanych pól (3 lokale + no-locale variant mirror DE), drop `Pflegedienst:` segment z job_description. (5) Reverse mapper: czytać z `day_care_facility_description_de` (lub no-locale fallback) pierwsze; legacy `job_description` segment parser jako fallback dla customers utworzonych pre-Bug-#13k. |
| 14 | **CI flakes ujawnione w pierwszym GitHub Actions run** (2026-05-07) — testy przechodzące lokalnie u Michała padały na ubuntu-latest UTC runner. Dwa różne wzory: (1) `formatDate('2025-12-31T23:59:59Z') === '01.01.2026'` w supabase.test.ts działało tylko w UTC+ TZ (CEST u Michała, UTC na CI → '31.12.2025'); (2) 3 pliki testów onboard hardcodowały `token_expires_at: "2026-05-07T12:00:00Z"` — passed lokalnie (Michał uruchamiał rano), padało na CI od ~14 UTC tego dnia z "lead token expired or invalid". Pre-existing flakes maskowane lokalnym setupem | .github/workflows/test.yml (TZ pin), supabase/functions/onboard-to-mamamia/_tests/{handler,onboard,mappers}.test.ts | (1) Pin `TZ=Europe/Berlin` w vitest job env — pasuje do produkcji (niemieccy klienci) i naprawia tym samym wszystkie przyszłe TZ-dependent testy. (2) Bump `token_expires_at` do `"2099-01-01T00:00:00.000Z"` we wszystkich 3 fixture'ach — nigdy nie wygaśnie podczas runa. **Reguła:** każda data w testach która ma być "w przyszłości" → bump do 2099 lub `new Date(Date.now() + N).toISOString()`. NIE używaj dat względem dzisiejszej, bo CI runuje 24/7. |
| 15 | **Switch beta → preprod Mamamia padał z `validation [{"service_agency_id":["...ist ungültig."]}]`** (2026-05-11). Po set'cie nowych secrets MAMAMIA_ENDPOINT + AUTH + AGENCY_EMAIL + AGENCY_PASSWORD w Supabase + redeploy Edge Functions, pierwszy onboard zwracał generic "onboarding failed". `DEBUG_ONBOARD=1` ujawnił że Mamamia odrzuca StoreJobOffer.service_agency_id=18 — to był id Primundus w beta.mamamia.app, prod ma id=3. Każdy tenant Mamamia ma osobny auto-increment, IDs się nie zgadzają między beta/prod | supabase/functions/onboard-to-mamamia/onboard.ts (`PRIMUNDUS_AGENCY_ID`), supabase/functions/onboard-to-mamamia/index.ts (DEBUG_ONBOARD gate) | (1) `PRIMUNDUS_AGENCY_ID = 3` dla prod (było 18 dla beta). Komentarz w kodzie listuje IDs per env. (2) Discovery: `{ ServiceAgency { id name } }` na live endpoint — query bez arg zwraca singleton dla zalogowanego agency user'a (Primundus = ten user). (3) Dodany `DEBUG_ONBOARD=1` env-gate analog do `DEBUG_PROXY` — gdy ustawiony, onboard zwraca underlying Mamamia error w body zamiast generic "onboarding failed". Default off; włącz tylko podczas diagnozy. **Reguła:** każdy hardcoded ID z Mamamia jest per-tenant. Przy następnym env switch'u (preprod → real prod, czy fresh tenant) — zrób query żeby zweryfikować że IDs są aktualne, NIE zakładaj że beta→prod ma identyczny seed data. Long-term TODO: fetch raz przy cold-start Edge Fn i cache w module singleton (eliminacja hardcode). |
| 17b | **Weight/height edge buckets silently dropped na save** (2026-05-12). User wybiera "Unter 50 kg" / "Über 110 kg" / "Unter 151 cm" / "Über 190 cm" w formularzu → save HTTP 200 OK, ale panel Mamamii pokazuje pola jako puste. Przyczyna: Bug #13f rozwiązywał MIDDLE buckets (10-step "51-60", "171-180" itd.) ale Mamamia używa NON-UNIFORM konwencji dla brzegowych: weight low=`"40-50"`, weight high=`"> 100"` (ze spacją!), height low=`"140-150"`, height high=`"190+"` (bez spacji). Stara `normalizeBucket` tylko strip'owała ` kg`/` cm` → wysyłaliśmy literalne "Unter 50" / "Über 110" / "Unter 151" / "Über 190" — Mamamia silently dropped. Bonus: nasz form miał 8 weight buckets (split "101-110" + "Über 110") podczas gdy Mamamia ma 7 (top = "> 100"), więc "101-110" nigdy nie istniało. | src/components/portal/AngebotCard.tsx (form options: drop "101-110 kg", rename top do "Über 100 kg"), src/lib/mamamia/patientFormMapper.ts (`WEIGHT_EDGE` / `HEIGHT_EDGE` lookup tables w `normalizeBucket`), src/lib/mamamia/mappers.ts (`mamamiaWeightToForm` / `mamamiaHeightToForm` reverse edge mapping), 2 testy | Edge mapping verified live na Customer 8454 przez DevTools po manual panel pick. Forward: `'Unter 50' → '40-50'`, `'Über 100' → '> 100'`, `'Unter 151' → '140-150'`, `'Über 190' → '190+'`. Reverse: same w drugą stronę. Middle buckets niezmiennie strip suffix. **Reguła:** zanim założysz że Mamamia panel używa uniformego naming dla enum-like field — set wszystkie edge cases ręcznie w panelu, pobierz przez DevTools / `Customer { patients { weight height } }`, dopiero potem koduj mapping. Mamamia ma quirky historical conventions per field.
| 17 | **inviteCaregiver flow padał na preprod** (2026-05-12). Frontend "Pflegekraft einladen" → proxy → `csrf-cookie` lookup pod złym hostem → DNS error: `https://prod.mamamia.app/backend/sanctum/csrf-cookie` `failed to lookup address`. Przyczyna: `derivePanelBaseUrl` w `mamamia-proxy/index.ts` zakładało że panel SPA siedzi na tym samym hoście co GraphQL API (strip `backend.` prefix + `/backend` path) — konwencja **tylko** beta. Mamamia hostuje panel SPA na **osobnym subdomain'ie** per tenant: beta=`beta.mamamia.app/backend`, preprod=`portal.mamamia.app/backend`. Nie da się tego derive'ować z `MAMAMIA_ENDPOINT` host'a — to zupełnie inny DNS record. **False-trail diagnoza (2 godziny)**: pierwsza próba fix'a wyderywowała `panelBaseUrl = origin(MAMAMIA_ENDPOINT)` → `https://backend.prod.mamamia.app` (host GraphQL API, NIE panel). Sanctum tam też ma middleware, więc cookies się ustawiały + LoginAgency zwracało 200. Ale StoreRequest → `Unauthorized` (HTTP 200 + `cat=authorization`). Błędnie zinterpretowane jako "tenant role permission gap" — eskalacja do Mamamia ops jako action item. Dopiero user otworzył panel w przeglądarce + skopiował URL z DevTools Network: `https://portal.mamamia.app/backend/graphql`. Inny host. Po przekierowaniu na właściwy URL `Unauthorized` nadal — ale przyczyna była **JobOffer.status='inactive'** dla tego konkretnego customer'a (8450, test setup), nie permission gap. Panel-mode StoreRequest wymaga active job offer. | supabase/functions/mamamia-proxy/index.ts (ProxySecrets + bootstrap), supabase/functions/_shared/mamamiaPanelClient.ts (verbose error format), supabase/functions/mamamia-proxy/_tests/handler.test.ts (SECRETS), Supabase secret `MAMAMIA_PANEL_URL` | (1) `MAMAMIA_PANEL_URL` jako **wymagany** secret (no soft fallback per Święta zasada nr 1), bootstrap throws gdy brak — wartość per-tenant ustalana przez inspekcję DevTools Network w żywym panelu Mamamii (beta=`https://beta.mamamia.app/backend`, preprod=`https://portal.mamamia.app/backend`). (2) `panelGraphQL` error format wzbogacony o `http=<status> cat=<extensions.category> cookies=<names>` — ułatwia rozróżnianie network/CSRF vs policy denial. **Lekcje:**  (a) URL endpoint'ów panel'a Mamamia jest **per-tenant, nie derywowalny** z GraphQL API URL'a — zawsze otwórz panel w przeglądarce + DevTools Network przed kodowaniem. (b) Sanctum cookies + LoginAgency 200 to NIE dowód że jesteśmy na właściwym endpoincie. `cat=authorization` może wskazywać na permission gap LUB na resource state (np. inactive job offer) LUB na sam zły endpoint — diagnoza wymaga real-panel comparison. (c) Anti-pattern: zacząć "policy denial → eskalacja do ops" przed zwykłą weryfikacją "co panel UI rzeczywiście fires" w DevTools. **Reguła do § Environment switch checklist:** krok 0 — otwórz panel SPA w przeglądarce, pobierz panel URL z DevTools, ustaw jako `MAMAMIA_PANEL_URL` secret. |
| 16 | **Patient form save (4-stopniowy wizard) nie zapisywał po preprod switch** (2026-05-12). `getCustomer` zwracał `Cannot query field "customer_contracts" on type "Customer". Did you mean "customer_contacts" or "customer_contract"?`. Beta Mamamia ma plural `customer_contracts` (1:n contracts z `contact_type` discriminator) — prod ma legacy singular `customer_contract` (1:1). Bug #13l fix (2026-05-07) napisany pod beta extension, niedostępny w prod. Probe beta + prod schema dowodzi: singular `customer_contract` istnieje w obu środowiskach (na becie zwraca pierwszy z plural'a) i jest writable via `UpdateCustomer(customer_contract: CustomerContractInputType, ...)` w obu. Plural args (`patient_contracts`, `invoice_contract`) — beta only | supabase/functions/mamamia-proxy/operations.ts (GET_CUSTOMER + UPDATE_CUSTOMER), supabase/functions/mamamia-proxy/actions.ts (UPDATE_CUSTOMER_ALLOWED), src/lib/mamamia/types.ts (MamamiaCustomer), src/lib/mamamia/mappers.ts (reverse), src/lib/mamamia/patientFormMapper.ts (forward + MappedCustomerPatch type), 2 testy | Refactor `customer_contracts[]`/`patient_contracts[]`/`invoice_contract` → `customer_contract` (singular) wszędzie. Universal lowest-common-denominator — działa na obu środowiskach. Beta tracimy 2-contract distinction (patient_contact vs contract_contact) ale i tak pisaliśmy w oba ten sam `location_id` (zero data loss). Verified live 2026-05-12: getCustomer + UpdateCustomer + verify roundtrip działa na Customer 8420 (prod). **Lesson:** beta i prod mogą mieć schema drift — zawsze probe pełen GraphQL przed env switch zamiast ufać że Mamamia tenants są spójne. Patrz §"Environment switch checklist" → krok 5 ("Verify hardcoded IDs") + rozszerz na pełen field-probe gdy schema-related fields są pod ryzykiem. |

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
- `caapp` (Vite static) — ~1.5min — serwowany na `https://kundenportal.primundus.de`
- `kostenrechner` (Next.js SSR) — ~2-3min — serwowany na `https://kostenrechner.primundus.de`

Render slot URLs (`caapp.onrender.com` + `kostenrechner.onrender.com`)
nadal działają jako fallback. Historyczne nazwy `caapp-beta` /
`kostenrechner-beta` zostały zrename'owane 2026-05-14 — odniesienia
w starszych komentarzach + bug logach poniżej zostawione celowo.

Render dashboard: pokazuje build logs. Jeśli build padnie, Render trzyma
poprzednią wersję live.

### Edge Functions (auto, via CI)

**Zmiany w `supabase/functions/*` ZAWSZE przez PR.** Po merge do
`integration/mamamia-onboarding` GitHub Actions (`deploy-edge-functions`
job w `.github/workflows/test.yml`) automatycznie deployuje funkcje do
prod Supabase. To jest single source of truth — gita.

**NIGDY** `supabase functions deploy` lokalnie ani direct push na
`integration/mamamia-onboarding`. Każdy lokalny deploy to race condition:
wgrywa stan TWOJEGO dysku, nie git HEAD, więc cudze zmiany w chmurze
mogą wyparować (incydent 2026-05-13 z `hp_caregiver_id` był dokładnie tym).

**Emergency hotfix** (tylko gdy CI padło i klient krwawi):
```bash
# 1. Confirm jesteś na czystym integration/mamamia-onboarding zsync z origin
git fetch origin && git diff HEAD origin/integration/mamamia-onboarding -- supabase/functions/
# Diff musi być pusty. Jeśli nie — pull/merge najpierw.

# 2. Deploy
npx supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi
```

Często musisz zdeployować **OBA** (`onboard-to-mamamia` + `mamamia-proxy`)
gdy zmiany dotyczą shared modules w `_shared/`. CI deploy robi to za
Ciebie (wszystkie funkcje po kolei).

**Branch protection** na `integration/mamamia-onboarding` wymaga PR + passing
CI checks (`vitest`, `deno-onboard`, `deno-proxy`) przed merge. To
strukturalnie blokuje direct push.

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

### PR template

Plik `.github/pull_request_template.md` auto-loaduje się przy każdym
otwartym PR. Sekcje: Summary / Why / Test plan (4 testy + e2e + smoke)
/ Documentation updates (mapowanie 1:1 na tabelę "Pliki które MUSZĄ być
w sync z kodem" z §"Święta zasada nr 2"). Nie usuwaj checklist'y —
wymuszenie spójności jest celem.

---

## GitHub workflow (PR / CI / branch protection)

Setup post-2026-05-07 (commit dodający Marcin'a jako collaboratora).
Przed tym commit'em workflow był "Michał pcha do `integration/...`
i Render auto-deploy'uje". Teraz wymuszamy PR-flow dla każdego — w tym
Michał (z `enforce_admins: false` może obejść w emergency, ale to
zarezerwowane do hot-fix'ów prod, nie codzienna ścieżka).

### Default branch dla pracy

`integration/mamamia-onboarding` jest "main" zespołu. Render auto-deploy
beta na każdy push do tego brancha. `main` istnieje historycznie ale
jest stary — **nie ruszamy**.

### Branch protection na `integration/mamamia-onboarding`

Skonfigurowane via `gh api repos/WilfulGrey/CAapp/branches/.../protection`
(commit `c277035`):

| Reguła | Wartość | Co znaczy |
|---|---|---|
| `required_pull_request_reviews.required_approving_review_count` | **0** | PR wymagany ALE **bez approve** — autor sam mergeuje gdy CI green. Decyzja 2026-05-08: Michał nie chce być review-bottleneckiem; CI + PR-only path uznane za wystarczający quality gate. |
| `required_pull_request_reviews.dismiss_stale_reviews` | false | (irrelevant przy 0 approvals) |
| `required_status_checks.strict` | true | Branch musi być up-to-date z target zanim merge. |
| `required_status_checks.contexts` | `vitest (frontend)`, `deno tests (onboard-to-mamamia)`, `deno tests (mamamia-proxy)` | 3 jobs musi być green. **To jedyna realna brama.** |
| `enforce_admins` | false | Michał (admin) może obejść w hot-fix. **Używaj świadomie.** |
| `allow_force_pushes` / `allow_deletions` | false | Nie da się zniszczyć historii brancha. |

**Implikacja:** każdy dev z `write` permission może self-merge swój PR po
zielonym CI. Code review jest opcjonalny (post-merge, on-demand). Jeśli
wynik okaże się problematyczny — zmień `required_approving_review_count`
na 1 przez `gh api -X PUT .../protection`.

### CI workflow (`.github/workflows/test.yml`)

3 jobs runują na każdy PR + push do `integration/mamamia-onboarding`:

1. **`vitest (frontend)`** — `npm ci` + `npx vitest run` + `tsc --noEmit`.
   Pin `TZ=Europe/Berlin` w env (patrz Bug #14 dla rationale).
2. **`deno tests (onboard-to-mamamia)`** — Deno setup + `deno task test`.
3. **`deno tests (mamamia-proxy)`** — Deno setup + `deno task test`.

Jobs runują równolegle (≈40-60s każdy). Cache: npm cache action automatic;
Deno nie ma persistent cache w tym workflow (dla deps reload at start —
remote modules, nie mamy lockfile cross-platformowy żeby cache walidować).

### Co aktywnie robi CI

- Sygnalizuje czerwonym `failed` na PR-e zanim merge — Michał widzi przed approve
- Re-runuje na każdy push do PR (force-push też triggeruje)
- Status checks pojawiają się jako wymagane w "Merge" button — branch
  protection blokuje przycisk gdy któryś job czerwony

### Co NIE robi CI (gotchas)

- **Nie deploy'uje Edge Functions** — Supabase Edge Functions lecą
  manualnie (`npx supabase functions deploy <name> --project-ref ...`).
  CI tylko testuje logikę.
- **Nie sprawdza tsc w `project 3/`** — pre-existing TS errors w
  Next.js typings (lucide CircleCheck, next/navigation). Skupiamy się
  na `src/` clean. Jeśli CI zacznie pinwheelować na `project 3/`,
  dodaj exclude w workflow.
- **Nie testuje przeciw beta backend** — wszystkie testy używają
  fixture'ów / mocks / `fetchFn` injected. Real e2e przez curl recipe
  z §"E2e verification recipe" — manual.

### Workflow per task (każdy dev)

```bash
# 1. Pull latest
git checkout integration/mamamia-onboarding && git pull

# 2. Branch off
git checkout -b fix/<scope>-<short-desc>

# 3. Pracuj. Commit (multi-commit OK — squash przy merge).

# 4. Test lokalnie ZANIM push
npx vitest run
# (deno tests jeśli ruszałeś Edge Functions)

# 5. Push + open PR
git push -u origin fix/<scope>-<short-desc>
gh pr create --base integration/mamamia-onboarding --title "..." --body "..."
# albo via UI — template auto-load

# 6. CI runuje (~60s). Czekamy na green.
# 7. Self-merge (CI green = wystarcza, approve nie jest wymagany).
#    GitHub UI → "Squash and merge" preferowane (clean history).
# 8. Po merge — Render auto-deploy beta (~2-3 min).
```

### Hot-fix path (admin override)

Gdy beta się pali i czekanie na CI/review = ryzyko biznesowe:

```bash
git checkout integration/mamamia-onboarding
# fix
git commit -m "hotfix(...): ..."
git push origin integration/mamamia-onboarding
# Branch protection przepuści (enforce_admins=false). Render zacznie
# build natychmiast. Zrób PR retro do code review history.
```

**Używaj świadomie** — to obejście wszystkich review'ów. Lepiej tracić
5 minut na PR niż 5 godzin na nieoczekiwany rollback.

### ONBOARDING.md — manual operations dla nowych devów

Plik `ONBOARDING.md` w repo root — od-zera-do-PR dla nowego
współpracownika. Zawiera: clone setup, .env handling (paczka osobnym
kanałem), install + dev, testy, branch/PR workflow, Render deploys,
troubleshooting. **Linkowany z każdej onboarding wiadomości do nowego
devа** — nie powtarzaj treści w Slacku, link do plik'a.

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

- **TZ-dependent test pada na CI** (UTC) ale przechodzi lokalnie (CEST/CET):
  data parsing który rolluje się na granicy dnia (`23:59:59Z` → next day
  w UTC+1, same day w UTC). Nasz CI pinuje `TZ=Europe/Berlin` w env
  vitest job — jeśli twój nowy test pada tylko na CI bez pina, sprawdź
  czy nie zakładasz lokalnej TZ. Patrz Bug #14.
- **Date hardcoded "dzisiaj N:NN UTC"** — token expiry / arrival_at /
  podobne. Pada w CI run po tej godzinie tego dnia. Fix: bump na
  `2099-01-01` lub użyj `new Date(Date.now() + N).toISOString()`. Bug #14.
- Frontend Vitest jest jsdom-based, nie real browser. Niektóre ipv6
  / network features nie działają.
- MSW mocks żyją w `test/setup.ts`. Sprawdź czy nie kolidują z fetch'em.
- Edge Function tests używają fake `fetchFn` injected — jeśli kod woła
  `fetch` bezpośrednio zamiast `deps.fetchFn`, test pominie network mock.
- **CI green ale lokalnie red** — najczęściej brakuje `npm install`
  po pull (lockfile się zmienił) lub stale `node_modules/`. `rm -rf
  node_modules && npm ci` rozwiązuje 90% przypadków.

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
- ❌ Direct push do `integration/mamamia-onboarding` (admin override mimo
  branch protection). Każda zmiana = feature branch + PR + CI green +
  1 review. Wyjątek: hot-fix prod fire — patrz §"Hot-fix path". Bug #14
  pokazał że nawet "pewne lokalnie" testy padają na CI runner.
- ❌ Hardcoded daty w testach (`token_expires_at: "2026-05-07..."`).
  Bump na `2099-01-01` lub relative `Date.now() + N`. CI runuje 24/7,
  twoja "jutrzejsza" data wygaśnie nim się zorientujesz.
- ❌ Założenia o lokalnej TZ w testach formatowania dat. CI runuje UTC.
  Pin `TZ` w workflow albo użyj UTC-relative assertions.
- ❌ Hardcoded Mamamia IDs (`PRIMUNDUS_AGENCY_ID`, `location_id`-y,
  etc.) bez znacznika środowiska. IDs są **per-tenant** — beta i prod
  to oddzielne bazy z osobnymi auto-increment'ami. Przy switch'u env
  zweryfikuj IDs live query'em (`{ ServiceAgency { id name } }` itp.),
  nie zakładaj że seed jest spójny. Patrz Bug #15.

---

## Environment switch checklist

Switching Supabase Edge Function secrets między środowiskami Mamamia
(np. beta → preprod → prod) jest niskim-kontaktowym kodzie ale wymaga
weryfikacji per-tenant invariants. Sekwencja:

### 1. Backup current secrets digests

```bash
npx supabase secrets list --project-ref <SUPA_REF>
# Zapisz digesty 4 MAMAMIA_* — przyda się gdyby trzeba rollback.
```

### 2. Set new secrets

```bash
npx supabase secrets set \
  MAMAMIA_ENDPOINT="https://<new-endpoint>/graphql" \
  MAMAMIA_AUTH_ENDPOINT="https://<new-endpoint>/graphql/auth" \
  MAMAMIA_AGENCY_EMAIL="..." \
  MAMAMIA_AGENCY_PASSWORD="..." \
  --project-ref <SUPA_REF>
```

Verify że digesty się zmieniły.

### 3. Redeploy both Edge Functions (cold-start = fresh secrets)

```bash
npx supabase functions deploy onboard-to-mamamia --project-ref <SUPA_REF>
npx supabase functions deploy mamamia-proxy --project-ref <SUPA_REF>
```

In-memory cache agency-token reset'uje się na cold-start (mamamiaClient.ts
`cachedToken`).

### 4. Reset legacy lead cache w Supabase

Stare `leads.mamamia_customer_id` wskazują na customers w **poprzednim**
tenant'cie — niedziałające w nowym. Jeśli chcesz żeby otwarcie portala
re-onboardowało:

```bash
supabase db query --linked "
  UPDATE leads
  SET mamamia_customer_id = NULL,
      mamamia_job_offer_id = NULL,
      mamamia_user_token = NULL,
      mamamia_onboarded_at = NULL
  WHERE mamamia_customer_id IS NOT NULL;
"
```

Albo skasuj testowe leady (`DELETE FROM leads WHERE email LIKE
'%mailinator.com'`). Decyzja zależy od tego czy leady mają wartość.

### 5. Verify hardcoded IDs

Najważniejszy step — **hardcoded Mamamia IDs są per-tenant**. Sprawdź:

```bash
# Agency ID
curl -sS -X POST "$NEW_AUTH_ENDPOINT" -d '{"query":"mutation { LoginAgency(email: \"...\", password: \"...\") { token } }"}'
TOKEN="<extracted>"

curl -sS -X POST "$NEW_GRAPHQL_ENDPOINT" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ ServiceAgency { id name } }"}'
# → porównaj z PRIMUNDUS_AGENCY_ID w supabase/functions/onboard-to-mamamia/onboard.ts
```

Jeśli ID się różni — update kodu + redeploy. Patrz Bug #15.

Inne potencjalne per-tenant IDs do sprawdzenia w przyszłości:
- `mobility_id` set (1..5) — system enum, zazwyczaj stabilne
- `lift_id` (1, 2) — system enum
- `tool_ids` ([1..6]) — pivot table content
- `urbanization_id` (1, 2, 3) — system enum
- `equipment_ids` ([1, 2, 6, 8]) — pivot
- `language_id` (1) — system enum
- `caregiver_id`-y matching'u — runtime, nie hardcoded

Te są **system-level enums w Mamamia** — gdyby zostały zmienione w
prod relative do beta, lots-of-things by się zepsuło. Spróbuj jeden
e2e test po switch'u (onboard + getCustomer + listMatchings) — błąd
typu "invalid enum" wskaże który ID jest zły.

### 6. E2e sanity (bez tworzenia śmieci)

- **Submit fresh test lead** — calculator API tworzy lead w Supabase.
  Onboard tworzy customer w Mamamia ze `status='draft'` (matcher
  publicznie ich nie pali, dopóki patient form save nie flippa na
  `'active'`).
- **Verify onboard zwraca customer_id + job_offer_id** — to dowodzi
  że StoreCustomer + StoreJobOffer przeszły walidację Mamamia.
- **NIE wypełniaj patient form do końca** — to UpdateCustomer +
  StoreJobOfferMatch które flippuje status. Druk w prod = potencjalny
  shadow ban Twojego agency account za spam draftami.

Jeśli onboard fail'uje z "onboarding failed" — włącz
`DEBUG_ONBOARD=1` (analog `DEBUG_PROXY`):

```bash
npx supabase secrets set DEBUG_ONBOARD=1 --project-ref <SUPA_REF>
npx supabase functions deploy onboard-to-mamamia --project-ref <SUPA_REF>
# Retry — response zwraca underlying Mamamia error
npx supabase secrets unset DEBUG_ONBOARD --project-ref <SUPA_REF>
npx supabase functions deploy onboard-to-mamamia --project-ref <SUPA_REF>
```

NIE zostaw DEBUG_ONBOARD włączonego na prod — wycieka details błędów
to potencjalny attack vector.

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
