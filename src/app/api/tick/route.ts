/**
 * Scheduler entry point, pinged every 15 min by cron-job.org with `x-tick-secret`.
 * Runs the rules once per onboarded user with a linked chat, each with their own settings and daily cap.
 * ?dry=1  — evaluate only, send nothing, log nothing.
 * ?force=<rule key> — send that rule now to every linked user regardless of window/condition/cap; still logged.
 * Response carries rule keys and skip reasons only — never message bodies, emails or chat ids.
 */
import { istNow } from "@/lib/dates";
import { evaluate, send } from "@/lib/rules/engine";
import { getSettings } from "@/lib/settings";
import { listLinkedUsers } from "@/lib/users";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.TICK_SECRET;
  if (!secret || req.headers.get("x-tick-secret") !== secret) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") ?? undefined;
  const now = istNow();

  const users = [];
  for (const { userId, chatId } of await listLinkedUsers()) {
    const settings = await getSettings(userId);
    const ev = await evaluate(userId, settings, now, { force });
    const sent = !dry ? await send(userId, chatId, ev.due, now) : [];
    users.push({ user: userId.slice(0, 8), due: ev.due.map((d) => d.logKey), sent, skipped: ev.skipped, sentToday: ev.sentToday });
  }

  return Response.json({ now: { date: now.date, time: now.time }, dry, force: force ?? null, users });
}
