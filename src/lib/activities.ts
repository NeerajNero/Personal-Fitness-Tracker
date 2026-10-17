/** Cardio log reads/writes shared by Train, Today, DayState and the bot. Config + validation live in ./cardio (client-safe). */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, type Activity } from "@/db/schema";
import { addDays, isoWeekday } from "@/lib/dates";
import { CARDIO_TYPE_KEYS, CARDIO_TYPES, normalizeCardio, type CardioEntry, type CardioInput, type CardioType, type Effort } from "./cardio";

export type { Activity };

export function toEntry(r: Activity): CardioEntry {
  const type = (CARDIO_TYPE_KEYS as readonly string[]).includes(r.type ?? "") ? (r.type as CardioType) : "sport";
  return {
    id: r.id,
    date: r.date,
    type,
    name: r.name,
    minutes: r.minutes,
    distanceKm: r.distanceKm,
    speedKmh: r.speedKmh,
    inclinePct: r.inclinePct,
    effort: (r.effort as Effort | null) ?? null,
    notes: r.notes,
    loggedAt: (r.loggedAt ?? r.createdAt).toISOString(),
  };
}

const newestFirst = [desc(activities.date), desc(sql`coalesce(${activities.loggedAt}, ${activities.createdAt})`), desc(activities.id)];

export async function listCardio(date: string): Promise<CardioEntry[]> {
  const rows = await db.select().from(activities).where(eq(activities.date, date)).orderBy(sql`coalesce(${activities.loggedAt}, ${activities.createdAt})`, activities.id);
  return rows.map(toEntry);
}

/** Most recent entry on or before `date` (any type) — what "Same as last time" repeats. */
export async function lastCardio(date: string): Promise<CardioEntry | null> {
  const [row] = await db.select().from(activities).where(lte(activities.date, date)).orderBy(...newestFirst).limit(1);
  return row ? toEntry(row) : null;
}

export async function insertCardio(date: string, input: CardioInput): Promise<CardioEntry> {
  const [row] = await db.insert(activities).values({ date, ...normalizeCardio(input), loggedAt: new Date() }).returning();
  return toEntry(row);
}

export async function updateCardio(id: number, input: CardioInput): Promise<CardioEntry | null> {
  const [row] = await db.update(activities).set(normalizeCardio(input)).where(eq(activities.id, id)).returning();
  return row ? toEntry(row) : null;
}

export async function deleteCardio(id: number): Promise<void> {
  await db.delete(activities).where(eq(activities.id, id));
}

/** Copy the most recent entry (on or before `date`) onto `date` with the current time. Null when there's nothing to repeat. */
export async function repeatLastCardio(date: string): Promise<CardioEntry | null> {
  const last = await lastCardio(date);
  if (!last) return null;
  const { type, name, minutes, distanceKm, speedKmh, inclinePct, effort } = last;
  const [row] = await db.insert(activities).values({ date, type, name, minutes, distanceKm, speedKmh, inclinePct, effort, loggedAt: new Date() }).returning();
  return toEntry(row);
}

/** The newest entry of `date` with its logged time, for the bot's `undo`. */
export async function latestCardioOn(date: string): Promise<CardioEntry | null> {
  const [row] = await db.select().from(activities).where(eq(activities.date, date)).orderBy(...newestFirst).limit(1);
  return row ? toEntry(row) : null;
}

/* --------------------------------- metrics --------------------------------- */

export type CardioWeek = { weekStart: string; minutes: number; byType: Record<string, number> };

/** Minutes and entry counts per type label, per ISO week, newest first (empty weeks included). */
export async function cardioByWeek(weeks: number, today: string): Promise<CardioWeek[]> {
  const monday = addDays(today, -(isoWeekday(today) - 1));
  const from = addDays(monday, -7 * (weeks - 1));
  const rows = await db
    .select({ date: activities.date, type: activities.type, minutes: activities.minutes })
    .from(activities)
    .where(and(gte(activities.date, from), lte(activities.date, addDays(monday, 6))));
  const out: CardioWeek[] = Array.from({ length: weeks }, (_, w) => ({ weekStart: addDays(monday, -7 * w), minutes: 0, byType: {} }));
  for (const r of rows) {
    const w = out.find((x) => r.date >= x.weekStart && r.date <= addDays(x.weekStart, 6));
    if (!w) continue;
    const label = CARDIO_TYPES[(CARDIO_TYPE_KEYS as readonly string[]).includes(r.type ?? "") ? (r.type as CardioType) : "sport"].label;
    w.minutes += r.minutes;
    w.byType[label] = (w.byType[label] ?? 0) + 1;
  }
  return out;
}

/** Every entry since `from`, oldest first — for the conditioning chart. */
export async function loadCardioSince(from: string): Promise<CardioEntry[]> {
  const rows = await db.select().from(activities).where(gte(activities.date, from)).orderBy(activities.date, sql`coalesce(${activities.loggedAt}, ${activities.createdAt})`);
  return rows.map(toEntry);
}
