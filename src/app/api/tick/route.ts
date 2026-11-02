/**
 * Scheduler entry point, pinged every 15 min by cron-job.org with `x-tick-secret`.
 * Runs the rules once per onboarded user with a linked chat, each with their own settings and daily cap.
 * One user's failure never stops the others: it's caught, reported per user as the error class, and a 403 (they blocked
 * the bot) marks their chat blocked so they're skipped until they write to the bot again.
 * ?dry=1  — evaluate only, send nothing, log nothing.
 * ?force=<rule key> — send that rule now to every linked user regardless of window/condition/cap; still logged.
 * Response carries rule keys, skip reasons and error classes only — never message bodies, emails or chat ids.
 */
import { istNow } from "@/lib/dates";
import { evaluate, send } from "@/lib/rules/engine";
import { getSettings } from "@/lib/settings";
import { describeSendError } from "@/lib/telegram/send";
import { listLinkedUsers, markChatBlocked } from "@/lib/users";

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
    const user = userId.slice(0, 8);
    try {
      const settings = await getSettings(userId);
      const ev = await evaluate(userId, settings, now, { force });
      const sent = !dry ? await send(userId, chatId, ev.due, now) : [];
      users.push({ user, ok: true, due: ev.due.map((d) => d.logKey), sent, skipped: ev.skipped, sentToday: ev.sentToday });
    } catch (err) {
      const failure = describeSendError(err);
      if (failure.blocked && !dry) await markChatBlocked(userId);
      console.error(`tick: user ${user} failed: ${failure.error}${failure.code ? ` ${failure.code}` : ""}`);
      users.push({ user, ok: false, error: failure.error, code: failure.code, blocked: failure.blocked });
    }
  }

  return Response.json({ now: { date: now.date, time: now.time }, dry, force: force ?? null, users });
}
