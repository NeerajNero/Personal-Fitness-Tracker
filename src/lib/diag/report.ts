/** Server-action error boundary: unexpected errors (not validation) become a diag event, after the response is sent. */
import { after } from "next/server";
import { auth } from "@/auth";
import { asUserId } from "@/lib/db/scope";
import { logEvent } from "./events";

export function reportActionError(err: unknown): void {
  if (!(err instanceof Error)) return;
  const message = `${err.name}: ${err.message}`;
  try {
    after(async () => {
      const session = await auth().catch(() => null);
      await logEvent({ userId: session?.user?.id ? asUserId(session.user.id) : null, scope: "action", level: "error", message });
    });
  } catch {
    // Outside a request (tests, scripts): there is nothing to attach it to.
  }
}
