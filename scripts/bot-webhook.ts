/**
 * Telegram webhook management. Reads .env via `node --env-file`. Prints no secrets.
 *   pnpm bot:set-webhook https://your-app.vercel.app   (or a cloudflared URL)
 *   pnpm bot:webhook-info
 *   pnpm bot:delete-webhook
 */
import { Api } from "grammy";

async function main() {
  const [cmd, urlArg] = process.argv.slice(2);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const api = new Api(token);

  if (cmd === "set") {
    if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
    if (!urlArg) throw new Error("usage: pnpm bot:set-webhook <https-url>");
    const base = urlArg.replace(/\/$/, "");
    const url = base.endsWith("/api/telegram") ? base : `${base}/api/telegram`;
    if (!url.startsWith("https://")) throw new Error("webhook URL must be https");
    await api.setWebhook(url, { secret_token: secret, drop_pending_updates: true, allowed_updates: ["message", "callback_query"] });
    console.log(`webhook set → ${url}`);
  } else if (cmd === "info") {
    const i = await api.getWebhookInfo();
    console.log(`url: ${i.url || "(none)"}`);
    console.log(`pending updates: ${i.pending_update_count}`);
    console.log(`secret token configured: ${secret ? "yes" : "no"} (Telegram never returns it)`);
    if (i.last_error_date) console.log(`last error: ${new Date(i.last_error_date * 1000).toISOString()} — ${i.last_error_message ?? ""}`);
    else console.log("last error: none");
  } else if (cmd === "delete") {
    await api.deleteWebhook({ drop_pending_updates: true });
    console.log("webhook deleted");
  } else {
    throw new Error("usage: bot-webhook.ts set <url> | info | delete");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
