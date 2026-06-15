# Datenbank-Migrationen (Staging-first)

Eine Migration ist eine `*.sql`-Datei in `supabase/migrations/`, benannt
`<version>_<name>.sql` (version = führender Zeitstempel). Sie wird über die
Supabase **Management API** angewandt und in
`supabase_migrations.schema_migrations` verbucht.

## Das Werkzeug: `scripts/apply-migrations.sh`

```bash
scripts/apply-migrations.sh <project-ref> [--dry-run]
```

- Wendet **nur ausstehende** Migrationen an (version nicht in `schema_migrations`),
  in Dateinamen-Reihenfolge, und verbucht jede danach → idempotent.
- Auth: `SUPABASE_ACCESS_TOKEN` (CI) oder lokal aus dem macOS-Keychain (Supabase
  CLI Login). **Ein** Token deckt Staging **und** Prod ab.
- Schickt das SQL aus der **Datei** (`jq --arg`), darum überleben plpgsql-`$$`
  -Bodies — anders als der inline `run_query`-Workflow-Input, der durch bash
  re-geparst wird und `$$` zerlegt. Genau diese Fragilität hat früher dazu
  geführt, dass Staging driftete und Pflegekraft-Einladungen brachen.

Projekt-Refs: Staging `taggpiwpwthgpcmaiqjw`, Prod `ycdwtrklpoqprabtwahi`.

## Regel: Staging-first

> Was auf Prod läuft, **war vorher auf Staging.**

1. Migration als Datei mergen (→ `integration/mamamia-onboarding`).
2. **Staging** bekommt sie automatisch (CI, siehe unten) — bzw. lokal:
   `scripts/apply-migrations.sh taggpiwpwthgpcmaiqjw`.
3. Auf Staging verifizieren (Funktion/Feature testen).
4. Erst dann **Prod**: `scripts/apply-migrations.sh ycdwtrklpoqprabtwahi`
   (manuell/gated — nie vor Staging).

`--dry-run` zeigt vorher, was angewandt würde. Steht ein Projekt auf
„up to date", sind beide Seiten deckungsgleich.

> ⚠️ Voraussetzung: `schema_migrations` muss ehrlich widerspiegeln, was
> angewandt ist. Wird eine Migration außerhalb dieses Skripts angewandt
> (z.B. `supabase db push`, manuelles SQL), den Eintrag nachtragen, sonst
> hält das Skript sie für ausstehend.

## CI-Verdrahtung (TODO — braucht `workflow`-Scope zum Mergen)

In `.github/workflows/test.yml` ein Job, der **vor** dem Edge-Function-Deploy
läuft (Schema vor Code). Nutzt das bereits vorhandene `SUPABASE_ACCESS_TOKEN`
— kein neues Secret nötig:

```yaml
  migrate-staging:
    name: Apply migrations to Supabase (staging)
    needs: [vitest, deno-onboard, deno-proxy, deno-detect]
    if: (github.event_name == 'push' && github.ref == 'refs/heads/integration/mamamia-onboarding') || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Apply migrations → staging
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        run: ./scripts/apply-migrations.sh "${{ secrets.SUPABASE_STAGING_REF }}"
```

Danach bei `deploy-edge-functions` und `deploy-kostenrechner-functions`
`needs:` auf `[migrate-staging]` setzen, damit das Schema vor dem Code steht.
Prod bleibt manuell/gated (gleiche Skript-Zeile mit `SUPABASE_PROD_REF`),
ausgeführt erst nach Staging-Verifikation.
