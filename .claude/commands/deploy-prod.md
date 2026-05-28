# /deploy-prod

Promote the current trunk commit from STAGING to PROD. The detailed
procedure (preconditions, steps 1–8, failure handling, env vars
expected, migration safety reminder) lives in:

**`.claude/skills/deploy-prod/SKILL.md`**

Read that file in full and execute the procedure from it. Two reasons
the source of truth lives there:

1. `.claude/skills/` is the modern Claude Code skill location and lets
   the model auto-invoke when appropriate. This `.claude/commands/`
   file is the explicit user-typed entry point (`/deploy-prod` works
   regardless of model heuristics).
2. Single source of truth — both `/deploy-prod` (user-typed) and the
   Skill-tool invocation read the same procedure. No drift.

Before doing anything: open `.claude/skills/deploy-prod/SKILL.md`,
follow ALL the preconditions and steps in order, and ask user to
confirm at step 2 before touching prod.
