/**
 * Cardio log config + pure helpers (client-safe: no db import).
 * Types decide which fields the form shows; validation and derivation are shared by the app and the bot.
 * No calorie-burn estimates anywhere (non-goal).
 */
import { z } from "zod";

export const CARDIO_TYPE_KEYS = ["incline_walk", "walk", "run", "cycle", "cross_trainer", "swim", "stairs", "sport"] as const;
export type CardioType = (typeof CARDIO_TYPE_KEYS)[number];
export type CardioField = "name" | "distance" | "speed" | "incline";

type TypeConfig = {
  label: string;
  /** Fields shown besides minutes, effort and note. */
  fields: CardioField[];
  /** Show pace (min/km) next to speed. */
  pace?: boolean;
};

export const CARDIO_TYPES: Record<CardioType, TypeConfig> = {
  incline_walk: { label: "Incline walk", fields: ["speed", "incline"], pace: true },
  walk: { label: "Walk", fields: ["distance", "speed"], pace: true },
  run: { label: "Run", fields: ["distance", "speed"], pace: true },
  cycle: { label: "Cycle", fields: ["distance"] },
  cross_trainer: { label: "Cross-trainer", fields: ["distance"] },
  swim: { label: "Swim", fields: ["distance"] },
  stairs: { label: "Stairs", fields: [] },
  sport: { label: "Sport", fields: ["name"] },
};

export const EFFORTS = ["easy", "moderate", "hard"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Bot words → type. `sport <name> <minutes>` is handled separately. */
export const CARDIO_ALIASES: Record<string, CardioType> = {
  walk: "walk",
  incline: "incline_walk",
  run: "run",
  cycle: "cycle",
  bike: "cycle",
  cross: "cross_trainer",
  stairs: "stairs",
  swim: "swim",
};

/** A logged entry as screens and the bot see it. `loggedAt` is an ISO timestamp. */
export type CardioEntry = {
  id: number;
  date: string;
  type: CardioType;
  name: string;
  minutes: number;
  distanceKm: number | null;
  speedKmh: number | null;
  inclinePct: number | null;
  effort: Effort | null;
  notes: string | null;
  loggedAt: string;
};

/* -------------------------------- validation ------------------------------- */

/** "" / null / undefined → null, else a number within [lo, hi]. */
const optNum = (lo: number, hi: number, msg: string) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number({ message: msg }).min(lo, msg).max(hi, msg).nullable());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max, "Too long").nullable().optional());

export const cardioInputSchema = z
  .object({
    type: z.enum(CARDIO_TYPE_KEYS),
    minutes: z.preprocess((v) => Number(v), z.number({ message: "Minutes 1–300" }).int("Whole minutes").min(1, "Minutes 1–300").max(300, "Minutes 1–300")),
    name: optText(60),
    distanceKm: optNum(0.1, 100, "Distance 0.1–100 km").optional(),
    speedKmh: optNum(1, 25, "Speed 1–25 km/h").optional(),
    inclinePct: optNum(0, 30, "Incline 0–30 %").optional(),
    effort: z.preprocess((v) => (v === "" ? null : v), z.enum(EFFORTS).nullable().optional()),
    notes: optText(200),
  })
  .superRefine((v, ctx) => {
    if (v.type === "sport" && !v.name) ctx.addIssue({ code: "custom", message: "Sport name required", path: ["name"] });
  });

export type CardioInput = z.input<typeof cardioInputSchema>;
export type CardioValues = Omit<CardioEntry, "id" | "date" | "loggedAt">;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Validated input → stored values: drop fields the type doesn't show, derive speed ⇄ distance whenever possible. */
export function normalizeCardio(input: CardioInput): CardioValues {
  const v = cardioInputSchema.parse(input);
  const cfg = CARDIO_TYPES[v.type];
  const has = (f: CardioField) => cfg.fields.includes(f);
  // Distance and speed travel together: a type that shows either one stores both (the other derived).
  const moves = has("distance") || has("speed");
  let distanceKm = moves ? (v.distanceKm ?? null) : null;
  let speedKmh = moves ? (v.speedKmh ?? null) : null;
  const hours = v.minutes / 60;
  if (speedKmh !== null && distanceKm === null) distanceKm = r2(speedKmh * hours);
  else if (distanceKm !== null && speedKmh === null) speedKmh = r2(distanceKm / hours);
  return {
    type: v.type,
    name: v.type === "sport" ? v.name! : cfg.label,
    minutes: v.minutes,
    distanceKm,
    speedKmh,
    inclinePct: has("incline") ? (v.inclinePct ?? null) : null,
    effort: v.effort ?? null,
    notes: v.notes ?? null,
  };
}

/* -------------------------------- formatting ------------------------------- */

const n1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");

/** "12:00/km" from km/h. */
export function pace(speedKmh: number): string {
  const secs = Math.round(3600 / speedKmh);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}/km`;
}

/** "Incline walk 20 min · 4.5 km/h · 6%", "Run 30 min · 5 km · 10 km/h (6:00/km) · hard". */
export function cardioSummary(e: Pick<CardioEntry, "type" | "name" | "minutes" | "distanceKm" | "speedKmh" | "inclinePct" | "effort">): string {
  const cfg = CARDIO_TYPES[e.type];
  const parts = [`${e.name} ${e.minutes} min`];
  if (e.type === "incline_walk") {
    if (e.speedKmh !== null) parts.push(`${n1(e.speedKmh)} km/h`);
    if (e.inclinePct !== null) parts.push(`${n1(e.inclinePct)}%`);
  } else {
    if (e.distanceKm !== null) parts.push(`${n1(e.distanceKm)} km`);
    if (e.speedKmh !== null && cfg.pace) parts.push(`${n1(e.speedKmh)} km/h (${pace(e.speedKmh)})`);
  }
  if (e.effort) parts.push(e.effort);
  return parts.join(" · ");
}

/** "20 min incline walk" / "45 min · incline walk, run" for a day's entries. */
export function cardioDayLine(entries: Pick<CardioEntry, "type" | "name" | "minutes">[]): string {
  const minutes = entries.reduce((s, e) => s + e.minutes, 0);
  const names = [...new Set(entries.map((e) => e.name.toLowerCase()))];
  return names.length === 1 ? `${minutes} min ${names[0]}` : `${minutes} min · ${names.join(", ")}`;
}

/* ------------------------------------ bot ----------------------------------- */

export type CardioParse = { input: CardioInput } | { error: string } | null;

const NUM = /^\d+(?:\.\d+)?$/;

/**
 * `<type> <minutes> [extras]` with aliases (walk, incline, run, cycle/bike, cross, stairs, swim), or `sport <name> <minutes> [effort]`.
 * Extras in any order: bare number = speed km/h, `4.2km` = distance, `6%` = incline, easy / mod / hard = effort.
 * Null when the message isn't a cardio command (so it can fall through to food).
 */
export function parseCardio(raw: string): CardioParse {
  const tokens = raw.trim().toLowerCase().split(/\s+/);
  let type: CardioType;
  let name: string | null = null;
  let rest: string[];
  if (tokens[0] === "sport") {
    const k = tokens.findIndex((t, i) => i >= 2 && NUM.test(t));
    if (k < 0) return tokens.length > 1 ? { error: "Try <code>sport badminton 45</code>" } : null;
    type = "sport";
    name = tokens.slice(1, k).join(" ").replace(/^./, (c) => c.toUpperCase());
    rest = tokens.slice(k);
  } else {
    const alias = CARDIO_ALIASES[tokens[0]];
    if (!alias || !tokens[1] || !NUM.test(tokens[1])) return null;
    type = alias;
    rest = tokens.slice(1);
  }

  const input: CardioInput = { type, minutes: rest[0], name };
  const cfg = CARDIO_TYPES[type];
  const moves = cfg.fields.includes("distance") || cfg.fields.includes("speed");
  for (const t of rest.slice(1)) {
    const km = /^(\d+(?:\.\d+)?)km$/.exec(t);
    const pct = /^(\d+(?:\.\d+)?)%$/.exec(t);
    if (NUM.test(t) && moves) input.speedKmh = t;
    else if (km && moves) input.distanceKm = km[1];
    else if (pct && cfg.fields.includes("incline")) input.inclinePct = pct[1];
    else if (t === "easy" || t === "hard") input.effort = t;
    else if (t === "mod" || t === "moderate") input.effort = "moderate";
    else return { error: `Didn't get "${t}" for ${cfg.label.toLowerCase()}. Try <code>walk 30 5.5</code>, <code>run 25 4.2km hard</code>, <code>incline 20 4.5 6%</code>.` };
  }
  const check = cardioInputSchema.safeParse(input);
  return check.success ? { input } : { error: check.error.issues[0]?.message ?? "Invalid cardio entry" };
}
