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
  3. Render umowy    — GET {KOSTENRECHNER}/api/contract-pdf/<leadId>?token=
                       (jedyne źródło renderu — z wiersza DB)
  4. Upload do MM    — BRAMKA: dopiero gdy Mamamia PRZETWORZYŁA confirmation
                       (final_confirmation widoczne na jobie klienta);
                       magic-bytes %PDF- (HTML-fallback NIGDY jako .pdf);
                       StoreFile → UpdateConfirmation(file_tokens)
                       → Confirmation.signed_contract (S3 Mamamii)
                       → stempel mamamia_pdf_uploaded_at + pdf_sha256

Cron detect-caregiver-events (co 15 min) — GWARANT:
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
| StoreConfirmation pada **transient** (network/HTTP/5xx) | 3 próby w callu (2s+4s backoff); potem cron retry'uje — **alarm gdy po retry danego przebiegu wciąż brak confirm i wiersz starszy niż 5 min** (permanent w cronie ⇒ bez progu wieku) | cron → POST `acceptance_sync_alarm` do bridge'a → mail; stempel TYLKO gdy mail przeszedł (błąd ⇒ 502 ⇒ re-alarm za 15 min) |
| Confirm OK, **tylko PDF-upload** niedomknięty | po **24h** (archiwum, zero ryzyka klienta — bramka final_confirmation potrzebuje z natury drugiego przebiegu) | cron, ten sam kanał |
| Wiersz naprawiony w tym samym przebiegu crona | **bez alarmu** (alarm ocenia stan PO retry, nie sprzed) | — |

Stałe: `ACCEPTANCE_CONFIRM_ALERT_AFTER_MS = 5 min`, `ACCEPTANCE_PDF_ALERT_AFTER_MS = 24h`
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
| `lead_application_acceptances.contract_snapshot` | JSONB (VertragsDaten — dane dokumentu) | ✅ kanoniczny rekord |
| `.contract_patient` / `.contract_contact` | JSONB (surowy formularz, niemieckie klucze) | ✅ |
| `.signatur` / `.signed_at` / `.signed_ip` / `.contract_version` | text / timestamptz / text / text | ✅ audyt podpisu |
| `.pdf_sha256` | text (hex) — hash bajtów wgranych do MM | ✅ tamper-evidence |
| Mamamia `Confirmation.signed_contract` | plik PDF w S3 Mamamii | ✅ archiwum binarne |
| Maile (klient + team, `Betreuungsvertrag_Primundus.pdf`) | załącznik PDF (render z metadata — jak dotychczas) | skrzynki |
| `GET /api/contract-pdf/<leadId>?token=` | PDF renderowany на żądanie z wiersza | ❌ efemeryczny |

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
