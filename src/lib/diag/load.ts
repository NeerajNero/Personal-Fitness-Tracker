/**
 * What Settings → Diagnostics shows, decided here and not in the UI: the admin flag comes from the users row, and the
 * System / People sections and the dry tick are never computed for anyone else. Every section loads on its own: a
 * failing one becomes `{ title, error }` (error class + first line, never the SQL) and the rest still render. The
 * server actions in src/app/(app)/settings/diag-actions.ts only resolve the session and call these.
 */
import type { Api } from "grammy";
import type { UserId } from "@/lib/db/scope";
import { runTick, type TickResult } from "@/lib/rules/tick";
import { getUser } from "@/lib/users";
import { recentEvents, type EventRow } from "./events";
import { collectDayState, collectMe, DAY_STATE_TITLE, dayStateSection, meSection } from "./me";
import { buildInfo, collectSystem, peopleSection, peopleStatus, systemSection } from "./system";
import { errorLine, fmtUtc, type DiagReport, type DiagSection } from "./text";

const eventLine = (e: EventRow, withUser: boolean) =>
  `${fmtUtc(e.at)} · ${withUser ? `${e.email ?? "system"} · ` : ""}${e.scope} · ${e.level} · ${e.message}${e.meta ? ` ${JSON.stringify(e.meta)}` : ""}`;

export async function isAdmin(userId: UserId): Promise<boolean> {
  return (await getUser(userId))?.isAdmin ?? false;
}

/** Runs one section's collector; its failure is that section's error line and nothing else's. */
async function section(title: string, build: () => Promise<DiagSection>): Promise<DiagSection> {
  try {
    return await build();
  } catch (e) {
    return { title, error: errorLine(e) };
  }
}

/** Me + DayState + my events for everyone; System, People and everyone's events only when the users row says admin. */
export async function buildDiagnostics(userId: UserId, opts: { host?: string | null; iat?: number; api?: Api } = {}): Promise<{ report: DiagReport; admin: boolean }> {
  const admin = await isAdmin(userId);
  const user = await getUser(userId).catch(() => null);
  const eventsTitle = admin ? "Events (last 50, everyone)" : "Events (last 20, mine)";
  const sections = await Promise.all([
    section("Me", async () => meSection(await collectMe(userId, { iat: opts.iat }))),
    section(DAY_STATE_TITLE, async () => dayStateSection(await collectDayState(userId))),
    ...(admin
      ? [
          section("System", async () => systemSection(await collectSystem({ host: opts.host, api: opts.api }))),
          section("People", async () => peopleSection(await peopleStatus())),
        ]
      : []),
    section(eventsTitle, async () => {
      const events = admin ? await recentEvents({ all: true, limit: 50 }) : await recentEvents({ userId, limit: 20 });
      return { title: eventsTitle, items: events.length ? events.map((e) => eventLine(e, admin)) : ["none"] };
    }),
  ]);
  return { report: { header: { build: buildInfo().sha, time: fmtUtc(new Date()), user: user?.email ?? userId }, sections }, admin };
}

/** Admin only; anyone else is refused before anything runs. */
export async function runTickDryAs(userId: UserId): Promise<TickResult> {
  if (!(await isAdmin(userId))) throw new Error("Admins only");
  return runTick({ dry: true });
}
