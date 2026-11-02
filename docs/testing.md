# Testing

One test file, no mocks: `pnpm test` runs `tests/multi-user.test.ts` (five tests) with `node --test` against **PGlite**,
a real Postgres compiled to WebAssembly that runs in memory. It needs no `DATABASE_URL` and no network.

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

## Adding a test
- Add a `test("…", async () => { … })` to `tests/multi-user.test.ts` (it shares the migrated database and the two users),
  or create `tests/<name>.test.ts` with the same preamble (PGlite → `globalThis.__recompTestDb` → `await import`), and add it
  to the `test` script in `package.json`.
- Use the lib functions, not raw SQL, for the behaviour under test; raw SQL is fine for seeding or inspecting.
- Anything that calls `auth()`, `redirect()` or `revalidatePath` (server actions, pages) isn't testable this way; test the
  lib function it calls.
- Gemini and Telegram are never called: `parseFreeText` needs `GEMINI_API_KEY` (unset in tests → null, which also writes
  a `gemini · no key` event), `sendMessage` isn't exercised (`describeSendError` is, with constructed grammY errors) and
  the bot's API calls are answered by the transformer above.
- `scripts/backup.ts` can be smoke-tested the same way: a preload module that builds a PGlite db, runs the migrations and
  sets `globalThis.__recompTestDb`, passed as a second `--import` before the script; delete `backups/` afterwards.

## Files
| File | Role |
|---|---|
| `tests/multi-user.test.ts` | The test |
| `src/db/index.ts` | The `__recompTestDb` hook |
| `package.json` → `test` | `node --conditions=react-server --import=tsx --test …` |
| `@electric-sql/pglite` | Dev dependency |
