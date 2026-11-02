/** Per-user CSV export. `settings` and `users` are never exported (chat ids, emails). */
import { getTableColumns, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { todayIST } from "@/lib/dates";
import { forUser, type UserId } from "@/lib/db/scope";
import { EXPORT_TABLES } from "@/lib/export-tables";

export type ExportTable = (typeof EXPORT_TABLES)[number];

const TABLES: Record<ExportTable, schema.ExportableTable> = {
  foods: schema.foods,
  food_log: schema.foodLog,
  daily_metrics: schema.dailyMetrics,
  measurements: schema.measurements,
  exercises: schema.exercises,
  routine_days: schema.routineDays,
  routine_exercises: schema.routineExercises,
  sessions: schema.sessions,
  session_exercises: schema.sessionExercises,
  sets: schema.sets,
  activities: schema.activities,
  nudge_log: schema.nudgeLog,
};

export function isExportTable(name: string): name is ExportTable {
  return (EXPORT_TABLES as readonly string[]).includes(name);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The user's rows of `table` as CSV (exercises: the shared library plus their own). */
export async function exportCsv(userId: UserId, table: ExportTable): Promise<{ filename: string; body: string }> {
  const u = forUser(userId);
  const t = TABLES[table];
  const columns = Object.values(getTableColumns(t)).map((c) => c.name);
  const where = table === "exercises" ? u.visible() : u.own(t);
  const res = await u.db.execute<Record<string, unknown>>(sql`select ${sql.join(columns.map((c) => sql.identifier(c)), sql`, `)} from ${t} where ${where} order by 1`);
  const lines = [columns.join(","), ...res.rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  return { filename: `${table}-${todayIST()}.csv`, body: `﻿${lines.join("\r\n")}\r\n` };
}
