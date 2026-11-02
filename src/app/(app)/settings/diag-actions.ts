"use server";

import { headers } from "next/headers";
import { fail, type ActionResult } from "@/lib/action-result";
import { asUserId } from "@/lib/db/scope";
import { buildDiagnostics, runTickDryAs } from "@/lib/diag/load";
import type { DiagReport } from "@/lib/diag/text";
import type { TickResult } from "@/lib/rules/tick";
import { requireSession } from "@/lib/session";

/** Everything Settings → Diagnostics shows, built on open (the admin probes include a network call). */
export async function loadDiagnostics(): Promise<ActionResult<{ report: DiagReport; admin: boolean }>> {
  try {
    const session = await requireSession();
    const { report, admin } = await buildDiagnostics(asUserId(session.user!.id!), { host: (await headers()).get("host"), iat: (session as { iat?: number }).iat });
    return { ok: true, report, admin };
  } catch (e) {
    return fail(e);
  }
}

/** Admin only (checked in the lib, not the UI): evaluate every linked user now without sending. */
export async function runTickDry(): Promise<ActionResult<{ result: TickResult }>> {
  try {
    const session = await requireSession();
    return { ok: true, result: await runTickDryAs(asUserId(session.user!.id!)) };
  } catch (e) {
    return fail(e);
  }
}
