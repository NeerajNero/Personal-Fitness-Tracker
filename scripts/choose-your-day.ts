/**
 * One-off data step for "choose your day". Run AFTER migration 0005. Idempotent — safe to re-run.
 *   pnpm choose-day:dry   — print what would change, write nothing
 *   pnpm choose-day       — apply
 *
 * 1. Create Push / Pull / Legs (rotation order 1–3) from EXISTING exercises only, 3 × 8.
 *    A type that already exists is left alone; exercises are only added to a type that has none.
 * 2. Archive Upper A/B and Lower A/B (history stays; they move after the active types).
 * 3. Convert "No training today" marks (nudge_log `mark:no_training`) into rest days
 *    (daily_metrics.rest_day), except dates whose session has sets — those are reported, not changed.
 * Prints names only, never secrets.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db";
import { dailyMetrics, exercises, routineDays, routineExercises } from "../src/db/schema";

const DRY = process.argv.includes("dry");

const TYPES: { name: string; exercises: string[] }[] = [
  { name: "Push", exercises: ["Flat bench press", "Overhead press", "Incline DB press", "Lateral raise", "Triceps pushdown"] },
  { name: "Pull", exercises: ["Pull-up (or assisted)", "Lat pulldown (wide)", "Barbell row", "Chest-supported row", "Face pull", "Biceps curl"] },
  { name: "Legs", exercises: ["Back squat", "Romanian deadlift", "Leg press", "Leg curl", "Leg extension", "Standing calf raise", "Hanging knee raise"] },
];
const LEGACY = ["UpperA", "LowerA", "UpperB", "LowerB"];
const NO_TRAINING_MARK = "mark:no_training";

async function main() {
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "APPLYING\n");

  const exRows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises);
  const exByName = new Map(exRows.map((e) => [e.name.toLowerCase(), e.id]));
  const typeRows = await db.select({ id: routineDays.id, name: routineDays.name, archived: routineDays.archived }).from(routineDays);
  const typeByName = new Map(typeRows.map((t) => [t.name.toLowerCase(), t]));
  const unmatched: string[] = [];

  // 1. Push / Pull / Legs
  for (const [i, t] of TYPES.entries()) {
    const ids = t.exercises.flatMap((n) => {
      const id = exByName.get(n.toLowerCase());
      if (id === undefined) unmatched.push(`${t.name}: ${n}`);
      return id === undefined ? [] : [id];
    });
    let typeId = typeByName.get(t.name.toLowerCase())?.id;
    if (typeId === undefined) {
      console.log(`+ create ${t.name} (rotation ${i + 1})`);
      if (!DRY) [{ id: typeId }] = await db.insert(routineDays).values({ name: t.name, sortOrder: i + 1, weekday: null }).returning({ id: routineDays.id });
    } else {
      console.log(`= ${t.name} exists — left as is`);
    }
    const [{ n }] = typeId === undefined ? [{ n: 0 }] : await db.select({ n: sql<number>`count(*)::int` }).from(routineExercises).where(eq(routineExercises.routineDayId, typeId));
    if (n > 0) {
      console.log(`  ${t.name} already has ${n} exercises — not touched`);
    } else {
      console.log(`  + ${ids.length} exercises, 3 × 8`);
      if (!DRY && typeId !== undefined && ids.length) {
        await db.insert(routineExercises).values(ids.map((exerciseId, k) => ({ routineDayId: typeId!, exerciseId, sortOrder: k + 1, targetSets: 3, targetReps: 8 }))).onConflictDoNothing();
      }
    }
  }

  // 2. Archive the legacy Upper/Lower types and move them after the active ones.
  const toArchive = typeRows.filter((t) => LEGACY.includes(t.name) && !t.archived);
  console.log(`\n${toArchive.length ? `~ archive ${toArchive.map((t) => t.name).join(", ")}` : "= legacy types already archived (or absent)"}`);
  if (!DRY && toArchive.length) {
    await db.update(routineDays).set({ archived: true, sortOrder: sql`${routineDays.sortOrder} + 100` }).where(inArray(routineDays.id, toArchive.map((t) => t.id)));
  }

  // 3. "No training today" marks → rest days.
  const marks = await db.execute<{ date: string; set_count: number; rest_day: boolean | null }>(sql`
    select m.date::text as date,
      (select count(*) from sets st join sessions s on s.id = st.session_id where s.date = m.date)::int as set_count,
      (select dm.rest_day from daily_metrics dm where dm.date = m.date) as rest_day
    from (select distinct date from nudge_log where rule_key = ${NO_TRAINING_MARK}) m
    order by m.date`);
  const convert = marks.rows.filter((m) => m.set_count === 0 && m.rest_day !== true);
  const conflicts = marks.rows.filter((m) => m.set_count > 0);
  console.log(`\n~ rest days from marks: ${convert.length} to convert, ${marks.rows.length - convert.length - conflicts.length} already rest`);
  for (const c of conflicts) console.log(`  ! ${c.date} has a "no training" mark but ${c.set_count} sets — left as a workout day`);
  if (!DRY) {
    for (const m of convert) {
      await db.insert(dailyMetrics).values({ date: m.date, restDay: true }).onConflictDoUpdate({ target: dailyMetrics.date, set: { restDay: true, updatedAt: new Date() } });
    }
  }
  // Marks are kept (no deletes); nothing reads them any more.

  console.log(unmatched.length ? `\nUNMATCHED exercise names (not added):\n  ${unmatched.join("\n  ")}` : "\nAll exercise names matched.");
}

main()
  .then(() => {
    console.log(DRY ? "\ndry run complete" : "\ndone");
    process.exit(0);
  })
  .catch((err) => {
    console.error("failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
