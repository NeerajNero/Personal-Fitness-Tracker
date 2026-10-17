-- Choose your day: routine days become free-named "workout types". Additive only: enum → text keeps every value;
-- the routine_day_name type stays (unused). weekday is kept but no longer read.
ALTER TABLE "routine_days" ALTER COLUMN "name" SET DATA TYPE text USING "name"::text;--> statement-breakpoint
ALTER TABLE "routine_days" ALTER COLUMN "weekday" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD COLUMN "rest_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routine_days" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "weekly_session_target" smallint DEFAULT 4 NOT NULL;