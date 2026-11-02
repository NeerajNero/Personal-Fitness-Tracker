/**
 * Idempotent seed. Run with: pnpm seed  (loads .env via node --env-file)
 *
 * A fresh database gets only the shared exercise library (user_id null). Users are created on first sign-in;
 * their settings, foods and workout types come from onboarding (gym users get Push/Pull/Legs from src/lib/library.ts).
 * Re-running refreshes muscle_group and cues on library rows and never touches a user's custom exercises.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { exercises, NIL_UUID } from "../src/db/schema";
import { EXERCISE_LIBRARY, LAT_CUES } from "../src/lib/library";

async function main() {
  // Upsert on exercises_owner_name_uq = (coalesce(user_id, nil), lower(name)); drizzle's builder can't name an expression index.
  const rows = sql.join(
    EXERCISE_LIBRARY.map((e) => sql`(${e.name}, ${e.muscleGroup}, ${e.pull ? LAT_CUES : null}, false)`),
    sql`, `,
  );
  const res = await db.execute(sql`
    insert into ${exercises} ("name", "muscle_group", "cues", "is_custom") values ${rows}
    on conflict (coalesce("user_id", ${NIL_UUID}::uuid), lower("name"))
    do update set "muscle_group" = excluded."muscle_group", "cues" = excluded."cues"
    returning "id"`);
  console.log(`exercises: ${res.rows.length} upserted (${EXERCISE_LIBRARY.filter((e) => e.pull).length} with lat cues)`);
}

main()
  .then(() => {
    console.log("seed complete");
    process.exit(0);
  })
  .catch((err) => {
    console.error("seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
