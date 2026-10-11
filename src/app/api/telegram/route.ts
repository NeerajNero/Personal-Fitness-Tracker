import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { webhookSecret } from "@/lib/telegram/env";

export const maxDuration = 30;

let handler: ((req: Request) => Promise<Response>) | null = null;

export async function POST(req: Request) {
  const secret = webhookSecret();
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }
  handler ??= webhookCallback(getBot(), "std/http", { timeoutMilliseconds: 25_000, onTimeout: "return", secretToken: secret });
  return handler(req);
}
