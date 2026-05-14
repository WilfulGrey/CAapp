# Onboarding — CAapp dev environment

> **Adresowane do:** współpracownik dev (Marcin lub kolejny członek zespołu)
> **Cel:** od zera do działającego lokalnego środowiska + commit/PR/deploy w 30 minut.
>
> Properties projektu są opisane szczegółowo w **[CLAUDE.md](CLAUDE.md)** —
> przeczytaj go po setup'ie. Tu jest *operations manual*, tam *project rules*.

---

## TL;DR (jeśli już znasz takie repa)

```bash
# 1. Clone (NIE swój fork — pracujemy na monorepo Michała)
git clone https://github.com/WilfulGrey/CAapp.git
cd CAapp
git checkout integration/mamamia-onboarding

# 2. Wklej dwa pliki .env (otrzymane osobno):
#    a) ./.env.local                  (CAapp / Vite)
#    b) "./project 3/.env"            (Primundus calculator / Next.js)

# 3. Install + run
npm install                            # CAapp deps
(cd "project 3" && npm install)        # Calculator deps

# Terminal 1 — CAapp on :5173
npm run dev

# Terminal 2 — Calculator on :3000
cd "project 3" && npm run dev

# 4. Open http://localhost:3000 — zacznij od kalkulatora,
#    redirect zaprowadzi cię do http://localhost:5173/?token=...
```

---

## 1. Repo i remote setup

### Single source of truth — `WilfulGrey/CAapp`

```bash
git clone https://github.com/WilfulGrey/CAapp.git
cd CAapp
```

**Ważne:**
- Pracujemy na **`WilfulGrey/CAapp`** jako jedynym remote `origin`.
- Twój fork `marcinwysocki007/CAapp` zostawiamy w spokoju — nie używamy go jako upstream/downstream. Może służyć jako twoje archiwum, ale codzienna praca = bezpośrednie PR-y do WilfulGrey.
- Default branch dla pracy: **`integration/mamamia-onboarding`**. Tu trafiają wszystkie merge'e, z tego brancha auto-deploy'uje Render na beta. Branch `main` istnieje historycznie ale jest nieaktualny — nie ruszamy go.

### Verify

```bash
git remote -v
# origin  https://github.com/WilfulGrey/CAapp.git (fetch)
# origin  https://github.com/WilfulGrey/CAapp.git (push)

git branch --show-current
# integration/mamamia-onboarding
```

---

## 2. Plików `.env` NIE commitujemy

`.gitignore` blokuje `.env`, `.env.local`, `.env.*.local`. Sprawdź zanim cokolwiek commitujesz:

```bash
git status --short | grep -E '\.env'
# (nic) ← OK
```

Pliki `.env` dostaniesz **osobnym kanałem** od Michała (Signal / encrypted email / 1Password vault). Trzymaj je tylko lokalnie. Nigdy nie wklejaj credentialów do PR-a, Slacka, screenshotów, GitHub issue.

### Co dokładnie umieścisz

| Ścieżka | Source |
|---|---|
| `/.env.local` | dla CAapp (Vite) — 3 zmienne |
| `/project 3/.env` | dla calculatora (Next.js) — 14 zmiennych |

Template'y są w repo (`.env.example` w obu lokalizacjach) — pokazują które klucze są potrzebne, ale wartości są puste; podstawisz je z paczki Michała.

---

## 3. Install i lokalny dev

### Wymagania

- **Node 20 LTS** (sprawdź: `node -v`). Render też pinuje 20.
- **npm 10+** (z Node 20 standardowo).
- Opcjonalnie: **Deno 2.7+** — tylko jeśli chcesz uruchamiać testy Edge Functions lokalnie. Bez tego CI/Render zrobią to za ciebie.

### Install

```bash
# CAapp (root)
npm install

# Calculator (subdirectory — UWAGA na spację w nazwie folderu)
cd "project 3"
npm install
cd ..
```

### Dev

Dwa równoległe procesy w osobnych terminalach:

```bash
# Terminal 1 — CAapp Kundenportal (Vite, hot reload)
npm run dev
# → http://localhost:5173

# Terminal 2 — Primundus Kostenrechner (Next.js)
cd "project 3"
npm run dev
# → http://localhost:3000
```

Przejście end-to-end: http://localhost:3000 → wypełnij wizard → po submit calculator zwróci `portalUrl=http://localhost:5173/?token=...` (zgodnie z `NEXT_PUBLIC_PORTAL_URL=http://localhost:5173` w `project 3/.env`) → portal otwiera się lokalnie i podłącza do **Supabase `ycdwtrklpoqprabtwahi` + Mamamia preprod tenant** (`backend.prod.mamamia.app`).

> **Lokalny dev = ten sam backend co Render beta slot.** Nie mamy lokalnej Supabase instancji ani lokalnego Mamamia — wszystko idzie do `ycdwtrklpoqprabtwahi.supabase.co` + Mamamia preprod (`backend.prod.mamamia.app`). To znaczy: każdy lokalny submit tworzy realny lead w Supabase + realnego customer'a w Mamamia preprod tenant'cie. Używaj test'owych emaili (`mailinator.com` zalecane) i test'owych imion (`Test [Co-testujesz]`).
>
> **⚠️ "beta" vs "preprod" terminologia:** nasz Render slot nazywa się `caapp-beta` / `kostenrechner-beta` — to nasz staging deploy. Ale **Mamamia** ma dwa osobne tenanty: `backend.beta.mamamia.app` (Mamamia dev env, forward-going schema) i `backend.prod.mamamia.app` (Mamamia production-grade, legacy schema — to którego aktualnie używamy jako preprod). Patrz CLAUDE.md §"Naming convention" dla szczegółów + Bug #16 dla schema diff między nimi.

---

## 4. Testy — uruchom przed commitem

### Frontend (Vitest + RTL/MSW)

```bash
npx vitest run            # wszystko, raz
npx vitest                # watch mode podczas dev
npm run test:coverage     # coverage report
```

Powinno przejść **163 testów** (stan na 2026-05-08, CI baseline). Jeśli twoja zmiana je psuje — albo aktualizuj test, albo cofnij zmianę.

### Edge Functions (Deno) — opcjonalnie

```bash
cd supabase/functions/onboard-to-mamamia
deno task test            # ~124 testów

cd ../mamamia-proxy
deno task test            # ~31 testów
```

### TypeScript build check

```bash
npx tsc --noEmit -p tsconfig.build.json
```

Pre-existing errors w `project 3/` (`next/navigation`, lucide `CircleCheck`) to nie są twoje — projekt 3 ma osobną tsconfig. Skupiaj się na `src/` clean.

---

## 5. Branch & PR workflow

### Złota reguła — żadnego direct push do `integration/mamamia-onboarding`

**Każda zmiana = feature branch + Pull Request.** Nawet 1-linijkowe fixy. Powód: Render auto-deploy'uje beta z każdego push'a do `integration/mamamia-onboarding` — chcemy review'ować zanim coś poleci na live.

### Workflow per task

```bash
# 1. Pull latest przed startem
git checkout integration/mamamia-onboarding
git pull origin integration/mamamia-onboarding

# 2. Branch off — nazwa: <typ>/<scope>-<short-desc>
git checkout -b fix/portal-pflegegrad-display
# albo: feat/calc-step-9-tooltip
# albo: refactor/mappers-cleanup

# 3. Pracuj — implementuj, pisz testy, aktualizuj CLAUDE.md jeśli dotyczy
#    (patrz: Święta zasada nr 2 w CLAUDE.md — docs muszą żyć z kodem)

# 4. Test lokalnie
npx vitest run
# (opcjonalnie deno tests jeśli ruszałeś Edge Functions)

# 5. Commit (zobacz konwencję poniżej)
git add <files>
git commit -m "fix(form): pflegegrad label inconsistency between Person 1 and 2"

# 6. Push do swojego brancha (NIE do integration/...)
git push -u origin fix/portal-pflegegrad-display

# 7. Otwórz PR na GitHub:
#    base: integration/mamamia-onboarding
#    head: fix/portal-pflegegrad-display
#    Tytuł = commit message
#    Opis = co + dlaczego + jak testowałeś (patrz template poniżej)

# 8. Czekaj na CI green (~60s, 3 status checks).
#    Approve od Michała NIE jest wymagany — możesz self-merge.

# 9. Self-merge: GitHub UI → "Squash and merge" (preferowane dla
#    czystej historii). Branch protection przepuści gdy CI zielony.

# 10. Po merge — Render auto-deploy'uje na beta (~2-3 min).
```

**Code review jest opcjonalny.** Jeśli zmiana jest nieoczywista
(refactor, nowy module, decyzja architektoniczna) — pinguj Michała
w PR comments + zaczekaj. CI łapie regresje techniczne; nie łapie
"czy to dobry pomysł". Self-merge gdy pewny; reviews on-demand.

### Commit convention (z CLAUDE.md)

- Prefix: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`,
  `docs:`, `chore:`, `infra(scope):`
- Scope krótki: `mapping`, `form`, `calc`, `api`, `email`, `cors`, etc.
- Body: 2-3 zdania DLACZEGO. Kod sam mówi co.
- Stopka: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
  (jeśli używałeś Claude Code do pisania).

### PR template (skopiuj do opisu PR)

```markdown
## Summary
- 2-3 bullety co zmienia ten PR

## Why
- Krótkie wyjaśnienie kontekstu / numer bug-a / link do issue

## Test plan
- [ ] vitest run (163+ tests passing)
- [ ] (jeśli dotyczy) deno onboard tests pass
- [ ] (jeśli dotyczy) deno proxy tests pass
- [ ] (jeśli dotyczy) e2e curl recipe na becie przeszedł — patrz CLAUDE.md
- [ ] manual smoke locally (jeśli zmiana dotyka UI)

## Screenshots / logs (opcjonalnie)
```

### Co NIE robić

- ❌ `git push origin integration/mamamia-onboarding` po commit'cie do tego brancha lokalnie (Render natychmiast zacznie build na beta — bez review). Jeśli przypadkowo zacommitowałeś tam zmianę, `git reset HEAD~1` i przenieś na feature branch.
- ❌ Force push do brancha który ma open PR (przepada review history). `--force-with-lease` tylko na własnych nietkniętych branchach.
- ❌ Commit'owanie `.env*`, `node_modules/`, `dist/`, `.next/`, `*.cookies`, plików `.tsx.bak` / `.broken`.
- ❌ Skipowanie testów ("commit'nę bez testów, naprawię później"). Jak zacznie się drift to nie skończy się nigdy.
- ❌ Bezpośrednie modyfikacje na `main` (stary branch, nie ruszamy).

---

## 6. Render deploys — jak to działa dla ciebie

### Trigger jest automatyczny

Render auto-deploy'uje na każdy push do `integration/mamamia-onboarding`. Nie potrzebujesz Render dashboard access żeby "wywołać deploy" — wystarczy że twój PR zostanie zmergowany.

```
twój PR mergowany → Render dostaje webhook → build → live na beta
                    (~1.5min CAapp, ~2-3min calculator)
```

### Dwa serwisy

| Service | Production URL | Render slot URL (fallback) | Z jakiej części repo |
|---|---|---|---|
| `caapp` | https://kundenportal.primundus.de | https://caapp.onrender.com | root (Vite static build) |
| `kostenrechner` | https://kostenrechner.primundus.de | https://kostenrechner.onrender.com | `project 3/` (Next.js SSR) |

Services były zrename'owane z `caapp-beta` / `kostenrechner-beta` w 2026-05-14 wraz z cutoverem na domeny primundus.de.

### Render team access

Michał dodaje Cię do Render team (Settings → Members → Invite). Po
akceptacji email-a zobaczysz w https://dashboard.render.com/ oba serwisy
beta. Możesz oglądać build logs / runtime logs / triggerować manual
redeploy. **NIE możesz** kasować serwisów ani zmieniać `render.yaml`
blueprint — to zarezerwowane dla Admin role.

### Co robisz po merge

1. Patrz logi build (Render dashboard → Service → Events lub Logs).
2. Smoke test live: skopiuj URL z PR → otwórz → przelataj wizard / portal → upewnij się że nic nie zepsute.
3. Jeśli zepsute — natychmiast otwórz PR z fix'em / rollback'iem (`git revert <merge-commit>` na nowym branchu, PR, merge).

### Edge Functions (manual)

Edge Functions Supabase **NIE są deploy'owane przez Render**. Push do brancha ich nie ruszy. Deploy ręczny:

```bash
npx supabase functions deploy onboard-to-mamamia --project-ref ycdwtrklpoqprabtwahi
npx supabase functions deploy mamamia-proxy --project-ref ycdwtrklpoqprabtwahi
```

Wymaga `npx supabase login` (Michał da ci dostęp do Supabase project'u jeśli musisz dotykać Edge Functions). W praktyce większość zmian dzieje się w `src/` (CAapp) i `project 3/` — Edge Functions są stabilne, dotyka ich Michał.

---

## 7. Co czytać dalej

| Plik | Kiedy |
|---|---|
| **[CLAUDE.md](CLAUDE.md)** | Czytaj po setup'ie. Architektura, gotchas, mapping reference, recent bugs. **Mandatory reading przed pierwszym PR.** |
| `docs/customer-portal-flow.md` | Szczegółowy walkthrough end-to-end flow (jeśli potrzebujesz głębszego zrozumienia). |
| `docs/mamamia-customer-fields-map.md` | Mamamia DB schema + fill-rates — przy każdym mapping audicie. |
| `docs/integration-blockers.md` | Log rozstrzygniętych Mamamia gotchas (enum values, validation). |

---

## 8. Komunikacja

- **Daily**: pull latest przed startem dnia.
- **Konflikty merge'a**: rozwiąż lokalnie (rebase preferowany nad merge), push do swojego feature brancha. Jeśli niepewny czy zachować — pinguj Michała na konkretny commit hash.
- **Pytania architektoniczne**: zanim zaczniesz większą zmianę (refactor, nowy module), napisz Michałowi 1-paragraf "co planuję" — szybsza review niż napisany kod do refactoru.
- **Bug spotted in prod/beta**: otwórz GitHub issue z reproduction steps + commit hash gdzie się pojawiło (`git log --oneline | grep <feature>`).

---

## 9. Pierwsza zmiana — sanity check

Żeby upewnić się że workflow działa:

```bash
git checkout -b chore/onboarding-marcin-test
echo "# (test) Onboarding workflow verified $(date +%Y-%m-%d)" >> /tmp/sanity.txt
# (nie commituj /tmp/sanity.txt — to tylko żeby zobaczyć git status w akcji)
git status                                # powinno być clean (nic w repo zmieniłeś)
git checkout integration/mamamia-onboarding
git branch -D chore/onboarding-marcin-test
```

Jeśli to przeszło — środowisko działa. Możesz brać pierwszego ticketa.

---

## 10. Troubleshooting (najczęstsze)

| Problem | Pierwsza diagnostyka |
|---|---|
| `npm run dev` pada na `VITE_SUPABASE_URL undefined` | Brak `.env.local` w roocie — patrz §2/§3 |
| Calculator pokazuje "500 internal server error" przy submit | Brak / niepełny `project 3/.env` lub `SUPABASE_SERVICE_ROLE_KEY` mising |
| Portal "Betreuungskräfte werden geladen..." nieskończenie | DevTools Network → szukaj `mamamia-proxy` calls. Jeśli 401 — session cookie nie ustawił się (sprawdź czy onboard-to-mamamia odpowiedział 200). |
| Vitest pada na `Cannot find module '../../lib/mamamia/mappers'` | `npm install` w roocie |
| TypeScript errors w `project 3/` | Zignoruj — pre-existing (Next.js typing). Tylko `src/` musi być clean. |
| `git push` "permission denied" | Sprawdź czy Michał dodał cię jako collaborator do `WilfulGrey/CAapp`. SSH key też musi być wgrany do GitHub. |

---

**Cel onboardingu: po przejściu tego pliku robisz pierwszego PR-a w ciągu 1h.** Jak utknąłeś na którymś kroku >15 min — pinguj Michała, nie męcz się solo.
