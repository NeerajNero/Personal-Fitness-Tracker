import { z } from "zod";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}
