/** Test double for next/navigation (see hooks.mjs): the same thrown-error contract as Next, without Next's runtime. */
export class RedirectError extends Error {
  digest: string;
  constructor(url: string, type: "replace" | "push" = "replace", status = 307) {
    super("NEXT_REDIRECT");
    this.digest = `NEXT_REDIRECT;${type};${url};${status};`;
  }
}

export function redirect(url: string, type?: "replace" | "push"): never {
  throw new RedirectError(url, type);
}

/** Rethrows Next's internal errors (redirect, notFound, …) so an app-level catch doesn't swallow them. */
export function unstable_rethrow(err: unknown): void {
  if (typeof err === "object" && err !== null && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_")) throw err;
}

/** Where a thrown redirect goes, or null when the error isn't one. */
export function redirectTarget(err: unknown): string | null {
  if (!(typeof err === "object" && err !== null && "digest" in err && typeof err.digest === "string")) return null;
  const [kind, , url] = err.digest.split(";");
  return kind === "NEXT_REDIRECT" ? url : null;
}
