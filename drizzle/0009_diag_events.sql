-- diag_events: operational events for Settings → Diagnostics (bot, tick, send, gemini, action). user_id null = system-wide.
-- Pruned to 7 days by /api/tick. Additive and re-runnable.
DO $$ BEGIN CREATE TYPE "public"."diag_level" AS ENUM('info', 'warn', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diag_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"scope" text NOT NULL,
	"level" "diag_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "diag_events" ADD CONSTRAINT "diag_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diag_events_user_at_idx" ON "diag_events" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diag_events_at_idx" ON "diag_events" USING btree ("at");
