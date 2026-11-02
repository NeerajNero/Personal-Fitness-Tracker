/**
 * Dump every table to one dated JSON file in ./backups/ (gitignored). This and the Neon branch are the restore sources;
 * the per-user CSV export in Settings is for users, not for restores.
 *   pnpm backup          — settings.telegram_chat_id and settings.telegram_link_code are written as null
 *   pnpm backup --full   — keeps them (needed to restore chat links without everyone re-sending /start)
 * Rows are plain `select *` (column names as in the database), tables in dependency order so a restore can replay the
 * file top to bottom. Prints row counts and the file name only, never a value.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/db";

const FULL = process.argv.includes("--full");
const OUT_DIR = join(process.cwd(), "backups");

/** Parents before children. Any table not listed here (a future one) is appended alphabetically. */
const ORDER = [
  "users", "settings", "exercises", "foods", "food_log", "daily_metrics", "measurements", "routine_days", "routine_exercises",
  "sessions", "session_exercises", "sets", "activities", "nudge_log", "pending_parses",
];
const REDACTED: Record<string, string[]> = FULL ? {} : { settings: ["telegram_chat_id", "telegram_link_code"] };

async function main() {
  const { rows: found } = await db.execute<{ name: string }>(
    sql`select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  );
  const names = found.map((r) => r.name);
  const tables = [...ORDER.filter((t) => names.includes(t)), ...names.filter((t) => !ORDER.includes(t))];

  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    const { rows } = await db.execute<Record<string, unknown>>(sql`select * from ${sql.identifier(t)}`);
    for (const col of REDACTED[t] ?? []) for (const row of rows) if (col in row) row[col] = null;
    data[t] = rows;
    console.log(`  ${t}: ${rows.length}`);
  }

  const takenAt = new Date();
  const file = join(OUT_DIR, `recomp-${takenAt.toISOString().replace(/[:.]/g, "-").slice(0, 19)}${FULL ? "-full" : ""}.json`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify({ takenAt, full: FULL, redacted: REDACTED, tables, data }, null, 1));
  console.log(`\nwrote ${file}${FULL ? "  (FULL: contains chat ids and link codes — keep it private)" : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
