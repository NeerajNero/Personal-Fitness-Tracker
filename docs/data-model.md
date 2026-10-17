# Data model

Source of truth: `src/db/schema.ts` (grep for the table you need; don't read the whole file).
Views: `drizzle/0001_views.sql`. Read this doc before adding or changing a table, column or view.

## Conventions
- `date` columns = IST calendar dates (`"YYYY-MM-DD"` strings). Timestamps = `timestamptz` (UTC).
- Nutrition / weights / measurements = `numeric` in mode "number" (JS numbers).
- Money = `numeric(8,2)` INR, columns suffixed `_inr`.
- Weekdays are ISO: 1 = Mon … 7 = Sun.
- Archive instead of delete for catalogue rows (`foods.archived`), so logs keep their history.

## Tables
| Table | Key columns | Notes |
|---|---|---|
| `settings` | id = 1 (check constraint) | Targets, phase switch/override, budgets, goal/checkpoint dates, onboarding stats, `telegram_chat_id` + link code, nudge toggles, cap, quiet hours. Seeded once, never overwritten |
| `foods` | name (unique), serving_label, serving_grams, kcal, protein_g, cost_inr, phase_tag, is_favourite, archived | **Saved meals live here too**: `serving_label = "1 meal"` (`MEAL_SERVING`), `is_favourite = true`, `phase_tag = both` |
| `food_log` | date, time (IST), food_id (nullable), label, qty, kcal, protein_g, cost_inr, source (app/telegram/ai) | kcal/protein are stored already multiplied by qty. `food_id` null = one-off manual entry |
| `daily_metrics` | date PK, weight_kg, steps, water_glasses, notes | Upserted |
| `measurements` | date, navel_cm, waist_cm | Upsert by date (bot + Trends) |
| `exercises` | name (unique), muscle_group, cues, is_custom | Seed refreshes cues/muscle_group |
| `routine_days` | name enum UpperA/LowerA/UpperB/LowerB, weekday, sort_order | |
| `routine_exercises` | (routine_day_id, exercise_id) PK, sort_order, target_sets, target_reps | |
| `sessions` | date, routine_day_id (null = free workout), incline_walk, notes | |
| `session_exercises` | (session_id, exercise_id) PK, sort_order, targets | Routine copied at Start, plus ad-hoc additions. **No sets are copied at Start** |
| `sets` | session_id, exercise_id, set_no (unique together), weight_kg, reps, rpe, is_working | Written by ✓ (`copyLastSets`) or the set grid |
| `activities` | date, name, minutes, notes | Sport/cardio quick add |
| `nudge_log` | sent_at, rule_key, date (IST), payload | Idempotency + daily cap. `mark:*` keys are per-day markers (e.g. `mark:no_training`), not sends |
| `pending_parses` | id, payload jsonb, created_at | Gemini parses awaiting ✓ in Telegram. Only the id goes in callback data; expire after 24 h |

## Views (`drizzle/0001_views.sql`)
- `v_daily_totals`: per-day kcal, protein, cost, entries, first/last log time
- `v_weight_7d`: weight + trailing 7-calendar-day average (RANGE window, so gaps don't widen it)
- `v_e1rm_by_exercise`: best working set per (session, exercise) by Epley e1RM
- `v_weekly_summary`: raw weekly aggregates. Adherence and verdicts are computed in `src/lib/metrics`, not here

## Migrations
- Change `schema.ts` → `pnpm db:generate --name <what>` → review the SQL in `drizzle/` → `pnpm db:migrate`.
- Defaults only affect new rows. If the existing `settings` row must change too, append an `UPDATE … WHERE id = 1`
  to the generated SQL (see `0004_nudge_defaults.sql`).
- View changes are hand-written SQL migrations.
- `pnpm seed` is idempotent: it inserts settings only if missing, inserts foods by name without touching existing ones, and upserts exercises and the routine.
