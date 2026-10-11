/**
 * Scheduler entry point, pinged every 15 min by cron-job.org with `x-tick-secret`.
 * ?dry=1  — evaluate only, send nothing, log nothing.
 * ?force=<rule key> — send that rule now regardless of window/condition/cap; still logged.
 * Response carries rule keys and skip reasons only — never message bodies.
 */
import { istNow } from "@/lib/dates";
import { evaluate, send } from "@/lib/rules/engine";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.TICK_SECRET;
  if (!secret || req.headers.get("x-tick-secret") !== secret) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") ?? undefined;
  const now = istNow();

  const ev = await evaluate(now, { force });
  const linked = !ev.skipped.some((s) => s.reason === "not_linked");
  const sent = linked && !dry ? await send(ev.due, now) : [];

  return Response.json({
    now: { date: now.date, time: now.time },
    dry,
    force: force ?? null,
    due: ev.due.map((d) => d.logKey),
    sent,
    skipped: ev.skipped,
    sentToday: ev.sentToday,
  });
}
