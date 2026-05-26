---
name: deploy-prod
description: Promote the current trunk commit from STAGING to PROD — applies migrations to prod Supabase, deploys edge functions to prod Supabase, triggers Render redeploy of caapp-beta + kostenrechner-beta (= prod slots), and smoke-tests kundenportal.primundus.de. Always asks for explicit user confirmation before touching prod. Use when the user types /deploy_prod or asks "wypuść to na prod".
---

# Promote staging → prod

> **🚧 STATUS (2026-05-22): not yet active.** Pending user-side
> infrastructure setup — staging Supabase project + Render staging
> services + branch rename. Until staging exists, "promotion" is a
> no-op (there's nothing to promote from). See `docs/staging-environment-plan.md`.
> The interim manual promotion path is described in CLAUDE.md §"Deploy
> workflow" → "Emergency hotfix".

## What this skill does

Takes the commit currently live on STAGING and ships it to PROD. The user has already verified staging manually (clicked through the portal, ran their flows). This skill:

1. Verifies the local commit matches what's live on staging (no skipping verification).
2. **Asks user to confirm** — prod deploy affects live customers.
3. Applies any new migrations to prod Supabase.
4. Deploys edge functions to prod Supabase.
5. Triggers Render redeploy of `caapp-beta` + `kostenrechner-beta` (the prod slots, despite "beta" in the slug — see CLAUDE.md URL convention).
6. Smoke-tests `kundenportal.primundus.de` + `kostenrechner.primundus.de`.
7. Reports.

## Preconditions

1. **Branch & tree:** `main` (or `integration/mamamia-onboarding` pre-rename), clean, up-to-date.
2. **Local SHA == staging SHA:** Query Render API for `caapp-staging` last successful deploy. If its commit ≠ `git rev-parse HEAD`, abort: *"Staging is on `<other SHA>`. Either pull/checkout that commit, or run /deploy_staging first."*
3. **Env vars present:** `SUPABASE_PROD_REF=ycdwtrklpoqprabtwahi`, `RENDER_API_KEY`, `PROD_CAAPP_SERVICE_ID=srv-d7phc0rrjlhs73dtismg`, `PROD_KOSTENRECHNER_SERVICE_ID` (lookup needed).

## Steps

### 1. Pre-flight: check Mamamia schema parity (if this commit touches GraphQL)

If `git diff origin/<previous-prod-tag>..HEAD --name-only` includes files in `src/lib/mamamia/` or `supabase/functions/mamamia-proxy/operations.ts` or `supabase/functions/onboard-to-mamamia/mappers.ts`, do a quick schema introspection on PROD Mamamia tenant before promoting:

```bash
# Login agency on PROD Mamamia
TOKEN=$(curl -sS -X POST "$MAMAMIA_PROD_AUTH_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { LoginAgency(email: \\\"$MAMAMIA_PROD_AGENCY_EMAIL\\\", password: \\\"$MAMAMIA_PROD_AGENCY_PASSWORD\\\") { token } }\"}" \
  | jq -r '.data.LoginAgency.token')

# Introspect any fields this PR depends on (Bug #16 lesson: beta plural !== prod singular)
curl -sS -X POST "$MAMAMIA_PROD_ENDPOINT" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"{ __type(name: \"Customer\") { fields { name type { name kind ofType { name kind } } } } }"}'
```

Compare returned field names against what the PR uses. If schema mismatch — STOP, tell user *"This change uses field X which doesn't exist on Mamamia prod. Stays on staging until prod schema catches up."*

### 2. Interactive confirmation

```
AskUserQuestion:
  question: "Promote commit <SHA> ('<commit msg>') from STAGING to PROD?

             Migrations to be applied:
               <list of migrations new vs prod>

             Edge functions to deploy:
               <list>

             Render services to redeploy:
               - caapp-beta (kundenportal.primundus.de)
               - kostenrechner-beta (kostenrechner.primundus.de)

             This affects LIVE customers."
  options: [Yes, deploy to prod | Cancel]
```

If Cancel → exit cleanly, no changes.

### 3. Apply migrations to PROD Supabase

```bash
npx supabase db push --linked --project-ref "$SUPABASE_PROD_REF"
```

Failure → STOP, surface error. Do NOT deploy functions if migration failed.

### 4. Deploy edge functions to PROD

Same loop as `/deploy_staging` but with `$SUPABASE_PROD_REF`:

CA-App functions: `onboard-to-mamamia`, `mamamia-proxy`, `detect-caregiver-events`, `daily-analytics-report`.

Kostenrechner functions (use `/tmp/kr-deploy` workaround for space-in-path): `chat-ai`, `schedule-email`, `send-scheduled-emails`.

### 5. Trigger Render redeploy of prod services

Render prod services have **auto-deploy OFF** (manual gate). Trigger via API:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$PROD_CAAPP_SERVICE_ID/deploys" \
  -d '{"clearCache":"do_not_clear"}'

curl -sS -X POST \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$PROD_KOSTENRECHNER_SERVICE_ID/deploys" \
  -d '{"clearCache":"do_not_clear"}'
```

### 6. Poll until both prod services live

```bash
# Loop with timeout 8min — kostenrechner-beta (Next.js SSR) takes 2-3min cold
render deploys list "$PROD_CAAPP_SERVICE_ID" --confirm -o json | jq -r '.[0].deploy.status'
render deploys list "$PROD_KOSTENRECHNER_SERVICE_ID" --confirm -o json | jq -r '.[0].deploy.status'
```

### 7. Smoke tests on PROD

```bash
# Portal SPA renders
curl -sS -o /dev/null -w "%{http_code}\n" https://kundenportal.primundus.de/
# Expect: 200

# Kostenrechner SPA renders
curl -sS -o /dev/null -w "%{http_code}\n" https://kostenrechner.primundus.de/
# Expect: 200

# Edge function on prod Supabase responds
curl -sS -X POST "https://${SUPABASE_PROD_REF}.supabase.co/functions/v1/onboard-to-mamamia" \
  -H "Content-Type: application/json" \
  -H "apikey: $SUPABASE_PROD_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_PROD_ANON_KEY" \
  -d '{"token":"smoke-test-invalid-token"}'
# Expect: 401 with "invalid-token" body
```

### 8. Report

Format the report tightly:

```
✅ Deployed commit <SHA> to PROD
   ("<commit msg>")

   Migrations: <N applied / skipped>
   Edge functions: <N/N deployed>
   Render: caapp-beta live (took <Xs>), kostenrechner-beta live (took <Ys>)
   Smoke: kundenportal.primundus.de 200, kostenrechner.primundus.de 200, edge fn 401

   Total promotion time: <Z min>

   Watch for:
   - Render dashboard: <URLs to both services>
   - Supabase logs: <project URL>
```

## Failure handling

- **Migration fails on prod** → STOP. Surface error verbatim. Tell user: *"Migration half-applied? Check Supabase Studio. Edge functions NOT deployed. Roll back migration manually if needed, then retry."*
- **Edge fn deploy fails** → continue rest, list failures. User decides retry.
- **Render redeploy fails** → don't auto-rollback. Tell user: *"Render build failed for <service>. Rollback via Render Dashboard → Deploys → previous successful → Rollback. Reason from build log: <excerpt>."*
- **Smoke test 5xx after live** → critical. Surface verbatim error. Tell user: *"PROD is live but smoke test failed. Customer impact possible. Roll back via Render Dashboard."*

## Migration safety reminder

Every commit promoted via this skill MUST satisfy **Święta zasada nr 3** (CLAUDE.md):

> Migration MUST be backward-compatible with the previous prod code version (expand/contract pattern). NEW columns nullable or with DEFAULT. NEVER drop columns or rename them in a single deploy.

If you ARE doing a breaking schema change, it's a multi-step ship:

1. PR 1: expand migration (add new) + dual-read code → /deploy_prod
2. PR 2: backfill data (if needed) → /deploy_prod
3. PR 3: switch to read-new only → /deploy_prod
4. PR 4: contract migration (drop old) → /deploy_prod

Each /deploy_prod between steps is a full promotion cycle. NEVER bundle.

## Env vars expected

| Var | Source | Notes |
|---|---|---|
| `SUPABASE_PROD_REF` | hardcoded = `ycdwtrklpoqprabtwahi` | Current prod project |
| `SUPABASE_PROD_ANON_KEY` | Supabase Dashboard | Public, safe in env |
| `RENDER_API_KEY` | Render Dashboard → Account → API Keys | Same key as staging |
| `PROD_CAAPP_SERVICE_ID` | `srv-d7phc0rrjlhs73dtismg` (caapp-beta slot) | Memory: `reference_deploy-branches.md` |
| `PROD_KOSTENRECHNER_SERVICE_ID` | Render Dashboard → kostenrechner-beta | TODO: document once verified |
| `MAMAMIA_PROD_ENDPOINT`, `MAMAMIA_PROD_AUTH_ENDPOINT`, `MAMAMIA_PROD_AGENCY_EMAIL`, `MAMAMIA_PROD_AGENCY_PASSWORD` | User's `~/.primundus-mamamia-prod.env` (per CLAUDE.md "Naming convention") | Only needed for pre-flight schema introspection |

## Related

- **/deploy_staging** — what you run before this skill. Verify staging there first.
- `docs/staging-environment-plan.md` — full architecture rationale.
- CLAUDE.md §"Promotion workflow" — narrative summary.
- CLAUDE.md Bug #15, #16, #17 — examples of what staging would have caught.
