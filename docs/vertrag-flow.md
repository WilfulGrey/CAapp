# Vertrag (umowa klienta) — przechowywanie + server-side sync do Mamamii

Source of truth dla flow akceptacji/podpisu po refactorze 2026-07-22
(PR `feat/acceptance-server-sync`). Jeśli kod się rozjedzie — aktualizuj ten plik.

## Sekwencja (obowiązująca, decyzja Michała 2026-07-22)

Po podpisie klienta w portalu przeglądarka robi **JEDEN** POST
(`/api/lead-event`, event `application_accepted_internal`). Resztę robi serwer:

```
Bridge (project 3/app/api/lead-event/route.ts):
  0. ATOMOWY upsert lead_application_acceptances (rdzeń + signatur + signed_at
     ISO + signed_ip + contract_snapshot + contract_version) — błąd ⇒ 500,
     portal pokazuje toast + retry. KONIEC „best-effort" splitu.
  → trigger Edge Fn sync-acceptance (Bearer = SERVICE_ROLE_KEY, timeout 25 s)
  → maile jak dotychczas (NIEZMIENIONE — render z metadata, Mail C + team)

Edge sync-acceptance → _shared/acceptanceSync.ts (współdzielony z cronem):
  1. UpdateCustomer  — TRZY osoby z formularza konfirmacji w NATYWNE sloty
                       klienta MM (fix 2026-07-21, Bug #19 / Customer 8394):
                       • LE → patient_contracts[{contact_type:"patient_contact"}]
                         (location_id rozwiązywane z PLZ LE przez katalog
                         Locations — ta sama metoda co główna lokalizacja
                         klienta [Bug #13d]; fallback: carry z istniejącego
                         contractu — MM REPLACES listę przy zapisie)
                       • AG → invoice_contract{contact_type:"contract_contact"}
                         (panel: „Person für den Vertrag/Rechnung"; agGleich ⇒
                         dyskretne pola LE, AG odrębny ⇒ split composed ag.name
                         na ostatniej spacji, bez salutation; location_id z PLZ
                         AG — Stadt-dropdown AG to JEGO miasto, nie adres opieki.
                         Uwaga: Location select-uje pole `location`, NIE `name`)
                       • KP → customer_contacts[] (panel: „Kontaktperson")
                       Flagi is_same_as_first_patient/is_same_as_contact ZAWSZE
                       jawnie (default MM = true ⇒ lustruje dane pacjenta w
                       wiersz i panel pokazuje „gleiche wie Patient"); wyjątek
                       agGleich ⇒ is_same_as_first_patient:true na invoice.
                       NIGDY singular customer_contract (pierwszy wiersz plurala
                       = patient_contact ⇒ AG lądowałby w slocie pacjenta).
                       + preserve equipments + non-empty patients-stuby
  2. StoreConfirmation — akcept aplikacji (contract_patient/contract_contact,
                       mapowanie niemieckie→Mamamia SERVER-SIDE: SALUTATION
                       enum Mr./Mrs. [Fall Diesmann], split einsatzort)
                       → stempel mamamia_confirmed_at + mamamia_confirmation_id.
                       Błąd NIE jest rzucany — klasyfikacja + structured
                       result.confirm_error (patrz „Polityka alarmowa" niżej):
                       transient ⇒ 3 próby wewnątrz calla (backoff 2s+4s),
                       permanent (GraphQL-level, np. wycofana Bewerbung) ⇒
                       bez retry, bridge alarmuje NATYCHMIAST.
  3. KANON umowy     — JEDEN render przy akcepcie (bridge, PRZED triggerem
                       syncu): bajty → Storage `contracts/<lead>/<app>.pdf`,
                       sha256 → pdf_sha256. Zeitstempel dokumentu =
                       signed_at wiersza w Europe/Berlin (formatSignedAtBerlin
                       — NIGDY getHours()/czas renderu/etykieta przeglądarki;
                       stąd były „dwie umowy z dwiema godzinami").
                       Mail C + mail teamowy + portal (/api/contract-pdf,
                       bucket-first) + upload do MM = TEN SAM PLIK.
  4. Upload do MM    — BRAMKA: dopiero gdy Mamamia PRZETWORZYŁA confirmation
                       (final_confirmation widoczne na jobie klienta);
                       bajty = KANON ze Storage (integralność: sha musi
                       zgadzać się z pdf_sha256, inaczej defer); fallback
                       dla alt-wierszy: render via /api/contract-pdf;
                       magic-bytes %PDF- (HTML-fallback NIGDY jako .pdf);
                       StoreFile → UpdateConfirmation(file_tokens)
                       → Confirmation.signed_contract (S3 Mamamii)
                       → stempel mamamia_pdf_uploaded_at

RETRY-CHAIN w tle edge fn (Michał 2026-07-21: „zwykły retry po 15-30
i 60 sekundach", „cron to słaby pomysł"):
  Erstversuch niekompletny (i błąd nie-permanent) ⇒ sync-acceptance
  odpowiada bridge'owi NATYCHMIAST i przez EdgeRuntime.waitUntil odpala
  łańcuch +15s → +30s → +60s (RETRY_DELAYS_MS). Każda stufa czyta wiersz
  ŚWIEŻO (stemple równoległego przebiegu kończą chain) i wykonuje pełną
  sekwencję. Typowy efekt: confirm + PDF w MM ≤ ~2 min po podpisie.
  Po wyczerpaniu: brak confirm ⇒ NATYCHMIAST alarm (POST acceptance_sync_alarm
  do bridge'a, source 'sync-retry'); tylko PDF wisi ⇒ bez alarmu (cron).

Cron detect-caregiver-events (co 15 min) — WYŁĄCZNIE BACKSTOP
(śmierć procesu edge, dłuższa awaria MM — normalnie nic nie robi):
  retry-scan: signatur NOT NULL AND (confirmed IS NULL OR pdf IS NULL)
  AND accepted_at > now()-30d → ten sam moduł. Alarm: patrz niżej.
```

## Polityka alarmowa (Michał 2026-07-21: „retry przez 5 minut i potem od razu alarm")

Zasada: **klient nigdy nie może wierzyć, że zlecenie jest obstawione, gdy w Mamamii
nie ma wiążącej confirmation** (np. agencja wycofała Bewerbung między wyświetleniem
a podpisem). Kanał alarmu = **mail do teamu** (`info@primundus.de` + extra BCC jak
mail bukingowy), wysyłany przez bridge (event `acceptance_sync_alarm`, team-mail-only:
nie ma go w GET_PUBLIC_EVENT_TYPES, zero maili do klienta; każdy alarm zostawia
audit-row w `lead_events`).

| Sytuacja | Kiedy alarm | Kto wysyła |
|---|---|---|
| StoreConfirmation odrzucone **permanentnie** (GraphQL-level error — deterministyczna odmowa, klasyfikacja po `graphqlErrors` na errorze, bez zgadywania treści komunikatu) | **NATYCHMIAST (T+0)** | bridge, zaraz po odpowiedzi synchronicznego sync-acceptance (`result.confirm_error.permanent=true`); stempel `mamamia_sync_alerted_at` po udanym mailu |
| StoreConfirmation pada **transient** (network/HTTP/5xx) | 3 próby w callu (2s+4s backoff) + **retry-chain +15/+30/+60 s** — po wyczerpaniu łańcucha wciąż brak confirm ⇒ **alarm ≈ T+2 min** | retry-chain (edge, w tle) → POST `acceptance_sync_alarm` (source `sync-retry`) do bridge'a → mail; stempel TYLKO gdy mail przeszedł |
| j.w., ale proces edge zginął zanim chain skończył | próg **5 min** od akceptu (niezależny bezpiecznik) | cron → ten sam POST (source `cron`); błąd maila ⇒ 502 ⇒ re-alarm za 15 min |
| Confirm OK, **tylko PDF-upload** niedomknięty | po **24h** (archiwum, zero ryzyka klienta — bramka final_confirmation potrzebuje z natury drugiego przebiegu; chain zwykle domyka go w ≤2 min) | cron, ten sam kanał |
| Wiersz naprawiony w tym samym przebiegu crona / stufie chaina | **bez alarmu** (alarm ocenia stan PO retry, nie sprzed) | — |

Stałe: `RETRY_DELAYS_MS = [15s, 30s, 60s]` (`sync-acceptance/index.ts`);
`ACCEPTANCE_CONFIRM_ALERT_AFTER_MS = 5 min`, `ACCEPTANCE_PDF_ALERT_AFTER_MS = 24h`
(`detect-caregiver-events/index.ts`); retry wewnętrzny `CONFIRM_TRANSIENT_RETRIES = 2`
(`_shared/acceptanceSync.ts`). Stempel `mamamia_sync_alerted_at` = jednorazowość alarmu.

## Guardy idempotencji (nigdy podwójny akcept)

- **Adopcja:** przed StoreConfirmation moduł czyta `Customer.job_offers[].final_confirmation`
  — jeśli istnieje confirmation dla **tej opiekunki** (caregiver-match: stare bundle,
  SA-Portal, wcześniejszy retry po zgubionej odpowiedzi) → przejmuje jej id, NIE strzela.
- **skip_confirm:** stare zakeszowane bundle wciąż wołają storeConfirmation same i wysyłają
  `metadata.mamamia_accepted=true` → bridge przekazuje `skip_confirm` → moduł nie dubluje
  (czeka aż final_confirmation będzie widoczne — wtedy adopcja).
- **Stemple** (`mamamia_confirmed_at`, `mamamia_pdf_uploaded_at`) — retry pomija zrobione fazy.
- **Nachträglich** (`submitContractOnly`, akcept był w SA-Portalu): ta sama ścieżka —
  adopcja znajduje istniejącą confirmation → tylko UpdateCustomer + upload PDF.

## Gdzie żyje umowa (formy przechowywania)

| Miejsce | Forma | Trwałe? |
|---|---|---|
| **Supabase Storage `contracts/<lead_id>/<application_id>.pdf`** | **KANONICZNY plik PDF** — render 1× przy akcepcie; bucket prywatny (service-role only) | ✅ jedyne źródło bajtów |
| `lead_application_acceptances.contract_snapshot` | JSONB (VertragsDaten — dane dokumentu) | ✅ kanoniczny rekord danych |
| `.contract_patient` / `.contract_contact` | JSONB (surowy formularz, niemieckie klucze) | ✅ |
| `.signatur` / `.signed_at` / `.signed_ip` / `.contract_version` | text / timestamptz / text / text | ✅ audyt podpisu |
| `.pdf_sha256` | text (hex) — sha256 KANONU, stemplowana przy akcepcie; sync weryfikuje przed uploadem do MM | ✅ tamper-evidence |
| Mamamia `Confirmation.signed_contract` | TEN SAM plik (bajty kanonu) w S3 Mamamii | ✅ archiwum binarne |
| Maile (klient + team, `Betreuungsvertrag_Primundus.pdf`) | załącznik = TEN SAM plik (bajty kanonu) | skrzynki |
| `GET /api/contract-pdf/<leadId>?token=` | serwuje KANON z bucketu (bucket-first); render tylko gdy kanonu brak (alt-buchungi) | proxy do kanonu |

Treść §§ żyje w kodzie (`project 3/lib/vertrag.ts` + JSX `VertragSignieren.tsx` — duplikacja
świadoma, patrz plan refactoru; `contract_version` w wierszu pinuje wersję tekstu — bump
TYLKO ze świadomą zmianą treści + zamrożeniem starej wersji).

## Otwarte (świadomie poza — wymagałoby zmian we froncie, tylko za osobnym OK Michała)

- Utrwalanie checkboxów zgód + Ort podpisu (kolumny `consent_read/consent_widerruf/signed_ort`
  czekają puste — przeglądarka je dziś wyrzuca).
- Dyskretne pola AG w metadata (dziś composed w snapshot → split heurystyczny nazwiska).
- Wspólny moduł treści §§ (T6).

## Sekrety / env

- `sync-acceptance` (edge): `SUPABASE_URL/SERVICE_ROLE_KEY`, `MAMAMIA_ENDPOINT/AUTH_ENDPOINT/
  AGENCY_EMAIL/AGENCY_PASSWORD`, `KOSTENRECHNER_URL` — wszystkie istnieją już per-env
  (te same co detect-caregiver-events). Auth wywołania: `Authorization: Bearer <SERVICE_ROLE_KEY>`
  (constant-time compare) — WYŁĄCZNIE server-to-server (bridge/cron), nigdy z przeglądarki.
- CI deployuje `sync-acceptance` na staging (pętla w `test.yml`); prod manualnie
  (`supabase functions deploy sync-acceptance --project-ref ycdwtrklpoqprabtwahi`).
