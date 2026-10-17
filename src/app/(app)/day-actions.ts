"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { ISO_DATE } from "@/lib/dates";
import { requireSession } from "@/lib/session";
import { setDayPlan } from "@/lib/training";

const choiceSchema = z.union([
  z.object({ kind: z.literal("rest") }),
  z.object({ kind: z.literal("custom") }),
  z.object({ kind: z.literal("workout"), typeId: z.number().int().positive() }),
]);

/** The day picker on Today and Train. `needsConfirm` → the current session has sets; call again with confirm to switch and keep them. */
export async function chooseDay(
  date: string,
  choice: { kind: "rest" } | { kind: "custom" } | { kind: "workout"; typeId: number },
  confirm = false,
): Promise<ActionResult<{ needsConfirm: false } | { needsConfirm: true; setCount: number }>> {
  await requireSession();
  try {
    const r = await setDayPlan(z.string().regex(ISO_DATE, "Bad date").parse(date), choiceSchema.parse(choice), { confirm: z.boolean().parse(confirm) });
    if (!r.ok) return { ok: true, needsConfirm: true, setCount: r.setCount };
    revalidatePath("/today");
    revalidatePath("/train");
    return { ok: true, needsConfirm: false };
  } catch (e) {
    return fail(e);
  }
}
