/**
 * Onboarding and the server-action error boundary, end to end against PGlite on migrations 0000–0010:
 *   1. the real `completeOnboarding` action (session stubbed, see tests/stubs/register.ts) for a home user and a gym
 *      user: settings row, users.onboarded_at, the redirect, Push/Pull/Legs only for the gym user; a second submit is
 *      sent to Today; a settings row left by a failed attempt is updated, not inserted again; validation returns field
 *      errors and writes nothing;
 *   2. every file-level "use server" module exports only functions (Next refuses the whole module otherwise, which is
 *      what broke the second user's onboarding: the form's zod schema was exported next to the action);
 *   3. a throwing action leaves an `action` diag event (user, action name, error class, first message line) before
 *      the error reaches Next; a redirect leaves none; `fail()` inside an action is reported under the action's name.
 * Run: pnpm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { before, test } from "node:test";
import { pathToFileURL } from "node:url";
import "./stubs/register"; // @/lib/session and next/navigation doubles, before any app module loads
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const db = drizzle({ client: pg });
globalThis.__recompTestDb = db; // must happen before any `@/` import below

const MIGRATIONS = join(process.cwd(), "drizzle");
before(async () => {
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const text = readFileSync(join(MIGRATIONS, file), "utf8");
    for (const stmt of text.split("--> statement-breakpoint")) if (stmt.trim()) await db.execute(sql.raw(stmt));
  }
});

const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const HOME = { weightKg: "60", heightCm: "160", age: "30", sex: "female", goal: "fat_loss", trainingLocation: "home", equipment: ["none"], daysPerWeek: "3", sessionMinutes: "30" };
const GYM = { weightKg: "80", heightCm: "178", age: "35", sex: "male", goal: "recomp", trainingLocation: "gym", equipment: ["dumbbells"], daysPerWeek: "4", sessionMinutes: "60" };

/** Runs the action as `userId`; resolves to the redirect target, the returned state, or rejects. */
async function submit(userId: string, fields: Record<string, string | string[]>) {
  const { completeOnboarding } = await import("@/app/onboarding/actions");
  const { redirectTarget } = await import("./stubs/navigation");
  globalThis.__recompTestUserId = userId;
  try {
    return { state: await completeOnboarding(null, form(fields)), redirect: null as string | null };
  } catch (err) {
    const redirect = redirectTarget(err);
    if (!redirect) throw err;
    return { state: null, redirect };
  }
}

test("completeOnboarding: home and gym users, resume, validation", async () => {
  const { ensureUser, getUser } = await import("@/lib/users");
  const { findSettings } = await import("@/lib/settings");
  const { listWorkoutTypes } = await import("@/lib/training");
  const { asUserId } = await import("@/lib/db/scope");
  const { recentEvents } = await import("@/lib/diag/events");

  process.env.ALLOWED_EMAILS = "owner@example.com, mia@example.com, raj@example.com, tom@example.com";
  await ensureUser({ email: "owner@example.com", name: "Owner" });
  const mia = asUserId((await ensureUser({ email: "mia@example.com", name: "Mia" })).id);
  const raj = asUserId((await ensureUser({ email: "raj@example.com", name: "Raj" })).id);
  const tom = asUserId((await ensureUser({ email: "tom@example.com", name: "Tom" })).id);

  // Home, bodyweight only, fat loss: the second user's exact inputs.
  const home = await submit(mia, HOME);
  assert.equal(home.redirect, "/onboarding/confirm");
  const s = (await findSettings(mia))!;
  assert.ok(s, "settings row written");
  assert.equal((await getUser(mia))!.onboardedAt !== null, true, "users.onboarded_at set");
  assert.ok(s.onboardedAt, "settings.onboarded_at set");
  assert.deepEqual(
    { goal: s.goal, loc: s.trainingLocation, equipment: s.equipment, days: s.daysPerWeek, minutes: s.sessionMinutes, target: s.weeklySessionTarget, sex: s.sex, age: s.age, weight: s.weightKg, height: s.heightCm },
    { goal: "fat_loss", loc: "home", equipment: ["none"], days: 3, minutes: 30, target: 3, sex: "female", age: 30, weight: 60, height: 160 },
  );
  assert.deepEqual({ kcal: s.kcalTarget, min: s.kcalMin, max: s.kcalMax, pmin: s.proteinMin, pmax: s.proteinMax }, { kcal: 1500, min: 1475, max: 1525, pmin: 120, pmax: 132 }, "Mifflin-St Jeor 1289 × 1.55 − 500, to 5; 2.0–2.2 g/kg");
  assert.match(s.telegramLinkCode!, /^[0-9A-F]{8}$/);
  assert.deepEqual(await listWorkoutTypes(mia), [], "home users get no starter types");
  assert.equal((await submit(mia, HOME)).redirect, "/today", "an onboarded user is sent to Today, targets untouched");

  // Gym: Push/Pull/Legs, equipment ignored.
  const gym = await submit(raj, GYM);
  assert.equal(gym.redirect, "/onboarding/confirm");
  const g = (await findSettings(raj))!;
  assert.deepEqual({ goal: g.goal, loc: g.trainingLocation, equipment: g.equipment, kcal: g.kcalTarget, pmin: g.proteinMin, pmax: g.proteinMax }, { goal: "recomp", loc: "gym", equipment: [], kcal: 2475, pmin: 144, pmax: 160 });
  assert.deepEqual((await listWorkoutTypes(raj)).map((x) => x.name), ["Push", "Pull", "Legs"]);
  assert.ok((await getUser(raj))!.onboardedAt);

  // Resume: an earlier attempt left a settings row (link code and onboarded_at included) but never reached markOnboarded.
  const earlier = new Date("2026-11-01T05:00:00Z");
  await db.execute(sql`insert into settings (user_id, kcal_target, kcal_min, kcal_max, telegram_link_code, onboarded_at) values (${tom}::uuid, 1, 1, 1, 'OLDCODE1', ${earlier.toISOString()}::timestamptz)`);
  assert.equal((await getUser(tom))!.onboardedAt, null);
  assert.equal((await submit(tom, HOME)).redirect, "/onboarding/confirm", "a retry works");
  const t = (await findSettings(tom))!;
  assert.deepEqual({ kcal: t.kcalTarget, code: t.telegramLinkCode, at: t.onboardedAt?.toISOString(), goal: t.goal }, { kcal: 1500, code: "OLDCODE1", at: earlier.toISOString(), goal: "fat_loss" }, "updated in place, code and date kept");
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from settings where user_id = ${tom}::uuid`);
  assert.equal(rows[0].n, 1);
  assert.ok((await getUser(tom))!.onboardedAt);

  // Validation: field errors, nothing written, no event.
  const bad = asUserId((await ensureUser({ email: "bad@example.com", name: null })).id);
  const v = await submit(bad, { ...HOME, goal: "", weightKg: "12" });
  assert.equal(v.redirect, null);
  assert.equal(v.state?.error, "Check the highlighted fields.");
  assert.deepEqual(Object.keys(v.state!.fieldErrors).sort(), ["goal", "weightKg"]);
  assert.equal(await findSettings(bad), null);
  assert.equal((await getUser(bad))!.onboardedAt, null);
  assert.deepEqual(await recentEvents({ userId: bad }), []);
});

test('every "use server" file exports only functions', async () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && readFileSync(p, "utf8").trimStart().startsWith('"use server"')) files.push(p);
    }
  };
  walk(join(process.cwd(), "src/app"));
  assert.ok(files.some((f) => f.endsWith("onboarding/actions.ts")), "the onboarding action is one of them");
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) assert.equal(typeof value, "function", `${file.replace(process.cwd(), "")} exports ${name} (${typeof value}); Next refuses the whole module`);
  }
});

test("a throwing action leaves a diag event before Next sees the error", async () => {
  const { action, run, fail } = await import("@/lib/action-result");
  const { redirect } = await import("./stubs/navigation"); // the double the actions see
  const { findUserByEmail } = await import("@/lib/users");
  const { asUserId } = await import("@/lib/db/scope");
  const { recentEvents } = await import("@/lib/diag/events");
  const mia = asUserId((await findUserByEmail("mia@example.com"))!.id);
  globalThis.__recompTestUserId = mia;

  const explode = action("explode", async (n: number) => {
    throw new TypeError(`boom ${n}\nsecond line never logged`);
  });
  await assert.rejects(explode(1), (e: unknown) => e instanceof TypeError && e.message.startsWith("boom 1"), "the error still reaches Next");
  let [ev] = await recentEvents({ userId: mia, limit: 1 });
  assert.deepEqual({ scope: ev.scope, level: ev.level, message: ev.message, meta: ev.meta }, { scope: "action", level: "error", message: "TypeError: boom 1", meta: { action: "explode" } });

  // A redirect is not a failure.
  await assert.rejects(action("leave", async () => redirect("/today"))(), (e: unknown) => (e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT;replace;/today") === true);
  assert.equal((await recentEvents({ userId: mia })).length, 1, "no event for a redirect");

  // fail() inside an action: the result comes back, the event carries the action's name, both before the return.
  const soft = action("soft", async () => {
    try {
      throw new RangeError("out of range");
    } catch (e) {
      return fail(e);
    }
  });
  assert.deepEqual(await soft(), { ok: false, error: "out of range" });
  [ev] = await recentEvents({ userId: mia, limit: 1 });
  assert.deepEqual({ message: ev.message, meta: ev.meta }, { message: "RangeError: out of range", meta: { action: "soft" } });
  assert.deepEqual(await run("plain", async () => 7), 7);
  assert.equal((await recentEvents({ userId: mia })).length, 2);
});
