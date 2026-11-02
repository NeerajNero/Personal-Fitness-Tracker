/**
 * The users table and the few cross-user lookups (sign-in, bot chat → user, the tick's user list, admin People).
 * Everything else goes through `forUser()`; this is the one module allowed to query without a user id.
 */
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings, users, type User } from "@/db/schema";
import { asUserId, type UserId } from "@/lib/db/scope";

export type { User };

/** Placeholder email the migration gives the pre-existing data's owner until the real owner signs in. */
export const OWNER_PLACEHOLDER_EMAIL = "owner@recomp.local";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** ALLOWED_EMAILS (or the older ALLOWED_EMAIL), lower-cased, blanks dropped. The first entry is the owner. */
export function allowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? process.env.ALLOWED_EMAIL ?? "";
  return raw.split(",").map(normalizeEmail).filter((e) => e !== "");
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return row ?? null;
}

export async function getUser(userId: UserId): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/**
 * The users row for a sign-in. The first ALLOWED_EMAILS entry claims the migration's placeholder owner row
 * (so the existing data becomes theirs); anyone else gets a fresh row on their first sign-in.
 */
export async function ensureUser(input: { email: string; name: string | null }): Promise<User> {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) return existing;
  if (email === allowedEmails()[0]) {
    const [claimed] = await db
      .update(users)
      .set({ email, name: input.name })
      .where(eq(users.email, OWNER_PLACEHOLDER_EMAIL))
      .returning();
    if (claimed) return claimed;
  }
  const [created] = await db.insert(users).values({ email, name: input.name }).onConflictDoNothing().returning();
  return created ?? (await findUserByEmail(email))!;
}

export async function markOnboarded(userId: UserId): Promise<void> {
  await db.update(users).set({ onboardedAt: sql`coalesce(${users.onboardedAt}, now())` }).where(eq(users.id, userId));
}

/* ------------------------------ telegram ------------------------------ */

/** The user whose settings hold this chat id, or null (unlinked chat). */
export async function userIdByChat(chatId: string): Promise<UserId | null> {
  const [row] = await db.select({ userId: settings.userId }).from(settings).where(eq(settings.telegramChatId, chatId)).limit(1);
  return row ? asUserId(row.userId) : null;
}

/** `/start <code>`: link the chat to whoever owns the code. Returns the user, or null when no code matches. */
export async function linkChatByCode(code: string, chatId: string): Promise<UserId | null> {
  const [row] = await db
    .update(settings)
    .set({ telegramChatId: chatId, updatedAt: new Date() })
    .where(and(sql`upper(${settings.telegramLinkCode}) = ${code.trim().toUpperCase()}`, sql`${settings.telegramChatId} is null`))
    .returning({ userId: settings.userId });
  return row ? asUserId(row.userId) : null;
}

/** Onboarded users with a linked chat — the tick runs the rules for each of these. */
export async function listLinkedUsers(): Promise<{ userId: UserId; chatId: string }[]> {
  const rows = await db
    .select({ userId: settings.userId, chatId: settings.telegramChatId })
    .from(settings)
    .innerJoin(users, eq(users.id, settings.userId))
    .where(and(isNotNull(settings.telegramChatId), isNotNull(users.onboardedAt)))
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({ userId: asUserId(r.userId), chatId: r.chatId! }));
}

/* -------------------------------- admin -------------------------------- */

export type PersonRow = { email: string; name: string | null; isAdmin: boolean; onboarded: boolean; linked: boolean; createdAt: Date };

/** Read-only list for Settings → People (admins only). */
export async function listPeople(): Promise<PersonRow[]> {
  const rows = await db
    .select({ email: users.email, name: users.name, isAdmin: users.isAdmin, onboardedAt: users.onboardedAt, chatId: settings.telegramChatId, createdAt: users.createdAt })
    .from(users)
    .leftJoin(settings, eq(settings.userId, users.id))
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({ email: r.email, name: r.name, isAdmin: r.isAdmin, onboarded: r.onboardedAt !== null, linked: r.chatId !== null, createdAt: r.createdAt }));
}
