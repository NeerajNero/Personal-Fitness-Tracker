/**
 * Scheduler entry point, pinged every 15 min by cron-job.org with `x-tick-secret`. The work is `runTick` (src/lib/rules/tick.ts).
 * ?dry=1  — evaluate only, send nothing, log nothing to nudge_log.
 * ?force=<rule key> — send that rule now to every linked user regardless of window/condition/cap; still logged.
 * Response carries rule keys, skip reasons and error classes only — never message bodies, emails or chat ids.
 */
import { runTick } from "@/lib/rules/tick";

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.TICK_SECRET;
  if (!secret || req.headers.get("x-tick-secret") !== secret) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const result = await runTick({ dry: url.searchParams.get("dry") === "1", force: url.searchParams.get("force") ?? undefined });
  return Response.json(result);
}
