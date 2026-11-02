import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { asUserId, type UserId } from "@/lib/db/scope";

/** For server actions and pages outside the (app) layout gate. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

/** The signed-in user's id, from the JWT only — never from the client. */
export async function requireUser(): Promise<UserId> {
  const session = await requireSession();
  return asUserId(session.user!.id!);
}
