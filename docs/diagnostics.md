# Diagnostics: Settings → Diagnostics, `diag`, diag_events

Read this when something "doesn't work" and before adding a probe or an event. The screen answers "is everything
working, and what happened recently?" without anyone opening Vercel, Neon or Telegram. **Nothing secret appears on it or
in the copied text:** env variables by name as present/missing, chat ids masked to their last 3 digits (`…234`), link
codes and tokens shown only as present/none. `pnpm test` asserts that for the copied text.

## How it loads
The row sits at the bottom of Settings, under "When something's off", outside the Setup group. It loads when opened
(`loadDiagnostics`, a server action), because the admin probes include a network call to Telegram. **Me** and **Events**
are for every user; **System** and **People** only for admins (`users.is_admin`). The phone adds **Device**, **PWA** and
**Client errors** on the client. **Copy diagnostics** puts every visible line on the clipboard as plain text with a header
(`Recomp diagnostics · build <sha> · <UTC time> · <email>`); when the clipboard API refuses (http, old WebView), a
selectable textarea appears instead. ↻ reloads. Admins also get **Run tick (dry)**, which runs `runTick({ dry: true })`
and shows the JSON inline.

## Me (every user)
| Line | Means | If it looks wrong |
|---|---|---|
| Account | email, user id, admin or user, whether the email is still in `ALLOWED_EMAILS` | "NOT in ALLOWED_EMAILS": the next request drops the session → [troubleshooting](troubleshooting.md#that-google-account-isnt-allowed) |
| Onboarded | `users.onboarded_at` | "no" with a settings row → [sign-in loops](troubleshooting.md#sign-in-loops-back-to-onboarding) |
| Session | JWT issued-at and age (from the token's `iat`) | very old + odd behaviour → sign out and in |
| Telegram | linked (chat `…ddd`) / not linked, BLOCKED, link code present/none | not linked → send `/start <code>`; BLOCKED → write anything to the bot → [reminders](troubleshooting.md#no-morning-brief--a-reminder-didnt-arrive) |
| My rows | count per table for this user (foods, food_log, …, diag_events) | zeros after the owner's first sign-in → [empty app](troubleshooting.md#the-owner-signs-in-and-sees-an-empty-app) |
| Today (one line) | `dayStateLine`: date · kcal · protein · day plan · cardio · weight · steps | disagrees with the chips → it can't: both read `getDayState`; check the date (IST) and the Device section's clock |
| Today's DayState | the exact `getDayState` object the chips and the bot read, pretty-printed (minus the `foodLoggedSince` function) | the ground truth for any "Today shows the wrong thing" report |

## System (admin)
| Line | Means | If it looks wrong |
|---|---|---|
| Build | `NEXT_PUBLIC_BUILD_SHA` (Vercel commit, `dev` locally), build time, Next version | sha older than the last push → the deploy didn't happen or failed |
| Server time | UTC and IST now | |
| Env present / missing | the required variables, by name only | anything missing → Vercel env + redeploy ([operations](operations.md#environment-env-never-envlocal-template-in-envexample)) |
| App URL | `NEXT_PUBLIC_APP_URL` vs the request host | MISMATCH → links in bot messages point elsewhere; fix the variable |
| Database | timed `select 1`, latest applied migration (journal tag), users count | FAILED → [everything errors](troubleshooting.md#everything-errors-at-once); migration behind `drizzle/` → `pnpm db:migrate` |
| Webhook | `getWebhookInfo`: url, whether it matches the app URL, pending updates, last error + time | wrong/empty url, growing pending, 401 last error → [bot never answers](troubleshooting.md#the-bot-never-answers) |
| Last tick | time of the last `tick / run` event (dry runs flagged) and each user's outcome | none or old → cron-job.org; a user `failed GrammyError 403` → they blocked the bot |
| Gemini | key present, model, pending parses, last gemini event with latency | "rate limited" / "timeout" → [Gemini](troubleshooting.md#gemini-never-parses-free-text) |

## People (admin)
One line per account: email · allowed / NOT in ALLOWED_EMAILS · onboarded · linked / no chat / BLOCKED · last inbound bot
message · last proactive send · last send error class. In/out times come from diag events, so they start at the deploy
that introduced them and cover 7 days.

## Device, PWA, client errors (from the phone)
Phone time, timezone and its offset from IST, clock skew vs the server, online flag and network type (where the browser
exposes it), user agent; installed (standalone) or a browser tab, service worker state and `SW_VERSION` (asked over a
MessageChannel; `public/sw.js`); the last 20 `console.error` / `unhandledrejection` / `error` entries captured in memory by
`components/client-log.tsx` since the page loaded (`src/lib/diag/client-log.ts`). A wrong phone timezone explains "logged
on the wrong day".

## Events (`diag_events`)
Last 20 for me; admins see the last 50 across users with the email. Written by:
| scope · message | By | meta |
|---|---|---|
| `bot · command` | every inbound update from a linked chat | `kind`: the parsed command type, `free_text`, or `callback:<prefix>`; never the text |
| `bot · <Error>: <message>` (error) | `bot.catch` | |
| `tick · run` (user null) | every `runTick`, dry or not | `dry`, `force`, `users[]` (ok, rules, error class) |
| `tick · due` / `sent` / `failed` | per user, only when something was due or the run threw | `dry`, `rules`, `error`, `code` |
| `send · <ErrorClass>` (error) | a failed proactive send | `code`, `blocked` |
| `gemini · parsed` / `nothing edible` / `bad output` / `rate limited` / `timeout` / `failed` / `no key` | `parseFreeText` | `ms`, `items`, `status`, `error` |
| `action · <Error>: <message>` (error) | `fail()` in server actions, after the response (`after()`); validation errors are not events | |
Real (non-dry) ticks delete rows older than 7 days. `remove-user` and the cascade delete a person's rows.

## The bot's `diag`
Five lines: build + Next version · db ok/FAILED with ms and migration · link state (masked chat, blocked) · last tick run
and this user's outcome in it · today's one-line DayState. Admins get two more: webhook status and the per-user tick line.

## Not shown, on purpose
Env values, tokens, the webhook secret, full chat ids, link codes, other people's data for non-admins, message bodies.

## Files
| File | Role |
|---|---|
| `src/lib/diag/events.ts` | `logEvent`, `recentEvents`, `pruneEvents`, `lastTickRun`, `userEventStats` (raw db: the ESLint exception) |
| `src/lib/diag/system.ts` | `buildInfo`, `envStatus`, `dbCheck`, `webhookStatus`, `tickStatus`, `geminiStatus`, `peopleStatus`, `collectSystem`, `systemSections` |
| `src/lib/diag/me.ts` | `collectMe`, `meSections`, `dayStateLine`, `dayStateJson` |
| `src/lib/diag/bot.ts` | `diagReply` (the `diag` command) |
| `src/lib/diag/text.ts`, `src/lib/diag/client-log.ts` | Client-safe: report shape + `renderDiagText`, `maskChatId`; the in-memory client error log |
| `src/lib/diag/report.ts`, `src/lib/action-result.ts` | Server-action error boundary (`reportActionError` via `fail`) |
| `src/app/(app)/settings/diagnostics.tsx`, `diag-actions.ts` | The card (client sections, copy, fallback textarea, Run tick) and `loadDiagnostics` / `runTickDry` |
| `src/components/client-log.tsx`, `public/sw.js` | Installs the client log; `SW_VERSION` + the version message |
| `src/lib/rules/tick.ts` | `runTick` (events, pruning) |
| `next.config.ts` | `NEXT_PUBLIC_BUILD_SHA` / `NEXT_PUBLIC_BUILD_TIME` from `VERCEL_GIT_COMMIT_SHA` at build |
| `drizzle/0009_diag_events.sql` | The table |
