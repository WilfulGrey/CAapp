# Render beta deployment

This repo ships two products via a single Render Blueprint
(`render.yaml`). Both run on Render's free tier.

| Service | Type | Source | URL pattern |
|---|---|---|---|
| `caapp-beta` | Static Site | repo root (Vite) | `https://caapp-beta.onrender.com` |
| `kostenrechner-beta` | Web Service | `project 3/` (Next.js 13) | `https://kostenrechner-beta.onrender.com` |

Both auto-deploy on push to `integration/mamamia-onboarding`.

## First-time setup

1. **Sign in to Render** with the GitHub account that has access to
   `WilfulGrey/CAapp` (or fork to your own).

2. **New → Blueprint** → connect this repo → pick branch
   `integration/mamamia-onboarding`. Render reads `render.yaml`,
   shows the two services, and prompts for every env var declared
   `sync: false`. Fill them as below.

3. **Service URLs** are assigned at create time. Note them — you'll
   need to paste `caapp-beta`'s URL into `NEXT_PUBLIC_PORTAL_URL` on
   the kostenrechner service (cross-link).

### `caapp-beta` env vars

All baked into the bundle at build time. No secrets here.

| Var | Value | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://ycdwtrklpoqprabtwahi.supabase.co` | committed |
| `VITE_SUPABASE_ANON_KEY` | (anon JWT) | committed |
| `VITE_DEBUG` | `0` | committed |

### `kostenrechner-beta` env vars

Set via Render dashboard on first deploy. Server-only secrets are
declared `sync: false` in the Blueprint and never live in repo.

| Var | Value | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://kostenrechner-beta.onrender.com` | this service's own URL after Render assigns it |
| `NEXT_PUBLIC_PORTAL_URL` | `https://caapp-beta.onrender.com` | the OTHER service's URL — cross-link |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ycdwtrklpoqprabtwahi.supabase.co` | committed |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon JWT) | committed |
| `SUPABASE_SERVICE_ROLE_KEY` | (service role JWT) | Supabase dashboard → Settings → API → service_role |
| `ADMIN_PASSWORD` | (anything) | pick one |
| `ADMIN_SESSION_SECRET` | (random, ≥ 32 chars) | e.g. `openssl rand -base64 48`; signs the admin cookie, own value per slot (Registry #132) |
| `SMTP_HOST` | `smtp.ionos.de` | committed |
| `SMTP_PORT` | `587` | committed |
| `SMTP_USER` | `kostenrechner@primundus.de` | Ionos credentials |
| `SMTP_PASS` | (Ionos mailbox password) | Ionos dashboard |
| `SMTP_FROM` | `kostenrechner@primundus.de` | Ionos |
| `SMTP_FROM_NAME` | `Primundus 24h-Pflege` | committed |
| `SMTP_ADMIN_EMAIL` | `kostenrechner@primundus.de` | where lead notifications land |
| `NODE_VERSION` | `20` | committed |

The local `project 3/.env` file already has these — copy/paste the
values into Render's UI. Do NOT push that file (it's in `project 3/.gitignore`).

## Deploy flow

1. Push to `integration/mamamia-onboarding` → Render auto-builds both services.
2. Static `caapp-beta` build completes in ~1-2 min (Vite is fast).
3. `kostenrechner-beta` builds in ~3-5 min (Next.js + ~70 MB of deps).
4. Free-tier Web Services sleep after 15 min idle. First request after
   sleep takes ~30s cold start. Static sites don't sleep.

## Smoke test once both are up

1. Open `https://kostenrechner-beta.onrender.com` (or whatever URL
   Render assigned).
2. Run through form 1 → step 2 → result page; submit name+email.
3. Expect: green "Vielen Dank!" with 3-2-1 countdown, then redirect
   to `https://caapp-beta.onrender.com/?token=…`.
4. Check inbox: Eingangsbestätigung email contains "Ihr persönlicher
   Portal-Link" button. Click from a different browser session →
   same portal opens (token reusable for 14 days).
5. After ~15 min: PDF Angebots-Email arrives with "Pflegekraft jetzt
   finden" CTA pointing at the same URL.

## Custom domains (optional, post-beta)

- caapp-beta → `kundenportal.primundus.de`
- kostenrechner-beta → `kostenrechner.primundus.de`

Add CNAME records in your DNS to the assigned `*.onrender.com` host,
then attach the custom domain in each service's Render dashboard.
After that, update `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_PORTAL_URL`
to the custom domains and trigger a redeploy.

## Troubleshooting

- **Static fallback 404 on /?token=…** — check the rewrite rule in
  `render.yaml` (Static Sites need explicit SPA fallback).
- **Next.js build fails on Render** — usually a missing env var the
  build-time code reads. Re-check the `kostenrechner-beta` env list.
- **Email doesn't arrive** — Ionos SMTP_PASS rotated, or
  `SMTP_ADMIN_EMAIL`/`SMTP_FROM` rejected by relay. Render service
  logs print the nodemailer error.
- **CA app shows blank page** — check browser console for
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` undefined; values are
  baked at build time, so a redeploy is required after env edits.
- **Cross-link broken (portal redirect goes to localhost)** — you
  forgot to set `NEXT_PUBLIC_PORTAL_URL` on `kostenrechner-beta`;
  rebuild after fixing.
