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
  1. UpdateCustomer  — customer_contract = dane kontaktowe z formularza
                       konfirmacji (agGleich ⇒ dyskretne pola LE;
                       AG odrębny ⇒ split composed ag.name na ostatniej spacji,
                       bez salutation) + preserve equipments + patients:[]
  2. StoreConfirmation — akcept aplikacji (contract_patient/contract_contact,
                       mapowanie niemieckie→Mamamia SERVER-SIDE: SALUTATION
                       enum Mr./Mrs. [Fall Diesmann], split einsatzort)
                       → stempel mamamia_confirmed_at + mamamia_confirmation_id
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
  AND accepted_at > now()-30d → ten sam moduł. Alert: >24h niedomknięte ⇒
  GŁOŚNY console.error (Supabase logs) + stempel mamamia_sync_alerted_at
  (jednorazowo). Celowo bez nowego maila.
```

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
