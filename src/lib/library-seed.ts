/**
 * Upsert the shared exercise library (user_id null), idempotent by name. Used by `pnpm seed` and the tests. Takes the
 * db as a parameter so it never imports `@/db` itself. Re-running refreshes group, cues, pattern, equipment, measure
 * and ladder on library rows and never touches a user's custom exercises.
 */
import { sql, type SQL } from "drizzle-orm";
import { NIL_UUID } from "@/db/schema";
import { EXERCISE_LIBRARY, LAT_CUES } from "./library";

/** Any drizzle client (Neon in the app, PGlite in tests): only `execute` is needed. */
type Executor = { execute(query: SQL): Promise<{ rows: unknown[] }> };

export async function upsertLibrary(db: Executor): Promise<number> {
  const rows = sql.join(
    EXERCISE_LIBRARY.map((e) =>
      sql`(${e.name}, ${e.muscleGroup}, ${e.pull ? LAT_CUES : (e.cues ?? null)}, false, ${e.pattern}::exercise_pattern, ${sql.raw(`'{${e.equipment.join(",")}}'`)}::text[], ${e.measure ?? "reps"}::exercise_measure, ${e.ladder ?? null}, ${e.ladderLevel ?? null})`,
    ),
    sql`, `,
  );
  const res = await db.execute(sql`
    insert into "exercises" ("name", "muscle_group", "cues", "is_custom", "pattern", "equipment", "measure", "ladder", "ladder_level") values ${rows}
    on conflict (coalesce("user_id", ${NIL_UUID}::uuid), lower("name"))
    do update set "muscle_group" = excluded."muscle_group", "cues" = excluded."cues", "pattern" = excluded."pattern",
      "equipment" = excluded."equipment", "measure" = excluded."measure", "ladder" = excluded."ladder", "ladder_level" = excluded."ladder_level"
    returning "id"`);
  return res.rows.length;
}
