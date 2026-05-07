<!--
  Template PR-a — wypełnij sekcje poniżej. Boilerplate można usunąć.
  Pełne reguły workflow: ONBOARDING.md §5 + CLAUDE.md.
-->

## Summary

<!-- 2-3 bullets WHAT się zmienia. Kod sam mówi co — ten opis ma dać reviewerowi 30-sekundowy overview. -->

-
-

## Why

<!-- Bug numer / link do issue / cytat z user-feedback / observed-vs-expected.
     Jeśli refactor — krótkie uzasadnienie czemu teraz, nie później. -->

## Test plan

- [ ] `npx vitest run` — frontend tests pass (146+ baseline)
- [ ] (jeśli dotyczy) `cd supabase/functions/onboard-to-mamamia && deno task test` — onboard tests pass (133+)
- [ ] (jeśli dotyczy) `cd supabase/functions/mamamia-proxy && deno task test` — proxy tests pass (31+)
- [ ] (jeśli dotyczy) `npx tsc --noEmit -p tsconfig.build.json` — clean build
- [ ] (jeśli dotyczy Mamamia integration) e2e curl recipe na becie przeszedł — patrz CLAUDE.md sekcja "E2e verification recipe"
- [ ] manual smoke local (jeśli zmiana dotyka UI) — kroki:
  -

## Documentation updates

<!-- Święta zasada nr 2 z CLAUDE.md — docs muszą żyć z kodem.
     Sprawdź tabelę w sekcji "Pliki które MUSZĄ być w sync z kodem".
     Zaznacz wszystkie które dotyczą tego PR-a. -->

- [ ] CLAUDE.md — Mamamia gotchas / Anti-patterns / Recent bug fixes registry
- [ ] CLAUDE.md — Field mapping reference (gdy ruszałeś PatientForm / mappers)
- [ ] CLAUDE.md — Kluczowe pliki (gdy dodajesz/usuwasz Edge Function)
- [ ] docs/customer-portal-flow.md (gdy zmieniasz lead lifecycle / mapping)
- [ ] N/A — żaden z punktów powyżej nie dotyczy

## Screenshots / logs

<!-- Opcjonalnie. Dla UI zmian — before/after. Dla bugfix — error przed + naprawiona ścieżka po. -->

---

🤖 Generated with [Claude Code](https://claude.com/claude-code) (jeśli dotyczy)
