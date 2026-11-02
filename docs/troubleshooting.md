# Troubleshooting

**Start with Settings → Diagnostics → Copy** and read (or send) that text: build, env by name, database, webhook, the
last tick, the person's link state, today's DayState and the last events are all in it ([diagnostics.md](diagnostics.md)
says what each line means). In Telegram, `diag` gives the five-line version. Then use the entries below. The short table
is in the [README](../README.md#troubleshooting).

## The bot never answers
- `pnpm bot:webhook-info`. The URL must be `https://<app>/api/telegram`; "pending updates" growing means deliveries fail;
  "last error" shows Telegram's view (e.g. `Wrong response from the webhook: 401 Unauthorized`).
- 401 → secret mismatch (next entry). No webhook → `pnpm bot:set-webhook https://<app>`.
- Webhook fine but silence for one person → their chat isn't linked: Settings → Telegram shows the code; they send
  `/start <code>`. An unlinked chat gets no reply at all, by design. Settings → People (admin) shows "no chat".
- Linked and still silent → Vercel logs for `telegram handler failed: <ErrorClass>: <message>` (no bodies). A Neon outage
  or quota looks like a connection error here.

## `/api/telegram` or `/api/tick` returns 401
- Telegram: `TELEGRAM_WEBHOOK_SECRET` in Vercel differs from the secret registered with `bot:set-webhook`. Re-run
  `pnpm bot:set-webhook <url>` with `.env` holding the same value as Vercel; see "Rotating the secret" in
  [operations.md](operations.md).
- Tick: cron-job.org's custom header `x-tick-secret` differs from `TICK_SECRET`, or the header isn't set at all.
  Both routes return 401 without touching anything.

## No morning brief / a reminder didn't arrive
1. cron-job.org → job history: is it running every 15 min and getting 200? Failed runs with timeouts: raise the job timeout.
2. `TICK_URL=https://<app> pnpm tick:dry`: the response lists each user with a reason per rule — `not_linked` (link the
   chat), `disabled` (Settings → Telegram reminders), `quiet_hours` (22:30–07:00 by default), `outside_window`,
   `already_sent` (one per rule per IST day), `daily_cap` (default 4), `condition_false` (e.g. the measure prompt only fires
   when nothing was measured this week).
3. Owner-only rules (`phase_switch`, `checkpoint_card`, `budget_80`) never fire for users without those dates/budgets.
4. `pnpm tick force=morning_brief` sends it now (to every linked user; it's logged, so the normal one won't repeat today).
5. One person only, and Settings → People shows **blocked**: they blocked the bot, a send got 403 and the tick now skips
   them (`listLinkedUsers` leaves them out, so `tick:dry` doesn't list them either). Their next message to the bot
   (Restart sends `/start`) clears it. Any other failed send shows in the tick response as that user's `ok: false` with the
   error class; the other users are unaffected.

## Sign-in loops back to onboarding
`users.onboarded_at` is null for that email. Normal for a new person. If they already finished the form (a `settings` row
exists), `markOnboarded` didn't run; set `onboarded_at = now()` on their users row in the Neon SQL editor. A user without a
settings row who lands on `/onboarding/confirm` is redirected back to the form.

## "That Google account isn't allowed"
- The app's message: the email isn't in `ALLOWED_EMAILS` (watch spelling, spaces and an un-redeployed env change). An
  existing users row doesn't help: the list is the authority. Someone signed in when they were removed is dropped on their
  next request (the jwt callback re-checks the list) and lands on `/login` with this message.
- A Google-branded error instead ("access blocked / app not verified / not a test user"): the OAuth consent screen is in
  Testing and the person isn't listed as a test user. Add them.
- Empty `ALLOWED_EMAILS` refuses everyone on purpose.

## The owner signs in and sees an empty app
The placeholder owner wasn't claimed: `ensureUser` only hands the `owner@recomp.local` row to the **first** `ALLOWED_EMAILS`
entry. The owner now has a fresh empty row. Fix the order, then in SQL: delete the empty row (`delete from users where
email = '<owner>'` — it has no data yet) and `update users set email = '<owner>' where email = 'owner@recomp.local'`.
Sign in again.

## A removed person can still use the bot
Expected: dropping the email from `ALLOWED_EMAILS` ends app access only. `pnpm remove-user <email>` unlinks the chat and
deletes their data; until then their linked chat keeps working.

## A food, type or session is "not found" that clearly exists
It belongs to another user (ids are global, rows are per user), or the request came with a stale optimistic id (negative
ids are pending rows). Reload. Cross-user access is refused as "not found" by design.

## "A food with that name already exists"
Unique per user on `lower(name)`. Archive or rename the existing one (Settings → Foods shows archived rows at the end).

## Diagnostics says "migrations pending"
The System section's first line (`N migrations pending — run pnpm db:migrate`, or `migrations table missing`) means the
deployed code is newer than the database: a column or table the code expects isn't there yet, so some screens, bot
commands or the tick fail with `relation … does not exist` / `column … does not exist`, and other Diagnostics sections
show that as their error line while the rest still render. Fix: Neon branch → `pnpm db:migrate` against production
(see the deploy order in [operations.md](operations.md#deploying-a-schema-change-migration)). The bot's `diag` shows the
same warning on its db line.

## Migration failed half-way
drizzle-kit runs each migration's statements in order and records it only at the end, so a failure leaves the schema
partly changed. Restore the Neon branch (or point-in-time restore) taken before `pnpm db:migrate`, fix the SQL, re-run.
0007 is written to be re-runnable (`IF NOT EXISTS`, guarded backfill), so after a restore it can simply run again.
Check the SQL against PGlite first: `pnpm test` runs every migration.

## Gemini never parses free text
`GEMINI_API_KEY` set in Vercel? Free-tier RPM / daily cap reached? Model retired (`GEMINI_MODEL` override)? Every failure,
including a 15 s timeout or malformed JSON, yields "couldn't parse that — try `paneer 150` style". Exact commands and
`<name> <kcal> <protein>` entries don't use Gemini at all.

## Everything is slow for the first request, then fine
Neon auto-suspends idle compute on the free plan; the first query after idle waits for a cold start. Nothing to fix.

## Everything errors at once
Neon compute suspended (quota) or `DATABASE_URL` changed: screens 500, bot silent, tick 500. Check the Neon console.
After a Neon password reset, update `DATABASE_URL` in Vercel and `.env`.

## Files
| File | Role |
|---|---|
| `src/app/(app)/settings/diagnostics.tsx`, `src/lib/diag/*` | Settings → Diagnostics and the bot's `diag` |
| `scripts/bot-webhook.ts`, `scripts/tick.ts` | The two command-line diagnostics |
| `src/lib/telegram/bot.ts` | The gate (`userIdByChat`, `linkChatByCode`) and `bot.catch` logging |
| `src/lib/rules/engine.ts`, `src/app/api/tick/route.ts` | Skip reasons; per-user try/catch and the blocked mark |
| `src/lib/users.ts` | `isAllowedEmail`, `ensureUser` claim logic, blocked flag |
| `auth.ts`, `src/app/login/page.tsx` | Allowlist and the sign-in error text |
