# Recomp: personal fitness tracker

@AGENTS.md

Web app + Telegram bot for body recomposition, used by a few people with separate accounts. Each user logs weight, food
(kcal + protein), lifts on training days and cardio; everything else is derived. **Design principle: minimise daily tracking
time.** Every feature must reduce friction, or it doesn't ship. Telegram covers most days. Confirm by exception (one tap = same
as last time). Details live in [docs/product.md](docs/product.md).

## Docs: read before changing, update after
One short doc per area in `docs/`, each ending with the files it covers. **Read only the doc(s) for the area you're touching**,
then open the files in its Files table. Don't explore the whole repo, and don't read all of `docs/`.

| Area | Doc |
|---|---|
| goals, targets per goal, owner seed values, non-goals | `docs/product.md` |
| layout, shared modules, client/server boundary | `docs/architecture.md` |
| tables, views, migrations | `docs/data-model.md` |
| accounts, sign-in, scoping rule, onboarding, verdicts per goal, owner-only values | `docs/users.md` |
| Today / Train / Cardio / Trends / Settings + onboarding / Telegram bot | `docs/features/<today|train|cardio|trends|settings-onboarding|telegram-bot>.md` · ladders, Day A/B/C, the finisher: `docs/home-program.md` |
| reminders, `/api/tick`, `getDayState` | `docs/rules-engine.md` |
| env, deploy order for migrations, webhook, tick, adding/removing a person, backups | `docs/operations.md` |
| `pnpm test`, PGlite | `docs/testing.md` · broken things: `docs/troubleshooting.md` · Diagnostics, `diag`, diag_events: `docs/diagnostics.md` · tokens, type, icons, motion, copy, the workout card: `docs/design.md` |

**Every step, before its commit:** update the docs it touches (Files tables included), `README.md` when setup, scripts,
operations or troubleshooting changed, and `CHANGELOG.md` under `## Unreleased` for anything user-visible. Code and docs land
in the same commit. Touch this file only if a convention, hard rule or the build order changed; keep it under ~80 lines.

## Users (the rule that must never be broken)
- `users` + `user_id` on every per-person table; `settings` is one row per user (PK user_id); `exercises.user_id` null = shared library.
- App code reaches the db only through `forUser(userId)` (`src/lib/db/scope.ts`), filtering with `own()` / `visible()` and stamping
  inserts. ESLint forbids `@/db` imports elsewhere (exceptions: `src/lib/users.ts` for sign-in / chat / admin; `src/lib/diag/` for events).
  Every lib function that queries takes `userId: UserId` first. Server actions get it from `requireUser()`, never from the client.
- `ALLOWED_EMAILS` (comma-separated, case-insensitive; old `ALLOWED_EMAIL` ok) is the only authority, re-checked on every request;
  a `users` row grants nothing. **First entry = owner/admin** and claims the placeholder owner row from migration 0007.
- Targets per goal in `src/lib/targets.ts` (recomp −225 / fat_loss −500 with floors / muscle_gain +250; protein by g/kg).
  Written once at onboarding; never recompute an existing user's stored numbers. Owner-only columns (phases, budgets, navel
  goal, checkpoint dates) are null for everyone else and the features that need them stay hidden.

## Stack (don't deviate without asking)
Next.js 16 App Router + TypeScript strict + Tailwind v4, `src/` layout, PWA · Neon Postgres via `@neondatabase/serverless`
+ Drizzle (drizzle-kit migrations) · Auth.js v5 Google, allowlisted to `ALLOWED_EMAILS` · grammY webhook at `/api/telegram` ·
`/api/tick` scheduler (`runTick`) pinged every 15 min by cron-job.org · Gemini flash-lite (`@google/genai`, JSON-schema output, must
degrade gracefully) · Vercel Hobby · all rules in `Asia/Kolkata` (store UTC, compute IST) · PGlite for tests only.

## Conventions
- pnpm. zod for every input. Server Actions for app mutations; route handlers only for `/api/telegram`, `/api/tick`, `/api/export/[table]`.
- `getDayState()` in `src/lib/rules/dayState.ts` is the ONE source for "state of today". Never duplicate that logic.
- Derived metrics in `src/lib/metrics/`. Shared writes (app + bot) in `src/lib/{food,training,daily,measurements,activities}.ts`.
  Client components never import anything that reaches `@/db`.
- Mobile-first, large tap targets, one-handed. Tailwind only, no UI kits; lucide icons via `components/icons.tsx`; SVG `line-chart.tsx`, no chart library.
- **Design** (`docs/design.md`): numbers are the hero; one accent for the next action and progress, `done` for anything completed; a card
  only where it groups; sentence case, plain verbs, no middle-dot meta, no arrows; 150 ms `motion-safe:` transitions on things that
  answer a tap, `.celebrate` the only unprompted motion. Match the surrounding idiom.

## Hard rules
- **Secrets:** they live in `.env` (not `.env.local`). Never print, cat, echo, log or quote `.env` or any env var value
  (terminal, commits, comments, errors, summaries). To check one, report only `NAME: set` / `not set`.
- **Never add `crons` to vercel.json** (Hobby cron is daily-only; cron-job.org drives `/api/tick`). Never auto-apply a target change; only suggest it.
- `AGENTS.md` is regenerated by `next dev`, so never edit it. For Next 16 APIs, read only the guide you need in `node_modules/next/dist/docs/`.
- Tailwind v4 is CSS-first (`src/app/globals.css`). Don't create a tailwind.config. `cacheComponents` stays OFF. There is no proxy.ts: the auth gate is `src/app/(app)/layout.tsx`. Root `auth.ts` is imported as `@/auth`.
- Migrations that change defaults must also `UPDATE` existing `settings` rows when current users' values should change.
- Production data is real: schema changes are additive only (new tables, nullable/defaulted columns, type relaxations; no drops
  or renames). Generate migrations and data scripts (with a `:dry` mode), but never run them or set the webhook; the owner does.
- Standalone scripts that import `src/db` need `node --conditions=react-server` (the db module imports `server-only`).

## Checks
```bash
pnpm exec next typegen && pnpm exec tsc --noEmit   # typegen first, or tsc fails on PageProps/LayoutProps
pnpm lint         # includes the @/db import rule
pnpm build        # when routes, config or server/client boundaries change
pnpm test         # migrations + two-user isolation on PGlite; no DATABASE_URL needed
```
Screens sit behind Google login, so say so when a UI change wasn't seen running.

## Build order
10–11. **Multi-user**, **Home program** — done (accounts, scoping, one bot, per-user export, People; ladders, Day A/B/C, the finisher).
12. **Exercise suggestions** — suggest swaps/additions per muscle group from the library (stalls, missing groups).

## Context hygiene (save tokens)
- Start from the doc's Files table; `grep -n` for a symbol rather than reading whole files (`schema.ts`, `metrics/trends.ts` are long).
- Don't read `node_modules`, `.next`, `drizzle/meta`, `pnpm-lock.yaml` or `public/icons`. Delegate broad searches to a subagent.
