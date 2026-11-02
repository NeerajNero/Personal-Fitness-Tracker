/**
 * The shared exercise library (seeded by scripts/seed.ts via src/lib/library-seed.ts), the gym starter types and the
 * home ladders (docs/home-program.md). Client-safe: constants only.
 */
import type { ExerciseMeasure, ExercisePattern } from "@/db/schema";

export const LAT_CUES = [
  "1. Thumbless grip — reduces forearm/biceps takeover",
  "2. Depress scapulae first — shoulders down into back pockets, before the pull",
  "3. Drive elbows down and back toward the hips; don't pull with the hands",
  "Note: upper-trap or forearm pain during pulls = shrugging + biceps dominance.",
].join("\n");

export type ExerciseSeed = {
  name: string;
  muscleGroup: string;
  pattern: NonNullable<ExercisePattern>;
  /** none, dumbbells, bands, pullup_bar, or gym. */
  equipment: string[];
  measure?: ExerciseMeasure;
  ladder?: string;
  ladderLevel?: number;
  cues?: string | null;
  /** Lat-dominant pull: gets LAT_CUES. */
  pull?: boolean;
};

const gym = (name: string, muscleGroup: string, pattern: NonNullable<ExercisePattern>, pull = false): ExerciseSeed => ({ name, muscleGroup, pattern, equipment: ["gym"], pull });

/** Gym rows: unchanged names and groups; pattern and equipment filled in since the home program. */
export const GYM_LIBRARY: ExerciseSeed[] = [
  gym("Lat pulldown (wide)", "back", "vertical_pull", true),
  gym("Barbell row", "back", "horizontal_pull", true),
  gym("Pull-up (or assisted)", "back", "vertical_pull", true),
  gym("Chest-supported row", "back", "horizontal_pull", true),
  gym("Straight-arm pulldown", "back", "vertical_pull", true),
  gym("Flat bench press", "chest", "horizontal_push"),
  gym("Incline DB press", "chest", "horizontal_push"),
  gym("Overhead press", "shoulders", "vertical_push"),
  gym("Lateral raise", "shoulders", "isolation"),
  gym("Face pull", "rear delts", "horizontal_pull"),
  gym("Biceps curl", "biceps", "isolation"),
  gym("Triceps pushdown", "triceps", "isolation"),
  gym("Back squat", "quads", "squat"),
  gym("Hack squat (or front squat)", "quads", "squat"),
  gym("Leg press", "quads", "squat"),
  gym("Walking lunge", "quads", "lunge"),
  gym("Leg extension", "quads", "isolation"),
  gym("Romanian deadlift", "hamstrings", "hinge"),
  gym("Leg curl", "hamstrings", "isolation"),
  gym("Trap bar / conventional deadlift", "posterior chain", "hinge"),
  gym("Standing calf raise", "calves", "calves"),
  gym("Seated calf raise", "calves", "calves"),
  gym("Hanging knee raise", "core", "core_brace"),
  gym("Cable crunch", "core", "core_brace"),
];

/* ------------------------------- home ladders ------------------------------- */

export type LadderSeed = {
  key: string;
  pattern: NonNullable<ExercisePattern>;
  muscleGroup: string;
  measure: ExerciseMeasure;
  /** Rungs easiest → hardest; each with its own cue. `measure` can be overridden per rung. */
  rungs: { name: string; cue: string; measure?: ExerciseMeasure; muscleGroup?: string }[];
};

export const LADDERS: LadderSeed[] = [
  {
    key: "push_up", pattern: "horizontal_push", muscleGroup: "chest", measure: "reps",
    rungs: [
      { name: "Wall push-up", cue: "Hands on the wall at shoulder height, feet a step back. Body in one line, elbows at 45°, chest to the wall and push away." },
      { name: "Incline push-up (table)", cue: "Hands on a table edge, body straight from head to heels. Lower until your chest nearly touches the edge." },
      { name: "Knee push-up", cue: "Knees down, hips open so the body is straight from knees to head. Full range: chest to the floor." },
      { name: "Push-up", cue: "Hands under the shoulders, squeeze the glutes, elbows tucked at 45°. Chest to the floor, lock out at the top." },
      { name: "Decline push-up (feet on chair)", cue: "Feet on a chair, hands on the floor. Keep the hips from sagging; lower until the nose nearly touches." },
      { name: "Archer push-up", cue: "Wide hands; bend one arm and keep the other straight so most of the weight goes to one side. Alternate sides each rep." },
    ],
  },
  {
    key: "pike", pattern: "vertical_push", muscleGroup: "shoulders", measure: "reps",
    rungs: [
      { name: "Knee pike push-up", cue: "Hips high, knees on the floor, hands in front. Lower the top of the head toward the floor and press back up." },
      { name: "Pike push-up", cue: "Hips high, legs straight, look between your feet. Lower the head to the floor in front of the hands; press up." },
      { name: "Elevated pike push-up", cue: "Feet on a chair, hips over the shoulders. Head to the floor and press. Stop if you feel it in the neck." },
    ],
  },
  {
    key: "row", pattern: "horizontal_pull", muscleGroup: "back", measure: "reps",
    rungs: [
      { name: "Table row, knees bent", cue: "Check the table first: lean on it with both hands and all your weight; if it tips or slides, use a different one. Lie under it, grip the edge, knees bent, pull the chest to the edge." },
      { name: "Table row, legs straight", cue: "Same table check. Body straight from heels to head, pull the chest to the edge, pause, lower slowly." },
      { name: "Table row, feet raised", cue: "Same table check, then feet on a chair so the body is level. Pull the chest to the edge and squeeze the shoulder blades." },
    ],
  },
  {
    key: "squat", pattern: "squat", muscleGroup: "quads", measure: "reps",
    rungs: [
      { name: "Chair squat", cue: "Stand in front of a chair, sit back until you touch it, stand up without rocking. Knees track over the toes." },
      { name: "Bodyweight squat", cue: "Feet shoulder width, sit between the heels, chest up. As deep as you can keep the heels down." },
      { name: "Pause squat (3 s)", cue: "Same squat; hold the bottom for a slow count of three before standing." },
      { name: "Split squat", cue: "One foot forward, one back, both knees to 90°. Torso upright; the front heel stays down.", muscleGroup: "quads" },
      { name: "Bulgarian split squat (chair)", cue: "Back foot on a chair, front foot far enough forward that the knee stays over the ankle. Straight down and up." },
      { name: "Doorframe-assisted pistol", cue: "Hold the doorframe lightly with one hand, lower on one leg as far as you can, use the hand only to balance." },
    ],
  },
  {
    key: "hinge", pattern: "hinge", muscleGroup: "glutes", measure: "reps",
    rungs: [
      { name: "Glute bridge", cue: "On your back, feet flat near the hips. Push through the heels, squeeze the glutes at the top, ribs down." },
      { name: "Single-leg glute bridge", cue: "One foot flat, the other leg straight or held to the chest. Drive up without the hips twisting." },
      { name: "Single-leg RDL", cue: "Hinge at the hip on one leg, the other leg reaching back, flat back, hands to the shin. Stand tall.", muscleGroup: "hamstrings" },
      { name: "Hamstring walkout", cue: "From a glute bridge, walk the heels out one step at a time until the legs are nearly straight, then walk back.", muscleGroup: "hamstrings" },
    ],
  },
  {
    key: "lunge", pattern: "lunge", muscleGroup: "quads", measure: "reps",
    rungs: [
      { name: "Reverse lunge", cue: "Step back, both knees to 90°, front heel down. Push through the front foot to stand. Alternate legs." },
      { name: "Walking lunge (bodyweight)", cue: "Step forward into a lunge, stand through the front foot, step the back foot through. Short steps keep the balance." },
      { name: "Step-up (chair)", cue: "Whole foot on the chair, push through that foot, don't bounce off the back leg. Lower under control.", muscleGroup: "glutes" },
      { name: "High step-up", cue: "A higher step (two chairs or a table edge you've checked). Same rule: the top leg does the work.", muscleGroup: "glutes" },
    ],
  },
  {
    key: "plank", pattern: "core_brace", muscleGroup: "core", measure: "seconds",
    rungs: [
      { name: "Knee plank", cue: "Forearms down, knees down, straight line from knees to head. Squeeze the glutes; don't let the hips sag." },
      { name: "Plank", cue: "Forearms and toes, ribs tucked, glutes tight. Breathe. Stop the set when the hips drop." },
      { name: "Long-lever plank", cue: "Elbows a hand further forward than usual. Everything else the same; it gets much harder." },
      { name: "Plank with shoulder taps", cue: "High plank, feet wide. Tap the opposite shoulder without the hips swaying. Count seconds, not taps." },
    ],
  },
  {
    key: "side_plank", pattern: "core_lateral", muscleGroup: "core", measure: "seconds",
    rungs: [
      { name: "Knee side plank", cue: "On one forearm, knees bent, hips lifted so the body is straight from knees to head. Both sides." },
      { name: "Side plank", cue: "Forearm and the side of the foot, hips high, top hand on the hip. Both sides." },
      { name: "Side plank hip dip", cue: "From a side plank, dip the hip toward the floor and back up. Hold the top for the count." },
      { name: "Side plank leg lift", cue: "Side plank; lift the top leg and hold. Keep the hips stacked." },
    ],
  },
  {
    key: "core", pattern: "core_brace", muscleGroup: "core", measure: "seconds",
    rungs: [
      { name: "Dead bug", cue: "On your back, arms up, knees over the hips. Lower the opposite arm and leg with the lower back pressed flat. One rep = both sides.", measure: "reps" },
      { name: "Hollow hold", cue: "Lower back pressed into the floor, shoulders and legs off it, arms by the ears. Lower the legs only as far as the back stays flat." },
      { name: "Hollow rock", cue: "Hollow position, rock gently from the shoulders to the hips without losing the shape. Count reps.", measure: "reps" },
      { name: "Reverse crunch", cue: "On your back, knees bent; curl the hips off the floor toward the chest and lower slowly. Count reps.", measure: "reps" },
    ],
  },
  {
    key: "wall_sit", pattern: "squat", muscleGroup: "quads", measure: "seconds",
    rungs: [
      { name: "Wall sit", cue: "Back flat on the wall, thighs level with the floor, knees over the ankles. Hands off the thighs." },
      { name: "Single-leg wall sit", cue: "Wall sit, then lift one foot an inch off the floor. Swap halfway through the hold." },
    ],
  },
  {
    key: "calves", pattern: "calves", muscleGroup: "calves", measure: "reps",
    rungs: [
      { name: "Calf raise on a step", cue: "Balls of the feet on a step, heels hanging. Full stretch at the bottom, pause at the top." },
      { name: "Single-leg calf raise", cue: "Same step, one foot at a time, a fingertip on the wall for balance." },
    ],
  },
];

/** Finishers: no ladder, no sets; logged by the 10-minute 30 s on / 30 s off timer on Train. */
export const CONDITIONING: { name: string; cue: string }[] = [
  { name: "Jumping jacks", cue: "Soft knees, land quietly. Keep the pace steady for the whole 30 s." },
  { name: "High knees", cue: "Drive the knees to hip height, stay on the balls of the feet, arms pumping." },
  { name: "Mountain climbers", cue: "High plank, drive one knee at a time toward the chest. Hips level, don't bounce." },
  { name: "Burpees", cue: "Hands down, feet back, chest to the floor, feet in, stand or jump. Slow is fine." },
  { name: "Skaters", cue: "Leap sideways onto one foot, the other leg sweeping behind. Land softly and hold a beat." },
  { name: "Shadow boxing", cue: "Light feet, jab-cross-hook, keep moving. Breathe out on every punch." },
  { name: "Stair climbs", cue: "Up at a brisk pace, down carefully. Use the rail if you need it." },
];

export const HOME_LIBRARY: ExerciseSeed[] = [
  ...LADDERS.flatMap((l) =>
    l.rungs.map((r, i) => ({ name: r.name, muscleGroup: r.muscleGroup ?? l.muscleGroup, pattern: l.pattern, equipment: ["none"], measure: r.measure ?? l.measure, ladder: l.key, ladderLevel: i + 1, cues: r.cue })),
  ),
  ...CONDITIONING.map((c) => ({ name: c.name, muscleGroup: "other", pattern: "conditioning" as const, equipment: ["none"], measure: "seconds" as const, cues: c.cue })),
];

export const EXERCISE_LIBRARY: ExerciseSeed[] = [...GYM_LIBRARY, ...HOME_LIBRARY];

/** Gym starter workout types in rotation order (3 × 8 each). */
export const GYM_WORKOUT_TYPES: { name: string; exercises: string[] }[] = [
  { name: "Push", exercises: ["Flat bench press", "Overhead press", "Incline DB press", "Lateral raise", "Triceps pushdown"] },
  { name: "Pull", exercises: ["Pull-up (or assisted)", "Lat pulldown (wide)", "Barbell row", "Chest-supported row", "Face pull", "Biceps curl"] },
  { name: "Legs", exercises: ["Back squat", "Romanian deadlift", "Leg press", "Leg curl", "Leg extension", "Standing calf raise", "Hanging knee raise"] },
];
