import { getTableColumns, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { todayIST } from "@/lib/dates";

/** Exportable tables. `settings` is excluded on purpose (holds the Telegram chat id). */
const TABLES = {
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
} as const;

export type ExportTable = keyof typeof TABLES;
export const EXPORT_TABLES = Object.keys(TABLES) as ExportTable[];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/export/[table]">) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { table } = await ctx.params;
  if (!(table in TABLES)) return new Response("Unknown table", { status: 404 });
  const t = TABLES[table as ExportTable];

  const columns = Object.values(getTableColumns(t)).map((c) => c.name);
  const res = await db.execute<Record<string, unknown>>(sql`select ${sql.join(columns.map((c) => sql.identifier(c)), sql`, `)} from ${t} order by 1`);

  const lines = [columns.join(","), ...res.rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))];
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${table}-${todayIST()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
