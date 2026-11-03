import { AsyncLocalStorage } from "node:async_hooks";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { reportActionError } from "@/lib/diag/report";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

type Running = { name: string; failed: unknown[] };
const running = new AsyncLocalStorage<Running>();

/**
 * Runs one server action under its name. A thrown error that isn't a Next redirect / notFound is written to
 * diag_events (user, action, error class, first message line) before it is rethrown, so the row exists before Next
 * renders its error page. Errors handed to `fail()` inside are written the same way before the result is returned.
 */
export async function run<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const store: Running = { name, failed: [] };
  return running.run(store, async () => {
    try {
      const result = await fn();
      for (const err of store.failed) await reportActionError(err, name);
      return result;
    } catch (err) {
      unstable_rethrow(err);
      await reportActionError(err, name);
      throw err;
    }
  });
}

/** Wraps an exported server action: `export const save = action("save", async (…) => { … })`. */
export function action<A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return (...args) => run(name, () => fn(...args));
}

/** Validation errors are the user's; anything else is also recorded as a diag event (see `run`). */
export function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof z.ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input" };
  const store = running.getStore();
  if (store) store.failed.push(err);
  else void reportActionError(err, null);
  return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
}
