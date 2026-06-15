#!/usr/bin/env bash
#
# apply-migrations.sh — apply pending Supabase migrations to ONE project,
# via the Management API, with proper history tracking. Identical behaviour
# on staging and prod → the single mechanism behind "staging-first".
#
#   Usage:  scripts/apply-migrations.sh <project-ref> [--dry-run]
#   Auth:   SUPABASE_ACCESS_TOKEN env (CI) — falls back to the macOS keychain
#           (local dev: Supabase CLI stores it as go-keyring-base64).
#
# Why Management API instead of `supabase db push`:
#   * reuses the access token CI already has (SUPABASE_ACCESS_TOKEN works for
#     staging+prod) — no per-environment DB-password secret to add;
#   * sends each migration's SQL from its FILE via `jq --arg`, so plpgsql
#     `$$` bodies survive verbatim (the inline `run_query` workflow input
#     re-parses through bash and mangles `$$` — that fragility is why staging
#     drifted and broke caregiver invites).
#
# Tracking: reads/writes supabase_migrations.schema_migrations (the same table
# the Supabase CLI uses). A migration whose version (the leading timestamp of
# the filename) is already recorded is skipped → idempotent + ordered.
#
# NOTE: this only does the right thing when schema_migrations honestly reflects
# what is applied. A project bootstrapped outside the CLI (e.g. prod, set up via
# Bolt) can have a sparse history — run with --dry-run first and reconcile
# before letting it apply, or it will try to re-run already-applied migrations.

set -euo pipefail

REF="${1:-}"
DRY_RUN=false
[ "${2:-}" = "--dry-run" ] && DRY_RUN=true
if [ -z "$REF" ]; then
  echo "usage: scripts/apply-migrations.sh <project-ref> [--dry-run]" >&2
  exit 2
fi

# ── Resolve the Management API token ───────────────────────────────────────
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -z "$TOKEN" ] && command -v security >/dev/null 2>&1; then
  raw=$(security find-generic-password -s "Supabase CLI" -a "supabase" -w 2>/dev/null || true)
  TOKEN=$(printf '%s' "${raw#go-keyring-base64:}" | base64 -d 2>/dev/null || true)
fi
if [ -z "$TOKEN" ]; then
  echo "::error::No Supabase access token (set SUPABASE_ACCESS_TOKEN or log in with the CLI)" >&2
  exit 1
fi

API="https://api.supabase.com/v1/projects/${REF}/database/query"
MIG_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
[ -d "$MIG_DIR" ] || { echo "::error::no migrations dir at $MIG_DIR" >&2; exit 1; }

RESP_BODY=/tmp/_mig_resp.json
RESP_HTTP=/tmp/_mig_http

# run_sql <sql> — POSTs the query; leaves the body in $RESP_BODY and the HTTP
# status in $RESP_HTTP. Communicates via files on purpose: callers read the
# status with http() instead of a global (a global set here would be lost,
# since run_sql is invoked from command substitutions / subshells).
run_sql() {
  curl -sS -o "$RESP_BODY" -w '%{http_code}' -X POST "$API" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg q "$1" '{query:$q}')" > "$RESP_HTTP" 2>/dev/null || echo 000 > "$RESP_HTTP"
}
http() { cat "$RESP_HTTP" 2>/dev/null || echo 000; }

# ── Versions already recorded on the target ────────────────────────────────
run_sql 'select version from supabase_migrations.schema_migrations order by version;'
if [ "$(http)" -ge 400 ]; then
  echo "::error::could not read schema_migrations on ${REF} (HTTP $(http)): $(cat "$RESP_BODY")" >&2
  exit 1
fi
applied="$(jq -r '.[]?.version' "$RESP_BODY" 2>/dev/null || true)"

# ── Determine pending files (version not in history), in filename order ─────
pending=()
for f in "$MIG_DIR"/*.sql; do
  [ -e "$f" ] || continue
  ver="$(basename "$f" | grep -oE '^[0-9]+' || true)"
  [ -n "$ver" ] || { echo "skip (no version prefix): $(basename "$f")"; continue; }
  if printf '%s\n' "$applied" | grep -qx "$ver"; then continue; fi
  pending+=("$f")
done

recorded_count="$(printf '%s\n' "$applied" | grep -c . || true)"
if [ "${#pending[@]}" -eq 0 ]; then
  echo "✓ ${REF}: up to date — no pending migrations (${recorded_count} recorded)"
  exit 0
fi

echo "Pending on ${REF}: ${#pending[@]} (of $(ls -1 "$MIG_DIR"/*.sql | wc -l | tr -d ' ') files, ${recorded_count} recorded)"
for f in "${pending[@]}"; do echo "  • $(basename "$f")"; done

if $DRY_RUN; then
  echo "(dry-run) nothing applied"
  exit 0
fi

# ── Apply in order, record each ────────────────────────────────────────────
for f in "${pending[@]}"; do
  ver="$(basename "$f" | grep -oE '^[0-9]+')"
  name="$(basename "$f" .sql | sed -E "s/^${ver}_//")"
  echo "::group::apply ${ver} ${name}"
  run_sql "$(cat "$f")"
  if [ "$(http)" -ge 400 ]; then
    echo "::error::migration ${ver} failed (HTTP $(http)): $(cat "$RESP_BODY")" >&2
    exit 1
  fi
  # Record it (version + name; statements left null — only version is used for
  # pending-detection). Single quotes are safe: ver is digits, name is the
  # filename slug (alnum + underscore).
  run_sql "insert into supabase_migrations.schema_migrations (version, name) values ('${ver}', '${name}') on conflict (version) do nothing;"
  if [ "$(http)" -ge 400 ]; then
    echo "::error::applied ${ver} but failed to write history (HTTP $(http))" >&2
    exit 1
  fi
  echo "✓ applied ${ver}"
  echo "::endgroup::"
done

echo "✓ ${REF}: applied ${#pending[@]} migration(s)"
