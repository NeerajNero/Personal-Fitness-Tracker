/**
 * The home plan (docs/home-program.md): Day A / B / C built from the ladders in one tap, after one question about
 * push-ups. Idempotent: a user who already has a Day A keeps what they have.
 */
import { asc, sql } from "drizzle-orm";
import { exercises, routineDays, routineExercises } from "@/db/schema";
import { forUser, type UserId } from "@/lib/db/scope";
import { BW_RANGE, HOME_DAYS, type PushupAnswer } from "@/lib/routine";

export { PUSHUP_ANSWERS, PUSHUP_LABEL, type PushupAnswer } from "@/lib/routine";

/** Starting push-up rung per answer: wall, incline, knee, standard. Every other ladder starts at rung 2. */
const PUSHUP_RUNG: Record<PushupAnswer, number> = { "0": 1, "1-5": 2, "6-15": 3, "16+": 4 };

type Slot = { ladder: string; levelOffset?: number } | { finisher: string };

/** Each day's slots in order. `levelOffset` = rungs above the ladder's start (Day B's hinge). */
export const HOME_PLAN: { name: (typeof HOME_DAYS)[number]["name"]; slots: Slot[] }[] = [
  { name: "Day A", slots: [{ ladder: "push_up" }, { ladder: "squat" }, { ladder: "hinge" }, { ladder: "plank" }, { finisher: "Jumping jacks" }] },
  { name: "Day B", slots: [{ ladder: "row" }, { ladder: "lunge" }, { ladder: "hinge", levelOffset: 1 }, { ladder: "side_plank" }, { ladder: "core" }] },
  { name: "Day C", slots: [{ ladder: "pike" }, { ladder: "lunge", levelOffset: 1 }, { ladder: "wall_sit" }, { ladder: "calves" }, { ladder: "core" }, { finisher: "High knees" }] },
];

export const FINISHER_MINUTES = 10;

/** Create Day A/B/C for a home user. Returns the type ids (existing ones when the plan is already there). */
export async function createHomePlan(userId: UserId, pushups: PushupAnswer): Promise<{ ids: number[]; created: boolean }> {
  const u = forUser(userId);
  const names = HOME_PLAN.map((d) => d.name);
  const existing = await u.db.select({ id: routineDays.id, name: routineDays.name }).from(routineDays).where(u.own(routineDays, sql`lower(${routineDays.name}) in (${sql.join(names.map((n) => sql`${n.toLowerCase()}`), sql`, `)})`));
  if (existing.length) return { ids: names.flatMap((n) => existing.filter((e) => e.name.toLowerCase() === n.toLowerCase()).map((e) => e.id)), created: false };

  const lib = await u.db
    .select({ id: exercises.id, name: exercises.name, ladder: exercises.ladder, level: exercises.ladderLevel, measure: exercises.measure, pattern: exercises.pattern })
    .from(exercises)
    .where(u.visible(sql`'none' = any(${exercises.equipment})`))
    .orderBy(asc(exercises.ladder), asc(exercises.ladderLevel));
  const rungs = (ladder: string) => lib.filter((e) => e.ladder === ladder && e.level !== null).sort((a, b) => a.level! - b.level!);
  const startLevel = (ladder: string) => (ladder === "push_up" ? PUSHUP_RUNG[pushups] : 2);
  const pick = (slot: Slot) => {
    if ("finisher" in slot) return lib.find((e) => e.pattern === "conditioning" && e.name.toLowerCase() === slot.finisher.toLowerCase()) ?? null;
    const list = rungs(slot.ladder);
    if (list.length === 0) return null;
    const want = startLevel(slot.ladder) + (slot.levelOffset ?? 0);
    return list.find((e) => e.level === want) ?? list.find((e) => e.level === startLevel(slot.ladder)) ?? list[0];
  };

  const ids: number[] = [];
  // The highest existing sort order so a user's own types keep their place in the rotation.
  const [{ max }] = await u.db.select({ max: sql<number>`coalesce(max(${routineDays.sortOrder}), 0)::int` }).from(routineDays).where(u.own(routineDays));
  for (const [i, day] of HOME_PLAN.entries()) {
    const [created] = await u.db.insert(routineDays).values(u.stamp({ name: day.name, sortOrder: max + i + 1 })).onConflictDoNothing().returning({ id: routineDays.id });
    if (!created) continue;
    ids.push(created.id);
    const values = day.slots.flatMap((slot, j) => {
      const e = pick(slot);
      if (!e) return [];
      const finisher = "finisher" in slot;
      return [u.stamp({ routineDayId: created.id, exerciseId: e.id, sortOrder: j + 1, targetSets: finisher ? 1 : 3, targetReps: finisher ? FINISHER_MINUTES : BW_RANGE[e.measure].bottom })];
    });
    if (values.length) await u.db.insert(routineExercises).values(values).onConflictDoNothing();
  }
  return { ids, created: true };
}

/** How many sessions with at least one set fall in the ISO week of `date`, before `date` (for the weekly rotation). */
export async function trainedThisWeek(userId: UserId, date: string, monday: string): Promise<number> {
  const u = forUser(userId);
  const res = await u.db.execute<{ n: number }>(sql`
    select count(*)::int as n from sessions s
    where s.user_id = ${u.uid} and s.date >= ${monday} and s.date < ${date}
      and exists (select 1 from sets st where st.session_id = s.id)`);
  return res.rows[0]?.n ?? 0;
}
