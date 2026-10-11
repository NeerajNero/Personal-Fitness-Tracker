/** Instant rule (logging path, not the tick): a log that pushes kcal over target gets an immediate overage reply. */
import { n0 } from "@/lib/format";
import type { DayState } from "@/lib/rules/dayState";

export function overageLine(state: DayState): string | null {
  if (state.remaining.kcal >= 0) return null;
  return `⚠️ ${n0(-state.remaining.kcal)} kcal over target — you're done for today.`;
}
