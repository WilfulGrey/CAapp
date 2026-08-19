# CAapp — Project rules for Claude

> ## 🆕 PROJECT CHANGE (2026-05-26): STAGING ENVIRONMENT JEST LIVE
>
> **Critical zmiana którą musisz znać zanim cokolwiek zrobisz.** Do 2026-05-25
> projekt miał jeden tryb: `git push` do trunk = deploy do prod. Klient widział
> twoje zmiany natychmiast. Od **2026-05-26** mamy dwa równoległe targets:
>
> | | STAGING (default) | PROD |
> |---|---|---|
> | URL CAapp | `caapp-staging.onrender.com` | `kundenportal.primundus.de` |
> | URL Kostenrechner | `kostenrechner-staging.onrender.com` | `kostenrechner.primundus.de` |
> | Supabase | `taggpiwpwthgpcmaiqjw` | `ycdwtrklpoqprabtwahi` |
> | Mamamia | `backend.beta.mamamia.app` (agency_id=18) | `backend.prod.mamamia.app` (agency_id=3) |
> | Trigger | Push → Render auto-build (front) + CI auto-deploy edge fns | Push → **front auto-live na Render** (auto-deploy ON — zweryfikowane 2026-07-03). Edge fns + migracje: **manual CLI** |
>
> **Co to oznacza dla twojego workflow:**
>
> 1. **Merge PR** → **FRONTEND auto-live na PROD** (Render auto-deploy ON dla obu slotów) **oraz** na staging. Edge fns lecą przez CI **tylko na staging**. ⚠️ Klient widzi nowy frontend od razu po merge — prod-front NIE jest gated.
> 2. **Prod edge fns / migracje** (jeśli zmiana ich dotyczy) — **manual przez CLI** (masz `supabase` CLI zalogowany per-user): `supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi`; migracje `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi`. Skilla `/deploy-prod` **już nie ma** — patrz niżej.
> 3. **Weryfikacja** na `caapp-staging.onrender.com` **przed** merge (bo merge = prod-front live), albo na becie przez curl (§"E2e verification recipe").
>
> **⚠️ KOLEJNOŚĆ dla zmian front+edge:** merge wysyła frontend na prod NATYCHMIAST, a prod edge fn jest manualny → **zdeployuj prod edge fn PRZED merge** (albo upewnij się że frontend degraduje gracefully). Inaczej jest okno gdzie prod-front woła akcję/pole którego prod-edge-fn jeszcze nie ma. Migracje: zawsze przed kodem (Święta zasada nr 3).
>
> **Migracje DB:** ZAWSZE backward-compatible z poprzednią wersją kodu (patrz Święta zasada nr 3 niżej). Nowa NOT NULL bez DEFAULT = zepsujesz prod między momentem zaaplikowania migracji a deploy'em kodu.
>
> **Skille:** `/deploy-staging` **został** (ręczny refresh stagingu — rzadko potrzebny, CI to robi). **`/deploy-prod` USUNIĘTY 2026-07-03** — opierał się na fałszywym założeniu że prod-front jest gated (NIE jest — auto-deployuje się na merge), robił zbędną ceremonię (Render API, migracje, smoke) i wprowadzał w błąd. **Prod deploy = manual CLI:** `supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi` (edge fns) + `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi` (migracje). `supabase` CLI zalogowany per-user (Windows Credential Manager).
>
> **Pełna dokumentacja:** `docs/staging-environment-plan.md`. Sekcja "Deploy workflow" w tym pliku niżej + URL convention (kostenrechner-beta slot = prod, mental-model "slot z custom domain = prod, slot bez = staging").
>
> **Kiedy w wątpliwości — ZAPYTAJ Michała.** Lepiej pause niż zdeployować nie tam.

---

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
| Zmiana w SMTP transport / email provider (`lib/email.ts`, `send-scheduled-emails`, `get_smtp_config`, SMTP secrets) | [docs/ses-email-migration.md](docs/ses-email-migration.md) + CLAUDE.md sekcja „Email transport (Amazon SES)" |
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

## 🩸 Święta zasada nr 3: MIGRACJE BACKWARD-COMPATIBLE Z POPRZEDNIĄ WERSJĄ KODU

**Każda migracja DB którą puszczasz na PROD MUSI być działająca z aktualnie
running kodem (= wersją przed twoim deploy'em).** Inaczej między momentem
zaaplikowania migracji a deploy'em nowego kodu masz okno gdzie żywy ruch
hituje błąd. Klient widzi 500. Lead się gubi.

To wynika z sekwencji prod deployu (patrz §"Deploy workflow"): migracje
**pierwsze**, potem kod (edge fns manual; frontend auto na Render po merge).
Sekwencja celowa — schema musi być gotowa zanim nowy kod jej zacznie używać.
Ale to znaczy że stary kod przez chwilę działa na nowej schemie (a frontend
auto-live na merge — tym bardziej migracja musi być gotowa wcześniej).

### Konkretne reguły

| Zmiana | OK? | Dlaczego |
|---|---|---|
| Dodać NULLABLE kolumnę | ✅ | Stary kod ją ignoruje. |
| Dodać kolumnę z DEFAULT | ✅ | Inserts z starego kodu (bez tego pola) dostają default. |
| Dodać tabelę | ✅ | Stary kod nie pisze do niej, nowy zaczyna. |
| Dodać index | ✅ | Czysto perf, neutralne. |
| Dodać CHECK constraint na istniejącej kolumnie | ⚠️ | OK gdy data już compliant. Inaczej migracja fail. Najpierw backfill. |
| Dodać NOT NULL bez DEFAULT na istniejącej kolumnie | ❌ | Stary kod może INSERTOWAĆ bez tego pola → constraint violation → 500. |
| Drop kolumny | ❌ | Stary kod ją SELECT-uje → undefined column → 500. Multi-step: code stops reading → deploy → migracja drop'ująca. |
| Rename kolumny | ❌ | Stary kod używa starej nazwy → undefined. Expand-contract: add new + dual-write + deploy code reading new + drop old. 4 deploy cycles. |
| Drop tabeli | ❌ | Patrz drop kolumny — najpierw stop-reading w kodzie. |
| Zmiana typu kolumny | ❌ | Cast może rzucić. Add nową column z nowym type → backfill → switch kod → drop starą. |

### Expand-contract pattern dla breaking changes

Gdy MUSISZ zrobić destruktywną zmianę (np. rename `lead.email` → `lead.contact_email`):

1. **PR 1 (expand)**: dodaj `contact_email` (nullable). Code: dual-read (`row.contact_email ?? row.email`), dual-write (zapisz w oba pola na każdy save). Deploy prod (migracja pierwsza, potem kod).
2. **PR 2 (backfill)**: skrypt SQL kopiuje istniejące wartości `email` → `contact_email`. Run manually w Supabase Studio lub jako migration. Deploy prod.
3. **PR 3 (switch)**: code czyta tylko `contact_email`. Pisze tylko `contact_email`. `email` nieużywane ale jeszcze w DB. Deploy prod.
4. **PR 4 (contract)**: migration drop'ująca kolumnę `email`. Deploy prod.

Cztery deploy cycles, ale ZERO downtime + zero customer-visible error.

### Kiedy można obejść (rzadko)

- **Maintenance window** ogłoszony klientom (np. niedziela 2:00-4:00 AM CET, banner w portalu wcześniej) — wtedy "stop-the-world" rebuild OK. Ale do tego potrzebujesz dummy-mode lub przekierowania na statyczną stronę "Wir machen ein Update". Obecnie nie mamy.
- **Migracja na pustej tabeli** (np. nowo dodana w poprzednim PR, jeszcze brak rows) — NOT NULL bez DEFAULT OK bo nie ma row'a do złamania.

### Kto pilnuje tej zasady

Skill `/deploy-prod` (usunięty 2026-07-03) miał to sprawdzać automatycznie — teraz **trzymasz to sam**: przed deployem migracji na prod sprawdź w powyższej tabeli czy zmiana jest backward-compatible z aktualnie running kodem. Jeśli nie (NOT NULL bez DEFAULT, drop, rename) → expand-contract. Zawsze: **migracja pierwsza (`scripts/apply-migrations.sh ycdwtrklpoqprabtwahi`), kod drugi.**

### Anti-pattern

Najczęstsza pokusa: "dodam NOT NULL z DEFAULT, ale chcę żeby kolumna była strict bez default na future inserts → zaraz po deploy zrobię ALTER TABLE DROP DEFAULT". To dwie migracje. Pierwsza puszcza się z DEFAULT (compat z starym kodem). Druga (DROP DEFAULT) puszcza się w następnym prod deployu JUŻ z nowym kodem który ZAWSZE wpisuje wartość. To jest zgodne z regułą.

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
| **Nasz beta Render slot** | Środowisko staging dla *naszego* deploy'u — `caapp-beta` + `kostenrechner-beta` na Render free-tier | `render.yaml`, `caapp-beta.onrender.com`, `kostenrechner-beta.onrender.com`, branch `integration/mamamia-onboarding` | Live, nasz preprod |
| **Mamamia beta tenant** | Mamamia development environment — separate DB, separate user accounts, separate schema seed | `https://backend.beta.mamamia.app/graphql` (URL hostuje Mamamia) | Forward-going (newer schema features, np. plural `customer_contracts`) |
| **Mamamia preprod tenant** | Mamamia "real prod" environment — legacy schema, separate DB | `https://backend.prod.mamamia.app/graphql` (URL hostuje Mamamia, ale nazwa myli — to ich production-grade tenant, my używamy jako preprod) | **Aktualnie podpięte** (od 2026-05-11), Bug #15 + #16 fixe tu zlokalizowane |
| **Mamamia prod** | Mamamia true-production (real customers) — kiedyś będziemy chcieli się tam podpiąć | TBD, prawdopodobnie ten sam endpoint co preprod ale inny agency account z prawdziwymi danymi | Jeszcze nie używamy |

**Konwencja w kodzie/komentarzach:**
- "beta" bez kwantyfikatora = **nasz Render slot** (default w tym repo)
- "Mamamia beta" / "beta tenant" / "beta.mamamia.app" = **Mamamia dev environment**
- "Mamamia preprod" / "prod Mamamia" / "backend.prod.mamamia.app" = **nasz aktualny target** (Mamamia production-grade tenant używany przez nasz beta slot)

**Implikacja:**
- Mamamia beta i preprod **MAJĄ różne schema** (Bug #16). Nie zakładaj że są spójne.
- Nasze Render slot nazewnictwo (`caapp-beta`, `kostenrechner-beta`) odzwierciedla **nasze** dev/staging stage, niezależnie od tego pod jakim Mamamia tenantem aktualnie hostujemy.
- Aktualnie: nasz `caapp-beta` (Render) → Supabase Edge Functions → Mamamia **preprod** (NIE Mamamia beta).

### 🚨 URL convention — primundus.de w komunikacji, *.onrender.com tylko w infra

Render slot names i ich domyślne URL-e (`*.onrender.com`) to **wewnętrzne
identyfikatory infrastruktury**. Klienci NIGDY nie widzą `onrender.com`
— wchodzą na branded domains:

| Env | User-facing URL | Internal Render slot |
|---|---|---|
| **PROD** | `https://kundenportal.primundus.de` | `caapp-beta` (`srv-d7phc0rrjlhs73dtismg`) |
| **PROD** | `https://kostenrechner.primundus.de` | `kostenrechner-beta` |
| **STAGING** | `https://caapp-staging.onrender.com` (no custom domain) | `caapp-staging` |
| **STAGING** | `https://kostenrechner-staging.onrender.com` (no custom domain) | `kostenrechner-staging` |

**Gotcha:** prod slot ma "beta" w slug'u (historyczny artefakt — pierwsze
deploy'e były beta, potem dostały custom domain i awansowały na prod, ale
slug został). Staging slot ma "staging" w slug'u (nowy, naming pasuje).
Mental-model: **"slot z custom domain = prod, slot bez = staging".**

**W wiadomościach do usera o PROD** (verify steps, deploy status,
"otwórz portal i...") — **ZAWSZE** `kundenportal.primundus.de` /
`kostenrechner.primundus.de`. Pisanie `caapp-beta.onrender.com` zostało
explicite zareportowane jako "nie jest właściwy adres" (user feedback
2026-05-22) — myli kontekst, bo to nie jest URL pod którym user testuje
prod.

**W wiadomościach o STAGING** — OK pisać `caapp-staging.onrender.com`,
bo staging NIE ma custom domain'a (zero DNS ceremonii, świadoma decyzja
per `docs/staging-environment-plan.md`). Customer nigdy nie widzi staging
URL-a, więc to jest "infra address" widoczne tylko zespołowi.

**W infra / curl recipe / debug logs / kodzie** `*.onrender.com` jest OK
(np. portalUrl assertion w testach, Render dashboard linki, e2e curl snippet
w §"E2e verification recipe"). Tam to wskazuje na konkretny build target.

**Regex check:** jeśli piszesz user-message O PROD i widzisz `onrender.com` →
swap na primundus.de. Jeśli O STAGING — zostaw, to legalny URL.

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
| `sync-acceptance/index.ts` | **Server-to-server only** (Bearer = SERVICE_ROLE_KEY) — sekwencja akceptu po podpisie (gotcha #12), triggerowana przez bridge |
| `_shared/acceptanceSync.ts` | Moduł sekwencji 1→4 (UpdateCustomer→StoreConfirmation→PDF→upload z bramką) — współdzielony przez sync-acceptance i detect-cron (retry) |
| `_shared/googleAdsAuth.ts` | Google-Ads-Zugang für Edge Fns (Secrets Env→Vault-RPC `get_google_ads_secrets`, Token-Refresh, GAQL-Search; Konto 924-028-6999). Genutzt vom daily-analytics-report (Ads-Kosten-Block); upload-offline-conversions hat noch eine lokale Kopie (Konsolidierungs-Kandidat) |
| `upload-offline-conversions/` | **Cron täglich 06:20 UTC** — lädt „Qualifizierte Leads" (erstes `patient_data_saved`, Lead trägt gclid/wbraid/gbraid) als Offline-Conversions zu Google Ads (Aktion `conversionActions/7720728390`, secondary). Status in `offline_conversion_uploads`; ohne Google-Secrets (Staging) inert. Doku: docs/google-ads-tracking.md |
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

### 10. UpdateCustomerToken — lustro tokenu portalu w Mamamii (panel-only)

Onboard po utworzeniu klienta wysyła `lead.token` (magic-link portalu) na rekord
klienta w Mamamii mutacją **panel-only** `UpdateCustomerToken(id, token)` (odczyt:
query `CustomerToken(id)`). Cel: zespół MM może otworzyć portal klienta po tokenie
(`?token=…`) i pomóc wypełnić formularz pacjenta.

- **Panel-only** — mutacji NIE ma na agency `/graphql` (zweryfikowane Mamamia MCP).
  Idzie przez sesję agency Sanctum (`_shared/mamamiaPanelClient.ts`) — ta sama ścieżka
  co `inviteCaregiver`.
- **onboard czyta teraz `MAMAMIA_PANEL_URL`** (wcześniej tylko `mamamia-proxy`). Sekret
  jest project-wide, ale bootstrap onboardu throw'uje gdy brak (Święta zasada nr 1).
- **Best-effort** — push w try/catch, awaria panelu NIE blokuje wejścia do portalu.
  Wykonuje się tylko przy cache-miss. Kod: `onboard-to-mamamia/onboard.ts:pushCustomerToken`
  + `UPDATE_CUSTOMER_TOKEN`.

### 12. Akcept aplikacji — SERVER-SIDE sekwencja (sync-acceptance), nie przeglądarka

Od refactoru 2026-07-22 przeglądarka po podpisie robi **jeden POST** do bridge'a;
sekwencję wykonuje edge fn `sync-acceptance` (+ cron detect jako gwarant/retry):
**1.** UpdateCustomer(customer_contract z formularza konfirmacji) → **2.** StoreConfirmation
→ **3.** render PDF (`/api/contract-pdf`) → **4.** upload do MM (StoreFile→UpdateConfirmation)
**dopiero gdy MM przetworzyła confirmation** (final_confirmation widoczne) → **5.** maile
(bridge, niezmienione). Szczegóły + guardy idempotencji (adopcja po caregiver-match,
skip_confirm dla starych bundli, stemple `mamamia_*`): [docs/vertrag-flow.md](docs/vertrag-flow.md).

- **NIGDY nie wołaj StoreConfirmation dwa razy** — najpierw guard na
  `Customer.job_offers[].final_confirmation` (Mamamia usuwa przetworzoną aplikację
  z listy w sekundy — ownership kotwiczy się na confirmation, nie aplikacji).
- Upload pliku przed przetworzeniem confirmation = błąd — bramka jest twardym wymogiem.
- Magic-bytes `%PDF-` przed każdym uploadem (renderer ma HTML-fallback).
- Mapowanie niemieckie→Mamamia (SALUTATION enum Mr./Mrs. — „Fall Diesmann", split
  einsatzort) żyje w `_shared/acceptanceSync.ts` — NIE duplikować we froncie.
- **Dryf walidacji beta↔preprod na `patients[]`** (2026-07-22, klasa Bug #16): beta
  odrzuca `patients: []` w UpdateCustomer („Das Feld patients ist erforderlich"),
  preprod toleruje (notatka proxy 2026-05-14). Bezpieczne na OBU tenantach: non-empty
  stuby `{id, tool_ids}` (przy okazji preserve tools, gotcha #13b). Tak robi
  `acceptanceSync`; proxy `updateCustomer` z `[]` działa, bo prod == preprod — ale
  przy każdym nowym narrow-write używaj stubów.
- **Trzy osoby z konfirmacji → NATYWNE sloty klienta MM** (2026-07-21, Customer 8394
  beta): krok 1 sekwencji pisze LE → `patient_contracts[{contact_type:
  "patient_contact"}]`, AG → `invoice_contract{contact_type:"contract_contact"}` (Person
  für den Vertrag/Rechnung), KP → `customer_contacts[]`. **`location_id` per wiersz z
  JEGO własnego PLZ** (Stadt-dropdown panelu czyta location_id, nie tekst; metoda 1:1
  jak główna lokalizacja klienta = `LocationsWithPagination(search: PLZ)` → pierwszy
  DE; AG mieszka niekoniecznie pod adresem opieki — 34117 vs 34123, feedback Michała);
  LE-fallback: carry z istniejącego contractu (MM REPLACES listę). Typ `Location` ma
  pole **`location`**, NIE `name` — zła selekcja wygląda jak pusty wynik. **NIGDY singular `customer_contract`**
  — MM typuje pierwszy wiersz plurala jako patient_contact, więc AG-dane lądują w
  slocie pacjenta/lokalizacji opieki (pierwotny bug: „3 osoby w formularzu, w mamamii
  jedna"). **ZAWSZE jawne flagi `is_same_as_first_patient`/`is_same_as_contact`** —
  bez nich MM defaultuje `true` i LUSTRUJE dane pacjenta w wiersz przy kolejnych
  UpdateCustomer (panel: zahaczone „Die Daten sind die gleichen wie die des
  Patienten"). Wyjątek: `agGleich` (AG==LE, snapshot.le===null lub brak snapshotu) ⇒
  `is_same_as_first_patient: true` na invoice_contract (uczciwy spiegel). Schema-parity:
  prod dogonił betę — plural args + `customer_contacts` są na OBU tenantach
  (walidacyjna sonda z `$nope`, 2026-07-21).
- **JEDEN kanoniczny PDF umowy** (Michał 2026-07-21: „generować 1 PDF, wysyłać go do
  klienta, do nas i na serwer. 1 i ten sam, niezmieniany plik"): bridge renderuje
  umowę RAZ przy akcepcie → bajty w Storage `contracts/<lead>/<app>.pdf` (bucket
  prywatny, migracja 20260722190000) + sha256 w `pdf_sha256`. Mail C, mail teamowy,
  portal (`/api/contract-pdf`, bucket-first) i upload do MM używają TYCH SAMYCH
  bajtów; sync weryfikuje sha przed uploadem (mismatch ⇒ defer, nie podmienia).
  Zeitstempel na dokumencie = `signed_at` wiersza w **Europe/Berlin**
  (`formatSignedAtBerlin` w `project 3/lib/vertrag.ts`) — NIGDY `getHours()`
  (serwer działa w UTC; stąd były dwie umowy z godzinami 17:00 vs 19:00), NIGDY
  etykieta z przeglądarki, NIGDY czas renderu. Render-fallback zostaje tylko dla
  alt-wierszy sprzed kanonu.
- **Retry-chain zamiast czekania na cron** (Michał 2026-07-21: „zwykły retry po 15-30
  i 60 sekundach", „cron to słaby pomysł"): niekompletny pierwszy przebieg (typowo:
  PDF czeka na bramkę przetworzenia) ⇒ sync-acceptance odpowiada od razu i przez
  `EdgeRuntime.waitUntil` odpala w tle łańcuch **+15s → +30s → +60s** (`RETRY_DELAYS_MS`);
  każda stufa czyta wiersz świeżo i wykonuje pełną sekwencję. Efekt: confirm+PDF w MM
  ≤ ~2 min po podpisie. Cron detect (15 min) = WYŁĄCZNIE backstop (śmierć procesu,
  dłuższa awaria MM). Permanent confirm-error ⇒ chain się NIE odpala (bridge alarmuje T+0).
- **Polityka alarmowa** (Michał 2026-07-21: klient NIGDY nie może wierzyć w obstawione
  zlecenie bez confirmation w MM, np. po wycofaniu Bewerbung przez agencję):
  StoreConfirmation-error jest klasyfikowany (`graphqlErrors` na errorze = **permanent**,
  deterministyczna odmowa MM — bez retry, alarm **T+0 z bridge'a**; network/HTTP =
  transient — 3 próby w callu 2s+4s + retry-chain 15/30/60 s, po wyczerpaniu wciąż
  brak confirm ⇒ **alarm ≈ T+2 min** POST-em `acceptance_sync_alarm` [source
  `sync-retry`] do bridge'a; cron-owy próg 5 min zostaje jako niezależny bezpiecznik).
  Confirm OK a tylko PDF wisi ⇒ alarm dopiero po 24h (archiwum, nie ryzyko klienta).
  Kanał: team-mail przez bridge (event `acceptance_sync_alarm`, team-mail-only,
  audit-row w lead_events); stempel `mamamia_sync_alerted_at` TYLKO po udanym mailu
  (inaczej re-alarm). Klasyfikować WYŁĄCZNIE po strukturze błędu, nie po treści
  komunikatu (Święta zasada 1.5). Szczegóły: [docs/vertrag-flow.md](docs/vertrag-flow.md)
  §„Polityka alarmowa".
- **Upload pliku przy adopcji: `application_id` = ORYGINALNA Bewerbung
  confirmation** (`final_confirmation.application_id`), nie kotwica wiersza —
  walidator `UpdateConfirmation` WYMAGA pola i odrzuca id niebędące realną
  Application (Bug #28; „optional" w introspekcji kłamie).
- **Annahme-Detektor (booking PANELOWY agencji ⇒ Mail C):** cron detect
  wykrywa świeże `final_confirmation` gescannowanych jobów i feueruje
  `application_accepted_internal` (Mail C + team-mail przez bridge). Kotwica
  świeżości = **`final_confirmation.created_at`** (moment bookingu, ≤7 dni);
  `final_confirmed_at` jest na OBU tenantach zawsze null (booking panelowy
  i portal-akcept — sondy 2026-08-05, Bug #26) i służy tylko jako fallback.
  Dedupe per (job, caregiver) po evencie w lead_events.

### 11. Opis opiekunki (`about_de`) — bierzemy z Mamamii, nie generujemy u siebie

Portal pokazuje **surowy `Caregiver.about_de` z Mamamii** (już NIE generujemy bio
opiekunki własnym Anthropic — akcja `generateCaregiverAbout` + `aiAboutCache.ts` usunięte).
Część opisów w Mamamii jest **stara** (limit 200 znaków); nowe są dłuższe. Kryterium
świeżości = **długość**: `isAboutDeStale(about_de) = (about_de ?? '').length <= 200`
(null/pusty → stary).

- **Stale → regeneracja przez Mamamię**: akcja proxy `generateCaregiverGermanDescription`
  woła mutację `GenerateCaregiverGermanDescription(id, translate_to_pl:false)` (przez
  `runGraphQL`, agency `/graphql`) → świeży `about_de` (>200) + `motivation`. **LLM-write
  (kosztuje)** → dedup per-CG na froncie (`src/lib/mamamia/caregiverAbout.ts`), proxy
  rate-limit per IP. Po regeneracji Mamamia trzyma świeży opis na stałe → następne otwarcia
  zero-cost.
- **Display** (`CustomerNurseModal`): stale → spinner **zamiast** starego → świeży; fresh →
  `about_de` wprost; błąd regeneracji → zostaje stary (realny) tekst → `motivation` → mechaniczny.
- `generateJobDescription` (podsumowanie pacjenta) i `ANTHROPIC_API_KEY` **zostają** —
  usunęliśmy tylko caregiver-bio. Wzorzec portowany z Sadash/saportal.

### 13. Follow-up joby (multi-job) — notify, discovery `folge_einsatz`, deeplinki `&job=`

Od 2026-08-04 (Bug #25, dowód: prod lead 9239 — Bewerbung na follow-up jobie
połknięta jako `seeded`, klientka nie dostała maila). Zasady:

- **Notify w detect:** job z historią eventów LUB default-job LUB **job LIVE
  `geplant`** ⇒ maile. Silent-seed został TYLKO dla pierwszego skanu joba
  `gebucht` (rejestracja altbestandu w mirrorze). Geplant follow-up job mailuje
  od PIERWSZEJ Bewerbung.
- **Cap:** max `NOTIFY_CAP_PER_JOB_RUN=3` kunden-maili per job per run
  (najnowsze `application.id` pierwsze). Nadwyżka w danym runie **NIE jest
  postowana w ogóle** (żadnego eventu ⇒ żadnego dedupe) i skapuje w kolejnych
  runach po 3 — nic nie ginie na stałe. Seeds (notify=false) bez capa.
- **Discovery (dziedziczenie stanu z Mamamii):** leady POZA active-setem
  (status `vertrag_abgeschlossen`/`betreuung_beauftragt` lub wygasły token;
  `nicht_interessiert` i `folge_einsatz` wykluczone) sondowane
  `GET_CUSTOMER_JOB_OFFERS` co ≥6h, max 50/run (`leads.mamamia_jobs_checked_at`).
  Jest job `geplant` ⇒ `leads.status='folge_einsatz'` + event
  `folge_einsatz_detected` + mirror upsert. Discovery NIC nie mailuje — maile
  robi normalny skan od następnego runa (lead w active-secie; `folge_einsatz`
  skanowany TAKŻE z wygasłym tokenem). **ZERO auto-przedłużania tokenu**
  (decyzja Michała: klient sam kliknie „Neuen Link senden" — ExpiredLinkScreen
  działa, bo `folge_einsatz` ∉ CLOSED_STATUSES). `statusOrder.folge_einsatz=2`
  w `lead-management.ts` — bez tego resubmit kalkulatora tworzyłby drugi lead.
- **Deeplinki:** maile o Bewerbungach (bridge A/B/C + remindery
  send-scheduled-emails) doklejają `&job=<lead_jobs.id>`; helper
  `appendJobParam` ISTNIEJE W DWÓCH KOPIACH (`project 3/lib/portal-url.ts` +
  `send-scheduled-emails/followupJobs.ts`) bo edge fn nie może importować z
  `lib/` (CI-deploy kopiuje tylko folder functions) — zmiany synchronizować.
- **Dedupe Bewerbungen = `application_id`, NIE para (job, opiekunka)** (Registry #35,
  od 2026-08-17). Ponowna wklejka tej samej PK na ten sam job to NOWA aplikacja
  w Mamamii (nowe `id`, zwykle inna stawka i terminy) i MUSI mailować. Eventy
  sprzed 17.08 nie mają `application_id` — dla takiej pary detektor **raz cicho
  rejestruje** id (`notify=false`, seed) i od następnego razu rozstrzyga dokładnie.
  Nazwa PK („Aneta K.") NIE identyfikuje osoby — w jednym skanie bywają dwie różne;
  zawsze `caregiver_id`.
- **Mail C bez limitu bookingów:** dedupe bridge per `application_id`
  (fallback: per `mamamia_job_offer_id` dla eventów detektora, legacy
  lead-wide tylko bez obu); `acceptedJk` w detect per (job, caregiver).
  Reminder-cancel „beauftragt" jest job-aware: reminder joba aktualnie
  `geplant` przeżywa (`followupJobs.ts:reminderBookedCancel`).
- **Admin:** Card „Einsätze (Mamamia)" w detalu leada (RLS anon-SELECT na
  `lead_jobs`, migracja 20260804090000), badge „N Einsätze" na liście, status
  `folge_einsatz` w filtrach, timeline z etykietami eventów portalowych +
  „(Seed — keine Mail versendet)" przy `metadata.seeded=true`.

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
| germanLevel | deutschkenntnisse | wish.germany_skill | grundlegend=**level_1**, kommunikativ=**level_2**, `sehr-gut`=**level_3** (2026-08-10, Bug #30 — klucz historyczny, ale stufa nazywa się „Gut" i kosztuje 450 €/Mo; wcześniej level_4). **level_4 = „Sehr gut" (600 €/Mo) NIE jest wybieralne w formularzu** — wyłącznie SA-Portal. **No soft default** — mapper throws na unknown/missing value (Święta zasada nr 1). |
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
| 18 | **Google Translate / browser translator → biały ekran w 5-step patient formie** (2026-05-22). User reportuje: włącza GT na kundenportal, klika "Weiter" w środku wizarda → strona blank. Klasyczny React + DOM-mutating extension crash: GT wrap'uje text-nody w `<font>` żeby je translować in-place. React reconciler trzyma referencję do oryginalnego text-noda + jego *zapamiętanego* parenta (`<p>`/`<div>`), więc gdy `step === N → N+1` triggeruje unmount konditionalnego bloku, `Node.prototype.removeChild` rzuca `DOMException: Node was not found` (child.parentNode = `<font>`, nie oryginalny parent). Throw bąbla się do root'a → cały root unmount → biała strona. **Wyłączenie GT NIE jest opcją** — niemieccy klienci mają rodzinę PL/UA/RU która używa translatora żeby pomagać. | src/lib/translateGuard.ts (NEW), src/main.tsx (install before mount), src/__tests__/translateGuard.test.ts (5 tests) | Defensive monkey-patch `Node.prototype.removeChild` + `insertBefore` — gdy `child.parentNode !== this` (= reparented przez translator), zamiast throw'a wrap'er logguje warning i no-op'uje (removeChild) lub appendChild fallback (insertBefore). Idempotent (sentinel `__caappTranslatePatched`). Install w `main.tsx` PRZED `createRoot(...)`. Standardowy workaround z facebook/react#11538 — używany przez Gatsby, w Next.js docs, large multilingual production apps. Tests symulują GT scenario przez ręczne reparenting text-node do `<font>` + assert że removeChild już nie throw'uje. **Reguła:** nigdy nie zakładać że text-nody w React tree zostaną tam gdzie React je zostawi — browser extensions (GT, password managers, ad blockers) mogą je przemiełać. Defensive DOM patch ma akceptowalny koszt (2 funkcje patch'owane raz przy mount) i ogromny upside (app survival vs white screen). |
| 19 | **Akcept: z 3 osób formularza konfirmacji w Mamamii lądowała jedna — i to w złym slocie** (2026-07-21, Customer 8394 beta, test Michała). Krok 1 sekwencji (#396) pisał AG w singular `customer_contract` → MM typuje pierwszy wiersz plurala `customer_contracts` jako **patient_contact** → dane Auftraggebera (inny adres!) lądowały w slocie pacjenta/lokalizacji opieki; LE i KP szły tylko do Confirmation (klient-level nigdy). Do tego brak flag `is_same_as_*` → MM defaultuje `true` i przy kolejnym UpdateCustomer LUSTRUJE dane pacjenta w wiersz (nadpisała Zenobię „Test Signature"; panel: zahaczone „Die Daten sind die gleichen wie die des Patienten" — screenshot Michała). | supabase/functions/_shared/acceptanceSync.ts (SYNC_CUSTOMER_QUERY + UPDATE_CUSTOMER_CONTRACT + krok 1, `isAgGleich`), _tests/acceptanceSync.test.ts, project 3/app/api/lead-event/route.ts (502 z przyczyną mail-fail) | LE→`patient_contracts[{contact_type:"patient_contact", is_same_as_first_patient:false, is_same_as_contact:false, +location_id carry}]`, AG→`invoice_contract{contact_type:"contract_contact", is_same_as_first_patient: agGleich, is_same_as_contact:false}`, KP→`customer_contacts[{is_same_as_first_patient:false}]`; singular `customer_contract` wycięty z mutacji. Weryfikacja live na 8394 (payload 1:1) + sonda walidacyjna `$nope` na prodzie (plural args są na obu tenantach — drift z Bug #16 nadrobiony przez MM). Patrz gotcha #12 (bullet „Trzy osoby"). |
| 20 | **Dwie różne wersje umowy z dwiema różnymi godzinami podpisu** (2026-07-21, test Michała). Umowa była renderowana DWUKROTNIE: (1) przy akcepcie do maili — z etykietą czasu OD PRZEGLĄDARKI („21.07.2026, 17:15"); (2) przy syncu/cronie do uploadu MM — świeży render z `signed_at` formatowanym `getHours()` na serwerze **UTC** → „um 17:00 Uhr" zamiast 19:00 niemieckiego. Dwa pliki, dwa czasy, oba formaty inne, jeden błędny o 2h. | project 3/lib/vertrag.ts (`formatSignedAtBerlin`), project 3/app/api/lead-event/route.ts (`getOrCreateCanonicalContract` + kanon przed sync-triggerem), project 3/app/api/contract-pdf/[leadId]/route.ts (bucket-first + TZ-fix), supabase/functions/_shared/acceptanceSync.ts (storage-first + sha-gate), migracja 20260722190000 (bucket `contracts`), testy | **JEDEN render przy akcepcie** → kanon w Storage `contracts/<lead>/<app>.pdf` + `pdf_sha256`; klient/team/MM/portal dostają TEN SAM plik; czas na dokumencie = `signed_at` w Europe/Berlin. Sync: kanon ze Storage z bramką sha (mismatch ⇒ defer); render-fallback tylko dla alt-wierszy. Patrz gotcha #12 (bullet „JEDEN kanoniczny PDF"). |
| 21 | **Multi-job klient klika nową Bewerbung, widzi starą PK** (2026-07-22, Kunde Dachs 8899 prod, zgłoszenie teamu: „wenn er darauf klickt, erscheint immer die Bewerbung der alten PK Renata N."). Multi-job był zaimplementowany (#289–#313: lead_jobs, detect skanuje wszystkie joby, przegląd `?view=jobs`, scoping `?job=`), ale DWIE dziury zostały: (1) wejście bez deeplinka = zawsze STARY default-job (maile nie doklejają `&job=`), a link „Alle meine Einsätze" renderował się tylko przy wejściu z `?job=` — klient z maila nigdy nie odkrył drugiego joba; (2) `pickFinalConfirmedJob` fallbackował na fc DOWOLNEGO joba, a ścieżka 2 `applyAcceptedOverlay` syntetyzowała accepted z lead-weitych acceptance-rows job-blind → BookedScreen starej PK porywał layout nawet pod `?job=<nowy>`. | supabase/functions/onboard-to-mamamia/{onboard,index}.ts (`fetchNewestPlannedJob` + wybór aktywnego joba), src/lib/mamamia/mappers.ts (`pickFinalConfirmedJob` strict per session-job; path-2 gate po fc-caregiver), src/pages/CustomerPortalPage.tsx (useLeadJobs + link „Alle meine Einsätze" bez `?job=`), testy | Opcja B (decyzja Michała): wejście bez `?job=` → sesja na NAJNOWSZYM `geplant` z lead_jobs (fallback: dotychczasowy job; jawny `?job=` ma zawsze pierwszeństwo); BookedScreen tylko gdy akcept dotyczy AKTYWNEGO joba (fc sesyjnego joba); świadoma mini-luka: MM przetwarza confirmation w max ~10 s (korekta Michała 2026-07-22 — NIE minuty; „1-2 min" było artefaktem kadencji ręcznych powtórek), więc tylko reload w tym ≤10-sekundowym oknie pokazuje krótko normalny portal (samoleczące; w samym momencie akceptu trzyma optimistic local-state). Side-effect: `listLeadJobs` przy każdym wejściu odświeża spiegel lead_jobs. |
| 22 | **Hinweis rekrutera przy Bewerbung nie docierał do klienta verbatim** (2026-07-22, decyzja Michała; przykład z bety: „Die Pflegekraft reist mit einem Hund", job ts-18-9868-1). Historia pola `application.message`: (a) 2026-05-19 — pełna redakcja na 3 warstwach (LIST_APPLICATIONS nie pobierało, AppCard i modal nie renderowały), bo pole niosło notatki back-office (nazwisko PK, telefon, stawki DLV/PK-Netto/RK, id-stuby); (b) 2026-07-23 (#408, Marcin) — LLM-redakcja server-side w proxy + cache `application_intros` → box „Hinweis der Agentur"; (c) **2026-07-22 (ta zmiana)** — Michał: „ma iść verbatim co napisał rekruter, jeśli są tam jakieś cenzury to wywal". Klient akceptował wklejkę nieświadomy rozjazdu (pies/termin), a LLM mógł treść przekształcić lub zjeść. | supabase/functions/mamamia-proxy/{operations,actions,types,index}.ts (pole `message` w LIST_APPLICATIONS; wycięte: LIST_APPLICATION_MESSAGES, INTRO_SYSTEM, stripIntroPII, buildApplicationIntros, store getApplicationIntros/upsertApplicationIntro), src/lib/mamamia/{mappers,types}.ts, src/components/portal/{AppCard,AngebotPruefenModal,shared}.tsx/ts, portal.test.tsx | Pole idzie **VERBATIM** (zero filtrów/LLM) i renderuje się jako „Hinweis der Agentur" na karcie ORAZ w modalu akceptacji (tam amber — moment decyzji), `whitespace-pre-wrap`. Pipeline LLM usunięty; tabela `application_intros` **zostaje w DB** (bez dropu, migracja 20260723120000 nietknięta) — gdyby wracać do redakcji. `coverMessage` = odtąd tylko preview-mocki. Odpowiedzialność za treść pola: Mamamia/rekruterzy. Zweryfikowane live na becie: joby 33389 → „Die Pflegekraft reist mit einem Hund / Tochter". |
| 23 | **Kill-switch dla hinweisu rekrutera** (2026-07-31, Michał: „wyłącz/ukryj wyświetlanie tego dodatkowego tekstu na razie u klientów — mamy jeszcze kilku rekruterów którzy uzupełnili błędnie"). Po włączeniu verbatim (#22) okazało się, że część rekruterów wpisuje w `application.message` treści nieprzeznaczone dla klienta. | supabase/functions/mamamia-proxy/actions.ts (`applicationMessageEnabled` + strip w `listApplications`), _tests/actions.test.ts | Gate **server-side, DEFAULT WYŁĄCZONY**: proxy usuwa `message` z odpowiedzi, więc tekst **nie dociera do przeglądarki** (nie jest tylko ukryty CSS-em — istotne, bo chodzi o treści wrażliwe). Front bez zmian: brak pola ⇒ box „Hinweis der Agentur" po prostu się nie renderuje. **Włączenie z powrotem** (gdy teksty rekruterów będą czyste): `npx supabase secrets set SHOW_APPLICATION_MESSAGE=1 --project-ref <ref>` — działa bez redeployu (cold start czyta env); wyłączenie: `secrets unset`. Zweryfikowane live na prodzie: aplikacja 11049 miała `message` (567 zn.) → po deployu `has_message_key: false`, reszta pól nietknięta. |
| 24 | **Kundenportal: nieudane rozwiązanie Einsatzort było po cichu połykane** (2026-08-03, prod, klient Christa Wimmer 9962). Austriacki kod pocztowy „4866 Unterach am Attersee" — `searchLocations` (Mamamia Locations = tylko DE) nie zwraca trafienia → `location_id` puste, ALE save się udaje (location_custom_text) i feuerujemy `patient_data_saved` → mail „Patientenprofil ausgefüllt / Pflegekräfte können sich bewerben". Klient zostaje jednak `draft` (gate aktywacji wymaga `location_id`) → brak zaproszeń/publikacji. Pusty `catch {}` + „proceed anyway" udawały sukces. | src/pages/CustomerPortalPage.tsx (onSaveToMamamia: detekcja `locationUnresolved` + toast + event `patient_form_location_unresolved` + flaga `location_unresolved` na patient_data_saved), src/lib/leadEvents.ts (LeadEvent + LeadEventMetadata: plz/ort/location_unresolved), project 3/app/api/lead-event/route.ts (ALLOWED_EVENTS + supresja Mail D gdy location_unresolved) | Zamiast cichego „fertig": (1) klient widzi toast „Ort konnte nicht übernommen werden — wir kümmern uns darum"; (2) event `patient_form_location_unresolved` (z PLZ+Ort) odróżnia „wpisane, nierozwiązywalne" od „puste"; (3) mylący mail „Pflegekräfte können sich bewerben" NIE leci (flaga). Dane pacjenta nadal zapisywane. **Otwarte:** to NIE aktywuje Christy — Mamamia (prawdopodobnie) nie ma ortów AT; pytanie kierunkowe „czy Primundus obsługuje Austrię?" do Marcina/Michała. |
| 25 | **Follow-up joby: Bewerbungi na nowych jobach nie mailowały, zamknięte leady nie wracały do obiegu, maile bez kontekstu joba, admin ślepy na multi-job** (2026-08-04; dowód prod lead 9239 Elke Zwolan: job 33415 `geplant` od 29.07, Bewerbung Agnieszki J. 03.08 zapisana `seeded:true` ⇒ zero maili — pierwsza Bewerbung KAŻDEGO follow-up joba była połykana przez warunek notify „historia lub default-job"). Systemowo: fetchActiveLeads pomijał leady z wygasłym tokenem/zamkniętym statusem (typowy klient follow-up ma oba), Mail C dedupe lead-wide (druga buchung = brak maila), remindery kasowane lead-wide przez `isBeauftragt`, linki w mailach bez `&job=`, admin bez `lead_jobs`. | supabase/functions/detect-caregiver-events/{index.ts,_tests/handler.test.ts}, migracja 20260804090000 (leads.mamamia_jobs_checked_at + RLS anon-SELECT lead_jobs), project 3: lib/lead-management.ts (`statusOrder.folge_einsatz=2`), lib/portal-url.ts (NEW), app/api/lead-event/route.ts (deeplink + dedupe per application_id), supabase/functions/send-scheduled-emails/{index.ts,followupJobs.ts NEW,_tests/} , app/admin/leads/{page,[id]/page}.tsx, src/pages/CustomerPortalPage.tsx (accept-metadata `mamamia_job_offer_id`), src/__tests__/{portalUrl.test.ts NEW,integration/portal.test.tsx}, .github/workflows/test.yml (job deno-send-scheduled) | Decyzje Michała: status **`folge_einsatz`** (dziedziczenie stanu z MM przez discovery, ZERO auto-przedłużania tokenu — self-service regen), Mail C dla KAŻDEGO bookingu („możemy mieć i 8 jobów rocznie"), deeplink = „klucz do mieszkania, pokój = job". Mechanika: notify += `liveStatus==='geplant'`; cap 3 maile/job/run z drip (nadwyżka BEZ eventu — nic nie ginie); discovery co 6h/50 leadów; per-(job,cg) `acceptedJk`; job-aware reminder-cancel. Szczegóły: gotcha #13. E2e staging przed prod-deployem; seeded-event 9239 re-fire tylko za osobnym OK Michała. |
| 35 | **Ponowna wklejka tej samej opiekunki na ten sam job nigdy nie mailowała** (2026-08-17, prod; zgłoszenie Michała „dzisiaj było już 13 wklejek, a wyszło mało maili"). Klucz dedupe w detektorze to była para **`(job, caregiver)`**, która nigdy nie wygasa — więc DRUGA i każda kolejna Bewerbung tej samej PK na tym samym jobie była niewidoczna dla klienta na zawsze. A to zwykle nowa oferta handlowa: Justyna M. na jobie 34429 wróciła z **3050 €** (najwyższa stawka na tym zleceniu, druga aplikacja 2950 €), klient o niej nie wiedział. Pomiar dnia: z 10 wklejek widocznych na liście wyszły **3 maile** — 6 zdławionych tym kluczem (potwierdzone po `caregiver_id`: cg36531/34075, cg35836/34203, cg27956/34429, cg5090/34050, cg17513/33981, cg13161/34225), 1 to osobny ludzki błąd (duplikat klienta Graedtke 10114 vs 10113). **Pułapka diagnostyczna:** nazwy PK nie identyfikują osoby — w jednym skanie były dwie różne „Aneta K." (`cg13867` ur. 1976 i `cg24493` ur. 1983), obie na innych jobach, obie zamailowane poprawnie. Pierwsza diagnoza „rury są drożne" była BŁĘDNA, bo porównywała liczniki (`lead_jobs.bewerbungen` vs liczba eventów) zamiast tożsamości aplikacji — liczniki się zgadzały, bo eventy kumulują się historycznie, a wycofane aplikacje znikają z listy. | supabase/functions/detect-caregiver-events/index.ts (`EventRow.application_id`, `seenAppIds`/`pairsWithAppId`, filtr `freshApps` + `seedOnly`, `fireBridgeEvent` stempluje `metadata.application_id`, `extractMetadataInt`), `fetchPastEvents` (+`application_id`), _tests/handler.test.ts (+3 nowe, 4 zaktualizowane) | Klucz = **`application_id`**. Trzy przypadki: (a) id znane ⇒ cisza (idempotencja skanu co 15 min — właściwy powód istnienia dedupe); (b) para ma TYLKO historię bez `application_id` (wiersze sprzed zmiany) ⇒ nie da się rozstrzygnąć „ta sama czy nowa", więc **raz cicho rejestrujemy** id (`notify=false`, mechanizm seed z Bug #25) zamiast zgadywać — samoleczące po jednym przebiegu; (c) reszta ⇒ mail, także dla tej samej PK na tym samym jobie. **`created_at` z Mamamii świadomie NIE użyte** — komentarz przy `rejected_at` w `queries.ts` dokumentuje, że dodanie pola do `JobOfferApplicationsWithPagination` zabiło prod na 3 dni (11-13.07, zero maili), a żadna nasza query nie ma tego pola udowodnionego na prodzie; klucz oparty na własnych danych nie ryzykuje niczego. Zaległe 5 z 17.08 wysłane jednorazowym skryptem (`buildCaregiverMetadata` + konditiony live z proxy, więc treść identyczna z detektorową); szóste (`app11636` Małgorzata T.) w międzyczasie wycofane ⇒ świadomie pominięte. **Bez backfillu starszych** (decyzja Michała). **Reguła:** tożsamość Bewerbung to `application_id`; para (job, opiekunka) mówi tylko „ta PK już się kiedyś zgłaszała", co jest czymś innym niż „o TEJ ofercie klient już wie". |
| 34 | **Zmiana adresu e-mail w adminie nie docierała do zaplanowanych maili** (2026-08-14, prod lead Alexandra Hagedorn `782591cb`). `scheduled_emails.recipient_email` to KOPIA adresu z momentu kolejkowania, a formularz „Kontaktinformationen" aktualizował wyłącznie `leads.email` — 5 przypomnień (`application_reminder{,_4h,_12h}`, 2× `application_last_chance`) wisiało na starym adresie, pierwsze 17 minut od zgłoszenia. Skala na prodzie w momencie wykrycia: 5/103 `pending` + 1/2 `needs_review` rozjechane (49 `sent` = historia, nietykane). Drugi, ukryty skutek: guard literówek domeny (`needs_review`) sprawdzał snapshot, więc po poprawieniu adresu oflagowałby wiersz ponownie na podstawie starej wartości. | project 3/app/admin/leads/[id]/page.tsx (`handleSaveContact` + adresat widoczny na liście kolejki), project 3/supabase/functions/send-scheduled-emails/index.ts (`recipient` z leada; guard domeny, `sendEmailSmtp`, `lead_events.metadata.to`, `failures[].recipient`, zapis `recipient_email` przy `sent`) | Dwie warstwy. (1) **Wysyłacz adresuje z `lead.email`**, snapshot tylko jako fallback (`(lead.email ?? "").trim() || row.recipient_email`) — wiersz leada i tak był już wczytany, więc to jedna linia; kolejka jest poprawna z definicji niezależnie od tego, czy admin-side update się powiódł. Bezpieczne, bo **żaden typ w kolejce nie jest mailem teamowym** — team leci bezpośrednim SMTP-em (`TEAM_NOTIFY_RECIPIENT`, `OPS_ALERT_TO`), a BCC to osobne pole. Zapis `recipient_email` przy `sent` czyni historię prawdziwą. (2) **Admin przepisuje kolejkę** przy zapisie (`pending` + `needs_review`, po `lead_id`); błąd → `alert`, nie ciche połknięcie. `needs_review` dostaje nowy adres, ale **zachowuje flagę** (decyzja Michała) — status jest write-only, nikt go nie czyta, więc odblokowanie zostaje ręczne. Wszystkie 5 miejsc INSERT-ujących do kolejki czyta świeże `leads.email` (zweryfikowane), więc nowe wiersze były OK już wcześniej. Prod naprawiony jednorazowym UPDATE-em (6 wierszy) przed wysyłką. **Reguła:** adresat maila w kolejce = wartość z leada w momencie WYSYŁKI; snapshot w wierszu jest wygodą i fallbackiem, nigdy źródłem prawdy. |
| 33 | **Wizard-Tracking verlor ~50 % der Kontakt-Abschlüsse + Google-Ads-Attribution fehlte komplett** (2026-08-14, SEA-Lauf 1). (a) `step_complete(contact_form)` + `angebot_angefordert`-Conversion liefen als supabase-js-Inserts direkt aus dem Browser; der Sofort-Redirect ins Portal (`window.location.assign`) brach sie in ~50 % der Fälle ab (Woche 07.–13.08.: 12 getrackte Abschlüsse vs. 23 echte Leads). `step_complete(9)` feuerte zudem in `handleNext` VOR der Validierung — zählte also auch fehlgeschlagene Submits. (b) 0 von 1.083 Sessions (4 Wochen) hatten utm_*; Klick-IDs (gclid) wurden nirgends erfasst → Ads/Organik untrennbar, kein Conversion-Rückkanal zu Google. | project 3/lib/analytics.ts (`trackCriticalSubmit` sendBeacon + `rememberAdParams`/`persistAdParams`/`getAdParams`), project 3/app/api/analytics/critical-event/route.ts (NEW — server-seitiger Insert), project 3/components/calculator/MultiStepForm.tsx (step-9-Tracking in Submit-Erfolg verschoben; GTM-sicherer Redirect `eventCallback`+`eventTimeout 700`+Safety 900 ms; `adParams` im Submit-Body), project 3/app/api/angebot-anfordern/route.ts (Klick-ID-Allowlist + best-effort Update auf lead), supabase/migrations/20260814090000_ad_click_ids.sql (nullable: analytics_sessions.utm_term/utm_content/gclid/wbraid/gbraid + leads.gclid/wbraid/gbraid), docs/google-ads-tracking.md (NEW — Ads/GTM-Setup-Anleitung), docs/customer-portal-flow.md (§Stage A Tracking + §Wiersz leads) | **sendBeacon überlebt Navigation garantiert** (Fallback fetch keepalive); Insert passiert server-seitig in der neuen Route. Klick-IDs IMMER als separates best-effort Update (nie im Haupt-Insert) — Lead-Erstellung darf nie an fehlenden Spalten scheitern, Migration darf nachlaufen. **Semantik-Änderung:** `step_complete(9)` = erfolgreicher Submit (Zeitreihen-Bruch am Deploy-Datum). Ads-UI-Schritte (UTM-Suffix, Conversion-Aktion, GTM-Tag) macht Martin — Anleitung in docs/google-ads-tracking.md. |
| 32 | **Klauzula telefonu usunięta z umowy — Vertragsversion v1.1** (2026-08-12, decyzja Michała: „klient musi zapewnić opiekunce telefon… potrzebujemy go znaleźć i usunąć ze wszystkich miejsc; poprzednie już podpisane zostają bez zmian"). § 1 pkt 10 („Der AG stellt der Betreuungsperson die Mitbenutzung eines Telefons für nationale Festnetztelefonate sowie Festnetztelefonate ins Heimatland und Internet zur Verfügung.") wycięty ze WSZYSTKICH miejsc dla nowych podpisów — § 1 ma odtąd 9 punktów. Kafel landera „Küche, Bad/WC und Internetanschluss…" ZOSTAJE (osobna decyzja — dotyczy warunków zakwaterowania, nie klauzuli). | project 3/lib/vertrag-content.ts (PARA_1.punkte[9] OUT + komentarz mapy stron), src/components/portal/VertragSignieren.tsx (duplikacja JSX — PARAGRAPHEN[0].punkte[9] OUT + audit-linia v1.1), project 3/app/api/lead-event/route.ts (`CONTRACT_VERSION='v1.1'` + auditNote), contract-pdf route + skrypty vertrag (literały v1.1), src/__tests__/vertragContent.test.ts (liczności `[9,…]`), fixture vertrag-baseline.html (regeneracja — diff TYLKO klauzula+wersja), public/primundus-mustervertrag.pdf (podmieniony), scripts/vertrag/render-muster.ts (NEW), docs/vertrag-flow.md | Semantyka wersji: **v1.0 = tekst 10-punktowy, v1.1 = 9-punktowy**; `contract_version` to czysty stempel audytowy (zero odczytów w runtime). **Freeze podpisanych = bajty kanonów w buckecie** (bucket-first + `upsert:false`), NIE martwy kod — repo trzyma wyłącznie aktualną treść; paginacja bez zmian (8 stron, smoke 3/3). Mustervertrag generowany odtąd z NASZEGO renderera: `render-muster.ts` = pusty input + odfiltrowany `auditBanner` (wzór nie jest podpisany), trailing-comma capSub przycięty w skrypcie; kopię na primundus.de wgrywa Michał ręcznie (poza repo). `parity-check.ts` vs stare prod-kanony będzie odtąd zgłaszał różnicę treści — OCZEKIWANE (stare kanony mają klauzulę), skrypt zostaje narzędziem per-wersja. |
| 31 | **Anrede in Mails und Portal übernahm VERSALIEN aus dem Lead** (2026-08-10, prod: die Nachfass-Mail grüßte „Hallo Frau RUPPERT"). Der Kunde tippt seinen Namen wie er will („RUPPERT", „marco"); `project 3/lib/email.ts` normalisierte das längst korrekt (capWord + Partikel), aber ZWEI weitere Stellen hatten noch die naive Fassung „nur erster Buchstabe groß, Rest unverändert": die Edge Function `send-scheduled-emails` (verschickt Eingangsbestätigung + Nachfass — daher die gemeldete Mail) und `src/lib/names.ts:cap()` (formale Portal-Anrede + `leadGreeting`). Die Portal-Tests zementierten den Defekt sogar („Sehr geehrte Frau von norman"). | project 3/supabase/functions/send-scheduled-emails/{names.ts NEU, index.ts, _tests/names.test.ts NEU}, src/lib/names.ts (`cap` → `capitalizeName`), src/lib/supabase.ts (`leadGreeting`), src/__tests__/supabase.test.ts | Einheitliche Regel in allen drei Runtimes: ALL-CAPS wird normalisiert („RUPPERT"→„Ruppert"), Kleinschreibung großgeschrieben, bewusst gemischte Schreibung bleibt („McDonald"), Bindestrich-/Wortteile einzeln, Partikel klein („Frau von Stein"). Die Edge Fn bekommt den Helfer als eigenes pures Modul `names.ts` (Edge Functions können nicht aus `lib/` importieren — gleiche Lage wie `appendJobParam`, daher drei Kopien mit Sync-Hinweis; Deno-Tests decken sie ab). **Regel:** Namen NIE roh in eine Anrede rendern — immer durch die Normalisierung. |
| 33 | **„Gut" landete bei der Kundenanlage weiter als `level_4`** (2026-08-16, Meldung Martin: Kunde Felsch pr-10182 „hat Sprachlevel L4"). Bug #30 (10.08.) trennte die Stufen (Formular bietet maximal „Gut" = `level_3` = 450 €/Mo; `level_4` = „Sehr gut" = 600 €/Mo nur über das SA-Portal) — gefixt wurde aber NUR die Portal-Seite (`src/lib/mamamia/mappers.ts:requiredGermanyLevelForWish`). Der ONBOARD-Mapper blieb auf `level_4`, obwohl die Feldtabelle oben schon `level_3` behauptete (Doc-Drift). Folge: JEDER „Gut"-Lead startete in mamamia mit `level_4`; erst der Patientenformular-Save korrigierte still auf `level_3` — den machen nur ~22 % der Kunden, der Rest blieb falsch und wurde im SA-Portal mit 600 €/Mo kalkuliert (~150 € über dem eigenen Angebot — exakt das Symptom von Bug #30). Prod-Beleg 16.08.: Hümmer/Bähr/Krohne/Glatz (ohne Formular) = `level_4`; Felsch/Türschmann (mit Formular) = `level_3`. | supabase/functions/onboard-to-mamamia/mappers.ts (`mapGermanySkill` + Rückgabetyp), _tests/mappers.test.ts | `sehr-gut` → `level_3`; `level_4` ist aus diesem Pfad nicht mehr erreichbar (bewusste Grenze, keine Lücke). **Regel:** Lebt ein Mapping an ZWEI Stellen (Onboard-Anlage + Portal-Save), beide im selben PR anfassen — und die Feldtabelle in CLAUDE.md ist eine Behauptung, kein Beweis: immer gegen den Code prüfen. Offen: Bestandskorrektur der bereits mit `level_4` angelegten Kunden. |
| 30 | **Empfehlung SA-Portals lag bei KAŻDYM kliencie z kalkulatora 150 € nad jego własną ofertą — "sehr gut" znaczyło co innego po obu stronach** (2026-08-10, prod klient Schiffer pr-10048: oferta portalu 2.800 €, SA-Portal rekomendował 2.950 € ⇒ czerwony "Preis niedryg" na jobie 2.750 €). Formularz oferuje najwyższy stopień jako **„Gut" = 450 €/Mo**, ale `requiredGermanyLevelForWish` zapisywał go w mamamii jako `level_4`, a SA-Portal wycenia `level_4` na 600 €/Mo (jego skala: L3=450, L4=600). Różnica 150 € trafiała w KAŻDEGO klienta z tym wyborem (84 z 272 leadów z mamamia-ID). | src/lib/mamamia/mappers.ts (`requiredGermanyLevelForWish`), migracja `..._split_german_grades_gut_sehr_gut.sql`, src/__tests__/mamamia/mappers.test.ts, docs/customer-portal-flow.md | Rozdzielone dwa grade: `sehr-gut` (klucz historyczny, label **„Gut"**, 450 €/Mo) → **level_3**; nowy wiersz `sehr-gut-sa` (label „Sehr gut", 600 €/Mo) → level_4, **niewybieralny w formularzu** (kalkulacja trafia dokładnie wybrany antwort_key, więc klient nigdy go nie dotknie) — wystawia go wyłącznie agencja w SA-Portalu. Klucza `sehr-gut` NIE zmieniono: wszystkie dotychczasowe leady mają go w `formularDaten`, rename zabiłby recalculate-all-leads i Angebots-Anpassung. `matchesGermanyWish` zostaje strikte — klient „Gut" widzi wyłącznie level_3, nie droższe level_4. **Uwaga (poza scope PR):** 84 istniejących klientów ma w mamamii `germany_skill=level_4` z czasów starego mapowania — do jednorazowej korekty po stronie mamamii, inaczej SA-Portal dalej liczy im 600. |
| 29 | **OOM kostenrechnera #2: optymalizator obrazów Nexta bez `sharp` = squoosh-WASM w procesie Node** (2026-08-09/10; OOM-y 09.08 10:41 i 10.08 mimo wycięcia Chromium w #27 — Chromium był DRUGIM winowajcą, pierwszy ładował się z każdą wizytą landera). Diagnoza WYŁĄCZNIE z telemetrii #426 (żądanie Michała „zamiast zgadywać, dodajmy logi"): (1) `[mem:boot] sharp=false` + warning Nexta; (2) lander + 4 optymalizacje ⇒ `[mem:spike] +170MB` przy heap=42MB/ext=4MB — pamięć POZA heapem i external = linear memory WASM; (3) kontrolowany burst 64× `/_next/image` ZABIŁ instancję stagingu (502 na health, auto-restart ~20s) — odtworzony profil zgonu. | project 3/package.json (+`sharp` runtime-dep; Next wykrywa automatycznie, zero zmian w kodzie), telemetria: instrumentation{,-node}.ts + lib/memlog.ts + middleware `[img]` + render.yaml NODE_OPTIONS=384 (tripwire) | Z sharpem: 20 równoległych optymalizacji ⇒ rss=105MB TOTAL (`[mem:boot] sharp=true`). **Reguła:** Next na self-hosted 512MB BEZ sharpa to bomba zegarowa skalująca się z ruchem — squoosh trzyma zdekodowane RGBA w WASM-ie niewidocznym dla heap-limitów; sampler `[mem]` (ext/ab vs heap) rozróżnia klasy winowajców. Sampler zostaje na stałe; `[img]`-logi i tripwire do zdjęcia po tygodniu czystych logów. |
| 28 | **Upload PDF-u do MM przy wierszach ADOPCYJNYCH nigdy nie przechodził — walidator UpdateConfirmation** (2026-08-06, wykryte w e2e gate 3 refactoru pdfkit, staging app=667). Adopcja (Vertrag nachträglich po bookingu panelowym) ankruje na confirmation-id; mamamia przy `UpdateConfirmation(file_tokens)`: z `application_id=<confirmation-id>` ⇒ „Anwendungs-ID ist ungültig", BEZ pola ⇒ „Das Feld Anwendungs-ID ist erforderlich" (schemat mówi optional — walidator Laravel wymaga i sprawdza przeciw realnym Applications; soft-deleted OK, nigdy-nieistniejące NIE). Skutek: wieczny cron-retry, którego render-path stemplował `pdf_sha256` efemerycznych bajtów bez obiektu w buckecie (6 fałszywych stempli na prodzie — naprawione backfillem `scripts/vertrag/backfill-contract-canon.ts`, 21/21 zdrowych). | supabase/functions/_shared/acceptanceSync.ts (SYNC_CUSTOMER_QUERY + typ + upload), _tests/acceptanceSync.test.ts (+2), project 3/scripts/vertrag/backfill-contract-canon.ts (NEW) | Selekcja **`final_confirmation.application_id`** (oryginalna Bewerbung confirmation — typ `Confirmation` zwraca to pole od #396) i przy adopcji upload idzie z NIM; brak wartości ⇒ defer z czytelnym powodem (zero ślepego uploadu). Echte rows bez zmian. Verified live staging: completed=1/errors=0, `mamamia_pdf_uploaded_at` ostemplowane. **Reguła:** „optional w schemacie" ≠ „optional w walidatorze" — mamamia potrafi wymagać pola wbrew introspekcji (klasa Bug #16/#26: prawdę mówi tylko live-sonda). |
| 27 | **Kostenrechner OOM >512MB na Render — pełny Chromium renderował PDF umowy w procesie Next.js** (2026-08-05/06). `buildVertragAttachmentPdf` odpalał `puppeteer-core`+`@sparticuz/chromium` (~300MB+ RSS) przy: świeżym akcepcie (kanon), resendzie Mail C i KAŻDYM otwarciu umowy 6 legacy-akceptów bez kanonu w buckecie. Baseline Next ~200-250MB + Chromium = ruletka OOM przy każdym renderze (w kodzie był już force-kill zombie-chromiumów — leczył skutki, nie przyczynę). | project 3: lib/vertrag.ts (fasada), lib/vertrag-content.ts (NEW — CAŁA treść §§1-10/Anlagen/etykiety jako dane + model blokowy `buildVertragDocument`/`documentPlainText` + `buildVertragHtml`), lib/vertrag-pdf.ts (NEW — renderer pdfkit), assets/fonts/ (NEW: Liberation Sans R/B/I + Liberation Serif R + DejaVuSans + licencje), next.config.js (+pdfkit externals), app/api/lead-event/route.ts (hardening `upsert:false` kanonu), scripts/vertrag/ (baseline/goldens/parity/smoke), src/__tests__/vertragContent.test.ts (NEW, 18 testów), .github/workflows/test.yml (job `vertrag-render-smoke`) | **Renderer = pdfkit** (~20-30MB/render, zero Chromium). Parytet ×4 (żądanie Michała): (1) PR1 baseline-lock — ekstrakcja treści bajt-w-bajt identyczna (fixture z kodu sprzed refactoru); (2) parity-check na 9 REALNYCH prod-kanonach: identyczna sekwencja znaków body (porządek WIZUALNY po sortowaniu y/x — chromium maluje pozycjonowane `li` PO normal-flow!), równe strony/stopki/liczniki numeracji — 9/9 PASS; (3) galeria stary/nowy + syntetyczne edge-case'y → sign-off Michała; (4) trwałe CI: testy pure-treści w root-vitest + render-smoke (8 stron, ń/▸/✓, stopki). **Fonty = POMIAR, nie deklaracja CSS**: kanony składał fontconfig kontenera Render → Liberation Sans (body; "Helvetica Neue/Arial" nie istniały), **Liberation SERIF** (podpisy 24pt — fallback stacka "Snell Roundhand…cursive"!), DejaVu (✓▸). Pułapki utrwalone w vertrag-pdf.ts: WinAnsi bez `ń` (bundlowane TTF obowiązkowe), justify+continued złamane w pdfkit (własny layoutRuns dla mieszanych stylów), pomiar TYM SAMYM fontem co draw, margins.bottom=0 na czas footer-passa, linie podpisu rysowane też przy pustych wartościach. PS 5.1 gotcha: Invoke-RestMethod dekoduje UTF-8 bez charset jako Latin-1 (mojibake w goldenach — pobierać surowe bajty). Stare kanony w buckecie NIETYKANE (bucket-first; niezmienność dokumentu); deps puppeteera zostają do PR3 (rollback=revert). |
| 26 | **Annahme-Detektor (Mail C za booking panelowy) NIGDY nie odpalił — martwa kotwica `final_confirmed_at`** (2026-08-05, wykryte przy weryfikacji `ts-18-9870-2` na becie: Michał zabookował Mariannę J. panelem, klient nie dostał Mail C). Guard 2 detektora (#379) wymagał świeżego `final_confirmation.final_confirmed_at`, a mamamia zwraca to pole jako **null na OBU tenantach i przy OBU ścieżkach** (booking panelowy ORAZ portal-akcept; sondy live: beta Confirmation 667, prod Confirmation 4005). Null wyglądał jak Altbestand ⇒ detektor milczał od 15.07; 100% dotychczasowych Mail C pochodziło z akceptów portalowych (na prodzie nic nie przepadło — każdy `gebucht` od 15.07 miał akcept portalowy, luka czysto latentna do czasu follow-up jobów). | supabase/functions/_shared/leadJobsSync.ts (selekcja + typ `created_at`), supabase/functions/detect-caregiver-events/index.ts (Guard 2: `fc.created_at ?? fc.final_confirmed_at`), _tests/handler.test.ts (+2 testy: created_at świeży + final null ⇒ feuert; created_at stary ⇒ Altbestand-cisza) | Kotwica świeżości = **`final_confirmation.created_at`** (= moment bookingu; stemplowane na obu tenantach — zweryfikowane sondą `probe-fc` wzorem „$nope" z Bug #19, potem usuniętą). `final_confirmed_at` zostaje w selekcji wyłącznie jako fallback, gdyby MM zaczęła je stemplować. Fix = 1 pole w selekcji + 1 pole w warunku (bez nowej maszynerii — feedback Michała „nie paćkać"). Staging e2e: odpalił się naturalnie dokładnie 1 event (Marianna — Mail C na alias). Prod: 3 zaległe bookingi <7 dni (Elke 9239 ×2: Agnieszka J. 33415 + Józefa B. 33817; smandala 8961: Anna B. 33821) **wyciszone backfillem** `application_accepted_internal` z `source=backfill-bug26, seeded=true` (decyzja Michała 2026-08-05: „Deploy + wycisz te 3" — fix działa tylko wprzód); czwarty kandydat (Aneta W. 33216, booking 27.07) poza 7-dniowym oknem. Resztkowa luka (świadomie poza scope): bridge deduplikuje eventy detektora per job ⇒ storno + booking INNEJ PK na TYM SAMYM jobie nie wyśle drugiego Mail C. |

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
- `src/__tests__/portalUrl.test.ts` — `appendJobParam` (cross-import z
  `project 3/lib/portal-url.ts` — jedyny dozwolony cross-app import, pure modul)

### Edge Functions (Deno)

```bash
# Onboard
cd supabase/functions/onboard-to-mamamia && deno task test

# Proxy
cd supabase/functions/mamamia-proxy && deno task test

# Detect (cron Bewerbungen/multi-job/discovery)
cd supabase/functions/detect-caregiver-events && deno task test

# Kostenrechner send-scheduled-emails (pure helpery followupJobs.ts)
cd "project 3/supabase/functions/send-scheduled-emails" && deno task test
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

> **🟢 STAGING LIVE (od 2026-05-26).** PR #189 + #190 wprowadziły dual-env.
> Staging = osobny Supabase project (`taggpiwpwthgpcmaiqjw`) + osobne Render
> slots (`caapp-staging` + `kostenrechner-staging`) + Mamamia beta tenant
> (`backend.beta.mamamia.app`, agency 18). Prod **niezmieniony** (slot
> `caapp` + `kostenrechner`, Supabase `ycdwtrklpoqprabtwahi`, Mamamia
> preprod `backend.prod.mamamia.app`, agency 3). Patrz
> `docs/staging-environment-plan.md` dla pełnego rationale.
>
> **Branch rename** `integration/mamamia-onboarding` → `main` — świadomie
> defer'owany. Trunk to nadal `integration/mamamia-onboarding`. Skills +
> workflows referują tę gałąź; rename gdy będzie pretekst.

### ⚠️ CO SIĘ ZMIENIŁO 2026-05-26 — KAŻDY DEV / CLAUDE MUSI WIEDZIEĆ

**Przed:** `git push origin integration/mamamia-onboarding` → wszystko auto-deployowało się na prod (Render + edge fns + migracje).

**Po:**
- **Frontend (Render):** push → BOTH prod + staging Render slots **auto-build** z tego samego commit'a (auto-deploy ON dla obu — zweryfikowane: prod deploy trigger=`new_commit`, status `live`). **Frontend na prod jest AUTO, nie gated.**
- **Edge functions:** CI deployuje **tylko na STAGING** Supabase (`taggpiwpwthgpcmaiqjw`). PROD Supabase (`ycdwtrklpoqprabtwahi`) **NIE dostaje auto-deploy** — manual `supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi`.
- **Migracje SQL:** brak auto-deploy w żadnym kierunku — zawsze manual przez `scripts/apply-migrations.sh <ref>` (lub `supabase db push --linked`).

**Implikacja:** jeśli zmieniasz cokolwiek w `supabase/functions/*` lub `project 3/supabase/functions/*` lub `supabase/migrations/*` → po merge frontend dotrze na prod automatycznie, **edge functions + migracje NIE**. Klient zobaczy nowy UI ale rozmawiający z nim Supabase ma stary kod → kruche.

**Co robić:**
1. **Tylko-frontend change** (np. tylko `src/` lub `project 3/components/`): merge → Render auto-deployuje na prod **i** staging. **Nic więcej nie trzeba** — front live na prodzie po ~2-3 min. (Zweryfikuj na stagingu PRZED merge, bo merge = prod live.)
2. **Zmiana z edge fns / migracjami:** zdeployuj je na **prod manualnie** (`supabase functions deploy … --project-ref ycdwtrklpoqprabtwahi`, migracje `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi`) — dla zmian front+edge **przed** merge (patrz KOLEJNOŚĆ w banerze u góry). Staging dostaje edge fns przez CI po merge.
3. **Hot-fix:** patrz §"Emergency hotfix" niżej.

### Dwa środowiska

| | STAGING | PROD |
|---|---|---|
| Render slot CAapp | `caapp-staging` (`srv-d8anbsfavr4c73do33mg`) | `caapp` (`srv-d7phc0rrjlhs73dtismg`) |
| Render slot Kostenrechner | `kostenrechner-staging` (`srv-d8anc9b7uimc73ajhdm0`) | `kostenrechner` (`srv-d7phc1n7f7vs739kaa5g`) |
| URL CAapp | `caapp-staging.onrender.com` | `kundenportal.primundus.de` |
| URL Kostenrechner | `kostenrechner-staging.onrender.com` | `kostenrechner.primundus.de` |
| Supabase project ref | `taggpiwpwthgpcmaiqjw` | `ycdwtrklpoqprabtwahi` |
| Supabase region | eu-central-1 (Frankfurt) | eu-west-1 (Ireland) |
| Mamamia tenant | `backend.beta.mamamia.app` | `backend.prod.mamamia.app` |
| Mamamia agency_id | `18` (Primundus beta) | `3` (Primundus prod) |
| Frontend deploy | Render auto on push do trunk | **Render auto on push do trunk** (auto-deploy ON — nie gated) |
| Edge fn deploy | CI auto via `test.yml` (po merge) | **Manual:** `supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi` |
| Migration deploy | Manual: `scripts/apply-migrations.sh taggpiwpwthgpcmaiqjw` (lub `/deploy-staging`) | **Manual:** `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi` |

(Slot slug `caapp-beta` istniał historycznie i został przemianowany na `caapp` — w starszych docsach możesz zobaczyć obie nazwy. To ten sam serwis.)

### Prod deploy — manual (skill `/deploy-prod` usunięty 2026-07-03)

`/deploy-prod` został **usunięty** — zakładał że prod-front jest gated (NIE jest,
auto-deployuje się na merge) i robił zbędną Render-API ceremonię. Prod deploy jest
teraz jawny i manualny; `/deploy-staging` **został** (opcjonalny refresh stagingu).

**Typowy dev cycle:**

```
feature/xyz → PR → CI green → (dla front+edge: deploy prod EDGE FN najpierw) → self-merge
                                       ↓
   merge = Render auto-deploy FRONTU na PROD (~2-3 min) + staging; CI → edge fns na staging
                                       ↓
   prod edge fns / migracje (jeśli dotyczy) — MANUAL:
     scripts/apply-migrations.sh ycdwtrklpoqprabtwahi        # migracje PIERWSZE
     supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi
                                       ↓
                          PROD live (kundenportal.primundus.de)
```

**Reguły które trzymasz sam (były w skillu, teraz ręcznie):**
- **migracje pierwsze, kod drugi** (Święta zasada nr 3) — prod migracja musi być backward-compatible.
- **front+edge → prod edge fn PRZED merge** (merge = front live na prodzie od razu).
- smoke po deploy: `curl -sS -o /dev/null -w "%{http_code}" https://kundenportal.primundus.de/` (200) + edge fn `{"token":"x"}` → 401.
- Mamamia schema-parity (Bug #16): dla zmian dotykających GraphQL — zweryfikuj że pole/mutacja istnieje na prod tenancie zanim wypuścisz.

**`/deploy-staging` (rzadkie):** ręczny refresh stagingu po transient CI flake
(esm.sh 522, Render build timeout), albo po zmianie staging secrets.

### Emergency hotfix (tylko gdy klient krwawi)

Gdy staging jest broken lub czekanie na full cycle = ryzyko biznesowe:

```bash
# 1. Confirm jesteś na czystym integration/mamamia-onboarding zsync z origin
git fetch origin && git diff HEAD origin/integration/mamamia-onboarding -- supabase/functions/
# Diff musi być pusty. Jeśli nie — pull/merge najpierw.

# 2. Bezpośredni deploy na prod (skipuje staging)
npx supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi
```

**Używaj świadomie.** Skipowanie stagingu znaczy że nie ma weryfikacji że
zmiana działa z prod Mamamia tenant (Bug #15, #16 by się wykryły na
stagingu). Po hotfix'ie zrób retro PR żeby commit znalazł się w git history,
oraz `/deploy-staging` żeby staging i prod znów były synchronized.

Często musisz zdeployować **OBA** (`onboard-to-mamamia` + `mamamia-proxy`)
gdy zmiany dotyczą shared modules w `_shared/`.

**Branch protection** na `integration/mamamia-onboarding` wymaga PR + passing
CI checks (`vitest`, `deno-onboard`, `deno-proxy`, `deno-detect`) przed merge.
To strukturalnie blokuje direct push.

### NEVER `supabase functions deploy` na prod bez gita

Każdy lokalny deploy bez wcześniejszego commit + push to race condition:
wgrywa stan TWOJEGO dysku, nie git HEAD, więc cudze zmiany w chmurze
mogą wyparować (incydent 2026-05-13 z `hp_caregiver_id` był dokładnie tym).
Hotfix sequence powyżej zaczyna od `git fetch + diff` żeby ten case
wykryć przed deploy'em.

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
- Google-Ads-Zugänge für `upload-offline-conversions` liegen **im Supabase
  VAULT** (nicht als Function-Env — das CLI-Token darf `secrets set` auf
  diesem Projekt nicht, 403): `google_ads_developer_token`,
  `google_oauth_client_id`, `google_oauth_client_secret`,
  `google_oauth_refresh_token`. Zugriff via RPC `get_google_ads_secrets()`
  (Migration 20260814122000, service_role-only — Muster wie
  `get_smtp_config`). Quelle der Werte: `.google.secrets` bei Martin;
  einspielen per Management-API-SQL (`vault.create_secret`/`update_secret`),
  NIE über Migrationen. Staging bewusst ohne Vault-Einträge → Function
  skippt. Env-Overrides (optional, Function liest Env zuerst):
  `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_OAUTH_*`, `GOOGLE_ADS_CUSTOMER_ID`,
  `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, `GOOGLE_ADS_QUALIFIED_LEAD_ACTION`.

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

**Dostępne** — `render` CLI zainstalowany (na Windows: `~/bin/render`), **zalogowany
per-user** (`render workspace current` działa nawet gdy `RENDER_API_KEY` w shellu jest
nieustawiony — CLI trzyma własny token). REST: base URL `https://api.render.com/v1`,
auth `Authorization: Bearer $RENDER_API_KEY` (wymaga klucza w env). Normalna ścieżka
deploy to auto-deploy z GitHub push (2-3 min — **front na prod i staging**); CLI/API
używaj do env-vars, statusu (`render deploys list <id> --confirm -o json`) i
wymuszonych redeploy'ów.

Service IDs:

| Slot | PROD | STAGING |
|---|---|---|
| CAapp | `srv-d7phc0rrjlhs73dtismg` | `srv-d8anbsfavr4c73do33mg` |
| Kostenrechner | `srv-d7phc1n7f7vs739kaa5g` | `srv-d8anc9b7uimc73ajhdm0` |

```bash
RK="$RENDER_API_KEY"; SID=srv-...
curl -sS "https://api.render.com/v1/services/$SID/env-vars?limit=100" -H "Authorization: Bearer $RK"        # read env
curl -sS -X PUT "https://api.render.com/v1/services/$SID/env-vars" -H "Authorization: Bearer $RK" -d '[...]' # bulk replace ALL (atomic)
curl -sS -X POST "https://api.render.com/v1/services/$SID/deploys" -H "Authorization: Bearer $RK" -d '{"clearCache":"do_not_clear"}'
```

**Gotcha:** zmiana env-vars przez API **NIE** auto-deployuje — nowe wartości
łapie dopiero kolejny deploy (`POST .../deploys` albo push). Bulk `PUT
/env-vars` zastępuje CAŁY zestaw, więc GET → modyfikuj → PUT (nie zgub
pozostałych zmiennych). Vary `value:` w `render.yaml` są nadpisywane przez
blueprint na każdym sync; `sync:false` zostają dashboard/API-managed.

### Email transport (Amazon SES)

Maile wychodzą przez **nodemailer over SMTP** (Amazon SES, region
`eu-central-1`, host `email-smtp.eu-central-1.amazonaws.com`, port 587
STARTTLS). SES zastąpił Ionos (throttling/timeouty z Rendera). Pełny runbook
+ per-env wartości: [docs/ses-email-migration.md](docs/ses-email-migration.md).

Dwie ścieżki transportu, **dwa różne magazyny configu** — łatwo pomylić:

| Ścieżka | Kod | Config żyje w | Czym przełączasz |
|---|---|---|---|
| **A — edge fn** `send-scheduled-emails` (maile do klienta: Eingangsbestätigung + Nachfass) | `sendEmailSmtp` | **Supabase Vault** (`vault.decrypted_secrets`: `smtp_host`, `smtp_user`, `smtp_pass`, `smtp_from`, …) przez RPC `get_smtp_config()` | SQL update Vault na danym projekcie. **Bez redeploy** — RPC czyta Vault per-call. |
| **B — Next.js** `sendEmail` (team notif, Vertrag, resend) | `project 3/lib/email.ts` | **Render env vars** (`SMTP_HOST`, `SMTP_USER`, …) | Render dashboard (brak Render API tokena). |

Gotchas:
- **Vault ≠ `supabase secrets`.** SMTP secrets ścieżki A siedzą w Vault (SQL
  `vault.create_secret`/`update_secret`), NIE w edge-fn env (`supabase secrets set`).
- `requireTLS: true` + bounded timeouts w obu transportach — choking provider
  pada szybko i widocznie zamiast wisieć. Provider-neutral (działa też z Ionos).
- `SMTP_FROM` MUSI być ustawiony (verified SES identity, `kostenrechner@primundus.de`).
  Inaczej kod fallbackuje na `SMTP_USER` = SMTP username `AKIA…` (nie email) → invalid From.
- `render.yaml` hardkoduje `SMTP_HOST=smtp.ionos.de` (prod blueprint). Przy
  prod cutover trzeba to zmienić — inaczej redeploy prod resetuje host na Ionos.
- Przełączenie env odbywa się **per-environment**: staging (Vault `taggpiwpwthgpcmaiqjw`
  + Render `kostenrechner-staging`) pierwszy, prod (`ycdwtrklpoqprabtwahi` +
  `kostenrechner`) dopiero po weryfikacji. SMTP password = sekret, nigdy do gita.

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
    \"email\": \"m.kepinski+e2e-${TS}@mamamia.app\",
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

**Test-maile: ZAWSZE plus-alias `m.kepinski+<tag>@mamamia.app`** (konwencja
Michała, np. `+testsignature`, `+e2e-<ts>`). **NIGDY mailinator ani inne
publiczne disposable-skrzynki** — mamy SES (reputacja nadawcy primundus.de),
a Eingangsbestätigung zawiera magic-link token, który w publicznej skrzynce
jest jawny dla każdego (feedback Michała 2026-07-21, ostro). Weryfikacja
odbioru: Michał widzi aliasy we własnej skrzynce; dowodem wysyłki po stronie
kodu jest event `email_eingangsbestaetigung_sent` w `lead_events`.

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
| `required_status_checks.contexts` | `vitest (frontend)`, `deno tests (onboard-to-mamamia)`, `deno tests (mamamia-proxy)`, `deno tests (detect-caregiver-events)` | 4 jobs musi być green. **To jedyna realna brama.** (`deno tests (send-scheduled-emails)` runuje, ale NIE jest required.) |
| `enforce_admins` | false | Michał (admin) może obejść w hot-fix. **Używaj świadomie.** |
| `allow_force_pushes` / `allow_deletions` | false | Nie da się zniszczyć historii brancha. |

**Implikacja:** każdy dev z `write` permission może self-merge swój PR po
zielonym CI. Code review jest opcjonalny (post-merge, on-demand). Jeśli
wynik okaże się problematyczny — zmień `required_approving_review_count`
na 1 przez `gh api -X PUT .../protection`.

### CI workflow (`.github/workflows/test.yml`)

5 test-jobs runuje na każdy PR + push do `integration/mamamia-onboarding`:

1. **`vitest (frontend)`** — `npm ci` + `npx vitest run` + `tsc --noEmit`.
   Pin `TZ=Europe/Berlin` w env (patrz Bug #14 dla rationale).
2. **`deno tests (onboard-to-mamamia)`** — Deno setup + `deno task test`.
3. **`deno tests (mamamia-proxy)`** — Deno setup + `deno task test`.
4. **`deno tests (detect-caregiver-events)`** — Deno setup + `deno task test`.
5. **`deno tests (send-scheduled-emails)`** — pure helpery `followupJobs.ts`
   z `project 3/supabase/functions/` (Bug #25). Jedyny NIE-required check.

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
- **Vertrag flow:** stary stage-B `/betreuung-beauftragen` został dropnięty w cherry-pick,
  ALE od 06/2026 istnieje **nowy** in-portal flow podpisu (VertragSignieren + acceptance
  + server-side sync do Mamamii) — patrz [docs/vertrag-flow.md](docs/vertrag-flow.md)
  i gotcha #12.
- **Migration to new Supabase project:** `ptdlgmpuqgbydglqnjgd` istnieje
  (Marcin's fork) ale nie używamy. Nasza beta na `ycdwtrklpoqprabtwahi`.
