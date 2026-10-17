/**
 * getDayState — the single source of truth for "where am I today".
 * The Today card, the Today/Train day picker, the Telegram bot and every nudge read from this. Never duplicate this logic.
 *
 * `foodLoggedSince` is a function, so strip it (or pick fields) before passing
 * a DayState to a client component.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dailyMetrics, foodLog, routineDays, sessions, type Settings } from "@/db/schema";
import { daysBetween } from "@/lib/dates";
import { getTargets, type Targets } from "@/lib/metrics/phase";
import { typeLabel } from "@/lib/routine";
import { getSettings } from "@/lib/settings";

/**
 * What the owner chose for the date. Precedence: rest flag → session with a type (workout) → session without one (custom) → unset.
 * `typeName` is the display label.
 */
export type DayPlan = { kind: "unset" | "rest" | "workout" | "custom"; typeId: number | null; typeName: string | null };
export type TypeRef = { typeId: number; typeName: string };

/** Active workout types (rotation order) with their history before `date`. */
export type TypeHistory = TypeRef & { lastDate: string | null };

/**
 * Next active type after the most recently trained active type (sessions with ≥1 set before `date`).
 * Rest and custom days don't advance it. No history → the first active type.
 */
export function nextUpFrom(active: TypeHistory[]): TypeRef | null {
  if (active.length === 0) return null;
  let last = -1;
  active.forEach((t, i) => {
    if (t.lastDate && (last < 0 || t.lastDate >= active[last].lastDate!)) last = i;
  });
  const next = active[(last + 1) % active.length];
  return { typeId: next.typeId, typeName: next.typeName };
}

/** Every workout type (active + archived) with the last date it was trained before `date`. */
export async function loadTypeHistory(date: string): Promise<(TypeHistory & { archived: boolean })[]> {
  const res = await db.execute<{ id: number; name: string; archived: boolean; last_date: string | null }>(sql`
    select rd.id, rd.name, rd.archived,
      (select max(s.date)::text from sessions s
        where s.routine_day_id = rd.id and s.date < ${date}
          and exists (select 1 from sets st where st.session_id = s.id)) as last_date
    from routine_days rd
    order by rd.sort_order, rd.id`);
  return res.rows.map((r) => ({ typeId: r.id, typeName: typeLabel(r.name), archived: r.archived, lastDate: r.last_date }));
}

export type DayState = {
  /** IST calendar date "YYYY-MM-DD". */
  date: string;
  targets: Targets;
  totals: { kcal: number; protein: number; cost: number; entries: number };
  /** Negative when over target. Protein is measured against the phase minimum. */
  remaining: { kcal: number; protein: number };
  metrics: { weightKg: number | null; steps: number | null; waterGlasses: number | null };
  /** The day's choice (rest / a workout type / custom), or unset. */
  dayPlan: DayPlan;
  /** Suggested workout type (rotation); null when there are no active types. */
  nextUp: TypeRef | null;
  /** Active types in rotation order with days since each was last trained before this date (null = never). */
  daysSince: (TypeRef & { days: number | null })[];
  flags: {
    weightLogged: boolean;
    stepsLogged: boolean;
    /** True once the session has at least one set or the incline walk is ticked. */
    workoutLogged: boolean;
    /** Set whenever a session row exists for the date, even if nothing is logged in it yet. */
    sessionId: number | null;
    /** "HH:MM:SS" IST of the latest food entry, or null. */
    lastFoodAt: string | null;
    /** True if any food was logged at or after `time` ("HH:MM" or "HH:MM:SS"). */
    foodLoggedSince: (time: string) => boolean;
  };
  /** Days since settings.smoke_free_since, or null when unset. */
  smokeFreeDays: number | null;
};

export async function getDayState(date: string, opts: { settings?: Settings } = {}): Promise<DayState> {
  const [s, totals, metrics, types, session] = await Promise.all([
    opts.settings ? Promise.resolve(opts.settings) : getSettings(),
    db
      .select({
        kcal: sql<number>`coalesce(sum(${foodLog.kcal}), 0)::float`,
        protein: sql<number>`coalesce(sum(${foodLog.proteinG}), 0)::float`,
        cost: sql<number>`coalesce(sum(${foodLog.costInr}), 0)::float`,
        entries: sql<number>`count(*)::int`,
        lastFoodAt: sql<string | null>`max(${foodLog.time})::text`,
      })
      .from(foodLog)
      .where(eq(foodLog.date, date))
      .then((r) => r[0]),
    db
      .select()
      .from(dailyMetrics)
      .where(eq(dailyMetrics.date, date))
      .then((r) => r[0] ?? null),
    loadTypeHistory(date),
    db
      .select({
        id: sessions.id,
        typeId: sessions.routineDayId,
        typeName: routineDays.name,
        inclineWalk: sessions.inclineWalk,
        // Fully qualified on purpose: drizzle would render the outer id unqualified and the subquery would bind it to sets.id.
        setCount: sql<number>`(select count(*) from "sets" st where st."session_id" = "sessions"."id")::int`,
      })
      .from(sessions)
      .leftJoin(routineDays, eq(routineDays.id, sessions.routineDayId))
      .where(eq(sessions.date, date))
      .orderBy(desc(sessions.id))
      .limit(1)
      .then((r) => r[0] ?? null),
  ]);

  const targets = getTargets(date, s);
  const lastFoodAt = totals.lastFoodAt;
  const active = types.filter((t) => !t.archived);
  const dayPlan: DayPlan = metrics?.restDay
    ? { kind: "rest", typeId: null, typeName: null }
    : session?.typeId != null
      ? { kind: "workout", typeId: session.typeId, typeName: session.typeName ? typeLabel(session.typeName) : null }
      : session
        ? { kind: "custom", typeId: null, typeName: null }
        : { kind: "unset", typeId: null, typeName: null };

  return {
    date,
    targets,
    totals: { kcal: totals.kcal, protein: totals.protein, cost: totals.cost, entries: totals.entries },
    remaining: { kcal: targets.kcal - totals.kcal, protein: targets.proteinMin - totals.protein },
    metrics: {
      weightKg: metrics?.weightKg ?? null,
      steps: metrics?.steps ?? null,
      waterGlasses: metrics?.waterGlasses ?? null,
    },
    dayPlan,
    nextUp: nextUpFrom(active),
    daysSince: active.map((t) => ({ typeId: t.typeId, typeName: t.typeName, days: t.lastDate ? daysBetween(t.lastDate, date) : null })),
    flags: {
      weightLogged: metrics?.weightKg != null,
      stepsLogged: metrics?.steps != null,
      workoutLogged: session !== null && (session.inclineWalk || session.setCount > 0),
      sessionId: session?.id ?? null,
      lastFoodAt,
      foodLoggedSince: (time) => lastFoodAt !== null && lastFoodAt >= time,
    },
    smokeFreeDays: s.smokeFreeSince ? Math.max(0, daysBetween(s.smokeFreeSince, date)) : null,
  };
}
