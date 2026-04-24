# Integracja Mamamia — inwentarz blokerów

**Cel:** zebrać w jednym miejscu wszystko co blokuje implementację planu `wykorzystaj-po-czenie-z-mamamia-graphql`. Dla każdej pozycji: **co wiemy już u siebie** (Salead/SADASH), **co musisz zdobyć** i **od kogo** (ty, inny projekt, Martin).

**Jak używać:** przejrzyj kolumnę „Akcja", zaznacz `[x]` gdy masz odpowiedź. Pozycje z akcją `→ Martin` wyślij zbiorczo dopiero gdy reszta będzie rozstrzygnięta.

**Nie commituj tego pliku do gita razem z konkretnymi credentialami** — poniżej są tylko *ścieżki* do secrets, bez wartości.

---

## ✅ Mamy u siebie (tylko kopiować/reużyć)

| # | Pozycja | Źródło | Akcja |
|---|---|---|---|
| 1 | **Mamamia API token dla Primundus** | ✅ **ROZSTRZYGNIĘTE 2026-04-23**: zarejestrowaliśmy własne ServiceAgency "Primundus" na becie używając SADASH-grade tokena. Token Primundus zapisany lokalnie w `~/.primundus-mamamia.env` (poza repo). Agency id=18, code=ts-18. | [x] Done |
| 2 | **Beta auth credentials (LoginAgency)** | ✅ **ROZSTRZYGNIĘTE 2026-04-23**: employee `primundus+portal@mamamia.app` (id=8190) pod agency id=18. Password wygenerowany random, zapisany w `~/.primundus-mamamia.env`. LoginAgency przetestowany → zwraca valid JWT który autoryzuje calle do `/graphql`. | [x] Done |
| 3 | **Mamamia URLs** | Prod `https://backend.prod.mamamia.app/graphql`, Beta `https://backend.beta.mamamia.app/graphql`, Auth `/graphql/auth` (no auth). Źródła: Salead `supabase/functions/get-caregivers/index.ts:4` + SADASH `.env.example` | [ ] Potwierdź że staging dla Primundus to `backend.beta.mamamia.app` (domyślne dla dev) |
| 4 | **Edge Function pattern** | Pełny kod: `/Users/michalkepinski/Documents/Projects/Salead/supabase/functions/get-caregivers/index.ts` (464 linii). Zawiera: boot, env, raw fetch do GraphQL, error handling, `edge_cache` read/write, rate limit, CORS preflight. | [x] Kopiujemy jako szkielet dla `onboard-to-mamamia` |
| 5 | **`register-sa` Edge Function** | `/Users/michalkepinski/Documents/Projects/Salead/supabase/functions/register-sa/index.ts` — **konkretnie pokazuje jak zarejestrować Service Agency + login przez Mamamia z Edge Function**. Prawie 1:1 nasz flow. | [x] Analiza + adaptacja pod StoreCustomer/StoreJobOffer |
| 6 | **`edge_cache` table migration** | `/Users/michalkepinski/Documents/Projects/Salead/supabase/migrations/20260327090000_add_edge_cache.sql` — 3 kolumny (key PK, data JSONB, expires_at), RLS + service role policy. | [x] Kopiujemy migrację (opcjonalnie: dodać index na `expires_at` dla cleanup). |
| 7 | **Rate limiting snippet** | In-memory Map, per IP, okno 60s, limit 30 (get-caregivers) / 5 (register-sa). Zwraca HTTP 429. | [x] Kopiujemy dla `onboard-to-mamamia` z limitem 5/min (rejestracja = rzadka). |
| 8 | **CORS preflight snippet** | Allow-Origin single-domain whitelist + Allow-Headers `authorization, x-client-info, apikey, content-type` + OPTIONS 204. | [x] Kopiujemy; whitelist `localhost:5173` (dev) + `*.onrender.com` / `portal.primundus.de` (prod) |
| 9 | **`PatientInputType` shape** | SADASH docs `customer-job-creation-flow.md:105-120` + `sadash-app/docs/customer-job-creation-flow.md`: `gender`, `year_of_birth`, `care_level (1-5)`, `mobility_id (1-5 dict)`, `weight`, `night_operations "yes"/"no"`, `dementia "yes"/"no"` | [x] Mapper już w planie |
| 10 | **`StoreCustomer` + `StoreJobOffer` signatures** | SADASH `customer-job-creation-flow.md:75-186` — pełne mutacje + wymagane pola + pułapki (`mobility_id` crash, `title` required, `arrival_at` unique) | [x] Gotowe do użycia |
| 11 | **Caregiver → Nurse mapper** | Salead `caregiver-filtering-pipeline.md §5` — pełny dict 14 pól | [x] Kopiujemy 1:1 |
| 12 | **`CaregiversWithPagination` query jako fallback matchingu** | Salead `get-caregivers/index.ts` — gotowy string z filtrami `last_contact`, `has_retouched_avatar`, `min_hp_jobs` + pola | [x] Kopiujemy jako fallback |
| 13 | **SADASH docs z GraphQL schema** | `/Users/michalkepinski/Documents/Projects/Sadash/`: `GRAPHQL_API_DOCS_INDEX.md`, `GRAPHQL_QUICK_REFERENCE.md`, `GRAPHQL_SCHEMA_ANALYSIS.md`, `API_INTEGRATION_SUMMARY.md`, `MOCK_DATA_REPLACEMENT_GUIDE.md` | [ ] Przejrzyj szczegółowo — mogą zawierać odpowiedzi na §19-23 poniżej |

---

## 🟡 Decyzja po twojej stronie (bez pytania nikogo)

| # | Pytanie | Kontekst | Akcja |
|---|---|---|---|
| 14 | **Czy Primundus reuse'uje SADASH-grade token / user `info@mamamia.app`, czy własny `mm+primundus@…`?** | ✅ **Własny** — zarejestrowaliśmy dedykowany ServiceAgency "Primundus" na becie (id=18). Token zapisany w `~/.primundus-mamamia.env`. | [x] Done |
| 15 | **Czy używamy staging `beta` czy od razu `prod` endpoint?** | ✅ **Beta dla MVP**. SADASH token nie działa na prod (HTML 500), więc i tak nie da się przypadkiem. Dla prod trzeba będzie osobnego onboardingu (StoreServiceAgency tam). | [x] Done (beta confirmed) |
| 16 | **Migracja SQL dodająca `mamamia_*` kolumny do `leads`** | ✅ **ROZSTRZYGNIĘTE 2026-04-24**: projekt przeniesiony z Bolt do własnej org (`ecilmewezgzpwyzvvnck`), JWT secret zrotowany przy claim (stary service_role z env Marcina NIE działał — signature mismatch). Świeży service_role pobrany przez `supabase projects api-keys`. `supabase link --project-ref ycdwtrklpoqprabtwahi` + `supabase migration repair --status reverted` dla 30 historycznych Bolt migracji + `supabase db push` → migracja `20260423120000_add_mamamia_ids_to_leads.sql` zastosowana. Zweryfikowane via PostgREST — 4 kolumny widoczne (`mamamia_customer_id, mamamia_job_offer_id, mamamia_user_token, mamamia_onboarded_at`). Key zapisany w `~/.primundus-mamamia.env`. | [x] Done |
| 17 | **`zuschüsse` vs `zuschusse` w Supabase `leads.kalkulation`** | ✅ **ROZSTRZYGNIĘTE 2026-04-23**: 3/3 sprawdzonych leadów używają `zuschüsse` z umlautem. Kod CAapp jest poprawny; **PDF ma literówkę** (dokumentuje bez umlauta). Żaden fallback nie jest potrzebny. Bonus: w realnych kalkulacjach jest też pole `pflegegradUsed` nieobsługiwane w typie `LeadKalkulation` — TODO dodać. | [x] Done |
| 18 | **`undoApp` UX** — przycisk „Ablehnung rückgängig machen" | ✅ **ROZSTRZYGNIĘTE 2026-04-24** (live introspection): **mutacja do cofania nie istnieje** — grep dla `restore`/`unreject`/`undo`/`revert`/`cancel` w mutations zwrócił 0 hits. `UpdateApplication` args nie zawierają żadnego reject-related pola (tylko `id`, salary, arrival_at itp.). **Decyzja**: usunąć przycisk „rückgängig machen" z UI. Decline = finalna akcja (potwierdza modal confirmation). | [x] Resolve — remove button in K5 refactor |

---

## 🟣 Zapytaj inny projekt (zespół Salead/SADASH)

| # | Pytanie | Do kogo | Uzasadnienie |
|---|---|---|---|
| 19 | ~~Czy Salead/SADASH mogą stworzyć dedykowane konto agency dla Primundus w Mamamii?~~ | ✅ **Zbędne** — sami sobie zarejestrowaliśmy Primundus agency przez StoreServiceAgency mutation (SADASH token ma wystarczające permissions). Żaden zespół zewnętrzny nie był potrzebny. | [x] Done |
| 20 | **Czy Salead może udostępnić tabelę `edge_cache` (shared)?** | Zespół Salead | Alternatywa: własna w Supabase projekcie CAapp. Shared jest prostsze ale coupling. |
| 21 | **Czy ktoś ma pełne machine-readable GraphQL schema dump (`schema.graphql` / `introspection.json`)?** | Ktokolwiek z zespołu MM | Przyspiesza codegen; alternatywa: introspection live (wymaga URL + token). |
| 22 | **Mutacja zaproszenia opiekunki** | ⚠️ **BLOCKER ODKRYTY 2026-04-24 (live)**: `SendInvitationCaregiver` i `StoreRequest` wymagają **customer-scoped JWT**, nie agency token. Primundus agency dostaje `Unauthorized`. Potrzebny flow: `ImpersonateCustomer(customer_id)` (admin-only) LUB `RegisterCustomer(email, first_name, password)` + `CustomerVerifyEmail(token)` → customer JWT. Obecny portal **nie ma customer password flow** — klient otrzymuje link z Supabase token, nie loguje się w Mamamii. **Workaround K5**: invite jest optimistic-only (UI pokazuje "eingeladen" ale nie persistuje); full flow blokowany do K6 customer-auth. |
| 23 | **Accept application** | ✅ **ROZSTRZYGNIĘTE 2026-04-23** (discovery): akceptacja w portalu to **NIE `UpdateApplication`, tylko `StoreConfirmation(application_id, contract_patient: ContractPatientInputType, contract_contact: ContractContactInputType, patient_contracts, invoice_contract, contract_contacts, file_tokens, is_confirm_binding, update_customer, message)`** — tworzy Confirmation (trwały kontrakt). ContractPatientInputType i ContractContactInputType mają 1:1 pola z naszego step-2 `AngebotPruefenModal`: salutation, title, first_name, last_name, phone, email, street_number, zip_code, city, location_id/location_custom_text. Zero niezgodności. | [x] Done |

---

## 🔴 Do Martina (gdy pozostaną tylko te)

| # | Pytanie | Dlaczego nikt inny |
|---|---|---|
| 24 | **Alt login dla customera** (K6) | **OPEN**: potrzebna Supabase Edge Function `issue-new-link(email)` + mail provider (Resend / Supabase built-in SMTP). Flow: klient wpisuje email na expired-link screen → Edge Function weryfikuje lead → generuje nowy token + expiry → wysyła link. **Dodatkowo**: żeby invite/accept działały (§22), prawdopodobnie trzeba dodać `RegisterCustomer(email, first_name, password)` + `CustomerVerifyEmail` → customer JWT podczas onboardingu, przechowywane w session cookie (obok agency token). Wymagania decyzyjne: (a) provider mail (b) czy klient musi ustawić password (c) czy chcemy dual-session (agency + customer) w cookie. |
| 25 | **Matching trigger po StoreJobOffer** | ✅ **ROZSTRZYGNIĘTE 2026-04-23** (live test na becie, JobOffer id=16225 → destroy): matching dostępny **NATYCHMIAST** (total=4 w pierwszym pollu, ~2s od StoreJobOffer). Brak mutacji trigger; computowany synchronicznie. Portal może od razu po `StoreJobOffer` query'ować `JobOfferMatchingsWithPagination`. | [x] Done |
| 26 | **Matching dla nowych JobOffer production-ready?** | ✅ **DZIAŁA na becie** dla naszego test case (female, year_of_birth 1945, care_level 3, Berlin) → 4 matche z `percentage_match=100`, wszystkie `is_show=true`, `is_best_matching=true`. **Uwaga**: beta zwróciła testowe opiekunki (imiona "Edu Testuje", "Damencja", nierealne year_of_birth). Na prod trzeba będzie osobny test. Salead może używać `CaregiversWithPagination` dla własnych powodów (szerszy scope niż pojedynczy job) — dla nas `JobOfferMatchings` wystarczy. | [x] Done (beta) |
| 27 | **Patient fields — `heben`/`inkontinenz`** | ✅ **ROZSTRZYGNIĘTE 2026-04-23** (introspection PatientInputType): obydwa są w typie: `lift_id: Int` (heben), `incontinence: Boolean` + `incontinence_feces: Boolean` + `incontinence_urine: Boolean` (inkontinenz szczegółowo). Plus bonus: `smoking: Boolean`, `features_condition: String` i wielojęzyczne opisy `*_de/_en/_pl`. **Update 2026-04-24 (live K4)**: persistence wymaga `patient.id` threading w UpdateCustomer — bez id Mamamia silently drops fields. GET_CUSTOMER rozszerzony o `patients{id}`. | [x] Done |
| 30 | **Enum `night_operations`** | ✅ **ROZSTRZYGNIĘTE 2026-04-24** (live UpdateCustomer probing, Customer 7570): valid values = `"no"`, `"occasionally"`, `"more_than_2"`. Wszystkie inne (yes/regularly/never/always/often/ja/nein/1x/2x/heavy/intense/multiple/etc.) odrzucone przez validator. Mapowanie: Nein→no, Gelegentlich→occasionally, Regelmäßig→more_than_2. | [x] Done |
| 31 | **Enum `other_people_in_house` / `accommodation` / `smoking_household`** | ⚠️ **UNKNOWN**: SADASH wysyła literalne niemieckie stringi (np. `Ehepartner/in`, `Einfamilienhaus`) i `smoking_household: "yes"/"no"`. Live test na beta: `smoking_household: "no"` **działa** przy `UpdateCustomer` gdy w tym samym call jest `patients[]`. `accommodation: "Einfamilienhaus"` i `other_people_in_house: "Ehepartner/in"` → validation fail (invalid enum value). StoreCustomer też odrzuca. **Mapper świadomie pomija** te 2 pola (accommodation, other_people_in_house); zapisuje tylko smoking_household. Zostają w localStorage draft. Enum values muszą być dostarczone z backend PHP config. |
| 32 | **Customer-auth flow (K5 invite + K6 alt-login)** | ⚠️ **UNKNOWN**: live test 2026-04-24 potwierdził że `CustomerVerifyEmail(token=<supabase_token>)` → `Unauthorized`, `CustomerLandingpage(uuid=<lead.id>)` → `Internal server error`. Mamamia customer auth ma własny JWT system, nie akceptuje naszych tokenów. Wymagane alternatywy: (a) `RegisterCustomer(email, first_name, password)` + `CustomerVerifyEmail(token_from_mail)` → dual-session w cookie, ale wymaga password flow; (b) custom endpoint po stronie Mamamii; (c) admin token + `ImpersonateCustomer` (łamie separację). |
| 28 | **Location lookup** | ✅ **ROZSTRZYGNIĘTE 2026-04-23** (discovery): Mamamia GraphQL ma natywne queries: `Locations(search: String)`, `LocationsWithPagination(limit, page, search)`, `Location(id: Int!)`. Używamy bezpośrednio z portalu (autocomplete PLZ) — bez Laravel REST proxy. | [x] Done |
| 29 | **CORS whitelist produkcyjny dla portalu Primundus** | ✅ Domena: **`portal.primundus.de`**. Do dodania po stronie Mamamii przed deploymentem prod. **Uwaga**: W pełnym BFF (R1 resolved) portal browser NIE rozmawia z Mamamia bezpośrednio — rozmawia z Edge Function w Supabase. Więc CORS po stronie Mamamii nie jest strict blocker (tylko Edge Function → Mamamia — server-to-server, no CORS). CORS jest potrzebny tylko dla Edge Function → browser: whitelist `portal.primundus.de` + `localhost:5173`. |

---

## 📦 Szkic maila do Martina (nie wysyłać teraz)

> Cześć Martin,
>
> Implementujemy nowy portal klienta Primundus (integracja z Mamamia GraphQL). Na bazie istniejących projektów (Salead, SADASH) wyjaśniłem większość rzeczy sam, ale mam **6 pytań do Ciebie**:
>
> 1. **Alt login customera** — klient dostaje link `?token=...` ważny 14 dni. Po wygaśnięciu potrzebujemy flow „email + kod jednorazowy". Czy istnieje mutacja / preferowany endpoint? `AuthUserViaMagicLinkTokenQuery` czy coś dedykowanego?
> 2. **Matching po `StoreJobOffer`** — automatyczny po queue/cron czy trzeba jawnie wywołać `TriggerMatching`? Jak długo wyniki są gotowe?
> 3. **`JobOfferMatchingsWithPagination` dla nowych JobOffer** — czy jest production-ready, czy mamy iść od razu na pattern Salead (CaregiversWithPagination + filtry)?
> 4. **Patient fields** — `heben` (lifting) i `inkontinenz` (incontinence) nie są w `PatientInputType`. Gdzie zapisywać? `UpdateCustomer.job_description` jako JSON?
> 5. **Location lookup** — SADASH używa REST `/api/locations?search=`. Czy GraphQL ma odpowiednik (`Locations(search)`)?
> 6. **CORS whitelist** — proszę dodać produkcyjne domeny portalu Primundus (potwierdzę gdy ustalimy nazwę — prawdopodobnie `portal.primundus.de`).
>
> Plan wdrożenia jest w 6 krokach TDD, zaczynam od K1 (scaffold+onboarding).
>
> Dzięki!

---

## 🚨 Zidentyfikowane ryzyka (nowe, z discovery 2026-04-23)

| # | Ryzyko | Skala | Rozwiązanie |
|---|---|---|---|
| R1 | **Agency token w browserze umożliwia cross-tenant data leak**. Agency token autoryzuje WSZYSTKO co widzi Primundus agency — wszystkich klientów Primundus. | Wysokie | ✅ **ROZSTRZYGNIĘTE 2026-04-23: wybieramy pełny BFF od razu** (nie MVP-with-risk). Agency token **nigdy** nie trafia do browsera. Browser rozmawia wyłącznie z Edge Function, która: (1) weryfikuje session cookie HttpOnly (podpisany Supabase secret, zawiera `{customer_id, job_offer_id, lead_token_hash}`), (2) validuje ownership (np. `JobOffer(id)` tylko dla `id == session.job_offer_id`), (3) executuje query na Mamamia z agency token server-side, (4) zwraca data. Wymaga +N Edge Functions (poniżej lista). |
| R2 | **Customer nie ma własnej tożsamości w Mamamii**. Portal używa shared agency token; identyfikacja klienta przez Supabase `?token=...`. Jeśli Supabase token expired (>14d) — klient musi dostać nowy link (ponowna generacja z Edge Function). Mamamia magic link NIE jest potrzebny. | Niskie (znane) | Zaimplementować Edge Function `issue-new-link(email)` która weryfikuje że email jest znany w Supabase leads + wysyła nowy link. Poza zakresem MVP, ale do zaplanowania w K6. |

## Next actions po rozstrzygnięciach

Gdy §14-18 + §19-23 będą znane → unblock K1 (scaffold Edge Function `onboard-to-mamamia` + migracja `leads`).
Gdy §24-29 będą znane → unblock K5 (invite) + K6 (alt login).
K2-K4 (read-only JobOffer/Applications/Matchings + write-back patient form) można zacząć już teraz równolegle.
