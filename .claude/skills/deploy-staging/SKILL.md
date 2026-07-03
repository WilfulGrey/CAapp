---
name: deploy-staging
description: Deploy current trunk to STAGING — runs Supabase migrations + edge function deploy + waits for Render auto-build of caapp-staging + kostenrechner-staging, then smoke-tests both. Use when the user types /deploy-staging, asks "deploy do staging", or wants to manually trigger a staging refresh after merge.
---

# Deploy to staging

> **Status:** ACTIVE since 2026-05-26. Staging Supabase = `taggpiwpwthgpcmaiqjw`,
> Render slots = `caapp-staging` (`srv-d8anbsfavr4c73do33mg`) +
> `kostenrechner-staging` (`srv-d8anc9b7uimc73ajhdm0`). Branch rename
> `integration/mamamia-onboarding` → `main` deferred — skill works with
> current branch name. See `docs/staging-environment-plan.md`.

## What this skill does

Pushes the current local trunk commit to STAGING:

1. Applies any pending DB migrations to the staging Supabase project.
2. Deploys all Edge Functions to staging Supabase.
3. Waits for Render to finish auto-building `caapp-staging` + `kostenrechner-staging` (Render auto-deploys on push to trunk).
4. Smoke-tests both services.
5. Reports outcome.

CI already triggers steps 1+3 automatically on push to trunk. This skill is the **manual** path for:
- Pushing a hotfix commit that bypassed CI.
- Re-running deploy after a transient failure (esm.sh 522, Render build flake).
- Forcing a staging refresh of just edge functions when frontend didn't change.

## Preconditions (Claude must verify before doing anything)

1. **Branch:** `git branch --show-current` must equal `main` (post-rename) or `integration/mamamia-onboarding` (until rename happens).
2. **Clean tree:** `git status --porcelain` empty. If dirty, abort with: *"Working tree dirty. Commit or stash first."*
3. **Up to date:** `git fetch origin && git rev-parse HEAD == git rev-parse origin/<trunk>`. If behind, abort.
4. **Tests pass locally:** Run `npx vitest run` — if any failure, abort unless user passes `--force` to the skill invocation.
5. **Env vars present:** `SUPABASE_STAGING_REF`, `RENDER_API_KEY`, `STAGING_CAAPP_SERVICE_ID`, `STAGING_KOSTENRECHNER_SERVICE_ID` — if any missing, list which + tell user where to set (shell rc / `.envrc`).

## Steps

### 1. Confirm with user

```
AskUserQuestion:
  question: "Deploy commit <SHA> ('<commit msg>') to STAGING?
             This will:
             - Apply pending migrations to staging Supabase
             - Deploy edge functions to staging Supabase
             - Trigger/wait for Render auto-build of staging services
             - Smoke-test the result"
  options: [Yes, deploy | Cancel]
```

### 2. Apply migrations to staging Supabase

```bash
npx supabase db push --linked --project-ref "$SUPABASE_STAGING_REF"
```

Failure → STOP, surface error verbatim. Do NOT continue to function deploy if migrations failed (= schema drift risk).

### 3. Deploy edge functions

Loop over the **CA-App functions** (root supabase/functions/):
- `onboard-to-mamamia`
- `mamamia-proxy`
- `detect-caregiver-events`
- `daily-analytics-report`

```bash
for fn in onboard-to-mamamia mamamia-proxy detect-caregiver-events daily-analytics-report; do
  npx supabase functions deploy "$fn" --project-ref "$SUPABASE_STAGING_REF"
done
```

Then **Kostenrechner functions** (project 3/supabase/functions/):
- `chat-ai`
- `schedule-email`
- `send-scheduled-emails`

```bash
# project 3 has a space in path → CI uses /tmp/kr-deploy copy. Replicate:
rm -rf /tmp/kr-deploy && cp -r "project 3/supabase/functions" /tmp/kr-deploy
cd /tmp/kr-deploy
for fn in chat-ai schedule-email send-scheduled-emails; do
  npx supabase functions deploy "$fn" --project-ref "$SUPABASE_STAGING_REF"
done
```

Continue on individual function failure; collect failures + report at end.

### 4. Wait for Render auto-build

```bash
# Poll both staging services until status=live or 5min timeout
render deploys list "$STAGING_CAAPP_SERVICE_ID" --confirm -o json | jq -r '.[0].deploy.status'
render deploys list "$STAGING_KOSTENRECHNER_SERVICE_ID" --confirm -o json | jq -r '.[0].deploy.status'
# Loop until both = "live"; abort on "build_failed" or "deactivated"
```

If `RENDER_API_KEY` not in env, fall back to manual check: tell user *"Open Render dashboard, confirm both staging services are live, then continue."*

### 5. Smoke tests

```bash
# Portal SPA loads
curl -sS -o /dev/null -w "%{http_code}\n" https://caapp-staging.onrender.com/
# Expect: 200

# Edge function responds (rejects bad token cleanly)
STAGING_SUPA_URL="https://${SUPABASE_STAGING_REF}.supabase.co"
curl -sS -X POST "$STAGING_SUPA_URL/functions/v1/onboard-to-mamamia" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_STAGING_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_STAGING_ANON_KEY" \
  -d '{"token":"smoke-test-invalid-token"}' \
  | grep -q "invalid-token"
# Expect: response body contains "invalid-token" (proves function is alive + validating)
```

### 6. Report

Tell user:
- Commit deployed: `<SHA>` ("<message>")
- Migrations applied: yes/no + count
- Edge functions deployed: list with ✓/✗
- Render staging build: live since `<timestamp>`
- Smoke tests: passing/failing
- Staging URLs: `https://caapp-staging.onrender.com` + `https://kostenrechner-staging.onrender.com`

## Failure handling

- **Migration failure** → STOP. Surface error. Tell user: *"Migration failed, did NOT deploy functions. Roll back the migration manually in Supabase Studio if it half-applied, then retry."*
- **Edge fn deploy failure (individual)** → continue with remaining functions, list failures at end. User decides whether to retry.
- **Render build timeout** → don't fail the skill; tell user *"Render build taking unusually long, check dashboard: <url>"*.
- **Smoke test 5xx** → don't auto-roll-back (we don't have a "previous deploy" pointer). Surface error verbatim + Render rollback instructions.

## Env vars expected

| Var | Value | Source |
|---|---|---|
| `SUPABASE_STAGING_REF` | `taggpiwpwthgpcmaiqjw` | Hardcoded — staging Supabase project ref |
| `SUPABASE_STAGING_ANON_KEY` | `eyJhbGc...` | Supabase Dashboard → caapp-staging → Settings → API |
| `RENDER_API_KEY` | `rnd_...` | Render Dashboard → Account → API Keys |
| `STAGING_CAAPP_SERVICE_ID` | `srv-d8anbsfavr4c73do33mg` | Hardcoded — caapp-staging Render slot |
| `STAGING_KOSTENRECHNER_SERVICE_ID` | `srv-d8anc9b7uimc73ajhdm0` | Hardcoded — kostenrechner-staging Render slot |

User keeps these in `~/.zshrc` or `direnv` `.envrc`. Never commit to repo
(refs + service IDs are arguably non-secret but treat as project metadata
that lives outside source control).

## Related

- **Prod deploy — manual** (skill `/deploy-prod` usunięty 2026-07-03): prod front auto-deployuje się na merge; edge fns/migracje ręcznie via `supabase functions deploy <name> --project-ref ycdwtrklpoqprabtwahi` + `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi`.
- `docs/staging-environment-plan.md` — historyczny rationale (skill retired).
- CLAUDE.md §"Prod deploy — manual" — aktualny workflow.
