/**
 * Rules engine. `evaluate(now)` decides what is due; `send(due)` delivers via Telegram and
 * records nudge_log. Idempotent per key per IST date (water uses slot keys like water_10),
 * capped per day, silent in quiet hours, each rule behind its settings toggle.
 */
import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { InlineKeyboardButton } from "grammy/types";
import { db } from "@/db";
import { nudgeLog, type Settings } from "@/db/schema";
import { inQuietHours, type IstNow } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { sendMessage } from "@/lib/telegram/send";
import { getDayState, type DayState } from "./dayState";
import { makeLoaders, type Loaders } from "./loaders";
import { RULES } from "./rules";

export type RuleMessage = { text: string; inlineKeyboard?: InlineKeyboardButton[][] };

export type RuleCtx = {
  now: IstNow;
  settings: Settings;
  state: DayState;
  /** rule_keys already logged (today for `day` rules; this month / ever for the others). */
  logged: Set<string>;
  load: Loaders;
};

export type Rule = {
  key: string;
  /** IST window, inclusive start, exclusive end. */
  window: { start: string; end: string };
  /** ISO weekdays the rule may fire on. */
  days?: number[];
  /** Idempotency scope. Default "day". */
  once?: "day" | "month" | "ever" | "custom";
  enabled: (s: Settings) => boolean;
  condition: (ctx: RuleCtx) => Promise<boolean> | boolean;
  message: (ctx: RuleCtx) => Promise<RuleMessage> | RuleMessage;
  /** Key written to nudge_log (default `key`). Water → `water_10`; weekly report → `weekly_report_<monday>`. */
  logKey?: (ctx: RuleCtx) => string;
};

export type Due = { key: string; logKey: string; message: RuleMessage; forced: boolean };
export type Skipped = { key: string; reason: "disabled" | "quiet_hours" | "outside_window" | "already_sent" | "daily_cap" | "condition_false" | "not_linked" | "unknown_rule" };
export type Evaluation = { due: Due[]; skipped: Skipped[]; sentToday: number };

const MARK_PREFIX = "mark:";

function inWindow(rule: Rule, now: IstNow): boolean {
  if (rule.days && !rule.days.includes(now.weekday)) return false;
  const [sh, sm] = rule.window.start.split(":").map(Number);
  const [eh, em] = rule.window.end.split(":").map(Number);
  return now.minutes >= sh * 60 + sm && now.minutes < eh * 60 + em;
}

async function loadLogged(now: IstNow): Promise<{ logged: Set<string>; sentToday: number }> {
  const monthKeys = RULES.filter((r) => r.once === "month").map((r) => r.key);
  const everKeys = RULES.filter((r) => r.once === "ever").map((r) => r.key);
  const monthStart = `${now.date.slice(0, 7)}-01`;
  const rows = await db
    .select({ ruleKey: nudgeLog.ruleKey, date: nudgeLog.date })
    .from(nudgeLog)
    .where(
      or(
        eq(nudgeLog.date, now.date),
        monthKeys.length ? and(inArray(nudgeLog.ruleKey, monthKeys), gte(nudgeLog.date, monthStart)) : sql`false`,
        everKeys.length ? inArray(nudgeLog.ruleKey, everKeys) : sql`false`,
        sql`${nudgeLog.ruleKey} like 'weekly_report_%' and ${nudgeLog.date} >= ${now.date}::date - 8`,
      ),
    );
  const logged = new Set(rows.map((r) => r.ruleKey));
  const sentToday = rows.filter((r) => r.date === now.date && !r.ruleKey.startsWith(MARK_PREFIX)).length;
  return { logged, sentToday };
}

export async function evaluate(now: IstNow, opts: { force?: string } = {}): Promise<Evaluation> {
  const settings = await getSettings();
  if (!settings.telegramChatId) return { due: [], skipped: [{ key: "*", reason: "not_linked" }], sentToday: 0 };

  const [state, { logged, sentToday }] = await Promise.all([getDayState(now.date, { settings }), loadLogged(now)]);
  const ctx: RuleCtx = { now, settings, state, logged, load: makeLoaders(now, settings, state) };

  if (opts.force) {
    const rule = RULES.find((r) => r.key === opts.force);
    if (!rule) return { due: [], skipped: [{ key: opts.force, reason: "unknown_rule" }], sentToday };
    const message = await rule.message(ctx);
    return { due: [{ key: rule.key, logKey: rule.logKey ? rule.logKey(ctx) : rule.key, message, forced: true }], skipped: [], sentToday };
  }

  const due: Due[] = [];
  const skipped: Skipped[] = [];
  const quiet = inQuietHours(now.minutes, settings.quietHoursStart, settings.quietHoursEnd);
  let budget = Math.max(0, settings.nudgeDailyCap - sentToday);

  for (const rule of RULES) {
    const skip = (reason: Skipped["reason"]) => skipped.push({ key: rule.key, reason });
    if (!rule.enabled(settings)) { skip("disabled"); continue; }
    if (quiet) { skip("quiet_hours"); continue; }
    if (!inWindow(rule, now)) { skip("outside_window"); continue; }
    const logKey = rule.logKey ? rule.logKey(ctx) : rule.key;
    if (logged.has(logKey)) { skip("already_sent"); continue; }
    if (budget <= 0) { skip("daily_cap"); continue; }
    if (!(await rule.condition(ctx))) { skip("condition_false"); continue; }
    due.push({ key: rule.key, logKey, message: await rule.message(ctx), forced: false });
    budget--;
  }
  return { due, skipped, sentToday };
}

/** Deliver and record. Returns the keys actually sent. */
export async function send(due: Due[], now: IstNow): Promise<string[]> {
  const sent: string[] = [];
  for (const d of due) {
    const r = await sendMessage(d.message.text, { inlineKeyboard: d.message.inlineKeyboard });
    if (!r.sent) continue;
    await db.insert(nudgeLog).values({
      ruleKey: d.logKey,
      date: now.date,
      payload: { rule: d.key, at: now.time, forced: d.forced || undefined },
    });
    sent.push(d.logKey);
  }
  return sent;
}
