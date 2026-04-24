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

## Q4. Customer / JobOffer deploy na prod — czy agency Primundus będzie replikowana?

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
