import { settings, type Settings } from "@/db/schema";
import { forUser, type UserId } from "@/lib/db/scope";

export type { Settings };

/** The user's settings row. Written by onboarding, so an onboarded user always has one. */
export async function getSettings(userId: UserId): Promise<Settings> {
  const row = await findSettings(userId);
  if (!row) throw new Error("settings row is missing — finish onboarding");
  return row;
}

export async function findSettings(userId: UserId): Promise<Settings | null> {
  const u = forUser(userId);
  const [row] = await u.db.select().from(settings).where(u.own(settings)).limit(1);
  return row ?? null;
}

/** Owner-style protein phases are in force only when every phase column is set. */
export function hasPhases(s: Settings): boolean {
  return s.phaseSwitchDate !== null && s.proteinMinVeg !== null && s.proteinMaxVeg !== null && s.proteinMinNonveg !== null && s.proteinMaxNonveg !== null;
}

/** Monthly protein budgets exist only when both phase budgets are set (owner). */
export function hasBudgets(s: Settings): boolean {
  return s.budgetVegInr !== null && s.budgetNonvegInr !== null;
}

/** The navel goal card and chart need the start, the band and the end date. */
export function hasNavelGoal(s: Settings): s is Settings & { navelStartCm: number; navelGoalMinCm: number; navelGoalMaxCm: number; goalDate: string } {
  return s.navelStartCm !== null && s.navelGoalMinCm !== null && s.navelGoalMaxCm !== null && s.goalDate !== null;
}
