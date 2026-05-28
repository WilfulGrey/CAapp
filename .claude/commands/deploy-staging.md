# /deploy-staging

Manually push the current trunk to STAGING (migrations + edge fns +
verify Render auto-build + smoke). Full procedure (preconditions,
steps 1–6, failure handling, env vars expected) lives in:

**`.claude/skills/deploy-staging/SKILL.md`**

Read that file in full and execute the procedure from it. This
`.claude/commands/` file is the user-typed entry point — Claude Code
discovers `/deploy-staging` directly from this folder, regardless of
whether the parallel `.claude/skills/` definition fires via auto-invoke.

Note: CI normally handles staging deploys automatically on push to
trunk. This skill is the manual fallback for CI flakes (esm.sh 522,
Render build timeout) or when you want to re-run edge-fn deploy
without a new commit.
