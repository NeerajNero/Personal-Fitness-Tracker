/**
 * Per-user data access. `forUser(userId)` is the only way to reach the database from app code
 * (ESLint forbids importing `@/db` anywhere else), so a query on a per-person table can't be written
 * without a user id in hand. Use `own(table, …)` / `visible(…)` in every WHERE and `stamp()` on every insert.
 */
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { exercises } from "@/db/schema";

/** A users.id that came from the session or a trusted lookup, never from the client. */
export type UserId = string & { readonly __brand: "UserId" };

/** Only auth, the session helper and src/lib/users.ts may mint one. */
export const asUserId = (id: string): UserId => id as UserId;

type UserTable = { userId: PgColumn };

export function forUser(userId: UserId) {
  return {
    userId,
    /** The raw client; every query on a user_id table must still filter with `own` / `visible`. */
    db,
    /** `user_id = $1` for raw SQL fragments. */
    uid: sql`${userId}::uuid`,
    /** `user_id = me AND …` */
    own: (t: UserTable, ...conds: (SQL | undefined)[]) => and(eq(t.userId, userId), ...conds),
    /** Shared library rows (user_id null) plus this user's own. */
    visible: (...conds: (SQL | undefined)[]) => and(or(isNull(exercises.userId), eq(exercises.userId, userId)), ...conds),
    /** Insert values with the owner filled in. */
    stamp: <T extends object>(values: T): T & { userId: UserId } => ({ ...values, userId }),
  };
}

export type Scope = ReturnType<typeof forUser>;
