import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return drizzle({ client: neon(url), schema });
}

declare global {
  /** Test hook: tests/*.test.ts set a PGlite-backed drizzle instance here before importing app code. */
  var __recompTestDb: unknown;
}

export const db = (globalThis.__recompTestDb as ReturnType<typeof connect> | undefined) ?? connect();
export type Db = typeof db;
export { schema };
