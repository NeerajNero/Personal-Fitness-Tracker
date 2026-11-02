/**
 * diag_events: what happened, for Settings → Diagnostics and the bot's `diag`. Written by the bot, the tick, Gemini and
 * the server-action error boundary; pruned to 7 days by the tick. Raw db access on purpose (system events have no user,
 * admins read across users), hence the ESLint exception for src/lib/diag/. Never store bodies, chat ids, tokens or codes.
 */
import { desc, eq, isNull, lt, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { diagEvents, users, type DiagLevel } from "@/db/schema";
import type { UserId } from "@/lib/db/scope";

export type DiagScope = "bot" | "tick" | "send" | "gemini" | "action";
export type EventInput = { userId?: UserId | null; scope: DiagScope; level?: DiagLevel; message: string; meta?: Record<string, unknown> | null };
export type EventRow = { id: number; at: Date; userId: string | null; email: string | null; scope: string; level: DiagLevel; message: string; meta: unknown };

/** Never throws: diagnostics must not break the thing it observes. */
export async function logEvent(e: EventInput): Promise<void> {
  try {
    await db.insert(diagEvents).values({ userId: e.userId ?? null, scope: e.scope, level: e.level ?? "info", message: e.message.slice(0, 300), meta: e.meta ?? null });
  } catch (err) {
    console.error("diag event not written:", err instanceof Error ? err.name : "error");
  }
}

/** Mine (`userId`) or, for admins, everyone's (`all`), newest first. */
export async function recentEvents(opts: { userId: UserId; limit?: number } | { all: true; limit?: number }): Promise<EventRow[]> {
  const rows = await db
    .select({ id: diagEvents.id, at: diagEvents.at, userId: diagEvents.userId, email: users.email, scope: diagEvents.scope, level: diagEvents.level, message: diagEvents.message, meta: diagEvents.meta })
    .from(diagEvents)
    .leftJoin(users, eq(users.id, diagEvents.userId))
    .where("all" in opts ? undefined : eq(diagEvents.userId, opts.userId))
    .orderBy(desc(diagEvents.at), desc(diagEvents.id))
    .limit(opts.limit ?? 20);
  return rows;
}

/** Rows older than `days`. Returns how many went. */
export async function pruneEvents(days = 7): Promise<number> {
  const gone = await db.delete(diagEvents).where(lt(diagEvents.at, sql`now() - make_interval(days => ${days})`)).returning({ id: diagEvents.id });
  return gone.length;
}

/** The most recent tick run (system event `tick / run`), dry or not. */
export async function lastTickRun(): Promise<EventRow | null> {
  const [row] = await db
    .select({ id: diagEvents.id, at: diagEvents.at, userId: diagEvents.userId, email: sql<null>`null`, scope: diagEvents.scope, level: diagEvents.level, message: diagEvents.message, meta: diagEvents.meta })
    .from(diagEvents)
    .where(and(isNull(diagEvents.userId), eq(diagEvents.scope, "tick"), eq(diagEvents.message, "run")))
    .orderBy(desc(diagEvents.at), desc(diagEvents.id))
    .limit(1);
  return row ?? null;
}

export type UserEventStats = { lastInbound: Date | null; lastOutbound: Date | null; lastSendError: string | null };

/** Per user: last inbound bot message, last proactive send, last send error class. */
export async function userEventStats(): Promise<Map<string, UserEventStats>> {
  const { rows } = await db.execute<{ user_id: string; last_in: string | null; last_out: string | null; last_err: string | null }>(sql`
    select e.user_id,
      max(e.at) filter (where e.scope = 'bot') as last_in,
      max(e.at) filter (where e.scope = 'tick' and e.message = 'sent') as last_out,
      (select e2.message from diag_events e2 where e2.user_id = e.user_id and e2.scope = 'send' and e2.level = 'error'
         order by e2.at desc, e2.id desc limit 1) as last_err
    from diag_events e where e.user_id is not null group by e.user_id`);
  const toDate = (v: string | null) => (v ? new Date(v) : null);
  return new Map(rows.map((r) => [r.user_id, { lastInbound: toDate(r.last_in), lastOutbound: toDate(r.last_out), lastSendError: r.last_err }]));
}
