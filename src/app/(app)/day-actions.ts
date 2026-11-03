"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE } from "@/lib/dates";
import { createHomePlan, PUSHUP_ANSWERS } from "@/lib/home-program";
import { requireUser } from "@/lib/session";
import { setDayPlan } from "@/lib/training";

const choiceSchema = z.union([
  z.object({ kind: z.literal("rest") }),
  z.object({ kind: z.literal("custom") }),
  z.object({ kind: z.literal("workout"), typeId: z.number().int().positive() }),
]);

/** "Set up your home plan": Day A/B/C from the ladders, after the push-up question. Idempotent. */
export const createHomePlanAction = action("createHomePlanAction", async (pushups: string): Promise<ActionResult<{ created: boolean }>> => {
  const userId = await requireUser();
  try {
    const r = await createHomePlan(userId, z.enum(PUSHUP_ANSWERS).parse(pushups));
    revalidatePath("/today");
    revalidatePath("/train");
    revalidatePath("/settings");
    return { ok: true, created: r.created };
  } catch (e) {
    return fail(e);
  }
});

/** The day picker on Today and Train. `needsConfirm` → the current session has sets; call again with confirm to switch and keep them. */
export const chooseDay = action("chooseDay", async (
  date: string,
  choice: { kind: "rest" } | { kind: "custom" } | { kind: "workout"; typeId: number },
  confirm = false,
): Promise<ActionResult<{ needsConfirm: false } | { needsConfirm: true; setCount: number }>> => {
  const userId = await requireUser();
  try {
    const r = await setDayPlan(userId, z.string().regex(ISO_DATE, "Bad date").parse(date), choiceSchema.parse(choice), { confirm: z.boolean().parse(confirm) });
    if (!r.ok) return { ok: true, needsConfirm: true, setCount: r.setCount };
    revalidatePath("/today");
    revalidatePath("/train");
    return { ok: true, needsConfirm: false };
  } catch (e) {
    return fail(e);
  }
});
