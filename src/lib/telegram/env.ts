export function botToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

export function webhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET || null;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}
