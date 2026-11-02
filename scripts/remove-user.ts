/**
 * Remove a person and every row they own. Take them off ALLOWED_EMAILS and redeploy first, or they can sign in
 * again and get a fresh, empty account.
 *   pnpm remove-user:dry <email>   — print what would be deleted, write nothing
 *   pnpm remove-user <email>       — unlink their Telegram chat, then delete the users row (every table cascades)
 * Refuses admins (the owner). Prints counts and the email only, never chat ids.
 */
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import { settings, users } from "../src/db/schema";
import { normalizeEmail } from "../src/lib/users";

const DRY = process.argv.includes("dry");
const email = process.argv.slice(2).find((a) => a !== "dry");

const OWNED_TABLES = [
  "settings", "foods", "food_log", "daily_metrics", "measurements", "exercises", "routine_days", "routine_exercises",
  "sessions", "session_exercises", "sets", "activities", "nudge_log", "pending_parses",
];

async function main() {
  if (!email) throw new Error("usage: pnpm remove-user[:dry] <email>");
  console.log(DRY ? "DRY RUN — nothing will be written\n" : "APPLYING\n");

  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  if (!user) throw new Error(`no user with that email`);
  if (user.isAdmin) throw new Error("refusing to remove an admin — clear is_admin in SQL first if you really mean it");

  const [s] = await db.select({ chatId: settings.telegramChatId }).from(settings).where(eq(settings.userId, user.id)).limit(1);
  console.log(`${user.email} · onboarded ${user.onboardedAt ? "yes" : "no"} · telegram ${s?.chatId ? "linked" : "not linked"}`);
  for (const t of OWNED_TABLES) {
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)} where user_id = ${user.id}`);
    if (rows[0].n > 0) console.log(`  ${t}: ${rows[0].n}`);
  }
  if (DRY) return;

  await db.update(settings).set({ telegramChatId: null, updatedAt: new Date() }).where(eq(settings.userId, user.id));
  await db.delete(users).where(eq(users.id, user.id));
  console.log("\nunlinked and deleted");
}

main()
  .then(() => {
    console.log(DRY ? "\ndry run complete" : "\ndone");
    process.exit(0);
  })
  .catch((err) => {
    console.error("failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
