-- Custom migration: reporting views.
-- All `date` columns are IST calendar dates, so date arithmetic here is already in IST.

-- Per-day intake totals from food_log.
CREATE OR REPLACE VIEW "v_daily_totals" AS
SELECT
  fl."date",
  ROUND(SUM(fl."kcal"), 1)      AS "kcal",
  ROUND(SUM(fl."protein_g"), 1) AS "protein_g",
  ROUND(SUM(fl."cost_inr"), 2)  AS "cost_inr",
  COUNT(*)::int                 AS "entries",
  MIN(fl."time")                AS "first_log_time",
  MAX(fl."time")                AS "last_log_time"
FROM "food_log" fl
GROUP BY fl."date";
--> statement-breakpoint

-- Daily weight with a trailing 7-calendar-day average (window by date RANGE, so
-- missed weigh-ins don't widen the window). n_days = how many weigh-ins fed the average.
CREATE OR REPLACE VIEW "v_weight_7d" AS
SELECT
  dm."date",
  dm."weight_kg",
  ROUND(AVG(dm."weight_kg") OVER w, 2) AS "weight_7d_avg",
  COUNT(dm."weight_kg")      OVER w     AS "n_days"
FROM "daily_metrics" dm
WHERE dm."weight_kg" IS NOT NULL
WINDOW w AS (ORDER BY dm."date" RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW);
--> statement-breakpoint

-- Best working set per (session, exercise) scored by Epley e1RM = weight × (1 + reps/30).
CREATE OR REPLACE VIEW "v_e1rm_by_exercise" AS
SELECT DISTINCT ON (s."id", st."exercise_id")
  s."id"           AS "session_id",
  s."date",
  s."routine_day_id",
  st."exercise_id",
  e."name"         AS "exercise_name",
  st."weight_kg",
  st."reps",
  ROUND(st."weight_kg" * (1 + st."reps" / 30.0), 2) AS "e1rm"
FROM "sets" st
JOIN "sessions"  s ON s."id" = st."session_id"
JOIN "exercises" e ON e."id" = st."exercise_id"
WHERE st."is_working"
ORDER BY s."id", st."exercise_id", (st."weight_kg" * (1 + st."reps" / 30.0)) DESC, st."set_no";
--> statement-breakpoint

-- One row per ISO week (Monday start). Raw aggregates only — adherence %, verdicts and
-- target comparisons are computed in src/lib/metrics against settings, not here.
CREATE OR REPLACE VIEW "v_weekly_summary" AS
WITH weeks AS (
  SELECT DISTINCT date_trunc('week', d)::date AS week_start
  FROM (
    SELECT "date" AS d FROM "daily_metrics"
    UNION SELECT "date" FROM "food_log"
    UNION SELECT "date" FROM "sessions"
    UNION SELECT "date" FROM "measurements"
    UNION SELECT "date" FROM "activities"
  ) all_dates
),
wt AS (
  SELECT date_trunc('week', "date")::date AS week_start,
         COUNT("weight_kg")::int AS days_weighed,
         ROUND(AVG("weight_kg"), 2) AS avg_weight_kg,
         ROUND(AVG("steps"))::int  AS avg_steps,
         COUNT("steps")::int       AS days_with_steps
  FROM "daily_metrics" GROUP BY 1
),
intake AS (
  SELECT date_trunc('week', "date")::date AS week_start,
         COUNT(*)::int              AS days_logged,
         ROUND(AVG("kcal"), 0)      AS avg_kcal,
         ROUND(AVG("protein_g"), 1) AS avg_protein_g,
         ROUND(SUM("cost_inr"), 2)  AS cost_inr
  FROM "v_daily_totals" GROUP BY 1
),
train AS (
  SELECT date_trunc('week', "date")::date AS week_start,
         COUNT(*)::int AS sessions,
         COUNT(*) FILTER (WHERE "incline_walk")::int AS incline_walks
  FROM "sessions" GROUP BY 1
),
act AS (
  SELECT date_trunc('week', "date")::date AS week_start,
         COALESCE(SUM("minutes"), 0)::int AS activity_minutes
  FROM "activities" GROUP BY 1
),
meas AS (
  SELECT DISTINCT ON (date_trunc('week', "date"))
         date_trunc('week', "date")::date AS week_start,
         "navel_cm", "waist_cm"
  FROM "measurements"
  ORDER BY date_trunc('week', "date"), "date" DESC, "id" DESC
)
SELECT
  w.week_start,
  (w.week_start + 6)      AS week_end,
  wt.days_weighed, wt.avg_weight_kg, wt.avg_steps, wt.days_with_steps,
  i.days_logged, i.avg_kcal, i.avg_protein_g, i.cost_inr,
  COALESCE(t.sessions, 0)       AS sessions,
  COALESCE(t.incline_walks, 0)  AS incline_walks,
  COALESCE(a.activity_minutes, 0) AS activity_minutes,
  m.navel_cm, m.waist_cm
FROM weeks w
LEFT JOIN wt     ON wt.week_start = w.week_start
LEFT JOIN intake i ON i.week_start = w.week_start
LEFT JOIN train  t ON t.week_start = w.week_start
LEFT JOIN act    a ON a.week_start = w.week_start
LEFT JOIN meas   m ON m.week_start = w.week_start;
