/**
 * The admin "System" section of Diagnostics and the extra lines of the bot's `diag`. Each probe is independent and
 * reports its own failure as text, so one broken dependency never hides the others. Secrets never leave here: env is
 * present/missing by name, chat ids are masked, the bot token is only used to call getWebhookInfo.
 */
import { Api } from "grammy";
import nextPkg from "next/package.json";
import { count, sql } from "drizzle-orm";
import journal from "../../../drizzle/meta/_journal.json";
import { db } from "@/db";
import { pendingParses, users } from "@/db/schema";
import { nowTimeIST, todayIST } from "@/lib/dates";
import { GEMINI_MODEL } from "@/lib/telegram/ai";
import { appUrl, botToken } from "@/lib/telegram/env";
import { listPeople } from "@/lib/users";
import type { TickRunUser } from "@/lib/rules/tick";
import { lastTickRun, recentEvents, userEventStats, type EventRow } from "./events";
import { fmtUtc, type DiagSection } from "./text";

export const REQUIRED_ENV = [
  "DATABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ALLOWED_EMAILS", "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "TICK_SECRET", "GEMINI_API_KEY", "NEXT_PUBLIC_APP_URL",
] as const;

export type BuildInfo = { sha: string; builtAt: string | null; next: string };
export type DbInfo = { ok: boolean; ms: number; migration: string | null; users: number | null; error: string | null };
export type WebhookInfo = { ok: boolean; url: string | null; matches: boolean | null; pending: number | null; lastError: string | null; lastErrorAt: string | null; error: string | null };
export type TickInfo = { at: Date; dry: boolean; users: TickRunUser[] } | null;
export type GeminiInfo = { key: boolean; model: string; pending: number | null; last: EventRow | null };
export type PersonDiag = { email: string; onboarded: boolean; linked: boolean; blocked: boolean; allowed: boolean; lastInbound: Date | null; lastOutbound: Date | null; lastSendError: string | null };
export type SystemDiag = {
  build: BuildInfo;
  time: { utc: string; ist: string };
  env: { present: string[]; missing: string[] };
  url: { configured: string | null; host: string | null; matches: boolean | null };
  db: DbInfo;
  webhook: WebhookInfo | null;
  tick: TickInfo;
  gemini: GeminiInfo;
  people: PersonDiag[];
};

const errName = (e: unknown) => (e instanceof Error ? e.name : "Error");

export function buildInfo(): BuildInfo {
  return { sha: process.env.NEXT_PUBLIC_BUILD_SHA || "dev", builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || null, next: nextPkg.version };
}

export function envStatus(): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];
  for (const name of REQUIRED_ENV) {
    const set = name === "ALLOWED_EMAILS" ? Boolean(process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL) : Boolean(process.env[name]);
    (set ? present : missing).push(name);
  }
  return { present, missing };
}

/** A timed `select 1`, the latest applied migration (by the journal's `when`), and the users count. */
export async function dbCheck(): Promise<DbInfo> {
  const t0 = Date.now();
  try {
    await db.execute(sql`select 1`);
    const ms = Date.now() - t0;
    let migration: string | null = null;
    try {
      const { rows } = await db.execute<{ created_at: string }>(sql`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`);
      const when = rows[0] ? Number(rows[0].created_at) : null;
      migration = when === null ? "none recorded" : (journal.entries.find((e) => e.when === when)?.tag ?? `unknown (${when})`);
    } catch {
      migration = "no migrations table";
    }
    const [{ n }] = await db.select({ n: count() }).from(users);
    return { ok: true, ms, migration, users: n, error: null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, migration: null, users: null, error: errName(e) };
  }
}

/** `api` lets the bot (and the test) reuse its own client; otherwise a fresh one with the server-side token. */
export async function webhookStatus(api: Api = new Api(botToken())): Promise<WebhookInfo> {
  try {
    const info = await api.getWebhookInfo();
    const expected = appUrl() ? `${appUrl()}/api/telegram` : null;
    return {
      ok: true, url: info.url || null, matches: expected ? info.url === expected : null, pending: info.pending_update_count,
      lastError: info.last_error_message ?? null, lastErrorAt: info.last_error_date ? fmtUtc(new Date(info.last_error_date * 1000)) : null, error: null,
    };
  } catch (e) {
    return { ok: false, url: null, matches: null, pending: null, lastError: null, lastErrorAt: null, error: errName(e) };
  }
}

export async function tickStatus(): Promise<TickInfo> {
  const run = await lastTickRun();
  if (!run) return null;
  const meta = (run.meta ?? {}) as { dry?: boolean; users?: TickRunUser[] };
  return { at: run.at, dry: meta.dry ?? false, users: meta.users ?? [] };
}

export async function geminiStatus(): Promise<GeminiInfo> {
  let pending: number | null = null;
  try {
    const [{ n }] = await db.select({ n: count() }).from(pendingParses);
    pending = n;
  } catch { /* reported as null */ }
  const last = (await recentEvents({ all: true, limit: 200 })).find((e) => e.scope === "gemini") ?? null;
  return { key: Boolean(process.env.GEMINI_API_KEY), model: GEMINI_MODEL, pending, last };
}

export async function peopleStatus(): Promise<PersonDiag[]> {
  const [people, stats] = await Promise.all([listPeople(), userEventStats()]);
  return people.map((p) => {
    const s = stats.get(p.id) ?? { lastInbound: null, lastOutbound: null, lastSendError: null };
    return { email: p.email, onboarded: p.onboarded, linked: p.linked, blocked: p.blocked, allowed: p.allowed, ...s };
  });
}

export async function collectSystem(opts: { host?: string | null; webhook?: boolean; api?: Api } = {}): Promise<SystemDiag> {
  const configured = appUrl() || null;
  const host = opts.host ?? null;
  const [dbInfo, webhook, tick, gemini, people] = await Promise.all([
    dbCheck(), opts.webhook === false ? Promise.resolve(null) : webhookStatus(opts.api), tickStatus(), geminiStatus(), peopleStatus(),
  ]);
  return {
    build: buildInfo(),
    time: { utc: fmtUtc(new Date()), ist: `${todayIST()} ${nowTimeIST()} IST` },
    env: envStatus(),
    url: { configured, host, matches: configured && host ? new URL(configured).host === host : null },
    db: dbInfo, webhook, tick, gemini, people,
  };
}

export const tickUserLine = (u: TickRunUser) => (u.ok ? `${u.user} ok${u.rules.length ? ` sent ${u.rules.join(", ")}` : " nothing due"}` : `${u.user} failed ${u.error}${u.code ? ` ${u.code}` : ""}`);

export function systemSections(s: SystemDiag): DiagSection[] {
  const sections: DiagSection[] = [];
  sections.push({
    title: "System",
    lines: [
      ["Build", `${s.build.sha} · built ${s.build.builtAt ? fmtUtc(s.build.builtAt) : "unknown"} · Next ${s.build.next}`],
      ["Server time", `${s.time.utc} · ${s.time.ist}`],
      ["Env present", s.env.present.join(", ") || "none"],
      ["Env missing", s.env.missing.join(", ") || "none"],
      ["App URL", `${s.url.configured ?? "NEXT_PUBLIC_APP_URL missing"} · request host ${s.url.host ?? "unknown"} · ${s.url.matches === null ? "not compared" : s.url.matches ? "match" : "MISMATCH"}`],
      ["Database", s.db.ok ? `ok · select 1 in ${s.db.ms} ms · migration ${s.db.migration} · ${s.db.users} users` : `FAILED (${s.db.error}) after ${s.db.ms} ms`],
      ["Webhook", !s.webhook ? "not checked" : s.webhook.ok
        ? `${s.webhook.url ?? "not set"} · ${s.webhook.matches === null ? "not compared" : s.webhook.matches ? "matches app URL" : "DOES NOT match app URL"} · ${s.webhook.pending} pending · last error ${s.webhook.lastError ? `${s.webhook.lastError} at ${s.webhook.lastErrorAt}` : "none"}`
        : `getWebhookInfo failed (${s.webhook.error})`],
      ["Last tick", s.tick ? `${fmtUtc(s.tick.at)}${s.tick.dry ? " (dry)" : ""} · ${s.tick.users.length ? s.tick.users.map(tickUserLine).join(" · ") : "no linked users"}` : "no run recorded"],
      ["Gemini", `key ${s.gemini.key ? "present" : "MISSING"} · ${s.gemini.model} · ${s.gemini.pending ?? "?"} pending parses · last ${s.gemini.last ? `${s.gemini.last.message} ${JSON.stringify(s.gemini.last.meta ?? {})} at ${fmtUtc(s.gemini.last.at)}` : "none"}`],
    ],
  });
  sections.push({
    title: "People",
    items: s.people.map((p) =>
      `${p.email} · ${p.allowed ? "allowed" : "NOT in ALLOWED_EMAILS"} · ${p.onboarded ? "onboarded" : "not onboarded"} · ${p.blocked ? "BLOCKED" : p.linked ? "linked" : "no chat"} · in ${fmtUtc(p.lastInbound)} · out ${fmtUtc(p.lastOutbound)} · send error ${p.lastSendError ?? "none"}`),
  });
  return sections;
}
