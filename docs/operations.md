# Operations: run, migrate, deploy, people, backups

## Environment (`.env`, never `.env.local`; template in `.env.example`)
`DATABASE_URL` `AUTH_SECRET` `AUTH_GOOGLE_ID` `AUTH_GOOGLE_SECRET` `ALLOWED_EMAILS` (first entry = owner/admin; `ALLOWED_EMAIL`
still accepted) `TELEGRAM_BOT_TOKEN` `TELEGRAM_BOT_USERNAME` `TELEGRAM_WEBHOOK_SECRET` `TICK_SECRET` `GEMINI_API_KEY`
`GEMINI_MODEL` (optional) `NEXT_PUBLIC_APP_URL` · local only: `TICK_URL` (optional).

Next.js and drizzle-kit load `.env` automatically. Standalone scripts use `node --env-file=.env` (wired into the package
scripts). Scripts that import `src/db` also need `--conditions=react-server`, because `src/db/index.ts` imports `server-only`,
which throws under plain Node. **Never print `.env` or any variable's value.** To check one, report only `NAME: set` / `not set`.
The full first-time setup (Neon, Google OAuth, BotFather, Gemini, Vercel, cron-job.org) is in the [README](../README.md).

## Local
```bash
pnpm install
pnpm db:migrate        # apply drizzle/ migrations to DATABASE_URL
pnpm seed              # idempotent: the shared exercise library (gym rows + home ladders). "Create my plan" seeds a missing ladder itself; run this for changed cues or new rungs
pnpm dev               # :3000; sign-in needs the localhost redirect URI on the Google client
```

## Checks before committing
```bash
pnpm exec next typegen && pnpm exec tsc --noEmit   # typegen first: PageProps/LayoutProps live in .next/types
pnpm lint              # includes the @/db import rule
pnpm build             # when routes, config or server/client boundaries changed
pnpm test              # migrations + two-user isolation on PGlite; no DATABASE_URL needed
```
For pure logic (e.g. `parseCommand`), a throwaway `node --import=tsx` script in a scratch dir works.

## Deploying a code-only change
Push to `main`; Vercel builds and deploys. Env changes need a redeploy too.

## Deploying a schema change (migration)
The app has one database and one deployment, so there is always a window where code and schema disagree. Keep it short
and make it the safer of the two:
1. **Neon branch first.** In the Neon console, create a branch from `main` (or note the time for point-in-time restore).
   It's the only undo.
2. **`pnpm db:migrate` against production** (`DATABASE_URL` pointing at it).
3. **Push within minutes.** Vercel deploys the code that expects the new schema.

Why both windows break: between 2 and 3 the *old* code runs on the *new* schema. Additive migrations mostly keep it alive
(new nullable columns are ignored), but a new NOT NULL column without a default fails every old insert (0007's `user_id`
is one: an old-code food log line from Telegram in that window would be rejected). The other order is worse: *new* code on the *old*
schema fails every query that names a new column, so every screen and bot message errors until the migration runs. So:
migrate, then deploy immediately, and prefer migrations that are additive and defaulted.

Migrations are hand-edited when data must move (0001 views, 0007 multi-user); `pnpm db:generate` produces the DDL and the
snapshot, then edit the SQL. Keep the statement breakpoints. 0007 is re-runnable, and `pnpm test` runs it against PGlite.

## Telegram webhook
- Set / check / remove: `pnpm bot:set-webhook https://<app>` · `pnpm bot:webhook-info` · `pnpm bot:delete-webhook`.
- **Rotating the secret:** put the new `TELEGRAM_WEBHOOK_SECRET` in Vercel and redeploy, update `.env`, then re-run
  `pnpm bot:set-webhook <url>`. Until the second step Telegram still sends the old secret and the route answers 401;
  Telegram keeps retrying those updates, and `set-webhook` then drops them (`drop_pending_updates: true`), so anything sent
  in that minute is lost. Do it at a quiet hour.
- For local testing, tunnel port 3000 and set the webhook to the tunnel URL; set it back afterwards.

## Reminders by hand
`pnpm tick:dry` evaluates every linked user without sending or logging; `pnpm tick` runs it for real;
`pnpm tick force=day_close` sends one rule to **every** linked user now (still logged). Both call `TICK_URL`
(default `http://localhost:3000`); set it to the production URL to run against Vercel. The response lists per user
(first 8 chars of the id) `ok: true` with the due keys, what was sent and a skip reason per rule, or `ok: false` with the
error class and code when that user's run threw (a 403 also sets `blocked: true` and marks their chat blocked); one
user's failure never stops the others. Never message bodies, emails or chat ids.
Production is driven by cron-job.org every 15 minutes with the `x-tick-secret` header. Settings → Diagnostics shows the
last run and, for admins, **Run tick (dry)** without leaving the phone ([diagnostics.md](diagnostics.md)); cron-job.org's
job history is the next place to look when a reminder didn't arrive.

## Adding a person
1. Append the email to `ALLOWED_EMAILS` in Vercel (owner stays first) and add them as a Google test user. Redeploy.
2. They sign in → onboarding (goal, gym/home, days, minutes → targets; gym users get Push/Pull/Legs) → `/start <code>`
   to the bot (`settings.telegram_link_code`, shown on the confirm page and in Settings → Telegram).
3. Settings → People (admin) shows allowed / onboarded / linked (or `blocked`: they blocked the bot; their next message
   to it clears that).

## Removing a person
1. `pnpm backup` (or a Neon branch): the only undo.
2. Remove the email from `ALLOWED_EMAILS` and redeploy. The jwt callback re-checks the list on every request, so their
   app session ends immediately and sign-in is refused. Their linked chat still works until step 3.
3. `pnpm remove-user:dry <email>` (counts per table), then `pnpm remove-user <email>`: unlinks the chat, deletes the users
   row; every owned table cascades. Refuses admins.

## Data scripts (owner runs them)
`pnpm choose-day:dry` → review → `pnpm choose-day` (after migration 0005; scoped to the admin user since 0007): Push/Pull/Legs,
archive Upper/Lower, "no training" marks → rest days. Idempotent; prints any exercise name it couldn't match.

## Backups
There is no scheduled job; the owner runs `pnpm backup` by hand (before every migration and before `remove-user`, and
every so often). It writes `backups/recomp-<timestamp>.json` (gitignored): every public table as plain `select *` rows,
column names as in the database, tables in dependency order (users, settings, exercises, foods, …), plus `takenAt`, the
table list and what was redacted. By default `settings.telegram_chat_id` and `settings.telegram_link_code` are written as
null; `pnpm backup --full` keeps them (file name ends in `-full`) so chat links can be restored without everyone sending
`/start` again. Keep the files off git and off shared drives: they hold everyone's data. Restore = replay the file's tables
in order into an empty schema (`pnpm db:migrate` first), or restore Neon's point-in-time / branch for a whole-database
undo (short window on the free plan). The two restore sources are this file and the Neon branch; the per-user CSV export
in Settings stays for users who want their own data, and never includes `settings` or `users`.

## Files
| File | Role |
|---|---|
| `.env.example` | Every variable with a comment |
| `scripts/bot-webhook.ts`, `scripts/tick.ts` | Webhook set/info/delete; call the tick |
| `scripts/seed.ts`, `scripts/choose-your-day.ts`, `scripts/remove-user.ts`, `scripts/backup.ts` | Library seed; one-off data step; delete a person; JSON dump of every table |
| `drizzle/`, `drizzle.config.ts` | Migrations and snapshots |
| `src/app/api/tick/route.ts`, `src/app/api/telegram/route.ts`, `src/app/api/export/[table]/route.ts` | The three route handlers |
| `next.config.ts` | `NEXT_PUBLIC_BUILD_SHA` / `NEXT_PUBLIC_BUILD_TIME` (Vercel commit, build time) for Diagnostics |
| `vercel.json` | Absent on purpose: no `crons` |
