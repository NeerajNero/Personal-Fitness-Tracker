-- Home program (docs/home-program.md): movement pattern, equipment, measure and ladder rung on exercises, and the
-- e1RM view now leaves out bodyweight exercises (equipment = {none}; their progress is reps and rungs, not kg).
-- Additive and re-runnable. Run `pnpm seed` afterwards to fill the library.
DO $$ BEGIN CREATE TYPE "public"."exercise_measure" AS ENUM('reps', 'seconds'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."exercise_pattern" AS ENUM('horizontal_push', 'vertical_push', 'horizontal_pull', 'vertical_pull', 'squat', 'hinge', 'lunge', 'core_brace', 'core_lateral', 'calves', 'conditioning', 'isolation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "pattern" "exercise_pattern";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "equipment" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "measure" "exercise_measure" DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "ladder" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN IF NOT EXISTS "ladder_level" smallint;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercises_ladder_idx" ON "exercises" USING btree ("ladder", "ladder_level");--> statement-breakpoint
DROP VIEW IF EXISTS "v_e1rm_by_exercise";--> statement-breakpoint
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
WHERE st."is_working" AND NOT ('none' = ANY(e."equipment"))
ORDER BY s."id", st."exercise_id", (st."weight_kg" * (1 + st."reps" / 30.0)) DESC, st."set_no";
