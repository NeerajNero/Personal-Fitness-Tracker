/**
 * Idempotent seed. Run with: pnpm seed  (loads .env via node --env-file)
 *
 * - settings: insert id=1 only if missing (never overwrites owner edits)
 * - foods: insert by name; existing rows are left untouched (owner edits in-app)
 * - exercises: upsert by name; muscle_group and cues are refreshed from this file
 * - routine_days (workout types Push/Pull/Legs) + their exercises: inserted only when the type is missing;
 *   afterwards the owner manages types in Settings, so a re-run never undoes edits
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

// The exercise library. `pull` = lat-dominant pull; gets LAT_CUES attached.
const EXERCISES: ExerciseSeed[] = [
  { name: "Lat pulldown (wide)", muscleGroup: "back", pull: true },
  { name: "Barbell row", muscleGroup: "back", pull: true },
  { name: "Pull-up (or assisted)", muscleGroup: "back", pull: true },
  { name: "Chest-supported row", muscleGroup: "back", pull: true },
  { name: "Straight-arm pulldown", muscleGroup: "back", pull: true },
  { name: "Flat bench press", muscleGroup: "chest" },
  { name: "Incline DB press", muscleGroup: "chest" },
  { name: "Overhead press", muscleGroup: "shoulders" },
  { name: "Lateral raise", muscleGroup: "shoulders" },
  { name: "Face pull", muscleGroup: "rear delts" },
  { name: "Biceps curl", muscleGroup: "biceps" },
  { name: "Triceps pushdown", muscleGroup: "triceps" },
  { name: "Back squat", muscleGroup: "quads" },
  { name: "Hack squat (or front squat)", muscleGroup: "quads" },
  { name: "Leg press", muscleGroup: "quads" },
  { name: "Walking lunge", muscleGroup: "quads" },
  { name: "Leg extension", muscleGroup: "quads" },
  { name: "Romanian deadlift", muscleGroup: "hamstrings" },
  { name: "Leg curl", muscleGroup: "hamstrings" },
  { name: "Trap bar / conventional deadlift", muscleGroup: "posterior chain" },
  { name: "Standing calf raise", muscleGroup: "calves" },
  { name: "Seated calf raise", muscleGroup: "calves" },
  { name: "Hanging knee raise", muscleGroup: "core" },
  { name: "Cable crunch", muscleGroup: "core" },
];

// Workout types in rotation order (3 × 8 each). Same as scripts/choose-your-day.ts.
const WORKOUT_TYPES: { name: string; exercises: string[] }[] = [
  { name: "Push", exercises: ["Flat bench press", "Overhead press", "Incline DB press", "Lateral raise", "Triceps pushdown"] },
  { name: "Pull", exercises: ["Pull-up (or assisted)", "Lat pulldown (wide)", "Barbell row", "Chest-supported row", "Face pull", "Biceps curl"] },
  { name: "Legs", exercises: ["Back squat", "Romanian deadlift", "Leg press", "Leg curl", "Leg extension", "Standing calf raise", "Hanging knee raise"] },
];

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
  const exRows = await db
    .insert(exercises)
    .values(EXERCISES.map((e) => ({ name: e.name, muscleGroup: e.muscleGroup, cues: e.pull ? LAT_CUES : null, isCustom: false })))
    .onConflictDoUpdate({
      target: exercises.name,
      set: {
        muscleGroup: sql`excluded.muscle_group`,
        cues: sql`excluded.cues`,
      },
    })
    .returning({ id: exercises.id, name: exercises.name });
  const exerciseIdByName = new Map(exRows.map((r) => [r.name, r.id]));
  console.log(`exercises: ${exRows.length} upserted (${EXERCISES.filter((e) => e.pull).length} with lat cues)`);

  // workout types — insert if missing; the owner manages them in Settings afterwards
  const created = await db
    .insert(routineDays)
    .values(WORKOUT_TYPES.map((t, i) => ({ name: t.name, sortOrder: i + 1 })))
    .onConflictDoNothing({ target: routineDays.name })
    .returning({ id: routineDays.id, name: routineDays.name });
  console.log(`workout types: ${created.length} inserted, ${WORKOUT_TYPES.length - created.length} existing`);

  // exercises per type — only for types created just now (never re-adds what the owner removed)
  const reValues = created.flatMap((t) =>
    WORKOUT_TYPES.find((w) => w.name === t.name)!.exercises.map((name, i) => ({
      routineDayId: t.id,
      exerciseId: exerciseIdByName.get(name)!,
      sortOrder: i + 1,
      targetSets: 3,
      targetReps: 8,
    })),
  );
  if (reValues.length) await db.insert(routineExercises).values(reValues).onConflictDoNothing();
  console.log(`routine_exercises: ${reValues.length} inserted`);
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
