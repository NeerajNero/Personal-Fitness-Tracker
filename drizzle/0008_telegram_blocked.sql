-- settings.telegram_blocked_at: set by /api/tick when a send gets 403 (the person blocked the bot); cleared by their next
-- message. Additive and re-runnable.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "telegram_blocked_at" timestamp with time zone;
