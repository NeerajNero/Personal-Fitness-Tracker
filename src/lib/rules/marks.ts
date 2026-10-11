/** Per-day markers stored in nudge_log (rule_key prefix `mark:`). Not sends; excluded from the daily cap. */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { nudgeLog } from "@/db/schema";
import { NO_TRAINING_MARK } from "./dayState";

export async function markNoTraining(date: string): Promise<void> {
  const exists = await db.select({ id: nudgeLog.id }).from(nudgeLog).where(and(eq(nudgeLog.date, date), eq(nudgeLog.ruleKey, NO_TRAINING_MARK))).limit(1);
  if (exists.length) return;
  await db.insert(nudgeLog).values({ date, ruleKey: NO_TRAINING_MARK, payload: { kind: "marker" } });
}
