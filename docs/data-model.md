# Data model

Source of truth: `src/db/schema.ts` (grep for the table you need; don't read the whole file).
Views: `drizzle/0007_multi_user.sql` (rebuilt per user; first written in `0001_views.sql`). Read this doc before adding or changing a table, column or view.

## Conventions
- `date` columns = IST calendar dates (`"YYYY-MM-DD"` strings). Timestamps = `timestamptz` (UTC).
- Nutrition / weights / measurements = `numeric` in mode "number" (JS numbers).
- Money = `numeric(8,2)` INR, columns suffixed `_inr`.
- Weekdays are ISO: 1 = Mon … 7 = Sun.
- Archive instead of delete for catalogue rows (`foods.archived`), so logs keep their history.
- **Every per-person table has `user_id` (uuid → `users.id`, cascade).** Read and write it only through `forUser(userId)`
  (`src/lib/db/scope.ts`). Uniqueness is per user: foods and workout types by `lower(name)`, daily_metrics and measurements by date.
  `exercises.user_id` is nullable: null = shared library row, set = that user's custom exercise
  (unique on `coalesce(user_id, nil-uuid), lower(name)`). Sets stay unique per (session, exercise, set_no).

## Tables
| Table | Key columns | Notes |
|---|---|---|
| `users` | id uuid, email (unique, lower-case), name, is_admin, onboarded_at, created_at | Created on the first allowed sign-in (`ensureUser`). `onboarded_at` gates the app. Migration 0007 creates a placeholder owner (`owner@recomp.local`, admin, onboarded) for the pre-existing data; the first `ALLOWED_EMAILS` entry claims it at sign-in |
| `settings` | **PK user_id** (legacy `id` column kept, never read) | One row per user, written by onboarding. Body stats, `goal` (recomp/fat_loss/muscle_gain), `training_location` (gym/home), `equipment` text[], `days_per_week`, `session_minutes`, kcal target/range, `protein_min/max` (single range), `weekly_session_target`, steps, nudge toggles, cap, quiet hours, `telegram_chat_id` + `telegram_link_code` (both unique across users), `telegram_blocked_at` (set on a 403 send, cleared by their next message; the tick skips the user while set). **Owner-only, nullable, no default:** phase switch/override + per-phase protein, budgets, navel start/goal + `goal_date`, `checkpoint_date`, `smoke_free_since` |
| `foods` | user_id, name (unique per user), serving_label, serving_grams, kcal, protein_g, cost_inr, phase_tag, is_favourite, archived | **Saved meals live here too**: `serving_label = "1 meal"` (`MEAL_SERVING`), `is_favourite = true`, `phase_tag = both` |
| `food_log` | user_id, date, time (IST), food_id (nullable), label, qty, kcal, protein_g, cost_inr, source (app/telegram/ai) | kcal/protein are stored already multiplied by qty. `food_id` null = one-off manual entry |
| `daily_metrics` | PK (user_id, date), weight_kg, steps, water_glasses, notes, rest_day | Upserted. `rest_day` = the owner chose Rest (wins over any session that day) |
| `measurements` | user_id, date (unique together), navel_cm, waist_cm | Upsert by date (bot + Trends) |
| `exercises` | user_id (nullable: null = shared library), name, muscle_group, cues, is_custom, **pattern** (enum), **equipment** text[] (none / dumbbells / bands / pullup_bar / gym; `{}` = unknown), **measure** (reps / seconds, stored in `sets.reps`), **ladder** + **ladder_level** | Library rows come from `pnpm seed` (idempotent by name); custom ones are the user's. Ladders and rules: [home-program.md](home-program.md) |
| `routine_days` | user_id, name (text, unique per user), sort_order, archived, weekday (legacy, nullable, never read) | **Workout types.** sort_order = rotation for "next up"; archived = hidden from picker and rotation, history kept. `name` was an enum until 0005 (type `routine_day_name` still exists, unused). Display via `typeLabel()` |
| `routine_exercises` | user_id, (routine_day_id, exercise_id) PK, sort_order, target_sets, target_reps | A workout type's exercise list |
| `sessions` | user_id, date, routine_day_id (null = custom), incline_walk (legacy, no longer set by the UI), notes | Choosing a type for a date creates it (`setDayPlan`) |
| `session_exercises` | user_id, (session_id, exercise_id) PK, sort_order, targets | The type's list copied when the day is chosen, plus ad-hoc additions. **No sets are copied** |
| `sets` | user_id, session_id, exercise_id, set_no (unique together), weight_kg, reps, rpe, is_working | Written by ✓ (`copyLastSets`) or the set grid |
| `activities` | user_id, date, name, minutes, notes, type, distance_km, speed_kmh, incline_pct, effort (`cardio_effort` enum), logged_at | **The cardio log.** `type` keys `CARDIO_TYPES` (src/lib/cardio.ts); null/unknown = sport. `name` = sport name or the type label. Speed and distance are both stored whenever one can be derived. Legacy rows (before 0006) are `sport` with `logged_at = created_at` |
| `nudge_log` | user_id, sent_at, rule_key, date (IST), payload | Idempotency + daily cap, per user. `mark:*` rows are per-day markers, not sends (legacy `mark:no_training` rows were converted to rest days and are no longer read) |
| `pending_parses` | id, user_id, payload jsonb, created_at | Gemini parses awaiting ✓ in Telegram; only the owner's chat can confirm one. Only the id goes in callback data; expire after 24 h |
| `diag_events` | id, at, user_id (nullable, cascade), scope, level (`diag_level`: info/warn/error), message, meta jsonb | Operational events for Settings → Diagnostics ([diagnostics.md](diagnostics.md)); user_id null = system-wide (tick runs). Real ticks prune rows older than 7 days. Never bodies, chat ids, tokens or codes |

## Views (`drizzle/0007_multi_user.sql`)
All four carry `user_id`; every reader filters on it.
- `v_daily_totals`: per (user, day) kcal, protein, cost, entries, first/last log time
- `v_weight_7d`: weight + trailing 7-calendar-day average (RANGE window partitioned by user, so gaps don't widen it)
- `v_e1rm_by_exercise`: best working set per (session, exercise) by Epley e1RM; bodyweight exercises (`'none' = any(equipment)`) are left out since 0010
- `v_weekly_summary`: raw weekly aggregates per user. Adherence and verdicts are computed in `src/lib/metrics`, not here

## Migrations
- Change `schema.ts` → `pnpm db:generate --name <what>` → review the SQL in `drizzle/` → `pnpm db:migrate`.
- Defaults only affect new rows. If existing `settings` rows must change too, append an `UPDATE "settings" …`
  to the generated SQL (see `0004_nudge_defaults.sql`).
- View changes are hand-written SQL migrations. `0007_multi_user.sql` is hand-written too (nullable `user_id` → backfill onto
  the placeholder owner → NOT NULL; re-runnable) and is exercised by `pnpm test` against PGlite, as is every later one
  (`0008_telegram_blocked.sql`: one nullable column; `0009_diag_events.sql`: the events table and its enum; `0010_home_program.sql`:
  the exercise columns, two enums and the rebuilt e1RM view; all `IF NOT EXISTS`). After 0010, run `pnpm seed`.
- `pnpm backup` before migrating (see [operations.md](operations.md#backups)).
- `pnpm seed` is idempotent and only upserts the shared exercise library. Users, settings, foods and workout types come from
  sign-in and onboarding (gym users get Push/Pull/Legs from `src/lib/library.ts`).
- One-off data scripts live in `scripts/` with a `:dry` variant (e.g. `pnpm choose-day:dry`, then `pnpm choose-day` after migration 0005).
- **Production rule: schema changes are additive** (new tables or nullable/defaulted columns; type relaxations like enum → text
  are OK; no drops or renames). The owner runs migrations and data scripts.

## Files
| File | Role |
|---|---|
| `src/db/schema.ts`, `src/db/index.ts` | Drizzle schema (all tables + types); the client (+ the test hook) |
| `drizzle/*.sql`, `drizzle/meta/` | Migrations and snapshots (`pnpm db:generate`) |
| `src/lib/db/scope.ts` | `forUser`: the only way app code queries |
| `scripts/seed.ts`, `scripts/remove-user.ts`, `scripts/choose-your-day.ts` | Library seed; delete a person; one-off data step |
