# Recomp: personal fitness tracker

@AGENTS.md

Web app + Telegram bot for a 1-year body recomposition (Oct 2026 → Oct 2027), now with accounts for a few people.
Each user logs weight, food (kcal + protein), lifts on training days, and navel/waist weekly. Everything else is derived.
**Design principle: minimise daily tracking time.** Every feature must reduce friction, or it doesn't ship. Telegram covers
most days. Confirm by exception (one tap = same as last time). Details live in [docs/product.md](docs/product.md).

## Docs: read before changing, update after
Detailed specs live in `docs/`, one short doc per area. **Read only the doc(s) for the area you're touching**, then
open the files listed in that doc's Files table. Don't explore the whole repo, and don't read all of `docs/`.

| Area | Doc |
|---|---|
| goals, targets, verdict rules, seed data, non-goals | `docs/product.md` |
| layout, shared modules, client/server boundary | `docs/architecture.md` |
| tables, views, migrations | `docs/data-model.md` |
| Today / Train / Cardio / Trends / Settings + onboarding / Telegram bot | `docs/features/<today|train|cardio|trends|settings-onboarding|telegram-bot>.md` |
| reminders, `/api/tick`, `getDayState` | `docs/rules-engine.md` |
| env, checks, deploy, webhook, cron | `docs/operations.md` |

**When you finish a feature or change:**
1. Update the matching doc(s) so they describe the new current behaviour (UX, rules, Files table).
2. Add a line under `## Unreleased` in `CHANGELOG.md` for anything user-visible (Added / Changed / Fixed / Removed).
3. Touch this file only if a convention or hard rule changed. Keep it short, because it loads into every session.
4. Run the checks (below), then commit code + docs together.

## Users
- **Model:** `users` (uuid, email, is_admin, onboarded_at) + `user_id` on every per-person table; `settings` is one row per user
  (PK user_id). `exercises.user_id` null = shared library, set = that user's custom exercise. See `docs/data-model.md`.
- **Scoping rule:** app code reaches the db only through `forUser(userId)` (`src/lib/db/scope.ts`); ESLint forbids importing
  `@/db` elsewhere (exceptions: `src/lib/users.ts` for sign-in / bot-chat / admin lookups). Every function in `src/lib/`
  that queries takes `userId: UserId` first. Server actions get it from `requireUser()` (the JWT), never from the client.
- **Email list:** `ALLOWED_EMAILS` (comma-separated, case-insensitive; the old `ALLOWED_EMAIL` still works). The **first
  entry is the owner**: it claims the placeholder owner row that migration 0007 gives the pre-existing data, and is admin.
  Anyone else on the list gets a fresh account on first sign-in; existing users stay allowed if removed from the list.
- **Targets per goal** (`src/lib/targets.ts`, Mifflin-St Jeor × activity factor from days/week): recomp = maintenance − 225,
  protein 1.8–2.0 g/kg · fat_loss = maintenance − 500 (floor 1,400 kcal female / 1,600 male), protein 2.0–2.2 g/kg, rate target
  0.5–1.0 %/week · muscle_gain = maintenance + 250, protein 1.8–2.0 g/kg. Onboarding writes them once; never recompute an
  existing user's stored numbers. Owner-only columns (phases, budgets, navel goal, checkpoint dates) are null for everyone else
  and the features that need them stay hidden.

## Stack (don't deviate without asking)
Next.js 16 App Router + TypeScript strict + Tailwind v4, `src/` layout, PWA · Neon Postgres via `@neondatabase/serverless`
+ Drizzle (drizzle-kit migrations) · Auth.js v5 Google, allowlisted to `ALLOWED_EMAILS` · grammY webhook at `/api/telegram` ·
`/api/tick` scheduler pinged every 15 min by cron-job.org · Gemini flash-lite (`@google/genai`, JSON-schema output, must
degrade gracefully) · Vercel Hobby · all rules in `Asia/Kolkata` (store UTC, compute IST).

## Conventions
- pnpm. zod for every input (forms, bot messages, API bodies).
- Server Actions for app mutations. Route handlers only for `/api/telegram`, `/api/tick`, `/api/export/[table]`.
- `getDayState()` in `src/lib/rules/dayState.ts` is the ONE source for "state of today". Never duplicate that logic.
- Derived metrics live in `src/lib/metrics/`. Shared writes (used by both app and bot) live in `src/lib/{food,training,daily,measurements,activities}.ts`.
- Cross-user queries (sign-in, chat id → user, the tick's user list, admin People) live only in `src/lib/users.ts`.
- Client components never import anything that reaches `@/db`.
- Mobile-first, large tap targets, one-handed. No UI kits, Tailwind only. No chart library (SVG `line-chart.tsx`). Minimal dependencies.
- Match the surrounding code's comment density and idiom. Commit after each step with a clear message.

## Hard rules
- **Secrets:** they live in `.env` (not `.env.local`). Never print, cat, echo, log or quote `.env` or any env var value
  (terminal, commits, comments, errors, summaries). To check one, report only `NAME: set` / `not set`.
- **Never add `crons` to vercel.json.** Hobby cron is daily-only, so cron-job.org drives `/api/tick`.
- Never auto-apply a target change. Only suggest it.
- `AGENTS.md` is regenerated by `next dev`, so never edit it. For Next 16 APIs, read only the specific guide in
  `node_modules/next/dist/docs/` that you need.
- Tailwind v4 is CSS-first (`src/app/globals.css`). Don't create a tailwind.config.
- `cacheComponents` stays OFF. There is no proxy.ts: the auth gate is `src/app/(app)/layout.tsx`. Root `auth.ts` is imported as `@/auth`.
- Migrations that change defaults must also `UPDATE` the existing `settings` rows when current users' values should change.
- Production data is real: schema changes are additive only (new tables, nullable/defaulted columns, type relaxations; no drops
  or renames). Generate migrations and data scripts (with a `:dry` mode), but never run them or set the webhook; the owner does.
- Standalone scripts that import `src/db` need `node --conditions=react-server` (the db module imports `server-only`).

## Checks
```bash
pnpm exec next typegen && pnpm exec tsc --noEmit   # typegen first, or tsc fails on PageProps/LayoutProps
pnpm lint
pnpm build        # when routes, config or server/client boundaries change
pnpm test         # tests/multi-user.test.ts: migrations + two-user isolation on PGlite (in-memory Postgres), no DATABASE_URL needed
```
Screens sit behind Google login, so say so when a UI change wasn't seen running.

## Context hygiene (save tokens)
- Start from the doc's Files table. Use `grep -n` for a symbol rather than reading whole files. `src/db/schema.ts` and
  `src/lib/metrics/trends.ts` are long, so read only the table or function you need.
- Don't read `node_modules`, `.next`, `drizzle/meta`, `pnpm-lock.yaml` or `public/icons`.
- For broad, multi-area investigations, delegate the search to a subagent and keep only its conclusions.
