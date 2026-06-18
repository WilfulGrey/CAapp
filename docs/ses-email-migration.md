# Email transport migration: Ionos → Amazon SES

*Status: 2026-06-18. Code (transport hardening) lands in the PR; the actual
provider switch is a **secrets-only** change applied per environment —
staging first, prod only after sign-off.*

## Why

Ionos SMTP throttled / timed out from Render. The Eingangsbestätigung was
already pushed off the synchronous request path onto the scheduled-email
pipeline because of it (see `app/api/angebot-anfordern/route.ts`). We're
moving to **Amazon SES** for reliability and headroom.

## What does NOT change

The architecture stays identical — still nodemailer over SMTP, port 587,
STARTTLS. SES drops in as a config swap. The PR only **hardens** the two
transports (mandatory STARTTLS + bounded timeouts so a choking provider
fails fast instead of hanging):

- `project 3/lib/email.ts` → `sendEmail()` — Next.js server (Render env vars)
- `project 3/supabase/functions/send-scheduled-emails/index.ts` →
  `sendEmailSmtp()` — edge function (Supabase Vault)

## The two transport paths (read this before touching anything)

| Path | Used for | Reads SMTP config from | Switch = |
|---|---|---|---|
| **A — edge function** (`send-scheduled-emails`) | Customer mail: Eingangsbestätigung + Nachfass 1/2 (the high-volume, customer-facing ones) | **Supabase Vault** via `get_smtp_config()` RPC — secret names `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`, `smtp_from_name` | Update Vault secrets on that project (SQL). No redeploy — the RPC reads Vault per-call. |
| **B — Next.js** (`sendEmail`) | Team "neuer Lead" notifications, Vertrag confirmation, admin resend | **Render env vars** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_FROM_NAME` | Update the Render service env vars (dashboard — there is no Render API token here). |

Vault (Path A) and `supabase secrets` (edge-fn env) are **different stores** —
the SMTP secrets live in Vault, set via SQL, not via `supabase secrets set`.

## SES facts (confirmed 2026-06-18)

- **Region:** `eu-central-1` (Frankfurt) → host `email-smtp.eu-central-1.amazonaws.com`
- **Port:** `587` (STARTTLS)
- **Verified sender:** `primundus.de` domain DKIM-verified + `kostenrechner@primundus.de`. **From = `kostenrechner@primundus.de`.**
- **Sandbox:** production access granted — can send to any recipient (no recipient-verification needed).
- **Credentials:** SES *SMTP* username/password (IAM user `ses-smtp-user.*`). Secret — stored only in Vault / Render, never in git.

The SES SMTP password is **not** the AWS secret access key; it's the
SES-derived SMTP password from the credentials CSV. `SMTP_USER` is the SMTP
username (`AKIA…`), which is *not* an email — so `SMTP_FROM` must always be
set explicitly (the code falls back to `SMTP_USER` for the From otherwise).

## Per-environment values

| Secret | Staging (`taggpiwpwthgpcmaiqjw`) + `kostenrechner-staging`) | Prod (`ycdwtrklpoqprabtwahi` + `kostenrechner`) |
|---|---|---|
| `smtp_host` / `SMTP_HOST` | `email-smtp.eu-central-1.amazonaws.com` | `email-smtp.eu-central-1.amazonaws.com` |
| `smtp_port` / `SMTP_PORT` | `587` | `587` |
| `smtp_user` / `SMTP_USER` | SES SMTP username | SES SMTP username |
| `smtp_pass` / `SMTP_PASS` | SES SMTP password | SES SMTP password |
| `smtp_from` / `SMTP_FROM` | `kostenrechner@primundus.de` | `kostenrechner@primundus.de` |
| `smtp_from_name` / `SMTP_FROM_NAME` | `Primundus 24h-Pflege` | `Primundus 24h-Pflege` |

## Staging cutover (do first)

### Path A — edge function (Vault)

Set the Vault secrets on the **staging** project. Each secret is upsert via
`vault.create_secret` (new) or `vault.update_secret` (existing). Run on
`taggpiwpwthgpcmaiqjw` (CLI `db` connection or Management API SQL):

```sql
-- For each name below: update if it exists, else create.
select vault.create_secret('email-smtp.eu-central-1.amazonaws.com', 'smtp_host');
select vault.create_secret('587',                                    'smtp_port');
select vault.create_secret('<SES_SMTP_USERNAME>',                    'smtp_user');
select vault.create_secret('<SES_SMTP_PASSWORD>',                    'smtp_pass');
select vault.create_secret('kostenrechner@primundus.de',             'smtp_from');
select vault.create_secret('Primundus 24h-Pflege',                   'smtp_from_name');
```

If a secret already exists, `create_secret` errors on the unique name — use
`vault.update_secret((select id from vault.secrets where name='smtp_host'), '<value>')`.

No edge-function redeploy is needed; `get_smtp_config()` reads Vault on every
invocation.

### Path B — Next.js (Render env)

Set the six `SMTP_*` env vars on the **`kostenrechner-staging`** Render
service (dashboard → Environment). Render redeploys the service on save.
Lower stakes (internal notifications) — fine to do alongside or just after A.

### Verify staging

Trigger the customer-facing path and confirm SES delivery:

```bash
# Submit a fresh lead via the staging calculator API (creates a lead +
# schedules the Eingangsbestätigung with delay 0 on the staging Supabase).
curl -sS -X POST "https://kostenrechner-staging.onrender.com/api/angebot-anfordern" \
  -H "Content-Type: application/json" \
  -d '{ "vorname":"SES Test", "email":"<deliverable-inbox>", "careStartTiming":"sofort",
        "kalkulation":{ "bruttopreis":3200, "eigenanteil":1700,
          "formularDaten":{ "betreuung_fuer":"1-person","pflegegrad":3,
            "weitere_personen":"nein","mobilitaet":"rollator",
            "nachteinsaetze":"gelegentlich","deutschkenntnisse":"kommunikativ",
            "fuehrerschein":"ja","geschlecht":"weiblich" } } }'

# Then poke the staging scheduler so we don't wait for the 5-min cron tick:
curl -sS -X POST "https://<staging-ref>.supabase.co/functions/v1/send-scheduled-emails" \
  -H "Content-Type: application/json" -H "Authorization: Bearer <staging-anon-or-service>" \
  -d '{}'
# → { "processed": N, "success": N, ... }
```

Confirm: (1) `success` count > 0, (2) the mail arrives, (3) headers show
`DKIM-Signature` from `primundus.de` and a `…amazonses.com` Return-Path.
Check `scheduled_emails.status='sent'` and the `email_*_sent` lead_event.

## Prod cutover (gated — only after staging is confirmed)

Order matters; prod email must never have SES host + Ionos creds (or vice
versa) at the same time. Do all of a path's secrets together.

1. **Path A (prod Vault):** set the six `smtp_*` secrets on
   `ycdwtrklpoqprabtwahi` (same values as staging).
2. **Path B (prod Render):** set the six `SMTP_*` env vars on the **`kostenrechner`**
   prod service. Also update `render.yaml` so the blueprint stops hardcoding
   `SMTP_HOST=smtp.ionos.de` (convert to `sync:false` or set the SES host) —
   otherwise the next prod redeploy resets the host back to Ionos.
3. **Edge fn:** promote `send-scheduled-emails` to prod via `/deploy-prod`
   (or `supabase functions deploy send-scheduled-emails --project-ref ycdwtrklpoqprabtwahi`)
   so prod runs the hardened transport.
4. **Verify prod** with one real send, then watch `scheduled_emails` for a few
   cycles. Keep the Ionos creds around for ~a day as a rollback option.

## Rollback

Set the secrets back to the Ionos values (host `smtp.ionos.de`, Ionos
user/pass/from) on the affected environment. No code rollback needed — the
hardened transport is provider-neutral.
