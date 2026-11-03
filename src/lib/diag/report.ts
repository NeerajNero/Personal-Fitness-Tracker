/** Server-action error boundary: an unexpected error (not validation, not a redirect) becomes a diag event. */
import { currentUserId } from "@/lib/session";
import { logEvent } from "./events";

/** `TypeError: first line of the message` — never a stack, never SQL. */
export const describeError = (err: Error): string => `${err.name}: ${err.message.split("\n")[0]}`;

/**
 * Writes `action · <Error>: <first line>` for the signed-in user with the action's name in `meta`.
 * Awaited by the caller, so the row exists before Next renders its error page. Never throws.
 */
export async function reportActionError(err: unknown, action: string | null): Promise<void> {
  if (!(err instanceof Error)) return;
  const userId = await currentUserId();
  await logEvent({ userId, scope: "action", level: "error", message: describeError(err), meta: action ? { action } : null });
}
