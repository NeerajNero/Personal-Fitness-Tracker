import { z } from "zod";
import { reportActionError } from "@/lib/diag/report";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Validation errors are the user's; anything else is also recorded as a diag event (scope `action`). */
export function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  reportActionError(err);
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}
