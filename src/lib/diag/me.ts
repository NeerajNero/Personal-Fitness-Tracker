/** The "Me" section of Diagnostics (every user) and the one-line day state the bot's `diag` prints. */
import { sql } from "drizzle-orm";
import { forUser, type UserId } from "@/lib/db/scope";
import { getDayState, type DayState } from "@/lib/rules/dayState";
import { todayIST } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { getUser, isAllowedEmail } from "@/lib/users";
import { n0 } from "@/lib/format";
import { errorLine, fmtUtc, maskChatId, type DiagSection } from "./text";

const MY_TABLES = [
  "foods", "food_log", "daily_metrics", "measurements", "exercises", "routine_days", "routine_exercises", "sessions",
  "session_exercises", "sets", "activities", "nudge_log", "pending_parses", "diag_events",
] as const;

export type MeDiag = {
  email: string; userId: string; admin: boolean; allowed: boolean; onboardedAt: Date | null;
  session: { issuedAt: Date | null; age: string | null };
  telegram: { linked: boolean; chat: string; blocked: boolean; hasCode: boolean };
  /** Per-table row counts, or the error line when that query failed (e.g. a table missing before its migration). */
  counts: [string, number][] | { error: string };
};

function age(from: Date): string {
  const min = Math.round((Date.now() - from.getTime()) / 60_000);
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}

export async function collectMe(userId: UserId, session: { iat?: number } = {}): Promise<MeDiag> {
  const u = forUser(userId);
  const [user, settings, counts] = await Promise.all([
    getUser(userId),
    getSettings(userId),
    u.db
      .execute<{ t: string; n: number }>(sql.join(MY_TABLES.map((t) => sql`select ${t} as t, count(*)::int as n from ${sql.identifier(t)} where user_id = ${u.uid}`), sql` union all `))
      .then((r) => r.rows.map((x): [string, number] => [x.t, x.n]), (e) => ({ error: errorLine(e) })),
  ]);
  const issuedAt = session.iat ? new Date(session.iat * 1000) : null;
  return {
    email: user?.email ?? "?", userId, admin: user?.isAdmin ?? false, allowed: user ? isAllowedEmail(user.email) : false, onboardedAt: user?.onboardedAt ?? null,
    session: { issuedAt, age: issuedAt ? age(issuedAt) : null },
    telegram: { linked: settings.telegramChatId !== null, chat: maskChatId(settings.telegramChatId), blocked: settings.telegramBlockedAt !== null, hasCode: settings.telegramLinkCode !== null },
    counts,
  };
}

export const collectDayState = (userId: UserId): Promise<DayState> => getDayState(userId, todayIST());

/** DayState as the chips and the bot read it; the one function field is dropped (not serialisable). */
export function dayStateJson(state: DayState): string {
  return JSON.stringify({ ...state, flags: { ...state.flags, foodLoggedSince: undefined } }, null, 2);
}

/** "2026-11-02 · 1234/1925 kcal · 80/140 g · Pull not started · cardio 0 min · 73.5 kg · 8,500 steps" */
export function dayStateLine(s: DayState): string {
  const plan = s.dayPlan.kind === "workout" ? `${s.dayPlan.typeName} ${s.flags.workoutLogged ? "logged" : s.flags.sessionId ? "no sets" : "not started"}`
    : s.dayPlan.kind === "custom" ? `custom ${s.flags.workoutLogged ? "logged" : "not started"}`
    : s.dayPlan.kind === "rest" ? "rest" : `unset${s.nextUp ? ` (next ${s.nextUp.typeName})` : ""}`;
  const parts = [s.date, `${n0(s.totals.kcal)}/${n0(s.targets.kcal)} kcal`, `${n0(s.totals.protein)}/${s.targets.proteinMin} g`, plan, `cardio ${n0(s.cardio.minutes)} min`];
  if (s.metrics.weightKg !== null) parts.push(`${s.metrics.weightKg} kg`);
  if (s.metrics.steps !== null) parts.push(`${n0(s.metrics.steps)} steps`);
  return parts.join(" · ");
}

export function meSection(m: MeDiag): DiagSection {
  return {
    title: "Me",
    lines: [
      ["Account", `${m.email} · id ${m.userId} · ${m.admin ? "admin" : "user"} · ${m.allowed ? "in ALLOWED_EMAILS" : "NOT in ALLOWED_EMAILS"}`],
      ["Onboarded", m.onboardedAt ? fmtUtc(m.onboardedAt) : "no"],
      ["Session", m.session.issuedAt ? `issued ${fmtUtc(m.session.issuedAt)} · age ${m.session.age}` : "no issued-at in token"],
      ["Telegram", `${m.telegram.linked ? `linked (chat ${m.telegram.chat})` : "not linked"}${m.telegram.blocked ? " · BLOCKED (write to the bot to resume)" : ""} · link code ${m.telegram.hasCode ? "present" : "none"}`],
      ["My rows", "error" in m.counts ? `FAILED (${m.counts.error})` : m.counts.map(([t, n]) => `${t} ${n}`).join(", ")],
    ],
  };
}

export const DAY_STATE_TITLE = "Today's DayState (what the chips and the bot read)";

export function dayStateSection(state: DayState): DiagSection {
  return { title: DAY_STATE_TITLE, lines: [["One line", dayStateLine(state)]], block: dayStateJson(state) };
}
