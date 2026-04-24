# CAapp — Project rules for Claude

## 🩸 Święta zasada nr 1: NO DUMB DATA, NO SOFT FALLBACKS

**Albo coś działa, albo nie.** Nie oszukujemy się sami hardkodowanymi
stub-danymi, demo modami, fixture fallbackami w środku produkcyjnego kodu,
ani mockami które „wyglądają jak działający portal" gdy realny backend leży.

### Zakazane

- Hardcodowane listy (nurses, applications, matchings, customers, offers,
  itd.) jako **fallback** gdy real data nie przychodzi — inicjalny `useState`,
  `?? MOCK_X`, `|| FAKE_Y`, `catch { return SEED }`.
- Komponenty które renderują „coś" z dumb-data gdy hook zwraca pustkę /
  błąd / `ready=false`. Milczący fallback = bug-masker.
- Pliki typu `src/data/*.ts` z seedami które trafiają do bundla produkcyjnego.
- Demo mode z hardkodem. Demo = real backend z test-accountem, nie inline
  fixture.
- Testowe fixtury w `test/` i `supabase/functions/*/_tests/` SĄ OK — one
  izolują test. Ale NIE importowane z `src/` do runtime'u.

### Wymagane

- Real backend or visible failure. Jeśli Mamamia nie odpowiada, pokazujemy
  błąd (toast / banner / error screen), **nie** mocka.
- Loading states dopóki real data leci. `null` / `[]` / empty state są
  dozwolone, ale tylko gdy to **prawdziwy stan** (brak aplikacji = pusta
  sekcja, nie 3 fake Anny).
- Error states gdy hook zwraca `error`. Widoczne dla usera.
- Feature flag typu `VITE_USE_MAMAMIA=0` (jeśli w ogóle) wyłącza FEATURE,
  nie zastępuje realnych danych fake'ami.

### Dlaczego to ma znaczenie

Soft fallback zamienia ewidentny bug w ciche kłamstwo. Portal pokazał
„Anna K. · Marta W. · 3 Bewerbungen aktiv!" gdy faktyczne `listApplications`
zwracało `[]` — bug z `SameSite=Lax` cookie był niewidoczny, bo demo
data udawała produkcję. To godziny debugowania które nie powinny się
wydarzyć.

Naruszenie tej zasady = regression. Review + rewrite.

---

## Stack

- React 18 + TypeScript 5 + Vite 5 + Tailwind 3
- Supabase (PostgreSQL + Edge Functions Deno 2.7)
- Mamamia GraphQL BFF przez Edge Functions (agency token server-side only)
- Vitest 3 + RTL + MSW (jsdom) dla frontend testów
- `deno task test` dla Edge Function testów

## Testing paradigm

- TDD (red/green/refactor) dla logiki: mappers, hooks, Edge Functions
- Integration tests (RTL+MSW w jsdom) dla golden paths
- NIE piszemy smoke testów które duplikują integration coverage

## Commit convention

- `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `docs:`
- Zawsze `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`
