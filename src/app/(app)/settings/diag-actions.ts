"use server";

import { headers } from "next/headers";
import { fail, type ActionResult } from "@/lib/action-result";
import { recentEvents, type EventRow } from "@/lib/diag/events";
import { collectMe, meSections } from "@/lib/diag/me";
import { buildInfo, collectSystem, systemSections } from "@/lib/diag/system";
import { fmtUtc, type DiagReport } from "@/lib/diag/text";
import { runTick, type TickResult } from "@/lib/rules/tick";
import { requireSession } from "@/lib/session";
import { asUserId } from "@/lib/db/scope";
import { getUser } from "@/lib/users";

const eventLine = (e: EventRow, withUser: boolean) =>
  `${fmtUtc(e.at)} · ${withUser ? `${e.email ?? "system"} · ` : ""}${e.scope} · ${e.level} · ${e.message}${e.meta ? ` ${JSON.stringify(e.meta)}` : ""}`;

/** Everything Settings → Diagnostics shows, built on open (the webhook probe is a network call). */
export async function loadDiagnostics(): Promise<ActionResult<{ report: DiagReport; admin: boolean }>> {
  try {
    const session = await requireSession();
    const userId = asUserId(session.user!.id!);
    const user = await getUser(userId);
    const admin = user?.isAdmin ?? false;
    const host = (await headers()).get("host");
    const [me, system, events] = await Promise.all([
      collectMe(userId, { iat: (session as { iat?: number }).iat }),
      admin ? collectSystem({ host }) : null,
      admin ? recentEvents({ all: true, limit: 50 }) : recentEvents({ userId, limit: 20 }),
    ]);
    const sections = [...meSections(me), ...(system ? systemSections(system) : [])];
    sections.push({ title: admin ? "Events (last 50, everyone)" : "Events (last 20, mine)", items: events.length ? events.map((e) => eventLine(e, admin)) : ["none"] });
    const report: DiagReport = { header: { build: buildInfo().sha, time: fmtUtc(new Date()), user: me.email }, sections };
    return { ok: true, report, admin };
  } catch (e) {
    return fail(e);
  }
}

/** Admin only: evaluate every linked user now without sending; the response is shown inline. */
export async function runTickDry(): Promise<ActionResult<{ result: TickResult }>> {
  try {
    const session = await requireSession();
    const user = await getUser(asUserId(session.user!.id!));
    if (!user?.isAdmin) throw new Error("Admins only");
    return { ok: true, result: await runTick({ dry: true }) };
  } catch (e) {
    return fail(e);
  }
}
