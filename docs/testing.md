# Testing

Two test files: `pnpm test` runs `tests/multi-user.test.ts` (six tests, no mocks) and `tests/onboarding.test.ts` (three
tests, two module doubles) with `node --test` against **PGlite**, a real Postgres compiled to WebAssembly that runs in
memory. It needs no `DATABASE_URL` and no network.

## How the database is swapped
`src/db/index.ts` exports `db = globalThis.__recompTestDb ?? connect()`. The test creates a PGlite instance, wraps it with
`drizzle-orm/pglite`, assigns it to `globalThis.__recompTestDb`, and only then imports app modules with dynamic
`await import("@/…")` (static imports would run before the assignment). `node --conditions=react-server` makes the
`server-only` import a no-op, exactly like the package scripts. tsx resolves the `@/` paths from `tsconfig.json`.
PGlite returns `date`/`timestamp` columns as strings (drizzle's driver sets the parsers), so the IST date logic behaves as
on Neon.

## The migration test
Runs `drizzle/0000` … `0006` statement by statement (split on `--> statement-breakpoint`), inserts single-user rows
(settings id = 1, a food, a food-log line, a weigh-in, a library exercise and a custom one, a workout type), then runs `0007`
and everything after it, and asserts: exactly one user, `owner@recomp.local`, admin, onboarded; no NULL `user_id` left in any stamped table; the
library exercise stays shared and the custom one is owned; the owner's settings keep their values with `goal = recomp`,
`training_location = gym`, `days_per_week = 4`. It then runs 0007 again to prove it's re-runnable.

## The two-user leak test
Using the real lib functions: `ensureUser` (the first `ALLOWED_EMAILS` entry claims the placeholder owner; the second gets a
fresh non-admin row), a home fat-loss user is onboarded the way `completeOnboarding` writes settings (`computeTargets`
checked, including the 1,400 kcal floor), the owner gets Push/Pull/Legs and the home user none. Each logs a food (same name
"Paneer" on both sides), a weigh-in and a set. Assertions: Today state (`getDayState`), Trends loaders (`loadWeightSeries`,
`loadDailyTotals`, `loadMeasurements`, `loadAllHistory`), export CSVs (`exportCsv`), bot resolution (`userIdByChat`,
`linkChatByCode`, `listLinkedUsers`), pending parses (`takePending`), `getFood` / `getSessionDetail` / `setDayPlan` with
another user's ids, and the People list — each contains only the caller's rows.

## The allowlist and blocked-chat test
`isAllowedEmail` goes false the moment the email leaves `ALLOWED_EMAILS` even though `findUserByEmail` still finds the
row, and `listPeople` reports `allowed: false` (that's what `auth.ts` asks at sign-in and in the jwt callback).
`describeSendError` classifies a constructed grammY 403 as `blocked`, an `HttpError` and a plain error as not. After
`markChatBlocked`, `listLinkedUsers` leaves that chat out while `userIdByChat` still resolves it (so their next message
can clear it); `clearChatBlocked` puts them back.

## The diagnostics test
The real grammY bot (`getBot()`) with an API transformer (`bot.api.config.use`) that answers every Telegram call locally and
captures reply texts, so `bot.handleUpdate(...)` runs the gate, the handlers and the diag middleware end to end. A weigh-in
from one chat writes a `bot · command` event for that user only; `runTick({ dry: true, force: "morning_brief" })` writes a
`due` event per linked user and a system `run` event; `diag` answers five lines (seven for the admin, through the same
transformer for `getWebhookInfo`); and the admin report from `buildDiagnostics` rendered by `renderDiagText` contains
neither chat id, token nor link code while still naming env variables, the migration and the DayState block. Then a hand-
made `drizzle.__drizzle_migrations` table one entry behind the journal yields "1 migration pending — run pnpm db:migrate",
and with `diag_events` dropped the report still has every section: only People and Events carry an error line, "My rows"
and "Last tick" read `FAILED (…)` / `check failed (…)`, the copied text lists both under `## Errors` with no SQL, the bot's
`diag` still answers and a real tick still runs. 0009 is re-run to restore the table.

## The diagnostics admin-gate test
`buildDiagnostics(B)` for a non-admin yields exactly Me, the DayState block and her own events (no System, no People, no
webhook result, nobody else's events); the same call for the admin adds System, People and everyone's events.
`runTickDryAs(B)` rejects with "Admins only" and works for the admin. `diagReply` gives five lines for her without the
webhook or per-user lines, seven for the admin. The server actions are thin wrappers around these, so the gate they
exercise is the one the app uses.

## The onboarding test (`tests/onboarding.test.ts`)
Runs the **real** `completeOnboarding` server action on a fresh database with every migration. Two modules are replaced
by `tests/stubs/register.ts`, which wraps Node's CommonJS resolver (what tsx loads everything through) before any app
module is imported: `@/lib/session` → `stubs/session.ts` (the user is `globalThis.__recompTestUserId`; no Auth.js, no
request) and `next/navigation` → `stubs/navigation.ts` (`redirect` throws the same `NEXT_REDIRECT;…` error Next throws,
`unstable_rethrow` passes it through; Next's own module can't load under `--conditions=react-server`). Everything else
is the real code. The test's `submit()` turns the thrown redirect into its target.
- A home user (female, 60 kg, 160 cm, 30, fat loss, bodyweight only, 3 days, 30 min): redirect to `/onboarding/confirm`,
  the settings row (goal, location, `equipment = {none}`, days, minutes, 1,500 kcal ±25, 120–132 g protein, a link code),
  `users.onboarded_at` set, no workout types; a second submit is sent to `/today`.
- A gym user (male, recomp): Push/Pull/Legs, `equipment = {}` even though the form sent one.
- Resume: a settings row left by a failed attempt (link code, old `onboarded_at`, `users.onboarded_at` null) is updated,
  not duplicated, and the code and date are kept.
- Validation: an empty goal and a 12 kg weight return field errors, write nothing, log nothing.
- **Every `"use server"` file under `src/app` exports only functions**: each is imported and every export checked. This
  is the rule that broke the second account's onboarding (a zod schema exported next to the action; Next refuses the
  module at request time and the build doesn't notice).
- The error boundary: an `action("explode", …)` that throws rejects with the same error and leaves an
  `action · TypeError: boom 1` event with `meta.action = "explode"` for the current user (first message line only); a
  redirect leaves no event; `fail()` inside an action is reported under the action's name before the result returns.

## Adding a test
- Add a `test("…", async () => { … })` to `tests/multi-user.test.ts` (it shares the migrated database and the two users),
  or create `tests/<name>.test.ts` with the same preamble (PGlite → `globalThis.__recompTestDb` → `await import`), and add it
  to the `test` script in `package.json`.
- Use the lib functions, not raw SQL, for the behaviour under test; raw SQL is fine for seeding or inspecting.
- A server action is testable from `tests/onboarding.test.ts` (or a new file that imports `./stubs/register` first): set
  `globalThis.__recompTestUserId`, call the action, catch the redirect with `redirectTarget` from `stubs/navigation.ts`.
  Pages and anything that needs a request (`headers()`, `after()`, `auth()` itself) still aren't; test the lib function.
- Gemini and Telegram are never called: `parseFreeText` needs `GEMINI_API_KEY` (unset in tests → null, which also writes
  a `gemini · no key` event), `sendMessage` isn't exercised (`describeSendError` is, with constructed grammY errors) and
  the bot's API calls are answered by the transformer above.
- `scripts/backup.ts` can be smoke-tested the same way: a preload module that builds a PGlite db, runs the migrations and
  sets `globalThis.__recompTestDb`, passed as a second `--import` before the script; delete `backups/` afterwards.

## Files
| File | Role |
|---|---|
| `tests/multi-user.test.ts` | Migrations, isolation, allowlist, diagnostics, home program |
| `tests/onboarding.test.ts` | The real onboarding action, the `"use server"` export rule, the action error boundary |
| `tests/stubs/register.ts`, `session.ts`, `navigation.ts` | The resolver wrapper and the two doubles |
| `src/db/index.ts` | The `__recompTestDb` hook |
| `package.json` → `test` | `node --conditions=react-server --import=tsx --test tests/multi-user.test.ts tests/onboarding.test.ts` |
| `@electric-sql/pglite` | Dev dependency |
