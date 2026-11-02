# Users: model, scoping, onboarding, goals

Read this before touching sign-in, onboarding, targets, anything that reads `settings`, or any query at all.

## Model
- `users`: id (uuid), email (unique, lower-cased), name, is_admin, onboarded_at, created_at. A row is created on the first
  allowed sign-in (`ensureUser`) and **never grants access by itself**: `ALLOWED_EMAILS` is the authority, checked at
  sign-in and on every request. `onboarded_at` is the app gate. Migration 0007 created a placeholder owner
  (`owner@recomp.local`, admin, onboarded) for the pre-existing data; the **first `ALLOWED_EMAILS` entry claims it** at sign-in.
- `settings`: one row per user, PK `user_id`, written by onboarding and edited in Settings. The legacy `id` column stays, never read.
  `telegram_chat_id` links the chat; `telegram_blocked_at` is set when a send gets 403 (they blocked the bot) and cleared by
  their next message, and the tick skips them while it's set.
- Every per-person table carries `user_id` (cascade on delete): foods, food_log, daily_metrics, measurements, routine_days,
  routine_exercises, sessions, session_exercises, sets, activities, nudge_log, pending_parses. `exercises.user_id` is
  nullable: null = shared library (seed), set = that user's custom exercise.
- Admin = `users.is_admin`. It only unlocks Settings → People (read-only list). The owner is the only admin.

## Scoping rule
- `forUser(userId)` (`src/lib/db/scope.ts`) is the only door to the database from app code. ESLint (`eslint.config.mjs`)
  rejects `@/db` imports anywhere except the scope, `src/lib/users.ts`, `src/lib/diag/` (system-wide events, admin probes)
  and `src/db/`.
- Reads filter with `own(table, …)` (`user_id = me AND …`) or `visible(…)` for exercises (library + own); inserts go through
  `stamp(values)`; raw SQL uses `uid`. A foreign id is simply not found.
- Every function in `src/lib/` that queries takes `userId: UserId` first (`UserId` is a branded string). Server actions get
  it from `requireUser()` (the JWT); pages too. Pure helpers (`*From`, `getTargets`, `hintFromSets`) take no user.
- Cross-user lookups live only in `src/lib/users.ts`: `isAllowedEmail`, `ensureUser`, `findUserByEmail`, `getUser`,
  `markOnboarded`, `userIdByChat`, `linkChatByCode`, `markChatBlocked`, `clearChatBlocked`, `listLinkedUsers`, `listPeople`.
- `pnpm test` proves two users can't see each other (see [testing.md](testing.md)).

## Sign-in
Auth.js v5, Google. `signIn` allows only an email in `ALLOWED_EMAILS` (or `ALLOWED_EMAIL`; comma-separated,
case-insensitive; `isAllowedEmail`), then `ensureUser` creates the row or, for the first entry, claims the placeholder owner.
The `jwt` callback runs on every session read: it re-checks the list and returns `null` (session dropped, cookie cleared)
when the email is no longer on it, so removing someone from the env and redeploying locks them out of the app at once.
Their bot access lasts until `remove-user` deletes them (or the chat is unlinked). Otherwise the callback keeps `uid`
(old tokens without one are resolved by email once); `session` exposes it as `session.user.id`.
`src/app/(app)/layout.tsx` redirects to `/login` without a session and to `/onboarding` while `users.onboarded_at` is null.

## Onboarding and `targets.ts`
`/onboarding` is one form (`onboarding-form.tsx` → `completeOnboarding`): weight, height, age, sex, goal, gym or home
(home shows equipment: none / dumbbells / bands / pullup_bar), days per week (1–7), minutes per session (15–180).
`computeTargets` (`src/lib/targets.ts`, client-safe, pure):
- maintenance = Mifflin-St Jeor (10w + 6.25h − 5a + 5 male / −161 female) × activity factor from days per week
  (0 → 1.2, 1–2 → 1.375, 3–4 → 1.55, 5–6 → 1.725, 7 → 1.9)
- kcal target = maintenance + the goal's delta, rounded to 5; range = ±25
- protein min/max = the goal's g/kg × weight

| Goal | kcal delta | Protein g/kg | Extra |
|---|---|---|---|
| recomp | −225 | 1.8–2.0 | |
| fat_loss | −500 | 2.0–2.2 | floor 1,400 kcal (female) / 1,600 (male); rate target 0.5–1.0 %/week |
| muscle_gain | +250 | 1.8–2.0 | |

The action writes the settings row (body stats, goal, location, equipment, days, minutes, `weekly_session_target` = days,
kcal + single protein range, a link code, `settings.onboarded_at`), creates Push/Pull/Legs for gym users
(`createWorkoutType`, from `src/lib/library.ts`; home users get none yet), marks `users.onboarded_at`, and shows
`/onboarding/confirm`. An onboarded user who opens `/onboarding` is sent to Today: **targets are computed once and never
recomputed for an existing user** (the owner's stored numbers predate this code and must stay).

## Verdicts and maintenance per goal (`src/lib/metrics/trends.ts`)
| Goal | eat more | eat less | tighten logging | maintenance card suggests |
|---|---|---|---|---|
| recomp (and muscle_gain, which has no rules of its own yet) | 7-day avg falling > 0.5 %/week | flat ±0.2 kg for 3 weeks and navel not dropping | < 5 of the last 7 days logged | tdee − 225 (muscle_gain: tdee + 250) |
| fat_loss | falling > 1.0 %/week | flat ±0.2 kg for 2+ weeks | < 5 of the last 7 days logged | tdee − 500 |

`weeklyRateFrom(series, days, goal)` sets `tooFast` from the goal's limit; the Weight card and the weekly report use it.

## Owner-only values and why
These settings columns are nullable with no default and are null for everyone but the owner, because they describe the
owner's specific plan rather than a goal: protein phases (`phase_switch_date`, `phase_override`, per-phase protein min/max),
monthly budgets (`budget_veg_inr`, `budget_nonveg_inr`), the navel goal (`navel_start_cm`, `waist_start_cm`,
`navel_goal_min/max_cm`, `goal_date`), `checkpoint_date`, `smoke_free_since`. The code checks `hasPhases` / `hasBudgets` /
`hasNavelGoal` (`src/lib/settings.ts`) and hides what needs them: the Protein phase card, phase protein fields and budget
fields in Settings; Navel vs goal, the goal card, spend and the checkpoint card in Trends; the `phase_switch`, `checkpoint_card`
and `budget_80` reminders. Everyone else has one protein range (`protein_min/max`) and `getTargets` falls back to it.

## Files
| File | Role |
|---|---|
| `auth.ts` | Allowlist at sign-in and on every request, users row at sign-in, uid in the JWT |
| `src/lib/db/scope.ts` | `forUser`, `UserId`, `asUserId` |
| `src/lib/users.ts` | users table, `isAllowedEmail`, the blocked flag + the only cross-user queries |
| `src/lib/session.ts` | `requireSession`, `requireUser` |
| `src/lib/settings.ts` | `getSettings`, `findSettings`, `hasPhases`, `hasBudgets`, `hasNavelGoal` |
| `src/lib/targets.ts`, `src/lib/library.ts` | Targets per goal; shared exercise library + gym starter types |
| `src/app/onboarding/*` | Form, `completeOnboarding`, confirm page |
| `src/app/(app)/layout.tsx` | The gate |
| `src/app/(app)/settings/people.tsx` | Admin list |
| `eslint.config.mjs` | The `@/db` import rule |
| `drizzle/0007_multi_user.sql`, `0008_telegram_blocked.sql` | The migrations |
