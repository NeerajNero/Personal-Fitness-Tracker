/**
 * The users table and the few cross-user lookups (sign-in, bot chat → user, the tick's user list, admin People).
 * Everything else goes through `forUser()`; this is the one module allowed to query without a user id.
 */
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
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

/**
 * The allowlist is the authority: a users row never grants access by itself. Checked at sign-in and again in the jwt
 * callback on every request, so dropping someone from the env (and redeploying) locks them out at once.
 */
export function isAllowedEmail(email: string): boolean {
  return allowedEmails().includes(normalizeEmail(email));
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

/** A send got 403: they blocked the bot. The chat stays linked; the tick skips them until `clearChatBlocked`. */
export async function markChatBlocked(userId: UserId): Promise<void> {
  await db.update(settings).set({ telegramBlockedAt: new Date(), updatedAt: new Date() }).where(eq(settings.userId, userId));
}

/** They wrote to the bot again (Telegram sends `/start` when they tap Restart), so sends can resume. */
export async function clearChatBlocked(userId: UserId): Promise<void> {
  await db.update(settings).set({ telegramBlockedAt: null, updatedAt: new Date() }).where(eq(settings.userId, userId));
}

/** Onboarded users with a linked, unblocked chat — the tick runs the rules for each of these. */
export async function listLinkedUsers(): Promise<{ userId: UserId; chatId: string }[]> {
  const rows = await db
    .select({ userId: settings.userId, chatId: settings.telegramChatId })
    .from(settings)
    .innerJoin(users, eq(users.id, settings.userId))
    .where(and(isNotNull(settings.telegramChatId), isNull(settings.telegramBlockedAt), isNotNull(users.onboardedAt)))
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({ userId: asUserId(r.userId), chatId: r.chatId! }));
}

/* -------------------------------- admin -------------------------------- */

export type PersonRow = {
  id: string; email: string; name: string | null; isAdmin: boolean; onboarded: boolean; linked: boolean;
  /** Linked but they blocked the bot (a send got 403); no reminders until they write again. */
  blocked: boolean;
  /** Still in ALLOWED_EMAILS. False = can't sign in any more; run remove-user to delete their data. */
  allowed: boolean;
  createdAt: Date;
};

/** Read-only list for Settings → People (admins only). */
export async function listPeople(): Promise<PersonRow[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin, onboardedAt: users.onboardedAt, chatId: settings.telegramChatId, blockedAt: settings.telegramBlockedAt, createdAt: users.createdAt })
    .from(users)
    .leftJoin(settings, eq(settings.userId, users.id))
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({
    id: r.id, email: r.email, name: r.name, isAdmin: r.isAdmin, onboarded: r.onboardedAt !== null, linked: r.chatId !== null,
    blocked: r.chatId !== null && r.blockedAt !== null, allowed: isAllowedEmail(r.email) || r.email === OWNER_PLACEHOLDER_EMAIL, createdAt: r.createdAt,
  }));
}
