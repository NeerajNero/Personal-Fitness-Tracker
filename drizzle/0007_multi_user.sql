-- Multi-user. Hand-written over the drizzle-kit diff so it can run against the live single-user database:
--   1. users table; the existing data gets an owner row (placeholder email, claimed by the first ALLOWED_EMAILS
--      entry on its next sign-in — see auth.ts) so every row can be stamped before user_id becomes NOT NULL.
--   2. user_id on every per-person table (exercises: nullable, null = shared library).
--   3. settings keyed by user_id; owner-specific columns become nullable with no default; goal/training columns added.
--   4. Per-user uniqueness (foods, routine_days, exercises by name; daily_metrics and measurements by date) and
--      the reporting views rebuilt to carry user_id.
-- Additive: no column or table is dropped. Re-runnable: every step is guarded.

DO $$ BEGIN CREATE TYPE "public"."goal" AS ENUM('recomp', 'fat_loss', 'muscle_gain'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."training_location" AS ENUM('gym', 'home'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint

-- 1. Owner. Only when the database already has a settings row and no users yet (a fresh database gets none:
--    users are created on first sign-in). The email is a placeholder because SQL can't read ALLOWED_EMAILS.
INSERT INTO "users" ("email", "name", "is_admin", "onboarded_at")
SELECT 'owner@recomp.local', 'Owner', true, now()
WHERE NOT EXISTS (SELECT 1 FROM "users") AND EXISTS (SELECT 1 FROM "settings");--> statement-breakpoint

-- 2. user_id columns (nullable first, stamped, then NOT NULL).
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "food_log" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "measurements" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_days" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "sets" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "nudge_log" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint
ALTER TABLE "pending_parses" ADD COLUMN IF NOT EXISTS "user_id" uuid;--> statement-breakpoint

-- Backfill: every existing row belongs to the (single) admin user. Custom exercises too; library rows stay shared.
UPDATE "settings" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "foods" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "food_log" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "daily_metrics" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "measurements" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "exercises" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL AND "is_custom";--> statement-breakpoint
UPDATE "routine_days" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "routine_exercises" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "sessions" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "session_exercises" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "sets" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "activities" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "nudge_log" SET "user_id" = (SELECT id FROM "users" WHERE is_admin ORDER BY created_at LIMIT 1) WHERE "user_id" IS NULL;--> statement-breakpoint
DELETE FROM "pending_parses" WHERE "user_id" IS NULL;--> statement-breakpoint

ALTER TABLE "settings" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "food_log" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_metrics" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "measurements" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_days" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_exercises" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session_exercises" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sets" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "nudge_log" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_parses" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" DROP CONSTRAINT IF EXISTS "foods_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_log" DROP CONSTRAINT IF EXISTS "food_log_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" DROP CONSTRAINT IF EXISTS "daily_metrics_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" DROP CONSTRAINT IF EXISTS "measurements_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" DROP CONSTRAINT IF EXISTS "exercises_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_days" DROP CONSTRAINT IF EXISTS "routine_days_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "routine_days" ADD CONSTRAINT "routine_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" DROP CONSTRAINT IF EXISTS "routine_exercises_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" DROP CONSTRAINT IF EXISTS "session_exercises_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" DROP CONSTRAINT IF EXISTS "sets_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT IF EXISTS "activities_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nudge_log" DROP CONSTRAINT IF EXISTS "nudge_log_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "nudge_log" ADD CONSTRAINT "nudge_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_parses" DROP CONSTRAINT IF EXISTS "pending_parses_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "pending_parses" ADD CONSTRAINT "pending_parses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 3. settings: keyed by user_id. The old id column stays (nullable, no default, never read).
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_singleton";--> statement-breakpoint
ALTER TABLE "settings" DROP CONSTRAINT IF EXISTS "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("user_id");--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "kcal_target" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "kcal_min" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "kcal_max" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "phase_switch_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "phase_switch_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_min_veg" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_min_veg" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_max_veg" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_max_veg" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_min_nonveg" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_min_nonveg" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_max_nonveg" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "protein_max_nonveg" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "budget_veg_inr" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "budget_veg_inr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "budget_nonveg_inr" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "budget_nonveg_inr" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_start_cm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_start_cm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "waist_start_cm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "waist_start_cm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_goal_min_cm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_goal_min_cm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_goal_max_cm" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "navel_goal_max_cm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "goal_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "goal_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "checkpoint_date" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "checkpoint_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "smoke_free_since" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "goal" "goal" DEFAULT 'recomp' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "training_location" "training_location" DEFAULT 'gym' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "equipment" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "session_minutes" smallint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "days_per_week" smallint;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "protein_min" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "protein_max" integer;--> statement-breakpoint
-- The owner keeps every stored value; goal/location come from the new defaults, days_per_week mirrors the session target.
UPDATE "settings" SET "days_per_week" = "weekly_session_target" WHERE "days_per_week" IS NULL;--> statement-breakpoint

-- 4. Per-user uniqueness. daily_metrics was keyed by date alone.
ALTER TABLE "daily_metrics" DROP CONSTRAINT IF EXISTS "daily_metrics_pkey";--> statement-breakpoint
ALTER TABLE "daily_metrics" DROP CONSTRAINT IF EXISTS "daily_metrics_user_id_date_pk";--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_user_id_date_pk" PRIMARY KEY("user_id","date");--> statement-breakpoint
DROP INDEX IF EXISTS "foods_name_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "routine_days_name_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "exercises_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "foods_user_name_uq" ON "foods" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "routine_days_user_name_uq" ON "routine_days" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "exercises_owner_name_uq" ON "exercises" USING btree (coalesce("user_id", '00000000-0000-0000-0000-000000000000'::uuid),lower("name"));--> statement-breakpoint
-- One measurement row per (user, date): fold any duplicate dates into the newest row before the unique index.
UPDATE "measurements" m SET
  "navel_cm" = COALESCE(m."navel_cm", (SELECT o."navel_cm" FROM "measurements" o WHERE o."user_id" = m."user_id" AND o."date" = m."date" AND o."id" < m."id" AND o."navel_cm" IS NOT NULL ORDER BY o."id" DESC LIMIT 1)),
  "waist_cm" = COALESCE(m."waist_cm", (SELECT o."waist_cm" FROM "measurements" o WHERE o."user_id" = m."user_id" AND o."date" = m."date" AND o."id" < m."id" AND o."waist_cm" IS NOT NULL ORDER BY o."id" DESC LIMIT 1))
WHERE EXISTS (SELECT 1 FROM "measurements" o WHERE o."user_id" = m."user_id" AND o."date" = m."date" AND o."id" < m."id");--> statement-breakpoint
DELETE FROM "measurements" m USING "measurements" n WHERE n."user_id" = m."user_id" AND n."date" = m."date" AND n."id" > m."id";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "measurements_user_date_uq" ON "measurements" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_log_user_date_idx" ON "food_log" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_date_idx" ON "sessions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activities_user_date_idx" ON "activities" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nudge_log_user_date_idx" ON "nudge_log" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_telegram_chat_id_uq" ON "settings" USING btree ("telegram_chat_id") WHERE "settings"."telegram_chat_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "settings_telegram_link_code_uq" ON "settings" USING btree ("telegram_link_code") WHERE "settings"."telegram_link_code" is not null;--> statement-breakpoint

-- 5. Views, per user. Dropped and recreated because user_id is a new leading column.
DROP VIEW IF EXISTS "v_weekly_summary";--> statement-breakpoint
DROP VIEW IF EXISTS "v_daily_totals";--> statement-breakpoint
DROP VIEW IF EXISTS "v_weight_7d";--> statement-breakpoint
DROP VIEW IF EXISTS "v_e1rm_by_exercise";--> statement-breakpoint
CREATE VIEW "v_daily_totals" AS
SELECT
  fl."user_id",
  fl."date",
  ROUND(SUM(fl."kcal"), 1)      AS "kcal",
  ROUND(SUM(fl."protein_g"), 1) AS "protein_g",
  ROUND(SUM(fl."cost_inr"), 2)  AS "cost_inr",
  COUNT(*)::int                 AS "entries",
  MIN(fl."time")                AS "first_log_time",
  MAX(fl."time")                AS "last_log_time"
FROM "food_log" fl
GROUP BY fl."user_id", fl."date";
--> statement-breakpoint
CREATE VIEW "v_weight_7d" AS
SELECT
  dm."user_id",
  dm."date",
  dm."weight_kg",
  ROUND(AVG(dm."weight_kg") OVER w, 2) AS "weight_7d_avg",
  COUNT(dm."weight_kg")      OVER w     AS "n_days"
FROM "daily_metrics" dm
WHERE dm."weight_kg" IS NOT NULL
WINDOW w AS (PARTITION BY dm."user_id" ORDER BY dm."date" RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW);
--> statement-breakpoint
CREATE VIEW "v_e1rm_by_exercise" AS
SELECT DISTINCT ON (s."id", st."exercise_id")
  s."user_id",
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
CREATE VIEW "v_weekly_summary" AS
WITH weeks AS (
  SELECT DISTINCT "user_id", date_trunc('week', d)::date AS week_start
  FROM (
    SELECT "user_id", "date" AS d FROM "daily_metrics"
    UNION SELECT "user_id", "date" FROM "food_log"
    UNION SELECT "user_id", "date" FROM "sessions"
    UNION SELECT "user_id", "date" FROM "measurements"
    UNION SELECT "user_id", "date" FROM "activities"
  ) all_dates
),
wt AS (
  SELECT "user_id", date_trunc('week', "date")::date AS week_start,
         COUNT("weight_kg")::int AS days_weighed,
         ROUND(AVG("weight_kg"), 2) AS avg_weight_kg,
         ROUND(AVG("steps"))::int  AS avg_steps,
         COUNT("steps")::int       AS days_with_steps
  FROM "daily_metrics" GROUP BY 1, 2
),
intake AS (
  SELECT "user_id", date_trunc('week', "date")::date AS week_start,
         COUNT(*)::int              AS days_logged,
         ROUND(AVG("kcal"), 0)      AS avg_kcal,
         ROUND(AVG("protein_g"), 1) AS avg_protein_g,
         ROUND(SUM("cost_inr"), 2)  AS cost_inr
  FROM "v_daily_totals" GROUP BY 1, 2
),
train AS (
  SELECT "user_id", date_trunc('week', "date")::date AS week_start,
         COUNT(*)::int AS sessions,
         COUNT(*) FILTER (WHERE "incline_walk")::int AS incline_walks
  FROM "sessions" GROUP BY 1, 2
),
act AS (
  SELECT "user_id", date_trunc('week', "date")::date AS week_start,
         COALESCE(SUM("minutes"), 0)::int AS activity_minutes
  FROM "activities" GROUP BY 1, 2
),
meas AS (
  SELECT DISTINCT ON ("user_id", date_trunc('week', "date"))
         "user_id", date_trunc('week', "date")::date AS week_start,
         "navel_cm", "waist_cm"
  FROM "measurements"
  ORDER BY "user_id", date_trunc('week', "date"), "date" DESC, "id" DESC
)
SELECT
  w."user_id",
  w.week_start,
  (w.week_start + 6)      AS week_end,
  wt.days_weighed, wt.avg_weight_kg, wt.avg_steps, wt.days_with_steps,
  i.days_logged, i.avg_kcal, i.avg_protein_g, i.cost_inr,
  COALESCE(t.sessions, 0)       AS sessions,
  COALESCE(t.incline_walks, 0)  AS incline_walks,
  COALESCE(a.activity_minutes, 0) AS activity_minutes,
  m.navel_cm, m.waist_cm
FROM weeks w
LEFT JOIN wt     ON wt.user_id = w.user_id AND wt.week_start = w.week_start
LEFT JOIN intake i ON i.user_id = w.user_id AND i.week_start = w.week_start
LEFT JOIN train  t ON t.user_id = w.user_id AND t.week_start = w.week_start
LEFT JOIN act    a ON a.user_id = w.user_id AND a.week_start = w.week_start
LEFT JOIN meas   m ON m.user_id = w.user_id AND m.week_start = w.week_start;
