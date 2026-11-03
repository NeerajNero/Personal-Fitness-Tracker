/**
 * Module doubles for the tests. Import this first (tests/onboarding.test.ts): it wraps Node's CommonJS resolver, which
 * is how tsx loads every module here, so that
 *   - `@/lib/session` → ./session.ts: the signed-in user is `globalThis.__recompTestUserId` instead of Auth.js, so the
 *     real server actions run without a request or a Google session;
 *   - `next/navigation` → ./navigation.ts: `redirect` throws the NEXT_REDIRECT error Next throws and `unstable_rethrow`
 *     passes it through, because Next's own module can't load under --conditions=react-server.
 * Everything else, including the stubs' own imports, resolves as before.
 */
import Module from "node:module";
import { join } from "node:path";

const stubs: Record<string, string> = {
  "@/lib/session": join(__dirname, "session.ts"),
  "next/navigation": join(__dirname, "navigation.ts"),
};

type Resolver = (this: unknown, request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolver };
const original = mod._resolveFilename;
mod._resolveFilename = function (request, parent, ...rest) {
  const stub = stubs[request];
  if (stub && !parent?.filename?.includes(join("tests", "stubs"))) return stub;
  return original.call(this, request, parent, ...rest);
};
