ALTER TABLE "settings" ALTER COLUMN "nudge_lunch_check" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "nudge_protein_check" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "nudge_kcal_check" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "nudge_budget" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "nudge_daily_cap" SET DEFAULT 4;--> statement-breakpoint
-- Apply the simplified nudge set to the existing settings row (owner can re-enable any of these in Settings).
UPDATE "settings" SET "nudge_lunch_check" = false, "nudge_protein_check" = false, "nudge_kcal_check" = false, "nudge_budget" = false, "nudge_daily_cap" = 4 WHERE "id" = 1;
