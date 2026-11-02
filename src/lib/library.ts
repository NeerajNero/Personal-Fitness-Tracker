/** The shared exercise library and the gym starter types. Seeded by scripts/seed.ts; types copied per gym user at onboarding. */

export const LAT_CUES = [
  "1. Thumbless grip — reduces forearm/biceps takeover",
  "2. Depress scapulae first — shoulders down into back pockets, before the pull",
  "3. Drive elbows down and back toward the hips; don't pull with the hands",
  "Note: upper-trap or forearm pain during pulls = shrugging + biceps dominance.",
].join("\n");

export type ExerciseSeed = { name: string; muscleGroup: string; pull?: boolean };

/** `pull` = lat-dominant pull; gets LAT_CUES attached. */
export const EXERCISE_LIBRARY: ExerciseSeed[] = [
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

/** Gym starter workout types in rotation order (3 × 8 each). Home users get none yet. */
export const GYM_WORKOUT_TYPES: { name: string; exercises: string[] }[] = [
  { name: "Push", exercises: ["Flat bench press", "Overhead press", "Incline DB press", "Lateral raise", "Triceps pushdown"] },
  { name: "Pull", exercises: ["Pull-up (or assisted)", "Lat pulldown (wide)", "Barbell row", "Chest-supported row", "Face pull", "Biceps curl"] },
  { name: "Legs", exercises: ["Back squat", "Romanian deadlift", "Leg press", "Leg curl", "Leg extension", "Standing calf raise", "Hanging knee raise"] },
];
