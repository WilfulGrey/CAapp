# Plan: Staging environment + Claude-driven deploy skills

*Plan-mode wynik z 2026-05-22. Źródło prawdy: ten plik (committed). Kopia robocza w `~/.claude/plans/ok-potrzebujemy-jeszcze-z-crystalline-steele.md`.*

> **⚠️ AKTUALIZACJA 2026-07-03:** Skill `/deploy-prod` (opisany niżej) został **usunięty** —
> opierał się na fałszywym założeniu że prod-front jest gated (NIE jest — auto-deployuje się
> na merge, zweryfikowane). Ten plik zostaje jako **zapis historyczny** oryginalnego planu;
> aktualny workflow deployu → CLAUDE.md §"Prod deploy — manual". `/deploy-staging` został.

## Context

Obecnie pracujemy w trybie "trunk = prod". Każdy merge do `integration/mamamia-onboarding`:

1. **Render** auto-deployuje `caapp-beta` + `kostenrechner-beta` (oba mają custom domains → `kundenportal.primundus.de` + `kostenrechner.primundus.de`) — czyli klient widzi zmiany natychmiast.
2. **CI** (`test.yml`) deployuje edge functions wprost do prod Supabase (`ycdwtrklpoqprabtwahi`).
3. **Migracje DB** lecą do prod Supabase przez `supabase-ops.yml` (PROJECT_REF hardcoded).
4. **Mamamia** — wszystkie wywołania idą do `backend.prod.mamamia.app` (Mamamia production-grade tenant + Primundus agency `id=3`, jedyny jaki mamy).

To zostawia zero przestrzeni na "skomplikowany test" — każdy taki test jest na żywym kliencie. Bug #15 (Primundus agency_id się rozjechał beta→prod, 2026-05-11) + Bug #16 (schema drift contracts plural vs singular, 2026-05-12) pokazały że potrzebujemy realnego środowiska do prelaunch verify, nie tylko vitest mock'ów.

**Cel:** dwa równoległe deploy targets — STAGING (Mamamia beta tenant + osobny Supabase + Render slot URLs) jako "trunk auto-deploy" i PROD (obecny stan) jako "Claude-orchestrated promotion". Workflow developera nie zmienia się dla 90% zadań (PR → merge → staging deploy automatycznie). Dla 10% "kompletny feature gotowy → ship" — `/deploy-prod` w Claude Code.

User decyzje (zatwierdzone w plan-mode):
- **Mamamia tenant dla staging:** `backend.beta.mamamia.app` (osobne agency, czyste IDs, akceptujemy ryzyko schema drift względem preprod).
- **Promotion mechanism:** Claude Code skills (`/deploy-staging`, `/deploy-prod`) — user pisze command, Claude wykonuje sekwencję + raportuje. Skills definiowane w repo (`.claude/skills/`).
- **Staging URL:** Render slot URL (`caapp-staging.onrender.com`, `kostenrechner-staging.onrender.com`) — zero DNS ceremony.
- **Branch rename:** `integration/mamamia-onboarding` → `main`; obecny mockup `main` → `main-mockup-legacy` (zarchiwizowany, nie usuwany).

## Architektura

```
                  ┌───────────────────────────────────────┐
                  │  feature/* branches                    │
                  └────────────────┬──────────────────────┘
                                   │ PR + CI green + self-merge
                                   ▼
                  ┌───────────────────────────────────────┐
                  │  main (rename z integration/...)       │
                  └────────────────┬──────────────────────┘
                                   │ Render auto-deploy
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │  STAGING                                          │
        │  • caapp-staging.onrender.com                     │
        │  • kostenrechner-staging.onrender.com             │
        │  • Supabase project: <new staging ref>            │
        │  • Mamamia: backend.beta.mamamia.app + agency 18  │
        │  • Edge fns + migracje auto via CI (push to main) │
        └──────────────────────────────────────────────────┘
                                   │
                                   │ /deploy-prod  (Claude orchestrates)
                                   │ ── user-confirmed promotion
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │  PROD                                             │
        │  • kundenportal.primundus.de  (slot caapp-beta)   │
        │  • kostenrechner.primundus.de (slot kostenrechner-beta) │
        │  • Supabase project: ycdwtrklpoqprabtwahi         │
        │  • Mamamia: backend.prod.mamamia.app + agency 3   │
        │  • Manual deploy via Render API + CLI             │
        └──────────────────────────────────────────────────┘
```

Render slot nazewnictwo zostaje (`caapp-beta` / `kostenrechner-beta` = prod) — rename slot'ów w Render Dashboard byłby kosmetyczny i wymagałby update'u service IDs w skryptach. Mental-model w docsach: "beta slot = prod, staging slot = staging".

## Migration / deploy ordering rule

W `/deploy-prod` zawsze: **migracje pierwsze, kod drugi**. Migracje MUSZĄ być backward-compatible z poprzednią wersją kodu (= expand/contract pattern):

- Nowa kolumna → ZAWSZE nullable albo z DEFAULT
- Usuwana kolumna → najpierw stop-reading w kodzie (deploy), potem migracja drop'ująca
- Rename → expand (add new), backfill, deploy code reading new, contract (drop old) — minimum 2 deploy cykle

Ta reguła zostaje skodyfikowana w CLAUDE.md jako Święta zasada nr 3.

## Critical files / changes

### 1. Branch rename (jednorazowo, ostrożnie)

```bash
# Lokalnie + na GitHub
git branch -m integration/mamamia-onboarding main-new
git push origin main-new
# W GH: Settings → Branches → Default → main-new
# Stary main (mockup) → rename do main-mockup-legacy:
git push origin :main  # delete
git branch -m main-mockup-legacy
git push origin main-mockup-legacy
# Final: rename main-new → main
git push origin :main-new
git branch -m main
git push -u origin main
# Branch protection: skopiować ustawienia ze starego trunka (3 status checks, PR-only)
```

Pliki do update'u (refs w kodzie):
- `render.yaml` → `branch: main` (był `integration/mamamia-onboarding`)
- `.github/workflows/test.yml` → push trigger branch
- `.github/workflows/supabase-ops.yml` → j.w. jeśli ma branch trigger
- `CLAUDE.md` → wszystkie wzmianki

### 2. Stworzenie staging Supabase + Mamamia setup (jednorazowo, ręcznie przez usera)

User-action items (Claude nie ma uprawnień):

1. **Supabase nowy projekt**: utworzyć w dashboard, np. `caapp-staging`. Zachować `project ref` (np. `abcdefgh...`), service-role key, anon key, db password.
2. **Apply ALL existing migrations** na świeżą staging DB:
   ```bash
   npx supabase link --project-ref <NEW_REF>
   npx supabase db push --linked
   ```
3. **Setup pg_cron jobs** (`detect-caregiver-events` co 15 min, `daily-analytics-report` o 06:00 UTC) — istnieją w migracjach `20260519080000_*` i `20260520070000_*`, zaaplikują się z push. **Sprawdzić** że `vault` extension działa i secrets są ustawione w nowej DB.
   > **⚠️ GOTCHA (wykryte 2026-07-21):** komenda każdego crona buduje URL+auth z
   > Vault-secrets **`supabase_url`** i **`supabase_service_role_key`** (fallback: GUC
   > `app.settings.*`). Migracje tworzą JOBY, ale NIE te secrety — bez nich `url` w
   > `net.http_post` jest NULL i **każdy tik pada** (`null value in column "url" of
   > relation "http_request_queue"`). Na stagingu (`taggpiwpwthgpcmaiqjw`) brakowało ich
   > od utworzenia projektu — **wszystkie 3 crony (detect, send-scheduled-emails,
   > daily-analytics) miały 0 udanych przebiegów 2026-05-26→2026-07-21**: zero maili
   > reminder/+15min-PDF ze stagingu, zero cron-gwaranta acceptance-sync. Fix (SQL editor,
   > wartości z Dashboard → Settings → API):
   > ```sql
   > select vault.create_secret('https://<REF>.supabase.co', 'supabase_url');
   > select vault.create_secret('<SERVICE_ROLE_KEY>', 'supabase_service_role_key');
   > ```
   > Weryfikacja: `SELECT jobname, status FROM cron.job_run_details ORDER BY start_time
   > DESC LIMIT 3` po najbliższym tiku (oraz `net._http_response` — statusy 200/NULL-long-call).
4. **Mamamia beta agency**: confirm że nasze beta credentials (`MAMAMIA_AGENCY_EMAIL` / `_PASSWORD` dla beta tenant) działają. Discover beta agency ID:
   ```bash
   # Po LoginAgency mutation:
   curl ... -d '{"query":"{ ServiceAgency { id name } }"}'
   # Per CLAUDE.md "Naming convention" → beta agency_id = 18 (już zweryfikowane historycznie)
   ```
5. **Render nowe services** (przez Render Dashboard, nie blueprint — żeby nie ruszać żywego prod blueprintu):
   - `caapp-staging` (Static, root: repo root, branch: `main`, auto-deploy ON)
   - `kostenrechner-staging` (Web, root: `project 3/`, branch: `main`, auto-deploy ON)
   - Env vars: skopiować klucze z prod, **wartości** → staging Supabase URL/keys + staging Mamamia secrets

### 3. Refactor: hardcoded → env-driven

#### 3a. `supabase/functions/onboard-to-mamamia/onboard.ts:134` — `PRIMUNDUS_AGENCY_ID = 3`

```ts
// PRZED:
const PRIMUNDUS_AGENCY_ID = 3;

// PO:
const PRIMUNDUS_AGENCY_ID = parseInt(Deno.env.get('MAMAMIA_AGENCY_ID') || '', 10);
if (!Number.isFinite(PRIMUNDUS_AGENCY_ID)) {
  throw new Error('MAMAMIA_AGENCY_ID env var required (3 for prod, 18 for staging beta tenant)');
}
```

Set w Supabase secrets:
- prod project: `MAMAMIA_AGENCY_ID=3`
- staging project: `MAMAMIA_AGENCY_ID=18`

Per Święta zasada nr 1 — `parseInt` throw'uje gdy missing (NO SOFT FALLBACKS).

#### 3b. `supabase/functions/_shared/cors.ts:6-12` — CORS allow-list

Dodać staging URLs:
```ts
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://portal.primundus.de',
  'https://kundenportal.primundus.de',
  'https://kostenrechner.primundus.de',
  'https://caapp-beta.onrender.com',
  'https://kostenrechner-beta.onrender.com',
  'https://caapp-staging.onrender.com',       // NEW
  'https://kostenrechner-staging.onrender.com', // NEW
]);
```

URL-e są stabilne — env-driven CORS przesada, dwa nowe entries wystarczą.

#### 3c. `.env.example` updates

Root + `project 3/`: dodać `# Staging` sekcje z URL-ami staging Supabase + komentarz "set per environment".

### 4. CI workflow updates

#### 4a. `.github/workflows/test.yml`

Push trigger branch → `main`. Edge function deploy job: dodać warunek "tylko z `main`" (był z `integration/mamamia-onboarding`).

Edge fn deploy nadal targetuje **staging** Supabase od teraz (push do main = staging deploy):

```yaml
deploy-edge-functions:
  needs: [vitest, deno-onboard, deno-proxy]
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  env:
    SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_STAGING_REF }}  # NEW secret
  steps:
    - ...
    - run: npx supabase functions deploy <name> --project-ref $SUPABASE_PROJECT_REF
```

Hardcoded `ycdwtrklpoqprabtwahi` w `test.yml:119` + `:172` → wymienić na `${{ env.SUPABASE_PROJECT_REF }}`.

GitHub secrets dodać:
- `SUPABASE_STAGING_REF` (nowy)
- `SUPABASE_PROD_REF=ycdwtrklpoqprabtwahi` (przemianowany istniejący flow)
- `SUPABASE_ACCESS_TOKEN` (już istnieje, działa na oba projects bo to user-scoped token)

#### 4b. `.github/workflows/supabase-ops.yml`

Dodać `workflow_dispatch.inputs.target_env` ∈ {staging, prod}, switchować PROJECT_REF na podstawie inputu. Default `staging`.

### 5. Claude Code skills (nowe pliki w repo)

**Lokalizacja:** `.claude/skills/deploy-staging/SKILL.md` + `.claude/skills/deploy-prod/SKILL.md`. Skills są project-scoped (commitowane do repo), więc każdy dev które robi `git pull` dostaje je automatycznie.

#### 5a. `.claude/skills/deploy-staging/SKILL.md`

```markdown
---
name: deploy-staging
description: Deploy current main branch to STAGING (Render auto-deploy + edge fns + migrations to staging Supabase). Use when user types /deploy-staging or asks "deploy to staging".
---

# Deploy to staging

## Preconditions
- cwd na `main` branch
- working tree clean
- `git pull` up-to-date z origin
- `npx vitest run` przeszedł (lub user explicit override "force deploy")

## Steps

1. Confirm with user: "Deploy main (commit <SHA>) to staging? This will:
   - Apply migrations to staging Supabase
   - Deploy edge functions to staging Supabase
   - Render auto-deploys caapp-staging + kostenrechner-staging from main"
2. `npx supabase db push --linked --project-ref $SUPABASE_STAGING_REF`
3. Deploy edge functions to staging (loop over: onboard-to-mamamia, mamamia-proxy, detect-caregiver-events, daily-analytics-report):
   `npx supabase functions deploy <name> --project-ref $SUPABASE_STAGING_REF`
4. Poll Render API for caapp-staging + kostenrechner-staging deploy status (use `render deploys list <SERVICE_ID> --confirm`). Wait until `status=live`.
5. Smoke test: `curl https://caapp-staging.onrender.com/` expect HTTP 200.
6. Smoke test: `curl https://<staging-supabase>.supabase.co/functions/v1/onboard-to-mamamia -d '{"token":"invalid"}'` expect 401 (function alive, rejects bad token cleanly).
7. Report: URLs, deploy time, smoke test results.

## Failure handling
- Migration failure → STOP. Do not deploy functions. Surface error.
- Edge fn deploy failure → continue with others, list failures at end.
- Smoke test 5xx → STOP. Roll back not implemented (Render auto-deploy is sticky to last successful).

## Env vars expected
- `SUPABASE_STAGING_REF` (set in user shell or `.envrc`)
- `RENDER_API_KEY` (already in user env per memory)
- `STAGING_CAAPP_SERVICE_ID`, `STAGING_KOSTENRECHNER_SERVICE_ID` (Render service IDs for staging)
```

#### 5b. `.claude/skills/deploy-prod/SKILL.md`

```markdown
---
name: deploy-prod
description: Promote current main commit from STAGING to PROD (manual gated). User types /deploy-prod after they've verified staging.
---

# Promote staging → prod

## Preconditions
- cwd na `main` branch, clean, up-to-date
- Last staging deploy was successful (Claude checks via Render API)
- User explicitly confirms commit SHA

## Steps

1. Determine current SHA: `git rev-parse HEAD`
2. Check Render API: is `caapp-staging` last deploy of this SHA live? If not, abort and tell user "Staging is on <other SHA>, deploy that first via /deploy-staging".
3. **Interactive confirm**: AskUserQuestion: "Promote commit <SHA> (\"<commit msg>\") from staging to PROD?
   - Migrations will be applied to PROD Supabase (ycdwtrklpoqprabtwahi)
   - Edge functions deployed to PROD Supabase
   - Render services caapp-beta + kostenrechner-beta redeployed
   - This affects LIVE customers on kundenportal.primundus.de
   Options: Yes, deploy / Cancel"
4. If confirmed:
   a. `npx supabase db push --linked --project-ref $SUPABASE_PROD_REF` (= ycdwtrklpoqprabtwahi)
   b. Deploy edge functions to PROD (same loop as staging, different ref)
   c. Trigger Render redeploy via API for caapp-beta + kostenrechner-beta:
      `curl -X POST -H "Authorization: Bearer $RENDER_API_KEY" https://api.render.com/v1/services/<SERVICE_ID>/deploys`
   d. Poll deploy status until both services are `live`
   e. Smoke test https://kundenportal.primundus.de + https://kostenrechner.primundus.de
5. Report: live URLs, deploy duration, smoke test status.

## Failure handling
- Same rules jako staging — migrations first, fail fast, no auto-rollback.
- Document failure in plain Polish for the user, include the last error message verbatim.

## Migration rule reminder
- Code in this commit MUST be backward-compatible with PREVIOUS prod schema (expand-contract). If you added a NOT NULL column without default, /deploy-prod will succeed but live traffic mid-deploy will hit errors. Per Święta zasada nr 3 in CLAUDE.md.

## Env vars expected
- `SUPABASE_PROD_REF=ycdwtrklpoqprabtwahi`
- `RENDER_API_KEY`
- `PROD_CAAPP_SERVICE_ID=srv-d7phc0rrjlhs73dtismg`
- `PROD_KOSTENRECHNER_SERVICE_ID=<lookup>`
```

### 6. CLAUDE.md updates

Sekcja "Deploy workflow" do przepisania:

- Stara sekcja "Frontend (auto)" + "Edge Functions (auto, via CI)" → opis dual-env (staging auto, prod gated).
- Nowa sekcja **"Święta zasada nr 3: BACKWARD-COMPATIBLE MIGRATIONS"** z expand-contract patternem.
- Nowa sekcja **"Promotion workflow — /deploy-staging i /deploy-prod"** wyjaśniająca skills.
- "Branch model" — `main` = staging trunk, deploy do prod = `/deploy-prod`.
- "Mamamia integration" — staging używa beta tenant + agency 18, prod używa preprod + agency 3.

Update sekcji "🚨 URL convention" — dodać staging URLs do tabeli.

Bug registry — nie dodawać (to nie bugfix). Dodać do nowej "Recent infra changes" sekcji.

### 7. ONBOARDING.md updates

Dodać sekcję "Staging vs prod" wyjaśniającą nowemu devowi:
- Trunk = staging
- Customer-facing URLs = prod (kundenportal.primundus.de)
- Twoja `/deploy-staging` po merge to nice-to-have (CI też deployuje), ale `/deploy-prod` jest jedynym sposobem na klienta-widoczną zmianę.

## Critical files — final list

| File | Change |
|---|---|
| `render.yaml` | Branch ref `main` (zamiast `integration/mamamia-onboarding`) |
| `.github/workflows/test.yml` | Push trigger branch + edge fn deploy → `SUPABASE_STAGING_REF` |
| `.github/workflows/supabase-ops.yml` | Add `target_env` input |
| `supabase/functions/onboard-to-mamamia/onboard.ts:134` | `PRIMUNDUS_AGENCY_ID` z env (throw if missing) |
| `supabase/functions/_shared/cors.ts` | +2 staging URLs |
| `.env.example` (root + `project 3/`) | Add Staging section header |
| `.claude/skills/deploy-staging/SKILL.md` | NEW |
| `.claude/skills/deploy-prod/SKILL.md` | NEW |
| `CLAUDE.md` | Deploy workflow, Święta zasada nr 3, URL convention update |
| `ONBOARDING.md` | Staging vs prod section |

User-side (poza Claude'm):
- Stworzyć staging Supabase project + zapisać ref/keys
- Stworzyć Render services `caapp-staging` + `kostenrechner-staging`
- Set env vars per environment (Supabase secrets + Render service env)
- Stworzyć GitHub secret `SUPABASE_STAGING_REF`
- Branch rename na GitHub (default branch + branch protection migration)

## Verification

End-to-end po wszystkim:

1. **Branch rename verify**: `git fetch origin && git branch -a` → widzi `main`, `main-mockup-legacy`. PR opening: domyślnie target `main`.
2. **Staging Render**: open `https://caapp-staging.onrender.com/` → renders portal (token gate).
3. **Staging Mamamia**: token z testowego lead → onboard działa, panel beta.mamamia.app pokazuje customer z agency_id=18.
4. **Push to main → CI auto-deploy**: commit no-op zmianę, push, watch Actions → edge fns deploy na staging Supabase, Render auto-builds staging slots.
5. **`/deploy-prod` skill**: w nowym chat'cie type `/deploy-prod` → Claude pyta o confirm, robi sekwencję, raportuje.
6. **Smoke test po deploy_prod**: `kundenportal.primundus.de/?token=<known>` ładuje portal, mamamia-proxy zwraca dane (sprawdza że secrets w prod się nie rozjechały).
7. **Migration rule sanity**: stwórz testową migrację z NOT NULL + DEFAULT, deploy na staging, verify że stara wersja kodu (przed merge) nadal czyta DB bez błędu.

## Out of scope (defer)

- **Anonymized prod data dump → staging** — fajny do mieć dla repro klientów-specific bugów, ale wymaga RGPD/GDPR review (PII). Defer do osobnego planu jeśli będzie taka potrzeba.
- **PR preview environments** (per-PR ephemeral URL) — wymaga paid Render plan + Supabase branching ($25/mo). Wartość vs koszt nie uzasadnia teraz.
- **Auto-rollback przy failed smoke test** — wymaga "previous deploy SHA" tracking + Render API rollback. Defer; manual rollback przez Render Dashboard "Rollback" button wystarczy na MVP.
- **Slack/Telegram notification po deploy_prod** — fajne, ale `/deploy-prod` zwraca raport bezpośrednio Claude'owi który forwarduje user'owi w chat. Wystarczy.
- **Telemetry split staging vs prod** (Clarity, analytics) — staging nie powinien tracked'ować do prod Clarity workspace. Trzeba osobny Clarity project ID per env (env-driven w `VITE_CLARITY_ID`). Trywialna zmiana, można dorzucić w tym PR jeśli czas pozwala.

## Open questions / risks

- **Mamamia beta schema drift** — staging passe może maskować prod-only bug (Bug #16 reverse: feature works on beta plural contracts, fails on prod singular). Mitigation: dla każdej zmiany dotykającej Mamamia GraphQL, w `/deploy-prod` Claude robi proactive schema introspection na prod (`__type(name: "...")`) i porównuje z założeniami feature'a. Dodać do skill steps.
- **pg_cron cycle na staging Supabase** — codzienny analytics report + 15min detect-caregiver-events wystartują też na staging, więc bedą generować emails. Mitigation: ustawić `DAILY_REPORT_RECIPIENTS=null` (lub na test inbox) na staging Supabase secrets, żeby zespół nie był spammed dwa razy dziennie.
- **Cross-env Mamamia customer ID collision** — gdyby ktoś przez pomyłkę odpalił staging-token na prod portal (token to losowy 32-char string, więc szansa kolizji ≈ 0 ale UI rendering może się rozjechać), proxy reject nie znajdzie customera w prod Mamamia. Akceptowalne — fail closed.
- **Render slot rename ceremonii** — pomijamy. `caapp-beta` slug w Render = prod, `caapp-staging` = staging. Dokumentujemy w CLAUDE.md że to historyczne. Rename slot'a teoretycznie możliwy ale niewart ryzyka (DNS może się przerwać, GitHub Actions deploys mogą się zbluffować).
- **Migration concurrency** — gdyby `/deploy-staging` i `/deploy-prod` poszły blisko siebie z różnymi migracjami w drodze, mogą się ścigać o lock. Mitigation: `/deploy-prod` zawsze najpierw sprawdza że staging SHA = local SHA, więc nie ma "wyprzedzenia". Skill enforce'uje.
- **Hardcoded sekrety BCC email** (`info@primundus.de`, `info@mamamia.app`) — na staging team nie chce dostawać emaili klienta. Konkretna decyzja: na staging Supabase ustawić `SMTP_BCC=` (puste) i `DAILY_REPORT_RECIPIENTS=` (puste lub test inbox). Code już env-driven, więc zero refactor.
