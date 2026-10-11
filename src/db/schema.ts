/**
 * Recomp data model — Drizzle pg-core.
 *
 * Conventions
 * - `date` columns are IST calendar dates (pg `date`, read as "YYYY-MM-DD" strings).
 * - Timestamps are `timestamptz` (stored UTC, converted to IST in code).
 * - Weights / measurements / nutrition are `numeric(p,s)` with mode "number" so
 *   Drizzle returns JS numbers (precision loss is irrelevant at these magnitudes).
 * - Money is `numeric(8,2)` in INR (rupees with paise as the fraction), mode "number".
 *   Column names carry the `_inr` suffix. Sum in SQL, round to 2 dp for display.
 * - Weekday numbering is ISO: 1 = Monday … 7 = Sunday.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ----------------------------- enums ----------------------------- */

export const phaseEnum = pgEnum("phase", ["veg", "nonveg"]);
export const phaseTagEnum = pgEnum("phase_tag", ["veg", "nonveg", "both"]);
export const logSourceEnum = pgEnum("log_source", ["app", "telegram", "ai"]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const routineDayNameEnum = pgEnum("routine_day_name", [
  "UpperA",
  "LowerA",
  "UpperB",
  "LowerB",
]);

/* ---------------------------- helpers ---------------------------- */

const num = (name: string, precision: number, scale: number) =>
  numeric(name, { precision, scale, mode: "number" });
const inr = (name: string) => num(name, 8, 2);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------------------- settings --------------------------- */

export const settings = pgTable(
  "settings",
  {
    id: integer("id").primaryKey().default(1),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),

    // Telegram
    telegramChatId: text("telegram_chat_id"),
    telegramLinkCode: text("telegram_link_code"), // one-time code shown in onboarding (`/start <code>`)

    // Onboarding stats
    weightKg: num("weight_kg", 5, 2),
    heightCm: num("height_cm", 5, 1),
    age: smallint("age"),
    sex: sexEnum("sex"),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),

    // Calorie targets
    kcalTarget: integer("kcal_target").notNull().default(1925),
    kcalMin: integer("kcal_min").notNull().default(1900),
    kcalMax: integer("kcal_max").notNull().default(1950),

    // Protein phases (auto by date; override wins)
    phaseOverride: phaseEnum("phase_override"),
    phaseSwitchDate: date("phase_switch_date").notNull().default("2026-12-01"),
    proteinMinVeg: integer("protein_min_veg").notNull().default(85),
    proteinMaxVeg: integer("protein_max_veg").notNull().default(100),
    proteinMinNonveg: integer("protein_min_nonveg").notNull().default(115),
    proteinMaxNonveg: integer("protein_max_nonveg").notNull().default(130),
    budgetVegInr: inr("budget_veg_inr").notNull().default(4800),
    budgetNonvegInr: inr("budget_nonveg_inr").notNull().default(5000),

    // Steps (rest-day target)
    stepsMin: integer("steps_min").notNull().default(8000),
    stepsMax: integer("steps_max").notNull().default(10000),

    // Body goal
    navelStartCm: num("navel_start_cm", 5, 2).notNull().default(90),
    waistStartCm: num("waist_start_cm", 5, 2).notNull().default(86),
    navelGoalMinCm: num("navel_goal_min_cm", 5, 2).notNull().default(76),
    navelGoalMaxCm: num("navel_goal_max_cm", 5, 2).notNull().default(78),
    goalDate: date("goal_date").notNull().default("2027-10-11"),
    checkpointDate: date("checkpoint_date").notNull().default("2026-12-10"),

    // Lifestyle
    smokeFreeSince: date("smoke_free_since").default("2026-09-27"),

    // Nudge toggles
    nudgeMorningBrief: boolean("nudge_morning_brief").notNull().default(true),
    nudgeLunchCheck: boolean("nudge_lunch_check").notNull().default(true),
    nudgeProteinCheck: boolean("nudge_protein_check").notNull().default(true),
    nudgeKcalCheck: boolean("nudge_kcal_check").notNull().default(true),
    nudgeDayClose: boolean("nudge_day_close").notNull().default(true),
    nudgeWater: boolean("nudge_water").notNull().default(false), // OFF by default per spec
    nudgeWeeklyMeasure: boolean("nudge_weekly_measure").notNull().default(true),
    nudgeBudget: boolean("nudge_budget").notNull().default(true),
    nudgeMilestones: boolean("nudge_milestones").notNull().default(true), // phase_switch, checkpoint, smokefree
    nudgeDailyCap: smallint("nudge_daily_cap").notNull().default(6),

    // Quiet hours (IST wall-clock; range wraps midnight)
    quietHoursStart: time("quiet_hours_start").notNull().default("22:30"),
    quietHoursEnd: time("quiet_hours_end").notNull().default("07:00"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

/* ------------------------------ foods ---------------------------- */

export const foods = pgTable(
  "foods",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    servingLabel: text("serving_label").notNull(),
    servingGrams: num("serving_grams", 7, 2),
    kcal: num("kcal", 7, 1).notNull(),
    proteinG: num("protein_g", 6, 1).notNull(),
    costInr: inr("cost_inr").notNull().default(0),
    phaseTag: phaseTagEnum("phase_tag").notNull().default("both"),
    isFavourite: boolean("is_favourite").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("foods_name_uq").on(t.name)],
);

export const foodLog = pgTable(
  "food_log",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    time: time("time").notNull(), // IST wall-clock
    foodId: integer("food_id").references(() => foods.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    qty: num("qty", 7, 2).notNull().default(1), // multiples of the food's serving
    kcal: num("kcal", 7, 1).notNull(),
    proteinG: num("protein_g", 6, 1).notNull(),
    costInr: inr("cost_inr").notNull().default(0),
    source: logSourceEnum("source").notNull().default("app"),
    createdAt: createdAt(),
  },
  (t) => [index("food_log_date_idx").on(t.date)],
);

/* --------------------------- daily data -------------------------- */

export const dailyMetrics = pgTable("daily_metrics", {
  date: date("date").primaryKey(),
  weightKg: num("weight_kg", 5, 2),
  steps: integer("steps"),
  waterGlasses: smallint("water_glasses"),
  notes: text("notes"),
  updatedAt: updatedAt(),
});

export const measurements = pgTable(
  "measurements",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    navelCm: num("navel_cm", 5, 2),
    waistCm: num("waist_cm", 5, 2),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("measurements_date_idx").on(t.date)],
);

/* ----------------------------- training -------------------------- */

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group").notNull(),
    cues: text("cues"),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exercises_name_uq").on(t.name)],
);

export const routineDays = pgTable(
  "routine_days",
  {
    id: serial("id").primaryKey(),
    name: routineDayNameEnum("name").notNull(),
    weekday: smallint("weekday").notNull(), // ISO 1=Mon … 7=Sun
    sortOrder: smallint("sort_order").notNull(),
  },
  (t) => [uniqueIndex("routine_days_name_uq").on(t.name)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    routineDayId: integer("routine_day_id")
      .notNull()
      .references(() => routineDays.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull(),
    targetSets: smallint("target_sets").notNull().default(3),
    targetReps: smallint("target_reps").notNull().default(8),
  },
  (t) => [primaryKey({ columns: [t.routineDayId, t.exerciseId] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    routineDayId: integer("routine_day_id").references(() => routineDays.id, {
      onDelete: "set null",
    }),
    inclineWalk: boolean("incline_walk").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_date_idx").on(t.date)],
);

/** Exercises attached to a session (routine copy at start, plus ad-hoc additions). */
export const sessionExercises = pgTable(
  "session_exercises",
  {
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull(),
    targetSets: smallint("target_sets").notNull().default(3),
    targetReps: smallint("target_reps").notNull().default(8),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.exerciseId] })],
);

export const sets = pgTable(
  "sets",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    setNo: smallint("set_no").notNull(),
    weightKg: num("weight_kg", 6, 2).notNull(),
    reps: smallint("reps").notNull(),
    rpe: num("rpe", 3, 1),
    isWorking: boolean("is_working").notNull().default(true),
  },
  (t) => [
    index("sets_session_id_idx").on(t.sessionId),
    uniqueIndex("sets_session_exercise_setno_uq").on(t.sessionId, t.exerciseId, t.setNo),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    name: text("name").notNull(),
    minutes: smallint("minutes").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("activities_date_idx").on(t.date)],
);

/* ------------------------------ nudges --------------------------- */

export const nudgeLog = pgTable(
  "nudge_log",
  {
    id: serial("id").primaryKey(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ruleKey: text("rule_key").notNull(),
    date: date("date").notNull(), // IST date the nudge belongs to
    payload: jsonb("payload"),
  },
  (t) => [
    index("nudge_log_date_rule_key_idx").on(t.date, t.ruleKey),
    index("nudge_log_date_idx").on(t.date),
  ],
);

/* ------------------------------ telegram ------------------------- */

/** Gemini parses awaiting ✓/✗ in Telegram. Only the id travels in callback data; rows expire after 24 h. */
export const pendingParses = pgTable("pending_parses", {
  id: serial("id").primaryKey(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------ types ---------------------------- */

export type Settings = typeof settings.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type FoodLog = typeof foodLog.$inferSelect;
export type DailyMetrics = typeof dailyMetrics.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type RoutineDay = typeof routineDays.$inferSelect;
export type RoutineExercise = typeof routineExercises.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SessionExercise = typeof sessionExercises.$inferSelect;
export type WorkoutSet = typeof sets.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type NudgeLog = typeof nudgeLog.$inferSelect;
export type PendingParse = typeof pendingParses.$inferSelect;
