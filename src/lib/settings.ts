import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings, type Settings } from "@/db/schema";

export type { Settings };

/** The singleton settings row (id = 1). Seeded by `pnpm seed`. */
export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (!row) throw new Error("settings row is missing — run `pnpm seed`");
  return row;
}

/** Onboarding is complete once the four body stats exist. */
export function isOnboarded(s: Settings): boolean {
  return s.weightKg !== null && s.heightCm !== null && s.age !== null && s.sex !== null;
}
