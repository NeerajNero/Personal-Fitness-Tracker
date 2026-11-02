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
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* ----------------------------- enums ----------------------------- */

export const phaseEnum = pgEnum("phase", ["veg", "nonveg"]);
export const phaseTagEnum = pgEnum("phase_tag", ["veg", "nonveg", "both"]);
export const logSourceEnum = pgEnum("log_source", ["app", "telegram", "ai"]);
export const sexEnum = pgEnum("sex", ["male", "female"]);
export const cardioEffortEnum = pgEnum("cardio_effort", ["easy", "moderate", "hard"]);
export const goalEnum = pgEnum("goal", ["recomp", "fat_loss", "muscle_gain"]);
export const trainingLocationEnum = pgEnum("training_location", ["gym", "home"]);
/** Legacy: routine_days.name used this until 0005 (now text). Kept so drizzle-kit never drops the type. */
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
/** Owner of a per-person row. Every query on such a table goes through `forUser()` (src/lib/db/scope.ts). */
const userId = () => uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

/* ------------------------------ users --------------------------- */

/** One row per person. Created on the first allowed sign-in; `onboarded_at` gates the app. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Lower-cased Google email. */
    email: text("email").notNull(),
    name: text("name"),
    isAdmin: boolean("is_admin").notNull().default(false),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

/* ---------------------------- settings --------------------------- */

/**
 * One row per user (PK = user_id). Written by onboarding (`src/lib/targets.ts` computes the numbers) and Settings.
 * Owner-specific columns (phases, budgets, navel goal, checkpoint dates, smoke-free date) are nullable and null for
 * everyone but the owner: features that need them stay hidden until they are set.
 */
export const settings = pgTable(
  "settings",
  {
    userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    /** Legacy singleton id (was the PK, always 1). Never read. */
    id: integer("id"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),

    // Telegram (chat id and link code are unique across users)
    telegramChatId: text("telegram_chat_id"),
    telegramLinkCode: text("telegram_link_code"), // one-time code shown in onboarding (`/start <code>`)

    // Onboarding stats
    weightKg: num("weight_kg", 5, 2),
    heightCm: num("height_cm", 5, 1),
    age: smallint("age"),
    sex: sexEnum("sex"),
    /** When this profile was set up (checkpoint windows start here). The gate is users.onboarded_at. */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),

    // Goal + training setup (onboarding)
    goal: goalEnum("goal").notNull().default("recomp"),
    trainingLocation: trainingLocationEnum("training_location").notNull().default("gym"),
    /** Home equipment: none, dumbbells, bands, pullup_bar. */
    equipment: text("equipment").array().notNull().default(sql`'{}'::text[]`),
    sessionMinutes: smallint("session_minutes"),
    daysPerWeek: smallint("days_per_week"),

    // Calorie targets
    kcalTarget: integer("kcal_target").notNull(),
    kcalMin: integer("kcal_min").notNull(),
    kcalMax: integer("kcal_max").notNull(),

    // Protein: a single range, or (owner) per-phase ranges that win when set
    proteinMin: integer("protein_min"),
    proteinMax: integer("protein_max"),

    // Protein phases (owner only; auto by date, override wins). All null = no phases.
    phaseOverride: phaseEnum("phase_override"),
    phaseSwitchDate: date("phase_switch_date"),
    proteinMinVeg: integer("protein_min_veg"),
    proteinMaxVeg: integer("protein_max_veg"),
    proteinMinNonveg: integer("protein_min_nonveg"),
    proteinMaxNonveg: integer("protein_max_nonveg"),
    budgetVegInr: inr("budget_veg_inr"),
    budgetNonvegInr: inr("budget_nonveg_inr"),

    // Steps (rest-day target)
    stepsMin: integer("steps_min").notNull().default(8000),
    stepsMax: integer("steps_max").notNull().default(10000),

    // Body goal (owner only)
    navelStartCm: num("navel_start_cm", 5, 2),
    waistStartCm: num("waist_start_cm", 5, 2),
    navelGoalMinCm: num("navel_goal_min_cm", 5, 2),
    navelGoalMaxCm: num("navel_goal_max_cm", 5, 2),
    goalDate: date("goal_date"),
    checkpointDate: date("checkpoint_date"),

    // Lifestyle
    smokeFreeSince: date("smoke_free_since"),
    weeklySessionTarget: smallint("weekly_session_target").notNull().default(4),

    // Nudge toggles
    nudgeMorningBrief: boolean("nudge_morning_brief").notNull().default(true),
    nudgeLunchCheck: boolean("nudge_lunch_check").notNull().default(false), // off by default since the 2026-10 simplification
    nudgeProteinCheck: boolean("nudge_protein_check").notNull().default(false), // off by default since the 2026-10 simplification
    nudgeKcalCheck: boolean("nudge_kcal_check").notNull().default(false), // off by default since the 2026-10 simplification
    nudgeDayClose: boolean("nudge_day_close").notNull().default(true),
    nudgeWater: boolean("nudge_water").notNull().default(false), // OFF by default per spec
    nudgeWeeklyMeasure: boolean("nudge_weekly_measure").notNull().default(true),
    nudgeBudget: boolean("nudge_budget").notNull().default(false), // off by default since the 2026-10 simplification
    nudgeMilestones: boolean("nudge_milestones").notNull().default(true), // phase_switch, checkpoint, smokefree
    nudgeDailyCap: smallint("nudge_daily_cap").notNull().default(4), // Sunday: brief + measure + report + close

    // Quiet hours (IST wall-clock; range wraps midnight)
    quietHoursStart: time("quiet_hours_start").notNull().default("22:30"),
    quietHoursEnd: time("quiet_hours_end").notNull().default("07:00"),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("settings_telegram_chat_id_uq").on(t.telegramChatId).where(sql`${t.telegramChatId} is not null`),
    uniqueIndex("settings_telegram_link_code_uq").on(t.telegramLinkCode).where(sql`${t.telegramLinkCode} is not null`),
  ],
);

/* ------------------------------ foods ---------------------------- */

export const foods = pgTable(
  "foods",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
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
  (t) => [uniqueIndex("foods_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

export const foodLog = pgTable(
  "food_log",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
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
  (t) => [index("food_log_date_idx").on(t.date), index("food_log_user_date_idx").on(t.userId, t.date)],
);

/* --------------------------- daily data -------------------------- */

export const dailyMetrics = pgTable(
  "daily_metrics",
  {
    userId: userId(),
    date: date("date").notNull(),
    weightKg: num("weight_kg", 5, 2),
    steps: integer("steps"),
    waterGlasses: smallint("water_glasses"),
    notes: text("notes"),
    /** The user chose Rest for this date (Today picker, bot `rest`). */
    restDay: boolean("rest_day").notNull().default(false),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const measurements = pgTable(
  "measurements",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    date: date("date").notNull(),
    navelCm: num("navel_cm", 5, 2),
    waistCm: num("waist_cm", 5, 2),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("measurements_date_idx").on(t.date), uniqueIndex("measurements_user_date_uq").on(t.userId, t.date)],
);

/* ----------------------------- training -------------------------- */

/** Stands in for "no user" in the shared-library uniqueness index. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    /** null = shared library row (seed); set = that user's custom exercise. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    muscleGroup: text("muscle_group").notNull(),
    cues: text("cues"),
    isCustom: boolean("is_custom").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("exercises_owner_name_uq").on(sql`coalesce(${t.userId}, '${sql.raw(NIL_UUID)}'::uuid)`, sql`lower(${t.name})`)],
);

export const routineDays = pgTable(
  "routine_days",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    /** Workout type name ("Push", or legacy "UpperA"). Text since 0005; the old enum type is kept, unused. */
    name: text("name").notNull(),
    /** Legacy: the weekday no longer decides anything. Kept for history, never read. */
    weekday: smallint("weekday"),
    /** Rotation order for "next up". */
    sortOrder: smallint("sort_order").notNull(),
    archived: boolean("archived").notNull().default(false),
  },
  (t) => [uniqueIndex("routine_days_user_name_uq").on(t.userId, sql`lower(${t.name})`)],
);

export const routineExercises = pgTable(
  "routine_exercises",
  {
    userId: userId(),
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
    userId: userId(),
    date: date("date").notNull(),
    routineDayId: integer("routine_day_id").references(() => routineDays.id, {
      onDelete: "set null",
    }),
    inclineWalk: boolean("incline_walk").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_date_idx").on(t.date), index("sessions_user_date_idx").on(t.userId, t.date)],
);

/** Exercises attached to a session (routine copy at start, plus ad-hoc additions). */
export const sessionExercises = pgTable(
  "session_exercises",
  {
    userId: userId(),
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
    userId: userId(),
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

/** The cardio log (sport included). `type` keys CARDIO_TYPES in src/lib/cardio.ts; null = legacy row, treated as "sport". */
export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    date: date("date").notNull(),
    /** Sport name, or the type's label for other cardio. */
    name: text("name").notNull(),
    minutes: smallint("minutes").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    type: text("type"),
    distanceKm: num("distance_km", 6, 2),
    speedKmh: num("speed_kmh", 5, 2),
    inclinePct: num("incline_pct", 4, 1),
    effort: cardioEffortEnum("effort"),
    loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("activities_date_idx").on(t.date), index("activities_user_date_idx").on(t.userId, t.date)],
);

/* ------------------------------ nudges --------------------------- */

export const nudgeLog = pgTable(
  "nudge_log",
  {
    id: serial("id").primaryKey(),
    userId: userId(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    ruleKey: text("rule_key").notNull(),
    date: date("date").notNull(), // IST date the nudge belongs to
    payload: jsonb("payload"),
  },
  (t) => [
    index("nudge_log_date_rule_key_idx").on(t.date, t.ruleKey),
    index("nudge_log_date_idx").on(t.date),
    index("nudge_log_user_date_idx").on(t.userId, t.date),
  ],
);

/* ------------------------------ telegram ------------------------- */

/** Gemini parses awaiting ✓/✗ in Telegram. Only the id travels in callback data; rows expire after 24 h. */
export const pendingParses = pgTable("pending_parses", {
  id: serial("id").primaryKey(),
  userId: userId(),
  payload: jsonb("payload").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------ types ---------------------------- */

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Goal = Settings["goal"];
export type TrainingLocation = Settings["trainingLocation"];
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

/** Tables with a user_id column that the export route may serve. */
export type ExportableTable =
  | typeof foods
  | typeof foodLog
  | typeof dailyMetrics
  | typeof measurements
  | typeof exercises
  | typeof routineDays
  | typeof routineExercises
  | typeof sessions
  | typeof sessionExercises
  | typeof sets
  | typeof activities
  | typeof nudgeLog;
