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
| `settings` | id = 1 (check constraint) | Targets, `weekly_session_target`, phase switch/override, budgets, goal/checkpoint dates, onboarding stats, `telegram_chat_id` + link code, nudge toggles, cap, quiet hours. Seeded once, never overwritten |
| `foods` | name (unique), serving_label, serving_grams, kcal, protein_g, cost_inr, phase_tag, is_favourite, archived | **Saved meals live here too**: `serving_label = "1 meal"` (`MEAL_SERVING`), `is_favourite = true`, `phase_tag = both` |
| `food_log` | date, time (IST), food_id (nullable), label, qty, kcal, protein_g, cost_inr, source (app/telegram/ai) | kcal/protein are stored already multiplied by qty. `food_id` null = one-off manual entry |
| `daily_metrics` | date PK, weight_kg, steps, water_glasses, notes, rest_day | Upserted. `rest_day` = the owner chose Rest (wins over any session that day) |
| `measurements` | date, navel_cm, waist_cm | Upsert by date (bot + Trends) |
| `exercises` | name (unique), muscle_group, cues, is_custom | Seed refreshes cues/muscle_group |
| `routine_days` | name (text, unique), sort_order, archived, weekday (legacy, nullable, never read) | **Workout types.** sort_order = rotation for "next up"; archived = hidden from picker and rotation, history kept. `name` was an enum until 0005 (type `routine_day_name` still exists, unused). Display via `typeLabel()` |
| `routine_exercises` | (routine_day_id, exercise_id) PK, sort_order, target_sets, target_reps | A workout type's exercise list |
| `sessions` | date, routine_day_id (null = custom), incline_walk (legacy, no longer set by the UI), notes | Choosing a type for a date creates it (`setDayPlan`) |
| `session_exercises` | (session_id, exercise_id) PK, sort_order, targets | The type's list copied when the day is chosen, plus ad-hoc additions. **No sets are copied** |
| `sets` | session_id, exercise_id, set_no (unique together), weight_kg, reps, rpe, is_working | Written by ✓ (`copyLastSets`) or the set grid |
| `activities` | date, name, minutes, notes, type, distance_km, speed_kmh, incline_pct, effort (`cardio_effort` enum), logged_at | **The cardio log.** `type` keys `CARDIO_TYPES` (src/lib/cardio.ts); null/unknown = sport. `name` = sport name or the type label. Speed and distance are both stored whenever one can be derived. Legacy rows (before 0006) are `sport` with `logged_at = created_at` |
| `nudge_log` | sent_at, rule_key, date (IST), payload | Idempotency + daily cap. `mark:*` rows are per-day markers, not sends (legacy `mark:no_training` rows were converted to rest days and are no longer read) |
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
- `pnpm seed` is idempotent: it inserts settings only if missing, inserts foods by name without touching existing ones, upserts the
  exercise library, and creates Push/Pull/Legs (with exercises) only when a type is missing.
- One-off data scripts live in `scripts/` with a `:dry` variant (e.g. `pnpm choose-day:dry`, then `pnpm choose-day` after migration 0005).
- **Production rule: schema changes are additive** (new tables or nullable/defaulted columns; type relaxations like enum → text
  are OK; no drops or renames). The owner runs migrations and data scripts.
