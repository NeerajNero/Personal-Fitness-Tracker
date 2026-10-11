CREATE TYPE "public"."log_source" AS ENUM('app', 'telegram', 'ai');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('veg', 'nonveg');--> statement-breakpoint
CREATE TYPE "public"."phase_tag" AS ENUM('veg', 'nonveg', 'both');--> statement-breakpoint
CREATE TYPE "public"."routine_day_name" AS ENUM('UpperA', 'LowerA', 'UpperB', 'LowerB');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"minutes" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"date" date PRIMARY KEY NOT NULL,
	"weight_kg" numeric(5, 2),
	"steps" integer,
	"water_glasses" smallint,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"muscle_group" text NOT NULL,
	"cues" text,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"time" time NOT NULL,
	"food_id" integer,
	"label" text NOT NULL,
	"qty" numeric(7, 2) DEFAULT 1 NOT NULL,
	"kcal" numeric(7, 1) NOT NULL,
	"protein_g" numeric(6, 1) NOT NULL,
	"cost_inr" numeric(8, 2) DEFAULT 0 NOT NULL,
	"source" "log_source" DEFAULT 'app' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"serving_label" text NOT NULL,
	"serving_grams" numeric(7, 2),
	"kcal" numeric(7, 1) NOT NULL,
	"protein_g" numeric(6, 1) NOT NULL,
	"cost_inr" numeric(8, 2) DEFAULT 0 NOT NULL,
	"phase_tag" "phase_tag" DEFAULT 'both' NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"navel_cm" numeric(5, 2),
	"waist_cm" numeric(5, 2),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nudge_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rule_key" text NOT NULL,
	"date" date NOT NULL,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "routine_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" "routine_day_name" NOT NULL,
	"weekday" smallint NOT NULL,
	"sort_order" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_exercises" (
	"routine_day_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"sort_order" smallint NOT NULL,
	"target_sets" smallint DEFAULT 3 NOT NULL,
	"target_reps" smallint DEFAULT 8 NOT NULL,
	CONSTRAINT "routine_exercises_routine_day_id_exercise_id_pk" PRIMARY KEY("routine_day_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"routine_day_id" integer,
	"incline_walk" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"exercise_id" integer NOT NULL,
	"set_no" smallint NOT NULL,
	"weight_kg" numeric(6, 2) NOT NULL,
	"reps" smallint NOT NULL,
	"rpe" numeric(3, 1),
	"is_working" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"telegram_chat_id" text,
	"telegram_link_code" text,
	"weight_kg" numeric(5, 2),
	"height_cm" numeric(5, 1),
	"age" smallint,
	"sex" "sex",
	"onboarded_at" timestamp with time zone,
	"kcal_target" integer DEFAULT 1925 NOT NULL,
	"kcal_min" integer DEFAULT 1900 NOT NULL,
	"kcal_max" integer DEFAULT 1950 NOT NULL,
	"phase_override" "phase",
	"phase_switch_date" date DEFAULT '2026-12-01' NOT NULL,
	"protein_min_veg" integer DEFAULT 85 NOT NULL,
	"protein_max_veg" integer DEFAULT 100 NOT NULL,
	"protein_min_nonveg" integer DEFAULT 115 NOT NULL,
	"protein_max_nonveg" integer DEFAULT 130 NOT NULL,
	"budget_veg_inr" numeric(8, 2) DEFAULT 4800 NOT NULL,
	"budget_nonveg_inr" numeric(8, 2) DEFAULT 5000 NOT NULL,
	"steps_min" integer DEFAULT 8000 NOT NULL,
	"steps_max" integer DEFAULT 10000 NOT NULL,
	"navel_start_cm" numeric(5, 2) DEFAULT 90 NOT NULL,
	"waist_start_cm" numeric(5, 2) DEFAULT 86 NOT NULL,
	"navel_goal_min_cm" numeric(5, 2) DEFAULT 76 NOT NULL,
	"navel_goal_max_cm" numeric(5, 2) DEFAULT 78 NOT NULL,
	"goal_date" date DEFAULT '2027-10-11' NOT NULL,
	"checkpoint_date" date DEFAULT '2026-12-10' NOT NULL,
	"smoke_free_since" date DEFAULT '2026-09-27',
	"nudge_morning_brief" boolean DEFAULT true NOT NULL,
	"nudge_lunch_check" boolean DEFAULT true NOT NULL,
	"nudge_protein_check" boolean DEFAULT true NOT NULL,
	"nudge_kcal_check" boolean DEFAULT true NOT NULL,
	"nudge_day_close" boolean DEFAULT true NOT NULL,
	"nudge_water" boolean DEFAULT false NOT NULL,
	"nudge_weekly_measure" boolean DEFAULT true NOT NULL,
	"nudge_budget" boolean DEFAULT true NOT NULL,
	"nudge_milestones" boolean DEFAULT true NOT NULL,
	"nudge_daily_cap" smallint DEFAULT 6 NOT NULL,
	"quiet_hours_start" time DEFAULT '22:30' NOT NULL,
	"quiet_hours_end" time DEFAULT '07:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_routine_day_id_routine_days_id_fk" FOREIGN KEY ("routine_day_id") REFERENCES "public"."routine_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_exercises" ADD CONSTRAINT "routine_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_routine_day_id_routine_days_id_fk" FOREIGN KEY ("routine_day_id") REFERENCES "public"."routine_days"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_date_idx" ON "activities" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_name_uq" ON "exercises" USING btree ("name");--> statement-breakpoint
CREATE INDEX "food_log_date_idx" ON "food_log" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_name_uq" ON "foods" USING btree ("name");--> statement-breakpoint
CREATE INDEX "measurements_date_idx" ON "measurements" USING btree ("date");--> statement-breakpoint
CREATE INDEX "nudge_log_date_rule_key_idx" ON "nudge_log" USING btree ("date","rule_key");--> statement-breakpoint
CREATE INDEX "nudge_log_date_idx" ON "nudge_log" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "routine_days_name_uq" ON "routine_days" USING btree ("name");--> statement-breakpoint
CREATE INDEX "sessions_date_idx" ON "sessions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sets_session_id_idx" ON "sets" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sets_session_exercise_setno_uq" ON "sets" USING btree ("session_id","exercise_id","set_no");