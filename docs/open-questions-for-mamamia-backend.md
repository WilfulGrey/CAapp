# Pytania do backend Mamamia — do skierowania do osoby znającej schema/PHP config

Context: integrujemy nowy portal klienta Primundus (CAapp) z Mamamia GraphQL beta (ServiceAgency id=18 Primundus). 5 z 6 kroków planu zrealizowane — te pozostałe 4 pytania wymagają informacji z core schema/config których introspection nie ujawnia. Jeśli Martin nie zna, prosimy o przekazanie **osobie która zna Mamamia backend PHP config / Laravel validator rules** (najprawdopodobniej dev core team).

---

## Q1. Enum values dla Customer fields (silent validator)

Laravel validator odrzuca `validation` error bez podania dozwolonych wartości dla trzech pól. Introspection nie pokazuje `ENUM` typu — są to ukryte `in:...` rules.

**Pola + warianty które przetestowaliśmy live (wszystkie rejected):**

| Field | Tested values (wszystkie odrzucone) |
|---|---|
| `accommodation` | `Einfamilienhaus`, `Wohnung in Mehrfamilienhaus`, `Andere`, `single_room`, `apartment`, `house` |
| `other_people_in_house` | `Nein, allein`, `Ehepartner/in`, `Kinder`, `Weitere Personen`, `alone`, `spouse`, `family`, `children`, `ja`, `nein` |

**Co działa (potwierdzone):**
- `smoking_household`: `"yes"` / `"no"` ✅
- `has_family_near_by`: `"yes"` / `"no"` ✅
- `internet`: `"yes"` / `"no"` ✅

**Pytanie:** Jakie są dozwolone values dla `accommodation` i `other_people_in_house` w walidatorze Customer? (Szukamy pełnej listy — prawdopodobnie w `app/Http/Requests/...` albo Customer model rules.)

**Kontekst:** SADASH app frontend wysyła niemieckie stringi z `<select>` (patrz `sadash-app/resources/js/Components/Modal/EditCustomerModal.vue:358-397`), ale te też wydają się nie działać na UpdateCustomer beta — lub po prostu failują silent w ich UI bez widocznego feedbacku.

---

## Q2. Customer-scope authentication dla invite flow

**Zgodnie z `primundus_developer_doku.pdf` §6**, nowy portal klienta ma po prostu „wyświetlać dopasowane oferty opiekunek" i pozwalać klientowi na invite (= customer inicjuje kontakt z opiekunką). PDF nie specyfikuje technicznie jak to się ma odbyć — po prostu zakłada że działa.

**Problem techniczny**: portal używa Primundus agency token (LoginAgency). Działa dla:
- Read: JobOffer, Customer, Applications, Matchings ✅
- Write: UpdateCustomer, StoreConfirmation, RejectApplication ✅

**Ale NIE działa dla invite**:
- `SendInvitationCaregiver(caregiver_id)` z agency bearer → **Unauthorized**
- `StoreRequest(caregiver_id, job_offer_id, message)` z agency bearer → **Unauthorized**
- `ImpersonateCustomer(customer_id)` z agency bearer → **Unauthorized** (wymaga admin scope)
- `CustomerVerifyEmail(token=<supabase_lead_token>)` → **Unauthorized** (Mamamia ma własny token system)
- `CustomerLandingpage(uuid=<supabase_lead_id>)` → **Internal server error**

**Request do Mamamia backend team**: zgodnie z zamysłem PDF portal klienta powinien po prostu móc invite'ować opiekunki. Proszę rozwiązać po stronie Mamamii — np.:

- **(a)** Automatyczne stworzenie customer-session podczas pierwszego onboardingu przez agency (żeby portal miał customer JWT bez password flow). Wtedy subsekwentne `SendInvitationCaregiver` działają.
- **(b)** Nowy dedykowany endpoint typu `InviteCaregiverAsAgencyForCustomer(customer_id, caregiver_id)` który bierze agency bearer + explicit customer_id, autoryzuje że agency jest właścicielem tego customera.
- **(c)** Inna architektura którą macie na uwadze — chętnie dostosujemy portal.

Workaround czasowy w portalu: invite działa tylko optimistic UI (klient widzi „eingeladen" lokalnie, ale caregiver notification nie idzie). Do czasu rozwiązania po stronie Mamamii.

---

## Q3. `lift_id` enum (heben)

`PatientInputType.lift_id: Int` — nasza introspection pokazała typ ale **żadnej ujawnionej listy**. Nigdzie w SADASH ani Salead nie ma hardcoded values.

**Pytanie:** Jakie są dozwolone wartości `lift_id`? (Prawdopodobnie 1-5 jak mobility_id, ale chcemy potwierdzenia + mapping na nasze UI labels: Ja/Nein + stopniowanie.)

Nasze UI patient form ma tylko boolean: `heben: "Ja"/"Nein"`. Jeśli Mamamia lift_id jest 1-5 enum, potrzebujemy też stopniowania (lekkie / średnie / ciężkie podnoszenie).

---

## Q4. ImpersonateCustomer zwraca `Unauthorized` mimo że spełniamy warunki, które podaliście

**Wasza informacja (2026-04-27):** *„rola musi być SA + CA musi należeć do tego SA, więcej warunków nie ma, poza tym że CA musi istnieć i musi mieć powiązanego usera, na którego można się zalogować"*.

**Po naszej stronie wszystko jest spełnione**, ale `ImpersonateCustomer` dalej rzuca `Unauthorized`. Konkretne dane:

**(1) User wykonujący — `primundus+portal@mamamia.app` (id=8190).** `LoginAgency` na `https://backend.beta.mamamia.app/graphql/auth` zwraca:
```json
{
  "id": 8190,
  "current_roleable_id": 8134,
  "roleables": [{
    "id": 8134,
    "role_id": 6,
    "roleable_type": "serviceAgency",
    "roleable_id": 18,
    "role": { "id": 6, "name": "admin", "slug": "admin", "morph_name": "caregiverAgency" },
    "roleable": { "__typename": "ServiceAgency" }
  }]
}
```
- `roleable_type=serviceAgency` ✓
- `roleable.__typename = ServiceAgency` ✓
- `role.slug = admin` ✓

**(2) Customer 7576** (`Customer(id: 7576)`):
```json
{
  "id": 7576,
  "service_agency_id": 18,
  "is_user": true,
  "email": "m.kepinski@mamamia.app",
  "first_name": "Michał"
}
```
- `service_agency_id == user.current_roleable.id` (18 == 18) ✓
- `is_user: true` ✓ (User account istnieje)

**(3) Wywołanie:**
```bash
POST https://backend.beta.mamamia.app/graphql/auth
Authorization: Bearer <agency JWT z LoginAgency, len=54>
Content-Type: application/json

{"query":"mutation Imp($cid: Int) { ImpersonateCustomer(customer_id: $cid) { id email token } }",
 "variables":{"cid":7576}}
```

**Odpowiedź:**
```json
{
  "errors": [{
    "message": "Unauthorized",
    "locations": [{"line": 1, "column": 27}],
    "path": ["ImpersonateCustomer"],
    "extensions": {
      "file": "/var/www/laravel/vendor/rebing/graphql-laravel/src/Support/Field.php",
      "line": 227
    }
  }]
}
```

**Pytanie:** czy możecie sprawdzić co dokładnie sprawdza middleware/policy na `ImpersonateCustomer` resolver? Hipotezy które przychodzą do głowy:

- **a)** Może liczy się `role.morph_name` zamiast `roleable_type`. Nasz role 6 ma `morph_name = "caregiverAgency"` — może gating chce `morph_name = "serviceAgency"` (czyli rolę z `roles` table id=8 `admin-sa-test` zamiast 6)? Read-only sweep prod DB pokazuje że role_id=8 ma 0 użytkowników, więc nikt jej nie używa — ale może to ona jest właściwa?
- **b)** Może wymaga personal_access_token z `name='impersonate'` (tak jak ma Admin MM, user 1, mm@vitanas.pl), a nie standardowego JWT z `name='API Token'` z `LoginAgency`?
- **c)** Może w `Customer.user_id` jest dodatkowa walidacja (np. user nie może być deleted, email_verified_at musi być nie-null)?
- **d)** Może wszystkim agency-admin-om mimo wszystko jest to wyłączone i jest hard-coded ABAC tylko dla user.id == 1?

**Co próbujemy osiągnąć:** zero-touch customer-scope JWT podczas onboardingu Primundus, żeby `SendInvitationCaregiver` działał bez czekania aż klient kliknie verify-mail. ImpersonateCustomer to idealny tool do tego (agency to my, ownership na Customer.service_agency_id). Magic-link flow też mamy zaimplementowany jako fallback (Edge Function `customer-verify` exchanguje token na User.token), ale `SendInvitationCustomer` nie ma `redirect` parametru więc magic-link kieruje na mamamia.app, nie na nasz portal — to drugi blocker.

**Stan po naszej stronie:** całe BFF + frontend gotowe, akceptują customer-token z dowolnego źródła (Impersonate albo magic-link). Czeka na wyjaśnienie middleware'u Impersonate.

---

## Q5. SendInvitationCaregiver — RESOLVED 2026-04-28

**TL;DR:** Polowaliśmy na złe drzewo. `SendInvitationCaregiver` to mutacja **customer-side**
(auth.user musi być customerem) — nieużywana w naszym agency-side flow. Mutacja, którą
panel UI Mamamii faktycznie wywołuje przy kliknięciu „wyślij zaproszenie" to
**`StoreRequest(caregiver_id, job_offer_id, message)`** na `/backend/graphql` pod
**agency-only session** (LoginAgency, BEZ ImpersonateCustomer).

Kluczem nie jest impersonate ani `is_user=true`. Wystarczy `customer.status='active'`,
co osiągamy ustawiając `Customer.arrival_at` w StoreCustomer (Mamamia auto-flippuje status
gdy spełniony cały if-block w controllerze). Verified live na becie 2026-04-28: customer 7585
status=active po samym StoreCustomer, StoreRequest pod agency-only panel zwraca Request.id=893.

Co zmieniliśmy w naszym kodzie:
- `inviteCaregiver` (mamamia-proxy/actions.ts) używa StoreRequest pod `loginAsAgency`,
  bez ImpersonateCustomer.
- `loginAndImpersonate` + `IMPERSONATE_CUSTOMER` + `SEND_INVITATION_CAREGIVER` usunięte
  jako dead code.
- Customer.arrival_at dodany do StoreCustomer payload (`onboard-to-mamamia/mappers.ts`)
  tak żeby customer od razu lądował z status=active.

Pozostałe pytania (per Q5 archeology) — nadal otwarte ale o niższym priorytecie:
- `customer.is_user=true` — co dokładnie flippuje (poza CustomerSetPassword)? nie jest gating
  dla StoreRequest, więc czysto info.
- ~~JobOffer.visibility — wysyłamy "public", DB pokazuje "hide".~~ **RESOLVED 2026-04-28:**
  Mamamia coerce'uje JobOffer.visibility na 'hide' gdy customer.status='draft' niezależnie
  od tego co StoreJobOffer dostaje w argumentach. Verified beta: 4 customers, jedyny 'hide'
  to ten utworzony przed naszym Customer.arrival_at fix (175468f) — cała reszta z
  status='active' ma visibility='public' zgodnie z payloadem. Side-effect customer.status,
  nic do naprawiania po naszej stronie.

---

## Q5. (HISTORICAL — kept for context only)

SendInvitationCaregiver — konkretna policy (UPDATE — wszystkie warunki spełnione, dalej Unauthorized)

`canImpersonateCustomer` zaimplementowaliście, panel-style flow przeszedł u nas live (csrf-cookie → LoginAgency → ImpersonateCustomer → User.id zwrócony, sesja w customer-mode). Wpięte w nasz Edge Function `mamamia-proxy` przez nowy `mamamiaPanelClient` helper.

**Następny gate to `SendInvitationCaregiver` jako impersonowany customer — który dalej rzuca `Unauthorized` mimo że customer wygląda na complete.**

Konkretny test (beta, `primundus+portal@mamamia.app` SA admin):

Customer 7577 — utworzony świeżo + uzupełniony przez nas:
```json
{
  "id": 7577,
  "service_agency_id": 18,
  "is_user": true,                  // SendInvitationCustomer side-effect
  "can_request_caregiver": true,    // UpdateCustomer + flag
  "customer_contract": { "id": 5717 },  // StoreCustomerContract done
  "first_patient_contract": { "id": 5717, "city": "München" },
  "current_job_offer": {
    "id": 16233,
    "status": "search",
    "visibility": "hide"
  },
  "patients": [{ "id": 12828, "care_level": 3, "mobility_id": 1 }]
}
```

Caregiver 10061 jest w `JobOfferMatchingsWithPagination(job_offer_id: 16233)` z `is_show=true` (pole #3 z 130 matchingów).

Pełen panel-flow:
```
1. GET  /backend/sanctum/csrf-cookie                   204 OK
2. POST /backend/graphql/auth   LoginAgency           200 OK (id=8190)
3. POST /backend/graphql/auth   ImpersonateCustomer    200 OK (User.id=8205)
4. POST /backend/graphql        SendInvitationCaregiver  errors[Unauthorized]
                                                       category: authorization
                                                       file: …/Field.php:227
```

Identycznie jak ImpersonateCustomer wcześniej — `Unauthorized` na `Field.php:227` (resolver-level), trace nie odsłania konkretnego warunku.

**Pytanie:** czy moglibyście pokazać `canSendInvitationCaregiver` policy / gate (analogicznie do `canImpersonateCustomer` którą pokazaliście)?

Coś jeszcze jest sprawdzane czego nie odgadujemy — porównanie z customer 7576 (gdzie wasz panel UI "Logowanie" działa dla Primundus admin) pokazuje że TEN customer ma **mniej** uzupełnione pola (nie ma żadnego customer_contract, can_request_caregiver=null) ale **panel pozwala go impersonować i wejść w jego widok**. Widać że gate `SendInvitationCaregiver` jest oddzielną regułą od panel-impersonate.

Hipotezy — który warunek nas blokuje:
- a) `customer.location_id` musi być not null (mamy null — żaden location_id z PLZ lookup; może wymaga osobnej mutacji `Locations(search)` + UpdateCustomer)?
- b) `current_job_offer.visibility != 'hide'`? UpdateJobOffer crashuje na `JobOfferArrivalAtExistsRule::__construct(): null given` — chyba bug niezwiązany, ale flip visibility nam nie wyszedł.
- c) `customer.status != 'draft'` — ale schemat nie eksponuje argumentu `status` na UpdateCustomer; jak go flippnąć?
- d) `customer.invoice_contract` musi istnieć (StoreCustomerContract daje tylko `patient_contact` typ; jak utworzyć `invoice_contract` typ?)
- e) `customer_contacts` musi mieć ≥1 wpis (brak osobnej mutacji `StoreCustomerContact` w schemacie)?

Konkretnie najbardziej zaintrygowała mnie (d): `StoreCustomerContract` zwraca zawsze `contact_type=patient_contact`, a w schemacie jest też `invoice_contract` (`Customer.invoice_contract: CustomerContract`) i `customer_contacts: [CustomerContact]`. Jak agency-side stworzyć te dwa pozostałe?

---

### UPDATE 2026-04-28 — uzupełniliśmy customer 7577 do stanu `status="active"`. Dalej `Unauthorized`.

Po analizie 200 losowych aktywnych customerów w prod (`SELECT … WHERE status='active' ORDER BY RAND()`) wybraliśmy fill-rate 100% pola jako wymagane i wypełniliśmy je dla 7577:

```sql
-- 100% fill-rate w prod (must-have):
service_agency_id, location_id, urbanization_id, arrival_at, care_budget,
other_people_in_house, has_family_near_by, accommodation, caregiver_accommodated,
visibility, pets

-- 99% (job_description), 90+% (internet, day_care_facility, caregiver_time_off, last_name)
```

Dodatkowe `UpdateCustomerOnboarding(step_finished: 3)` **(jako impersonowany customer)** flippuje `customer.status` z `draft` na **`active`**. Confirmed live. Pełny stan customer 7577 teraz:

```json
{
  "id": 7577, "status": "active", "is_user": true,
  "can_request_caregiver": true,
  "service_agency_id": 18, "location_id": 14380, "urbanization_id": 1,
  "accommodation": "single_family_house", "caregiver_accommodated": "room_premises",
  "internet": "yes", "smoking_household": "no", "has_family_near_by": "yes",
  "other_people_in_house": "no", "pets": "no_information",
  "job_description": "…",
  "customer_contract": { "id": 5717, "contact_type": "patient_contact" },
  "customer_caregiver_wish": {
    "gender": "female", "germany_skill": "level_3",
    "smoking": "no", "driving_license": "not_important"
  },
  "customer_contacts": [{ "id": 1216 }],
  "current_job_offer": {
    "id": 16233, "status": "search",
    "visibility": "public_limited",   // flipped via UpdateJobOffer
    "arrival_at": "2026-06-15"
  },
  "patients": [{
    "id": 12828, "gender": "male", "year_of_birth": 1945,
    "care_level": 3, "mobility_id": 3, "weight": "70-90 kg",
    "night_operations": "1_2_times", "night_operations_description": "…",
    "dementia": "yes", "dementia_description": "…",
    "incontinence": true, "incontinence_urine": true
  }]
}
```

Caregiver 10061 jest w `JobOfferMatchingsWithPagination(16233)` z `is_show=true` (3-cie miejsce z 130 matchings).

**Mimo wszystkiego — `SendInvitationCaregiver(caregiver_id: 10061)` jako impersonowany customer dalej rzuca `Unauthorized` na `Field.php:227`.**

Jedyna hipoteza która pozostaje:

**(f) — gating odróżnia "real customer login" od "agency-impersonate session".** Mamamia wykrywa że auth.user.impersonate_user_id != null (impersonowani przez agency) i blokuje sensitive actions takie jak SendInvitationCaregiver, akceptuje tylko gdy customer zalogował się sam (przez `Login(email,password)` lub `CustomerVerifyEmail` magic-link).

Jeśli to (f), to `canImpersonateCustomer` którą pokazałeś jest dla "agent może zalogować się jako klient żeby zobaczyć co widzi", ale write-actions od strony klienta nie przechodzą. To byłby projektowany feature.

Czy możecie wprost potwierdzić: **czy SA-admin po `ImpersonateCustomer` ma uprawnienia do `SendInvitationCaregiver` w imieniu klienta, czy tylko do read-only debug-mode?**

Jeśli tylko read-only — flow Primundus musi przejść przez `CustomerVerifyEmail` magic-link (klient sam loguje się przez mail), a wtedy wracamy do Q4 wariant A — potrzebujemy `redirect: String` parametru na `SendInvitationCustomer` żeby magic-link prowadził do `portal.primundus.de`, nie `mamamia.app`.

---

## Q6. Customer / JobOffer deploy na prod — czy agency Primundus będzie replikowana?

Obecnie zarejestrowaliśmy ServiceAgency „Primundus" (id=18, code=ts-18) na **beta** przez SADASH-grade admin token. Nasz Edge Function Supabase loguje się jako `primundus+portal@mamamia.app` → agency JWT.

**Pytanie:** Na prod (`backend.prod.mamamia.app`) musimy przejść ten sam flow (StoreServiceAgency + StoreServiceAgencyEmployee + LoginAgency)? Czy macie proces by propagować ServiceAgency beta→prod, czy musimy utworzyć osobną na prod? Plus:

- Czy trzeba request CORS whitelist dla `portal.primundus.de` (prod) i `localhost:5173` (dev)?
- Jakie jest rate limiting per-agency po stronie Mamamii (żeby wiedzieć czy nasz Edge Function in-memory 60/min jest zgodny)?

---

## Resolved (dla kontekstu — zrobiliśmy samodzielnie)

Wszystko inne — architektura, discovery typów, większość enumów, testowanie end-to-end — rozwiązaliśmy live probing / introspection. Stan szczegółowy w `docs/integration-blockers.md` (29/31 pozycji oznaczone `[x] Done`).

**Kluczowe znaleziska:**
- `night_operations` enum: `"no"` / `"occasionally"` / `"more_than_2"` (live verified)
- `dementia`: `"yes"` / `"no"`
- `mobility_id`: 1=Mobile, 3=Walker, 4=Wheelchair, 5=Bedridden
- UpdateCustomer wymaga `patients: []` w każdym call (Undefined array key crash inaczej)
- Customer fields: brak `salutation`/`phone`/`gender`/`year_of_birth` (te są na Patient)
- AnonymousApplication type dla customer queries (bez agency fields)
- Matching filtery: tylko boolean (is_show, is_match, is_rejected), no gender
- RestoreApplication mutation **nie istnieje** — decline jest finalny

---

**Kontakt:** michal.t.kepinski@gmail.com · [GitHub PR](https://github.com/marcinwysocki007/CAapp/pull/1)
