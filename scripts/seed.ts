/**
 * Idempotent seed. Run with: pnpm seed  (loads .env via node --env-file)
 *
 * A fresh database gets only the shared exercise library (user_id null): the gym rows and the home ladders from
 * src/lib/library.ts. Users are created on first sign-in; their settings, foods and workout types come from onboarding
 * (gym users get Push/Pull/Legs; home users build Day A/B/C from the card). Re-running refreshes library rows and never
 * touches a user's custom exercises. Run it after every deploy that changes the library.
 */
import { db } from "../src/db";
import { EXERCISE_LIBRARY, HOME_LIBRARY, LADDERS } from "../src/lib/library";
import { upsertLibrary } from "../src/lib/library-seed";

async function main() {
  const n = await upsertLibrary(db);
  console.log(`exercises: ${n} upserted of ${EXERCISE_LIBRARY.length} (${HOME_LIBRARY.length} home rows on ${LADDERS.length} ladders)`);
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
