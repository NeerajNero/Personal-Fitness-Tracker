/** Test double for src/lib/session.ts (see hooks.mjs): the user is whoever the test put in `globalThis.__recompTestUserId`. */
import { asUserId, type UserId } from "@/lib/db/scope";

declare global {
  var __recompTestUserId: string | undefined;
}

export async function requireSession() {
  const id = globalThis.__recompTestUserId;
  if (!id) throw new Error("test: no signed-in user (set globalThis.__recompTestUserId)");
  return { user: { id }, expires: "" };
}

export async function requireUser(): Promise<UserId> {
  return asUserId((await requireSession()).user.id);
}

export async function currentUserId(): Promise<UserId | null> {
  const id = globalThis.__recompTestUserId;
  return id ? asUserId(id) : null;
}
