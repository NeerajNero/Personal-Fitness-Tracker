# Architecture

Read this before adding a module, a route, or anything shared between the app and the bot.

## Shape
```
Browser (PWA) ──► Next.js App Router on Vercel ──► Neon Postgres (Drizzle)
Telegram ──webhook──► /api/telegram (grammY) ──┘        ▲
cron-job.org ──every 15 min──► /api/tick (rules engine) ┘──► Telegram sendMessage
Bot free text ──► Gemini flash-lite (structured JSON) ──► confirm ✓ in chat
```
A few users, each fully isolated by `user_id`. Everything is computed in IST (`Asia/Kolkata`). Timestamps are stored in UTC, and `date` columns hold IST calendar dates.

## Directory map
| Path | What lives there |
|---|---|
| `auth.ts` | Auth.js v5, Google provider, allowlist `ALLOWED_EMAILS` (or an existing users row; fails closed). Creates the users row on first sign-in and puts the user id in the JWT. Imported as `@/auth` |
| `src/lib/db/scope.ts` | `forUser(userId)`: the only door to the db from app code (`own`, `visible`, `stamp`, `uid`). `UserId` is a branded type |
| `src/lib/users.ts` | The users table and the only cross-user queries: `isAllowedEmail`, `ensureUser`, chat id → user, link by code, blocked flag, linked users for the tick, People |
| `src/lib/session.ts` | `requireSession()` / `requireUser()` (the user id from the JWT) |
| `src/lib/targets.ts`, `src/lib/library.ts` | Client-safe: targets per goal (Mifflin-St Jeor), the shared exercise library + gym starter types |
| `src/app/(app)/` | Gated screens: `today/`, `train/`, `trends/`, `settings/`. Each has `page.tsx` + client components + `actions.ts` (Server Actions) |
| `src/app/(app)/layout.tsx` | **The auth + onboarding gate** (`users.onboarded_at`; there is no proxy.ts) and the tab bar |
| `src/app/onboarding/`, `src/app/login/` | First-run flow and sign-in (outside the gate) |
| `src/app/api/telegram` | Bot webhook (checks `x-telegram-bot-api-secret-token`) |
| `src/app/api/tick` | Scheduler entry (checks `x-tick-secret`); `?dry=1`, `?force=<key>` → `src/lib/rules/tick.ts` `runTick` |
| `src/app/api/export/[table]` | Session-gated CSV download of the signed-in user's rows (`src/lib/export.ts`); `settings` and `users` are excluded |
| `src/db/schema.ts` | Drizzle schema (all tables + types). `src/db/index.ts` = client |
| `src/lib/rules/` | "State of today" (`dayState.ts`) + nudge engine. See [rules-engine.md](rules-engine.md) |
| `src/lib/metrics/` | Derived numbers: `phase.ts` (targets), `trends.ts`, `strength.ts`, `spend.ts`, `checkpoint.ts` |
| `src/lib/telegram/` | `bot.ts` (handlers), `parse.ts` (commands, pure), `ops.ts` (command actions), `messages.ts` (templates), `ai.ts` (Gemini), `send.ts` |
| `src/lib/diag/` | Diagnostics: `events.ts` (diag_events; raw db, ESLint exception), `system.ts` (admin probes), `me.ts`, `bot.ts` (`diag`), `text.ts` + `client-log.ts` (client-safe), `report.ts` (server-action error boundary). See [diagnostics.md](diagnostics.md) |
| `src/lib/food.ts`, `training.ts`, `activities.ts` (cardio), `daily.ts`, `measurements.ts` | **Shared writes** used by both the screens and the bot (`setDayPlan` decides what a day is); all take `userId` first |
| `src/lib/export.ts` | Per-user CSV builder used by the export route |
| `public/sw.js`, `public/manifest.webmanifest` | Network-only service worker (installability only; answers a version message) and the PWA manifest |
| `src/components/client-log.tsx` | Captures `console.error` / unhandled rejections in memory for Diagnostics (root layout) |
| `src/components/day-picker.tsx` + `src/app/(app)/day-actions.ts` | "What's today?" picker shared by Today and Train |
| `src/lib/dates.ts` | IST helpers: `todayIST`, `nowTimeIST`, `addDays`, `istNow`, quiet-hours math |
| `src/components/` | `tab-bar`, `date-header`, `day-picker`, `charts/line-chart.tsx` (hand-written SVG; no chart library) |
| `scripts/` | `seed.ts` (shared exercise library only), `remove-user.ts` (delete a person, `:dry`), `backup.ts` (JSON dump of every table, `--full` keeps chat ids), `choose-your-day.ts` (one-off data step), `bot-webhook.ts`, `tick.ts`, `gen-icons.ts` (PWA icons, one-off) |
| `drizzle/` | SQL migrations (0001 = views, 0007 = multi-user; both hand-written; 0008–0009 generated then made re-runnable) |
| `tests/` | `multi-user.test.ts`: migrations + two-user isolation on PGlite (`pnpm test`) |

## Rules that keep it coherent
- **Every query is scoped to a user.** App code imports `forUser(userId)` from `src/lib/db/scope.ts` and filters with
  `own(table, …)` (or `visible()` for exercises); inserts go through `stamp()`. ESLint blocks `@/db` imports anywhere else.
  Every lib function that reads or writes takes `userId: UserId` first; server actions get it from `requireUser()`.
- **One source for "today":** `getDayState(userId, date)` in `src/lib/rules/dayState.ts`. The Today card, the bot's `today`
  command and every nudge read it. Never recompute remaining kcal/protein, training-day status, etc. anywhere else.
- **One write path:** the screens and the bot call the same functions (`insertFoodEntries`, `entryFromFood`, `saveMeal`,
  `copyFoodLog`, `setDayPlan`, `copyLastSets`, `upsertDailyMetrics`, `upsertMeasurementByDate`). Add new writes there,
  not inside a route or a component.
- **Metrics:** loaders fetch the data, and the `*From` helpers are pure, so a page can load each dataset once and derive everything from it.
- **Client/server boundary:** client components must not import anything that imports `@/db`. Client-safe modules:
  `lib/format.ts` (incl. `MEAL_SERVING`), `lib/cardio.ts` (cardio config, validation, summaries), `lib/metrics/phase.ts`, `lib/routine.ts`, `lib/nudges.ts`, `lib/export-tables.ts`, `lib/targets.ts`, `lib/library.ts`, `lib/diag/text.ts`, `lib/diag/client-log.ts`.
  (A db import that leaked into the client bundle was fixed in `f731e7d`, so keep it that way.)
- **Mutations:** Server Actions return `ActionResult` (`src/lib/action-result.ts`). Each one calls `requireUser()`,
  validates its input with zod, and calls `revalidatePath` on the screens it affects. A foreign id is simply "not found". Route handlers exist only for telegram, tick and export.
- **Optimistic UI:** lists use `useOptimistic` with negative temp ids, and rows with an id < 0 render as pending.
- **Dates in URLs:** Today and Train take `?d=YYYY-MM-DD` (past days only) for back-filling.

## Framework notes (Next 16)
- Turbopack always. `cacheComponents` is OFF on purpose, because every screen is per-request (auth + db).
- Tailwind v4 CSS-first (`src/app/globals.css` `@theme`). There is no tailwind.config.
- `AGENTS.md` is regenerated by `next dev` and says to read `node_modules/next/dist/docs/` for any API you're unsure of.
  Read only the specific guide you need, not the whole folder.
- PWA: `public/manifest.webmanifest`, `public/sw.js` (network-only), registered by `components/sw-register.tsx`.
