/**
 * One tick: the rules for every onboarded user with a linked, unblocked chat. Used by /api/tick (cron-job.org) and by
 * Settings → Diagnostics → "Run tick (dry)". One user's failure never stops the others: it's caught, reported per user as
 * the error class, and a 403 (they blocked the bot) marks their chat blocked so they're skipped until they write again.
 * Every run writes a `tick / run` diag event (dry ones too, flagged) and a per-user event when something was due or
 * failed; real runs also prune diag events older than 7 days.
 */
import { istNow } from "@/lib/dates";
import { logEvent, pruneEvents } from "@/lib/diag/events";
import { evaluate, send, type Skipped } from "@/lib/rules/engine";
import { getSettings } from "@/lib/settings";
import { describeSendError } from "@/lib/telegram/send";
import { listLinkedUsers, markChatBlocked } from "@/lib/users";

export type TickUserResult =
  | { user: string; ok: true; due: string[]; sent: string[]; skipped: Skipped[]; sentToday: number }
  | { user: string; ok: false; error: string; code: number | null; blocked: boolean };
export type TickResult = { now: { date: string; time: string }; dry: boolean; force: string | null; users: TickUserResult[]; pruned: number };

/** What the run event keeps per user (no skip lists). */
export type TickRunUser = { user: string; ok: boolean; rules: string[]; error?: string; code?: number | null };

export async function runTick(opts: { dry?: boolean; force?: string } = {}): Promise<TickResult> {
  const dry = opts.dry ?? false;
  const force = opts.force ?? null;
  const now = istNow();
  const users: TickUserResult[] = [];

  for (const { userId, chatId } of await listLinkedUsers()) {
    const user = userId.slice(0, 8);
    try {
      const settings = await getSettings(userId);
      const ev = await evaluate(userId, settings, now, { force: force ?? undefined });
      const sent = !dry ? await send(userId, chatId, ev.due, now) : [];
      const due = ev.due.map((d) => d.logKey);
      users.push({ user, ok: true, due, sent, skipped: ev.skipped, sentToday: ev.sentToday });
      if (due.length) await logEvent({ userId, scope: "tick", message: dry ? "due" : "sent", meta: { dry, rules: dry ? due : sent, force } });
    } catch (err) {
      const failure = describeSendError(err);
      if (failure.blocked && !dry) await markChatBlocked(userId);
      console.error(`tick: user ${user} failed: ${failure.error}${failure.code ? ` ${failure.code}` : ""}`);
      users.push({ user, ok: false, error: failure.error, code: failure.code, blocked: failure.blocked });
      await logEvent({ userId, scope: "tick", level: "error", message: "failed", meta: { dry, error: failure.error, code: failure.code } });
      await logEvent({ userId, scope: "send", level: "error", message: failure.error, meta: { code: failure.code, blocked: failure.blocked } });
    }
  }

  const summary: TickRunUser[] = users.map((u) => (u.ok ? { user: u.user, ok: true, rules: dry ? u.due : u.sent } : { user: u.user, ok: false, rules: [], error: u.error, code: u.code }));
  await logEvent({ scope: "tick", message: "run", meta: { dry, force, users: summary } });
  const pruned = dry ? 0 : await pruneEvents(7).catch((e) => (console.error("diag prune failed:", e instanceof Error ? e.name : "error"), 0));
  return { now: { date: now.date, time: now.time }, dry, force, users, pruned };
}
