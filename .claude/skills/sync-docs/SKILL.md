---
name: sync-docs
description: After finishing a feature or fix in this repo, map the changed files to their docs/ pages, update those docs and CHANGELOG.md, run the checks. Use when the user says "update docs", "sync docs", "finish up", or before committing a feature.
---

# Sync docs with the change

Keep this cheap: work from the diff, not from re-reading the repo.

1. `git status --short` and `git diff --stat HEAD` (plus `git diff --stat main...HEAD` on a branch) → list the changed source files.
2. Map each changed path to its doc. Open only the docs that are hit:
   | Changed path | Doc |
   |---|---|
   | `src/app/(app)/today/**`, `src/lib/food.ts` | `docs/features/today.md` |
   | `src/app/(app)/train/**`, `src/lib/training.ts`, `src/lib/metrics/strength.ts` | `docs/features/train.md` |
   | `src/app/(app)/trends/**`, `src/lib/metrics/{trends,checkpoint,spend}.ts`, `src/components/charts/**` | `docs/features/trends.md` |
   | `src/app/(app)/settings/**`, `src/app/onboarding/**`, `src/app/login/**`, `auth.ts` | `docs/features/settings-onboarding.md` |
   | `src/lib/telegram/**`, `src/app/api/telegram/**` | `docs/features/telegram-bot.md` |
   | `src/lib/rules/**`, `src/app/api/tick/**`, `src/lib/nudges.ts` | `docs/rules-engine.md` |
   | `src/db/schema.ts`, `drizzle/*.sql`, `scripts/seed.ts` | `docs/data-model.md` (+ `docs/product.md` for seed/targets) |
   | new top-level module, moved responsibility, client/server boundary | `docs/architecture.md` |
   | `package.json` scripts, `.env.example`, deploy/config | `docs/operations.md` |
3. Read the relevant hunks (`git diff HEAD -- <path>`), then edit each doc so it describes the **current** behaviour:
   what the owner sees, behaviour rules, and the Files table. Remove anything that's no longer true. No history in docs.
4. If it's user-visible, add bullets under `## Unreleased` in `CHANGELOG.md` (Added / Changed / Fixed / Removed), in plain words.
5. Edit `CLAUDE.md` only if a convention or hard rule changed.
6. Run `pnpm exec next typegen && pnpm exec tsc --noEmit` and `pnpm lint`. Report the results, and say which docs you updated
   and which mapped docs needed no change.
