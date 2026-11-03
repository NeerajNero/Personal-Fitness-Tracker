# Recomp

A small fitness tracker for a few people: a web app (installable PWA) plus one Telegram bot. Each person logs weight,
food (kcal + protein), lifts on training days and cardio, mostly by sending the bot one line (`w 74.2`, `dosa 350 12`,
`done`). The app derives everything else: calorie and protein targets from a goal (recomp, fat loss or muscle gain),
"what's today" (a workout type in rotation, or rest), a weekly verdict (hold / eat more / eat less / tighten logging),
lift progression hints and stalls, and reminders at fixed times of day. Everyone has their own account, data, targets,
foods and workout types; only the exercise library is shared. It runs on Vercel Hobby, Neon Postgres and cron-job.org,
with Gemini for free-text meal parsing. Time zone is `Asia/Kolkata` throughout.

## Setup checklist

Do these in order. Every secret goes into `.env` locally (copy `.env.example`) and into Vercel for production. Never
commit `.env`.

1. **Neon database.** Create a project, copy the pooled connection string into `DATABASE_URL`. Then
   `pnpm install`, `pnpm db:migrate` (applies `drizzle/*.sql`) and `pnpm seed` (the shared exercise library only;
   people, settings, foods and workout types are created at sign-in and onboarding).
2. **Google OAuth.** Google Cloud console → APIs & Services → OAuth consent screen: External, add every person who will
   sign in as a **test user** while the app is in Testing (unlisted Google accounts are refused by Google before the app
   sees them). Credentials → OAuth 2.0 Client (Web): authorised redirect URIs `http://localhost:3000/api/auth/callback/google`
   and `https://<your-app>.vercel.app/api/auth/callback/google`. Put the client id and secret in `AUTH_GOOGLE_ID` /
   `AUTH_GOOGLE_SECRET`, and `openssl rand -base64 32` into `AUTH_SECRET`.
3. **Allowlist.** `ALLOWED_EMAILS=you@example.com,friend@example.com`. Comma-separated, case-insensitive. **The first
   entry is the owner (admin)**: on an existing database it claims the data that migration 0007 parked under a
   placeholder owner. The list is the only authority and is re-checked on every request: a `users` row grants nothing
   by itself. The older name `ALLOWED_EMAIL` still works.
4. **Telegram bot.** In Telegram, talk to @BotFather → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN` and the
   username (without `@`) into `TELEGRAM_BOT_USERNAME`. `openssl rand -hex 32` into `TELEGRAM_WEBHOOK_SECRET`. After the
   first deploy: `pnpm bot:set-webhook https://<your-app>.vercel.app` (it appends `/api/telegram` and sends the secret).
   Check with `pnpm bot:webhook-info`. For local testing, expose port 3000 with a tunnel and set the webhook to that URL.
5. **Gemini.** Google AI Studio → API key → `GEMINI_API_KEY`. `GEMINI_MODEL` is optional (default
   `gemini-3.5-flash-lite`; keep a flash-lite class model for the free tier). Without a key, free-text meals just get
   "couldn't parse that"; every exact command still works.
6. **App URL and tick secret.** `NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app` (bot replies link to it) and
   `openssl rand -hex 32` into `TICK_SECRET`.
7. **Vercel.** Import the repo (framework: Next.js, package manager: pnpm). Environment variables, one line each:
   - `DATABASE_URL` — Neon pooled connection string
   - `AUTH_SECRET` — Auth.js session signing key
   - `AUTH_GOOGLE_ID` — Google OAuth client id
   - `AUTH_GOOGLE_SECRET` — Google OAuth client secret
   - `ALLOWED_EMAILS` — who may sign in; first = owner/admin
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `TELEGRAM_BOT_USERNAME` — shown on the link-Telegram screens; not a secret
   - `TELEGRAM_WEBHOOK_SECRET` — must match what `bot:set-webhook` sent
   - `TICK_SECRET` — the `x-tick-secret` header cron-job.org sends
   - `GEMINI_API_KEY` — meal parsing
   - `GEMINI_MODEL` — optional model override
   - `NEXT_PUBLIC_APP_URL` — public base URL, no trailing slash
   Deploy, then run step 4's `bot:set-webhook` against the production URL.
8. **cron-job.org.** Create a job: `GET https://<your-app>.vercel.app/api/tick`, every 15 minutes, with a custom
   request header `x-tick-secret: <TICK_SECRET>`. Save, enable, and watch its history for 200s. **Do not add `crons`
   to `vercel.json`**: Hobby cron runs once a day, which is useless for reminders.
9. Sign in, finish onboarding, send `/start <code>` to the bot. You're the owner; Settings → People lists everyone.

Local development: `pnpm dev` on port 3000. The app needs Google sign-in even locally, which is why the localhost
redirect URI is in step 2.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Next.js dev server (Turbopack) on :3000 |
| `pnpm build` / `pnpm start` | Production build / serve it |
| `pnpm lint` | ESLint, including the rule that only `src/lib/db/scope.ts` and `src/lib/users.ts` may import `@/db` |
| `pnpm test` | Migrations, two-user isolation, the real onboarding action and the action error boundary on PGlite (in-memory Postgres); needs no database |
| `pnpm db:generate` | drizzle-kit: diff `src/db/schema.ts` into a new `drizzle/*.sql` + snapshot (then hand-edit if data must move) |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `pnpm db:studio` | drizzle-kit studio against `DATABASE_URL` |
| `pnpm seed` | Idempotent: upsert the shared exercise library (`src/lib/library.ts`) |
| `pnpm choose-day:dry` / `pnpm choose-day` | One-off Oct 2026 data step (Push/Pull/Legs, archive Upper/Lower, marks → rest days); already applied |
| `pnpm remove-user:dry <email>` / `pnpm remove-user <email>` | Show, then delete, everything a person owns (refuses admins) |
| `pnpm backup` / `pnpm backup --full` | Dump every table to `backups/recomp-<timestamp>.json` (gitignored); chat ids and link codes are nulled unless `--full` |
| `pnpm bot:set-webhook <https-url>` | Point Telegram at `<url>/api/telegram` with `TELEGRAM_WEBHOOK_SECRET`; drops pending updates |
| `pnpm bot:webhook-info` | Current webhook URL, pending update count, last delivery error |
| `pnpm bot:delete-webhook` | Remove the webhook (the bot goes silent) |
| `pnpm tick:dry` | Evaluate every linked user's reminders now without sending or logging |
| `pnpm tick` | Run the tick for real; `pnpm tick force=<rule key>` sends one rule to every linked user now |

`tick` and `tick:dry` call `TICK_URL` (default `http://localhost:3000`); set it to the production URL to hit Vercel.

## Adding a person

1. Append their Google email to `ALLOWED_EMAILS` in Vercel (keep the owner first).
2. Add them as a test user on the Google OAuth consent screen (while the app is in Testing mode).
3. Redeploy (env changes need a new deployment).
4. They open the app, sign in with Google, and finish onboarding: body stats, goal, gym or home, days and minutes per
   week. That writes their targets and, for gym users, Push/Pull/Legs.
5. They send `/start <code>` (shown after onboarding and in Settings → Telegram) to the bot. One bot serves everyone;
   the code decides whose chat it is.

The list is the authority: a `users` row never grants access on its own, and the list is re-read on every request.
Settings → People marks anyone whose row has outlived the list as "not in ALLOWED_EMAILS".

## Removing a person

1. `pnpm backup` (or a Neon branch): the only undo.
2. Drop them from `ALLOWED_EMAILS` and redeploy. Their app session ends on their next request and sign-in is refused
   from then on. The bot still answers their linked chat until the next step.
3. `pnpm remove-user:dry their@email` to see what will go (row counts per table), then `pnpm remove-user their@email`.
   It unlinks their Telegram chat and deletes their `users` row; every table they own cascades. The script refuses admins.
4. Optionally remove them as a Google test user.

There is no soft delete; the undo is the backup file or a Neon restore (see Costs & quotas).

## Privacy & access

- **Each person sees only their own rows.** Every query goes through `forUser(userId)` with the id taken from the
  signed-in session; a foreign id in a request is simply "not found". The bot resolves the user from the chat id, so one
  chat can never act for another. The exercise library (names, muscle groups, cues) is the only shared data.
- **What the admin sees.** Settings → People: each account's email, name, admin flag, whether they're still in
  `ALLOWED_EMAILS`, whether onboarding is finished and whether a Telegram chat is linked or blocked. No weights, food,
  lifts or chat ids. Admins have no other powers in the app; removing
  someone is a script run by whoever has the database URL.
- **Third parties.** Google receives the sign-in (and returns email, name, picture; the app stores email and name).
  Telegram sees every message to and from the bot, as with any bot. Gemini receives the free-text meal message and the
  sender's food catalogue (names, servings, kcal, protein) so it can match against it; no identity, no history.
  cron-job.org sees only the tick's HTTP status and the JSON of rule keys, skip reasons and the first 8 characters of
  user ids. Vercel keeps request logs (paths, status codes) and the app's `console.error` lines, which carry the error
  class and message only, never message bodies, chat ids or tokens. Neon holds the data.
- **Diagnostics** (Settings → Diagnostics, bot `diag`) shows env variables by name only, chat ids masked to the last 3
  digits, link codes and tokens as present/none. Admins see every account's email and link state, never their data.
- **Exports** (Settings → Export) are per user and never include `settings` or `users` (chat ids, emails). `pnpm backup`
  is for whoever holds the database URL: every table, with chat ids and link codes nulled unless `--full`.

## Security model

- **Allowlist is the authority** (`auth.ts`): `signIn` refuses any email not in `ALLOWED_EMAILS`; a `users` row never
  grants access by itself, and an unset list refuses everyone. The first allowed sign-in creates the row (the first entry
  claims the placeholder owner). The `jwt` callback re-reads the list on every request and drops the session when the
  email is gone, so removing someone and redeploying locks them out of the app at once.
- **JWT sessions.** The user's id is written into the JWT once at sign-in and read back with `requireUser()`; nothing
  trusts an id from the client. Sessions issued before multi-user get their id resolved by email on the next request.
- **The `@/db` import rule.** ESLint only lets `src/lib/db/scope.ts`, `src/lib/users.ts` and `src/db/` import the
  database. Everything else calls `forUser(userId)` and filters with `own()` / `visible()`, stamps inserts with
  `stamp()`, and takes `userId` as its first argument. `src/lib/users.ts` holds the only cross-user lookups (sign-in,
  chat id → user, the tick's user list, People). `pnpm test` proves two users can't see each other.
- **Gate.** `src/app/(app)/layout.tsx` redirects to `/login` without a session and to `/onboarding` until
  `users.onboarded_at` is set. There is no middleware/proxy file; server actions and the export route check the session themselves.
- **Secrets on the open endpoints.** `/api/telegram` rejects requests whose `x-telegram-bot-api-secret-token` header
  differs from `TELEGRAM_WEBHOOK_SECRET` (Telegram sends what `bot:set-webhook` registered). `/api/tick` rejects
  requests without the right `x-tick-secret`. Both answer 401 and do nothing else.
- **Never logged:** tokens, chat ids, message bodies, env values.

## Costs & quotas

| Service | Plan and limit | What happens when it's exceeded |
|---|---|---|
| Vercel Hobby | Free. Function duration is capped (the webhook route declares 30 s, the tick 60 s); cron is daily only | The webhook answers Telegram after 25 s and keeps working in the background; if Vercel then kills it, that reply is lost (Telegram doesn't retry a 200). A killed tick stops mid-list and the remaining users get their reminders on the next 15-minute run. Daily cron is why cron-job.org exists |
| Neon free tier | Monthly compute-hour quota; compute auto-suspends after inactivity; short point-in-time restore window | A cold start makes the first request after idle take a few seconds. Over quota, Neon suspends compute: every query throws, screens return a server error, the bot answers nothing (`bot.catch` logs the error class), the tick returns 500 and cron-job.org marks the run failed. Nothing retries; it recovers when the quota resets |
| Gemini free tier | Requests-per-minute and per-day caps on flash-lite | `parseFreeText` returns null on 429, timeout (15 s) or bad JSON, so the bot replies "couldn't parse that — try `paneer 150` style". Exact commands and the app are unaffected |
| Telegram Bot API | ~30 messages/s overall, ~1/s per chat | The app sends at most each user's `nudge_daily_cap` reminders a day plus one reply per message, far below the limits. A failed send (429, or a user who blocked the bot) is caught per user: the run goes on, the response lists that user as `ok: false` with the error class, and a 403 marks their chat blocked so the tick skips them until they write to the bot again |
| cron-job.org free | 1-minute minimum interval; a request that exceeds its timeout (30 s by default) is marked failed | A "failed" run usually still completed on Vercel (the tick is idempotent per rule per day, so a double run sends nothing twice). Raise the job's timeout if the history shows timeouts |
| Google OAuth in Testing | 100 test users; refresh tokens aren't used (JWT sessions) | Someone not on the test-user list is refused by Google with its own error page before reaching the app |

## Troubleshooting

| Symptom | First check |
|---|---|
| Anything at all | Settings → Diagnostics → **Copy diagnostics** (or `diag` to the bot): build, env by name, database, webhook, last tick, link state, today's state, recent events. No secrets in it, so it can be pasted anywhere. [docs/diagnostics.md](docs/diagnostics.md) |
| Bot never answers | `pnpm bot:webhook-info`: URL must be `https://<app>/api/telegram`, pending updates should be 0, last error empty. Re-run `pnpm bot:set-webhook <url>` |
| `/api/telegram` or `/api/tick` returns 401 | Secret mismatch: the webhook secret in Vercel vs the one `bot:set-webhook` sent (re-run it), or cron-job.org's `x-tick-secret` header vs `TICK_SECRET` |
| No morning brief / reminders | cron-job.org job history (is it running, 200s?), then `pnpm tick:dry` with `TICK_URL` set: look at the skip reason per rule (`disabled`, `quiet_hours`, `already_sent`, `daily_cap`, `not_linked`) |
| One person gets no reminders | Settings → People shows `blocked`: they blocked the bot and a send got 403. They tap Restart / send anything to the bot and reminders resume. `pnpm tick` shows `ok: false` + error class for a user whose send failed |
| A removed person can still use the bot | Expected until `pnpm remove-user <email>` unlinks the chat; dropping the email from `ALLOWED_EMAILS` only ends app access |
| Sign-in loops back to onboarding | `users.onboarded_at` is null for that email. Finish onboarding, or set it in the Neon SQL editor if the settings row already exists |
| "That Google account isn't allowed" | Email not in `ALLOWED_EMAILS` (check spelling, spaces, and that Vercel was redeployed; an existing `users` row doesn't help), or a Google-side error: the person isn't a test user on the consent screen |
| Owner signed in but sees an empty app | The claim didn't happen: the owner's email isn't the **first** `ALLOWED_EMAILS` entry. Fix the order, or `update users set email = '<owner>' where email = 'owner@recomp.local'` |
| Migration failed half-way | Restore the Neon branch (or point-in-time restore) to before `pnpm db:migrate`, fix the SQL, re-run. 0007 is re-runnable |
| Gemini never parses | `GEMINI_API_KEY` set? Free-tier RPM/day exhausted? The bot replies "couldn't parse that" for every failure; exact commands still work |

Full entries: [docs/troubleshooting.md](docs/troubleshooting.md).

## How it's built

- [CLAUDE.md](CLAUDE.md): the rules (stack, conventions, hard rules, the Users rule, build order). Short on purpose.
- [docs/README.md](docs/README.md): one short doc per area with the files it covers: product and targets, architecture,
  data model, users, each screen, the bot, the rules engine, operations, testing, troubleshooting.
- [CHANGELOG.md](CHANGELOG.md): what changed and when.
