-- Cardio log: activities extended in place (nullable columns + a new enum type; nothing dropped or renamed).
CREATE TYPE "public"."cardio_effort" AS ENUM('easy', 'moderate', 'hard');--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "distance_km" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "speed_kmh" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "incline_pct" numeric(4, 1);--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "effort" "cardio_effort";--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "logged_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
-- Existing rows: quick-add sports (name kept); their logged time is when they were created, not this migration.
UPDATE "activities" SET "type" = 'sport' WHERE "type" IS NULL;--> statement-breakpoint
UPDATE "activities" SET "logged_at" = "created_at" WHERE "logged_at" IS NULL OR "logged_at" > "created_at";
