/**
 * What Settings → Diagnostics shows, decided here and not in the UI: the admin flag comes from the users row, and the
 * System / People sections and the dry tick are never computed for anyone else. The server actions in
 * src/app/(app)/settings/diag-actions.ts only resolve the session and call these.
 */
import type { Api } from "grammy";
import type { UserId } from "@/lib/db/scope";
import { runTick, type TickResult } from "@/lib/rules/tick";
import { getUser } from "@/lib/users";
import { recentEvents, type EventRow } from "./events";
import { collectMe, meSections } from "./me";
import { buildInfo, collectSystem, systemSections } from "./system";
import { fmtUtc, type DiagReport } from "./text";

const eventLine = (e: EventRow, withUser: boolean) =>
  `${fmtUtc(e.at)} · ${withUser ? `${e.email ?? "system"} · ` : ""}${e.scope} · ${e.level} · ${e.message}${e.meta ? ` ${JSON.stringify(e.meta)}` : ""}`;

export async function isAdmin(userId: UserId): Promise<boolean> {
  return (await getUser(userId))?.isAdmin ?? false;
}

/** Me + DayState + my events for everyone; System, People and everyone's events only when the users row says admin. */
export async function buildDiagnostics(userId: UserId, opts: { host?: string | null; iat?: number; api?: Api } = {}): Promise<{ report: DiagReport; admin: boolean }> {
  const admin = await isAdmin(userId);
  const [me, system, events] = await Promise.all([
    collectMe(userId, { iat: opts.iat }),
    admin ? collectSystem({ host: opts.host, api: opts.api }) : null,
    admin ? recentEvents({ all: true, limit: 50 }) : recentEvents({ userId, limit: 20 }),
  ]);
  const sections = [...meSections(me), ...(system ? systemSections(system) : [])];
  sections.push({ title: admin ? "Events (last 50, everyone)" : "Events (last 20, mine)", items: events.length ? events.map((e) => eventLine(e, admin)) : ["none"] });
  return { report: { header: { build: buildInfo().sha, time: fmtUtc(new Date()), user: me.email }, sections }, admin };
}

/** Admin only; anyone else is refused before anything runs. */
export async function runTickDryAs(userId: UserId): Promise<TickResult> {
  if (!(await isAdmin(userId))) throw new Error("Admins only");
  return runTick({ dry: true });
}
