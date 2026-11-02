/**
 * Multi-user isolation, end to end against a real Postgres (PGlite, in memory):
 *   1. migrations 0000–0006 + legacy single-user rows → 0007 stamps them onto the placeholder owner;
 *   2. two users each log a food, a weigh-in and a set; Today state, Trends data, export and bot resolution
 *      contain only their own rows.
 * Run: pnpm test   (node --conditions=react-server so `server-only` resolves)
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

const pg = new PGlite();
const db = drizzle({ client: pg });
globalThis.__recompTestDb = db; // must happen before any `@/` import below

const MIGRATIONS = join(process.cwd(), "drizzle");
async function runMigration(file: string) {
  const text = readFileSync(join(MIGRATIONS, file), "utf8");
  for (const stmt of text.split("--> statement-breakpoint")) {
    if (stmt.trim()) await db.execute(sql.raw(stmt));
  }
}

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const before7 = files.filter((f) => f < "0007");
const from7 = files.filter((f) => f >= "0007");

test("0007 backfills the legacy single-user data onto the placeholder owner", async () => {
  for (const f of before7) await runMigration(f);
  await db.execute(sql`insert into settings (id) values (1)`);
  await db.execute(sql`insert into foods (name, serving_label, kcal, protein_g) values ('Paneer', '100 g', 265, 18)`);
  await db.execute(sql`insert into food_log (date, time, label, qty, kcal, protein_g) values ('2026-10-20', '12:00', 'Paneer', 1, 265, 18)`);
  await db.execute(sql`insert into daily_metrics (date, weight_kg) values ('2026-10-20', 74.2)`);
  await db.execute(sql`insert into exercises (name, muscle_group, is_custom) values ('Lat pulldown (wide)', 'back', false), ('My cable thing', 'back', true)`);
  await db.execute(sql`insert into routine_days (name, sort_order) values ('Push', 1)`);
  for (const f of from7) await runMigration(f);

  const { rows: users } = await db.execute<{ email: string; is_admin: boolean; onboarded: boolean }>(sql`select email, is_admin, onboarded_at is not null as onboarded from users`);
  assert.equal(users.length, 1);
  assert.deepEqual(users[0], { email: "owner@recomp.local", is_admin: true, onboarded: true });
  for (const t of ["settings", "foods", "food_log", "daily_metrics", "routine_days"]) {
    const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(t)} where user_id is null`);
    assert.equal(rows[0].n, 0, `${t} has unstamped rows`);
  }
  const { rows: ex } = await db.execute<{ name: string; owned: boolean }>(sql`select name, user_id is not null as owned from exercises order by name`);
  assert.deepEqual(ex, [{ name: "Lat pulldown (wide)", owned: false }, { name: "My cable thing", owned: true }]);
  const { rows: s } = await db.execute<{ goal: string; loc: string; dpw: number; kcal: number }>(sql`select goal, training_location as loc, days_per_week as dpw, kcal_target as kcal from settings`);
  assert.deepEqual(s[0], { goal: "recomp", loc: "gym", dpw: 4, kcal: 1925 });

  // Re-running the migration is a no-op.
  for (const f of from7) await runMigration(f);
  const { rows: again } = await db.execute<{ n: number }>(sql`select count(*)::int as n from users`);
  assert.equal(again[0].n, 1);
});

test("two users see only their own rows", async () => {
  const { asUserId, forUser } = await import("@/lib/db/scope");
  const schema = await import("@/db/schema");
  const { ensureUser, markOnboarded, userIdByChat, linkChatByCode, listLinkedUsers, listPeople } = await import("@/lib/users");
  const { insertFoodEntries, listFoods, getFood, saveMeal } = await import("@/lib/food");
  const { upsertDailyMetrics } = await import("@/lib/daily");
  const { createWorkoutType, listWorkoutTypes, setDayPlan, getSessionDetail, sessionProgress, findOrCreateExercise, listExercises } = await import("@/lib/training");
  const { getDayState } = await import("@/lib/rules/dayState");
  const { loadWeightSeries, loadDailyTotals, loadMeasurements } = await import("@/lib/metrics/trends");
  const { loadAllHistory } = await import("@/lib/metrics/strength");
  const { exportCsv } = await import("@/lib/export");
  const { createPending, takePending } = await import("@/lib/telegram/ai");
  const { upsertMeasurementByDate } = await import("@/lib/measurements");
  const { computeTargets } = await import("@/lib/targets");
  const { GYM_WORKOUT_TYPES, EXERCISE_LIBRARY } = await import("@/lib/library");

  // The shared library (what `pnpm seed` writes). One row already exists from the legacy data.
  for (const e of EXERCISE_LIBRARY) {
    await db.execute(sql`insert into exercises (name, muscle_group, is_custom) values (${e.name}, ${e.muscleGroup}, false)
      on conflict (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) do nothing`);
  }

  process.env.ALLOWED_EMAILS = "Owner@Example.com, ana@example.com";
  const owner = await ensureUser({ email: "OWNER@example.com", name: "Owner" });
  assert.equal(owner.email, "owner@example.com", "first allowed email claims the placeholder owner");
  assert.equal(owner.isAdmin, true);
  const ana = await ensureUser({ email: "ana@example.com", name: "Ana" });
  assert.equal(ana.isAdmin, false);
  assert.equal(ana.onboardedAt, null);
  const A = asUserId(owner.id);
  const B = asUserId(ana.id);

  // B onboards as a home fat-loss user (what completeOnboarding writes).
  const t = computeTargets({ weightKg: 62, heightCm: 165, age: 30, sex: "female", goal: "fat_loss", daysPerWeek: 3 });
  const uB = forUser(B);
  await uB.db.insert(schema.settings).values(uB.stamp({ goal: "fat_loss", trainingLocation: "home", equipment: ["dumbbells"], daysPerWeek: 3, sessionMinutes: 45,
    kcalTarget: t.kcalTarget, kcalMin: t.kcalMin, kcalMax: t.kcalMax, proteinMin: t.proteinMin, proteinMax: t.proteinMax, telegramLinkCode: "BEEF1234", onboardedAt: new Date() }));
  await markOnboarded(B);
  assert.equal(t.kcalTarget, 1575, "Mifflin-St Jeor × 1.55 − 500, to the nearest 5");
  assert.equal(t.proteinMin, 124, "2.0 g/kg");
  assert.equal(computeTargets({ weightKg: 45, heightCm: 150, age: 60, sex: "female", goal: "fat_loss", daysPerWeek: 1 }).kcalTarget, 1400, "fat-loss floor");
  // A gym user gets Push/Pull/Legs; B (home) gets nothing.
  for (const [i, w] of GYM_WORKOUT_TYPES.entries()) await createWorkoutType(A, w.name, i + 1, w.exercises);
  assert.deepEqual((await listWorkoutTypes(A)).map((x) => x.name), ["Push", "Pull", "Legs"]);
  assert.deepEqual(await listWorkoutTypes(B), []);

  // Foods: same name on both sides is fine; each sees only their own.
  const date = "2026-11-02";
  const paneerA = (await listFoods(A)).find((f) => f.name === "Paneer")!;
  const mealB = await saveMeal(B, { label: "Paneer", kcal: 300, proteinG: 20 });
  assert.ok(!("error" in mealB));
  assert.equal(await getFood(B, paneerA.id), null, "B can't read A's food by id");
  await insertFoodEntries(A, [{ date, time: "13:00:00", foodId: paneerA.id, label: "Paneer", qty: 1, kcal: 265, proteinG: 18, costInr: 40, source: "app" }]);
  await insertFoodEntries(B, [{ date, time: "13:00:00", foodId: mealB.id, label: "Paneer", qty: 2, kcal: 600, proteinG: 40, costInr: 0, source: "telegram" }]);

  // Weigh-ins and a measurement.
  await upsertDailyMetrics(A, date, { weightKg: 73.5 });
  await upsertDailyMetrics(B, date, { weightKg: 61.0 });
  await upsertMeasurementByDate(B, date, { navelCm: 80 });

  // A set each: A on Pull (the legacy "Push" row from the migration test has no exercises), B on a custom session with her own exercise.
  const planA = await setDayPlan(A, date, { kind: "workout", typeId: (await listWorkoutTypes(A)).find((x) => x.name === "Pull")!.id });
  assert.ok(planA.ok && planA.sessionId);
  const bench = (await listExercises(A)).find((e) => e.name === "Barbell row")!;
  const uA = forUser(A);
  await uA.db.insert(schema.sets).values(uA.stamp({ sessionId: planA.sessionId!, exerciseId: bench.id, setNo: 1, weightKg: 60, reps: 8 }));
  const planB = await setDayPlan(B, date, { kind: "custom" });
  assert.ok(planB.ok && planB.sessionId);
  const curlB = await findOrCreateExercise(B, "Band curl", "biceps");
  await uB.db.insert(schema.sessionExercises).values(uB.stamp({ sessionId: planB.sessionId!, exerciseId: curlB, sortOrder: 1 }));
  await uB.db.insert(schema.sets).values(uB.stamp({ sessionId: planB.sessionId!, exerciseId: curlB, setNo: 1, weightKg: 10, reps: 12 }));
  assert.ok(!(await listExercises(A)).some((e) => e.id === curlB), "B's custom exercise is invisible to A");
  // A can't plan a day with B's workout type (checked on an empty date so the sets guard doesn't short-circuit).
  const homeB = await createWorkoutType(B, "Home", 1, []);
  assert.equal(await setDayPlan(A, "2026-11-03", { kind: "workout", typeId: homeB! }).then(() => "ok", (e: Error) => e.message), "Workout type not found");
  assert.deepEqual((await listWorkoutTypes(B)).map((x) => x.name), ["Home"]);

  // Today state.
  const sA = await getDayState(A, date);
  const sB = await getDayState(B, date);
  assert.equal(sA.totals.kcal, 265);
  assert.equal(sB.totals.kcal, 600);
  assert.equal(sA.metrics.weightKg, 73.5);
  assert.equal(sB.metrics.weightKg, 61);
  assert.equal(sA.dayPlan.kind, "workout");
  assert.equal(sB.dayPlan.kind, "custom");
  assert.equal(sA.targets.kcal, 1925, "owner targets untouched");
  assert.equal(sB.targets.kcal, 1575);
  assert.equal(sB.targets.proteinMin, 124, "single protein range when phases are null");
  assert.equal(sB.targets.budget, null);
  assert.equal(sA.targets.budget, 4800);
  assert.deepEqual(sB.daysSince.map((d) => [d.typeName, d.days]), [["Home", null]], "only B's own type, never trained");
  assert.deepEqual((await sessionProgress(A, planA.sessionId!)), { logged: 1, total: 6 });
  assert.equal(await getSessionDetail(B, planA.sessionId!), null, "B can't open A's session");

  // Trends data.
  assert.deepEqual((await loadWeightSeries(A)).map((p) => p.weightKg), [74.2, 73.5]);
  assert.deepEqual((await loadWeightSeries(B)).map((p) => p.weightKg), [61]);
  assert.deepEqual((await loadDailyTotals(B, "2026-10-01", date)).map((d) => d.kcal), [600]);
  assert.deepEqual((await loadMeasurements(A)), []);
  assert.deepEqual((await loadAllHistory(A)).map((h) => h.name), ["Barbell row"]);
  assert.deepEqual((await loadAllHistory(B)).map((h) => h.name), ["Band curl"]);

  // Export.
  const csvA = (await exportCsv(A, "food_log")).body;
  const csvB = (await exportCsv(B, "food_log")).body;
  assert.equal(csvA.split("\r\n").filter(Boolean).length, 3, "header + A's two entries");
  assert.equal(csvB.split("\r\n").filter(Boolean).length, 2);
  assert.ok(csvB.includes("telegram") && !csvA.includes("telegram"));
  const exA = (await exportCsv(A, "exercises")).body;
  assert.ok(exA.includes("My cable thing") && !exA.includes("Band curl"));
  assert.ok((await exportCsv(B, "exercises")).body.includes("Band curl"));

  // Bot resolution: link by code, resolve by chat, foreign pending parse.
  assert.equal(await userIdByChat("111"), null);
  assert.equal(await linkChatByCode("nope", "111"), null);
  assert.equal(await linkChatByCode("beef1234", "222"), B);
  assert.equal(await userIdByChat("222"), B);
  await uA.db.update(schema.settings).set({ telegramChatId: "111" }).where(uA.own(schema.settings));
  assert.equal(await userIdByChat("111"), A);
  assert.deepEqual((await listLinkedUsers()).map((x) => x.chatId).sort(), ["111", "222"]);
  const pendingA = await createPending(A, { date, text: "x", items: [], totals: { kcal: 0, proteinG: 0 } });
  assert.equal(await takePending(B, pendingA), null, "B can't confirm A's parse");
  assert.ok(await takePending(A, pendingA));

  const people = await listPeople();
  assert.deepEqual(people.map((p) => [p.email, p.onboarded, p.linked]), [["owner@example.com", true, true], ["ana@example.com", true, true]]);
});
