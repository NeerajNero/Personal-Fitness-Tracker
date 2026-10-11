/**
 * Idempotent seed. Run with: pnpm seed  (loads .env via node --env-file)
 *
 * - settings: insert id=1 only if missing (never overwrites owner edits)
 * - foods: insert by name; existing rows are left untouched (owner edits in-app)
 * - exercises: upsert by name; muscle_group and cues are refreshed from this file
 * - routine_days / routine_exercises: upserted so the routine always matches the spec
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  exercises,
  foods,
  routineDays,
  routineExercises,
  settings,
} from "../src/db/schema";

const LAT_CUES = [
  "1. Thumbless grip — reduces forearm/biceps takeover",
  "2. Depress scapulae first — shoulders down into back pockets, before the pull",
  "3. Drive elbows down and back toward the hips; don't pull with the hands",
  "Note: upper-trap or forearm pain during pulls = shrugging + biceps dominance.",
].join("\n");

type FoodSeed = {
  name: string;
  servingLabel: string;
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  costInr: number;
  phaseTag: "veg" | "nonveg" | "both";
  isFavourite?: boolean;
};

const FOODS: FoodSeed[] = [
  { name: "Whey (MB Biozyme)", servingLabel: "1 scoop (33 g)", servingGrams: 33, kcal: 120, proteinG: 25, costInr: 75, phaseTag: "veg", isFavourite: true },
  { name: "Soya chunks", servingLabel: "50 g dry", servingGrams: 50, kcal: 170, proteinG: 26, costInr: 10, phaseTag: "veg", isFavourite: true },
  { name: "Paneer", servingLabel: "100 g", servingGrams: 100, kcal: 265, proteinG: 18, costInr: 40, phaseTag: "veg", isFavourite: true },
  { name: "Curd (dahi)", servingLabel: "200 g", servingGrams: 200, kcal: 120, proteinG: 8, costInr: 15, phaseTag: "veg" },
  { name: "Toned milk", servingLabel: "250 ml", servingGrams: 250, kcal: 145, proteinG: 8, costInr: 15, phaseTag: "veg" },
  { name: "Dal (cooked)", servingLabel: "1 cup (50 g raw)", servingGrams: 50, kcal: 170, proteinG: 12, costInr: 8, phaseTag: "veg" },
  { name: "Roti", servingLabel: "1 (30 g atta)", servingGrams: 30, kcal: 100, proteinG: 3, costInr: 3, phaseTag: "veg", isFavourite: true },
  { name: "Rice", servingLabel: "50 g raw", servingGrams: 50, kcal: 175, proteinG: 3.5, costInr: 3, phaseTag: "veg" },
  { name: "Banana", servingLabel: "1", servingGrams: null, kcal: 105, proteinG: 1, costInr: 5, phaseTag: "veg" },
  { name: "Cooking oil", servingLabel: "1 tsp", servingGrams: 5, kcal: 45, proteinG: 0, costInr: 1, phaseTag: "veg" },
  { name: "Black coffee", servingLabel: "1 cup", servingGrams: null, kcal: 5, proteinG: 0, costInr: 2, phaseTag: "veg" },
  { name: "Whole egg", servingLabel: "1", servingGrams: null, kcal: 75, proteinG: 6, costInr: 7, phaseTag: "nonveg" },
  { name: "Chicken breast", servingLabel: "100 g raw", servingGrams: 100, kcal: 120, proteinG: 23, costInr: 30, phaseTag: "nonveg" },
  { name: "Fish (rohu)", servingLabel: "100 g raw", servingGrams: 100, kcal: 100, proteinG: 17, costInr: 25, phaseTag: "nonveg" },
];

type ExerciseSeed = { name: string; muscleGroup: string; pull?: boolean };

// `pull` = lat-dominant pull; gets LAT_CUES attached.
const ROUTINE: Record<"UpperA" | "LowerA" | "UpperB" | "LowerB", ExerciseSeed[]> = {
  UpperA: [
    { name: "Lat pulldown (wide)", muscleGroup: "back", pull: true },
    { name: "Barbell row", muscleGroup: "back", pull: true },
    { name: "Flat bench press", muscleGroup: "chest" },
    { name: "Overhead press", muscleGroup: "shoulders" },
    { name: "Face pull", muscleGroup: "rear delts" },
    { name: "Biceps curl", muscleGroup: "biceps" },
  ],
  LowerA: [
    { name: "Back squat", muscleGroup: "quads" },
    { name: "Romanian deadlift", muscleGroup: "hamstrings" },
    { name: "Leg press", muscleGroup: "quads" },
    { name: "Leg curl", muscleGroup: "hamstrings" },
    { name: "Standing calf raise", muscleGroup: "calves" },
    { name: "Hanging knee raise", muscleGroup: "core" },
  ],
  UpperB: [
    { name: "Pull-up (or assisted)", muscleGroup: "back", pull: true },
    { name: "Chest-supported row", muscleGroup: "back", pull: true },
    { name: "Incline DB press", muscleGroup: "chest" },
    { name: "Lateral raise", muscleGroup: "shoulders" },
    { name: "Straight-arm pulldown", muscleGroup: "back", pull: true },
    { name: "Triceps pushdown", muscleGroup: "triceps" },
  ],
  LowerB: [
    { name: "Trap bar / conventional deadlift", muscleGroup: "posterior chain" },
    { name: "Hack squat (or front squat)", muscleGroup: "quads" },
    { name: "Walking lunge", muscleGroup: "quads" },
    { name: "Leg extension", muscleGroup: "quads" },
    { name: "Seated calf raise", muscleGroup: "calves" },
    { name: "Cable crunch", muscleGroup: "core" },
  ],
};

// ISO weekday: 1=Mon … 7=Sun
const ROUTINE_DAYS = [
  { name: "UpperA", weekday: 1, sortOrder: 1 },
  { name: "LowerA", weekday: 2, sortOrder: 2 },
  { name: "UpperB", weekday: 4, sortOrder: 3 },
  { name: "LowerB", weekday: 5, sortOrder: 4 },
] as const;

async function main() {
  // settings (id=1) — insert only if missing
  const s = await db.insert(settings).values({ id: 1 }).onConflictDoNothing().returning({ id: settings.id });
  console.log(`settings: ${s.length ? "inserted" : "exists"}`);

  // foods — insert by name, leave existing rows alone
  const f = await db
    .insert(foods)
    .values(FOODS.map((x) => ({ ...x, isFavourite: x.isFavourite ?? false })))
    .onConflictDoNothing({ target: foods.name })
    .returning({ id: foods.id });
  console.log(`foods: ${f.length} inserted, ${FOODS.length - f.length} existing`);

  // exercises — upsert by name, refresh muscle_group + cues
  const allExercises = Object.values(ROUTINE).flat();
  const exRows = await db
    .insert(exercises)
    .values(
      allExercises.map((e) => ({
        name: e.name,
        muscleGroup: e.muscleGroup,
        cues: e.pull ? LAT_CUES : null,
        isCustom: false,
      })),
    )
    .onConflictDoUpdate({
      target: exercises.name,
      set: {
        muscleGroup: sql`excluded.muscle_group`,
        cues: sql`excluded.cues`,
      },
    })
    .returning({ id: exercises.id, name: exercises.name });
  const exerciseIdByName = new Map(exRows.map((r) => [r.name, r.id]));
  console.log(`exercises: ${exRows.length} upserted (${allExercises.filter((e) => e.pull).length} with lat cues)`);

  // routine_days — upsert by name
  const dayRows = await db
    .insert(routineDays)
    .values(ROUTINE_DAYS.map((d) => ({ ...d })))
    .onConflictDoUpdate({
      target: routineDays.name,
      set: { weekday: sql`excluded.weekday`, sortOrder: sql`excluded.sort_order` },
    })
    .returning({ id: routineDays.id, name: routineDays.name });
  const dayIdByName = new Map(dayRows.map((r) => [r.name, r.id]));
  console.log(`routine_days: ${dayRows.length} upserted`);

  // routine_exercises — upsert by (day, exercise); defaults 3 × 8
  const reValues = (Object.keys(ROUTINE) as (keyof typeof ROUTINE)[]).flatMap((day) =>
    ROUTINE[day].map((e, i) => ({
      routineDayId: dayIdByName.get(day)!,
      exerciseId: exerciseIdByName.get(e.name)!,
      sortOrder: i + 1,
      targetSets: 3,
      targetReps: 8,
    })),
  );
  const re = await db
    .insert(routineExercises)
    .values(reValues)
    .onConflictDoUpdate({
      target: [routineExercises.routineDayId, routineExercises.exerciseId],
      set: { sortOrder: sql`excluded.sort_order` },
    })
    .returning({ exerciseId: routineExercises.exerciseId });
  console.log(`routine_exercises: ${re.length} upserted`);
}

main()
  .then(() => {
    console.log("seed complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
