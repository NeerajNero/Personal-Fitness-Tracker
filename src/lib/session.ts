import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** For server actions and pages outside the (app) layout gate. */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}
