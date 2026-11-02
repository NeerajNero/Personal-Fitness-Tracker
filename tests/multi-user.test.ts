/**
 * Multi-user isolation, end to end against a real Postgres (PGlite, in memory):
 *   1. migrations 0000–0006 + legacy single-user rows → 0007 stamps them onto the placeholder owner;
 *   2. two users each log a food, a weigh-in and a set; Today state, Trends data, export and bot resolution
 *      contain only their own rows;
 *   3. ALLOWED_EMAILS is the authority (a users row grants nothing) and a blocked chat drops out of the tick's list
 *      until that person writes to the bot again;
 *   4. diagnostics: a simulated bot message and a dry tick write diag events for the right user only, `diag` answers,
 *      and the copied text carries no chat id, token or link code; with diag_events missing, every other section
 *      still renders and the copied text lists the failure under "Errors"; a database behind the journal says so;
 *   5. the admin gate is server-side: a non-admin's report has no System / People, the dry tick is refused, and the
 *      bot's `diag` has no webhook or per-user lines;
 *   6. the home program: ladder rules (up at 3 × 15, down after two sessions under 8, stall at three flat sessions),
 *      the plan is created once with the right starting rungs (and seeds the library if it has to), a rung advances on
 *      the next Start, a hold logs seconds.
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
  const { GYM_WORKOUT_TYPES } = await import("@/lib/library");
  const { upsertLibrary } = await import("@/lib/library-seed");

  // The shared library (what `pnpm seed` writes). One row already exists from the legacy data and gets refreshed.
  await upsertLibrary(db);

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

test("the allowlist is the authority; blocked chats are skipped until they write again", async () => {
  const { isAllowedEmail, findUserByEmail, listLinkedUsers, listPeople, markChatBlocked, clearChatBlocked, userIdByChat } = await import("@/lib/users");
  const { describeSendError } = await import("@/lib/telegram/send");
  const { GrammyError, HttpError } = await import("grammy");

  // Dropping ana from the env is enough: her users row still exists, but sign-in and the jwt callback ask only this.
  assert.equal(isAllowedEmail("Ana@Example.com"), true);
  process.env.ALLOWED_EMAILS = "owner@example.com";
  assert.ok(await findUserByEmail("ana@example.com"), "the row is still there");
  assert.equal(isAllowedEmail("ana@example.com"), false, "a users row grants nothing");
  assert.deepEqual((await listPeople()).map((p) => [p.email, p.allowed]), [["owner@example.com", true], ["ana@example.com", false]]);
  process.env.ALLOWED_EMAILS = "owner@example.com, ana@example.com";
  assert.equal(isAllowedEmail("ana@example.com"), true);

  // A 403 from Telegram = they blocked the bot. The chat stays linked, the tick skips them, People shows it.
  const forbidden = new GrammyError("Call to 'sendMessage' failed!", { ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }, "sendMessage", {});
  assert.deepEqual(describeSendError(forbidden), { error: "GrammyError", code: 403, blocked: true });
  assert.deepEqual(describeSendError(new HttpError("Network request for 'sendMessage' failed!", new Error("ECONNRESET"))), { error: "HttpError", code: null, blocked: false });
  assert.deepEqual(describeSendError(new TypeError("x")), { error: "TypeError", code: null, blocked: false });

  const B = (await userIdByChat("222"))!;
  await markChatBlocked(B);
  assert.deepEqual((await listLinkedUsers()).map((x) => x.chatId), ["111"], "blocked chat is skipped by the tick");
  assert.deepEqual((await listPeople()).map((p) => [p.linked, p.blocked]), [[true, false], [true, true]]);
  assert.equal(await userIdByChat("222"), B, "still linked: her next message resolves to her and clears the flag");
  await clearChatBlocked(B);
  assert.deepEqual((await listLinkedUsers()).map((x) => x.chatId).sort(), ["111", "222"]);
  assert.deepEqual((await listPeople()).map((p) => p.blocked), [false, false]);
});

test("diagnostics: events land on the right user and the copied text holds no secrets", async () => {
  const { getBot } = await import("@/lib/telegram/bot");
  const { runTick } = await import("@/lib/rules/tick");
  const { recentEvents, lastTickRun } = await import("@/lib/diag/events");
  const { buildDiagnostics } = await import("@/lib/diag/load");
  const { dbCheck, migrationsPendingLine } = await import("@/lib/diag/system");
  const { renderDiagText } = await import("@/lib/diag/text");
  const { userIdByChat, findUserByEmail } = await import("@/lib/users");
  const { asUserId } = await import("@/lib/db/scope");

  const TOKEN = "123456:TESTTOKENXYZ";
  const CHAT_A = "5551234111";
  const CHAT_B = "5559876222";
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.NEXT_PUBLIC_APP_URL = "https://recomp.test";
  await db.execute(sql`update settings set telegram_chat_id = ${CHAT_A} where telegram_chat_id = '111'`);
  await db.execute(sql`update settings set telegram_chat_id = ${CHAT_B} where telegram_chat_id = '222'`);
  const A = asUserId((await findUserByEmail("owner@example.com"))!.id);
  const B = (await userIdByChat(CHAT_B))!;

  // Every Telegram API call is answered locally; replies are captured by method + text.
  const bot = getBot();
  const sent: string[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    if (method === "sendMessage") sent.push(String((payload as { text?: string }).text ?? ""));
    const result =
      method === "getMe" ? { id: 1, is_bot: true, first_name: "t", username: "recomp_test_bot", can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false }
      : method === "getWebhookInfo" ? { url: "https://recomp.test/api/telegram", has_custom_certificate: false, pending_update_count: 0 }
      : { message_id: 1, date: 0, chat: { id: 1, type: "private" } };
    return { ok: true, result } as never;
  });
  await bot.init();
  const update = (chat: string, text: string, id: number) => ({
    update_id: id, message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id: Number(chat), type: "private" as const, first_name: "x" }, from: { id: Number(chat), is_bot: false, first_name: "x" }, text },
  });

  await bot.handleUpdate(update(CHAT_B, "w 61.5", 1));
  assert.match(sent.at(-1) ?? "", /61\.5/, "the bot answered the weigh-in");
  const mine = await recentEvents({ userId: B });
  assert.ok(mine.some((e) => e.scope === "bot" && e.message === "command" && (e.meta as { kind: string }).kind === "weight"), "B has the bot event");
  assert.ok(!(await recentEvents({ userId: A })).some((e) => e.scope === "bot"), "A has none of B's bot events");

  // A dry tick with a forced rule: a `due` event per linked user and one system `run` event.
  const tick = await runTick({ dry: true, force: "morning_brief" });
  assert.deepEqual(tick.users.map((u) => u.ok), [true, true]);
  for (const id of [A, B]) {
    const ev = (await recentEvents({ userId: id })).find((e) => e.scope === "tick");
    assert.ok(ev && ev.message === "due" && (ev.meta as { dry: boolean }).dry === true, "dry tick event per user");
  }
  const run = await lastTickRun();
  assert.ok(run && run.userId === null && (run.meta as { users: unknown[] }).users.length === 2);

  // `diag`: five lines for a user, seven for the admin; neither leaks the chat id or token.
  await bot.handleUpdate(update(CHAT_B, "diag", 2));
  const diagB = sent.at(-1)!;
  assert.equal(diagB.split("\n").length, 5, diagB);
  assert.ok(diagB.includes("…222") && !diagB.includes(CHAT_B) && !diagB.includes(TOKEN));
  await bot.handleUpdate(update(CHAT_A, "diag", 3));
  const diagA = sent.at(-1)!;
  assert.equal(diagA.split("\n").length, 7, diagA);
  assert.ok(diagA.includes("webhook ok") && diagA.includes("(dry)"));

  // The copied text (what Settings → Diagnostics → Copy produces for the admin).
  const { report } = await buildDiagnostics(A, { host: "recomp.test", api: bot.api, iat: Math.floor(Date.now() / 1000) - 3600 });
  const text = renderDiagText(report);
  for (const secret of [CHAT_A, CHAT_B, TOKEN, "BEEF1234", "beef1234"]) assert.ok(!text.includes(secret), `copied text contains ${secret}`);
  assert.ok(text.includes("chat …111") && text.includes("link code") && !/link code [A-Z0-9]{8}/.test(text));
  assert.ok(text.includes("Env missing") && text.includes("DATABASE_URL"), "env by name only");
  assert.ok(text.includes("migrations table missing — run pnpm db:migrate"), "PGlite was migrated by hand, so the table is missing");
  assert.ok(text.includes("ana@example.com · allowed · onboarded · linked"));
  assert.ok(text.includes('"dayPlan"'), "DayState block present");
  assert.ok(text.includes("· tick · info · due"), "events listed");
  assert.ok(!text.includes("## Errors") && report.sections.every((s) => !s.error), "nothing failed");

  // Behind the journal: a migrations table that stops at 0008 → "1 migration pending"; at the newest → no line.
  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta", "_journal.json"), "utf8")) as { entries: { when: number; tag: string }[] };
  const [prev, last] = journal.entries.slice(-2);
  await db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', ${prev.when})`);
  let dbi = await dbCheck();
  assert.equal(dbi.migration, prev.tag);
  assert.equal(migrationsPendingLine(dbi), "1 migration pending — run pnpm db:migrate");
  await db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('y', ${last.when})`);
  dbi = await dbCheck();
  assert.equal(dbi.migration, last.tag);
  assert.equal(migrationsPendingLine(dbi), null);
  assert.ok(renderDiagText((await buildDiagnostics(A, { host: "recomp.test", api: bot.api })).report).includes(`migration ${last.tag}`));

  // Resilience: without diag_events every other section still renders; the failures are error lines, listed under Errors.
  await db.execute(sql`drop table diag_events`);
  const broken = (await buildDiagnostics(A, { host: "recomp.test", api: bot.api })).report;
  const titles = broken.sections.map((s) => s.title);
  assert.deepEqual(titles, ["Me", "Today's DayState (what the chips and the bot read)", "System", "People", "Events (last 50, everyone)"]);
  const errored = broken.sections.filter((s) => s.error).map((s) => s.title);
  assert.deepEqual(errored, ["People", "Events (last 50, everyone)"], "only the sections that need the table");
  const me = broken.sections[0].lines!.find(([k]) => k === "My rows")![1];
  assert.match(me, /^FAILED \(\w+: .*diag_events/);
  const system = broken.sections[2].lines!;
  assert.match(system.find(([k]) => k === "Last tick")![1], /^check failed \(/);
  assert.match(system.find(([k]) => k === "Database")![1], /^ok · select 1/);
  const brokenText = renderDiagText(broken);
  assert.ok(brokenText.includes("## Errors") && /^People: \w+: /m.test(brokenText) && /^Events \(last 50, everyone\): \w+: /m.test(brokenText));
  assert.ok(!/select .* from/i.test(brokenText.split("## Errors")[1]), "no SQL in the error lines");
  for (const secret of [CHAT_A, CHAT_B, TOKEN]) assert.ok(!brokenText.includes(secret));
  // The bot still answers, and a real tick still runs (pruning is caught).
  await bot.handleUpdate(update(CHAT_B, "diag", 4));
  assert.equal(sent.at(-1)!.split("\n").length, 5);
  assert.equal((await runTick({ dry: false })).dry, false);
  // Restore the table (0009 is re-runnable) so the next test has it.
  for (const f of from7.filter((f) => f.startsWith("0009"))) await runMigration(f);
  assert.ok((await buildDiagnostics(A, { host: "recomp.test", api: bot.api })).report.sections.every((s) => !s.error));
});

test("diagnostics: the admin gate is server-side", async () => {
  const { buildDiagnostics, runTickDryAs } = await import("@/lib/diag/load");
  const { diagReply } = await import("@/lib/diag/bot");
  const { getBot } = await import("@/lib/telegram/bot");
  const { getSettings } = await import("@/lib/settings");
  const { findUserByEmail } = await import("@/lib/users");
  const { asUserId } = await import("@/lib/db/scope");
  const A = asUserId((await findUserByEmail("owner@example.com"))!.id);
  const B = asUserId((await findUserByEmail("ana@example.com"))!.id);
  const api = getBot().api; // still carries the transformer from the previous test

  // Non-admin: only Me, the DayState block and her own events — System and People are never built.
  const forB = await buildDiagnostics(B, { host: "recomp.test", api });
  assert.equal(forB.admin, false);
  assert.deepEqual(forB.report.sections.map((s) => s.title), ["Me", "Today's DayState (what the chips and the bot read)", "Events (last 20, mine)"]);
  assert.ok(forB.report.sections.every((s) => !["System", "People"].includes(s.title)));
  assert.ok(forB.report.sections[2].items!.every((it) => !it.includes("owner@example.com")), "no other user's events");
  assert.ok(!JSON.stringify(forB.report).includes("Webhook"), "no webhook probe result for a non-admin");

  // Admin: the same call adds System, People and everyone's events.
  const forA = await buildDiagnostics(A, { host: "recomp.test", api });
  assert.equal(forA.admin, true);
  assert.deepEqual(forA.report.sections.map((s) => s.title).slice(2), ["System", "People", "Events (last 50, everyone)"]);

  // The dry tick is refused for a non-admin before anything runs, and works for the admin.
  await assert.rejects(runTickDryAs(B), /Admins only/);
  assert.equal((await runTickDryAs(A)).dry, true);

  // The bot's diag: five lines for her, no webhook or per-user tick line; seven for the admin.
  const replyB = await diagReply({ userId: B, settings: await getSettings(B) }, api);
  assert.equal(replyB.split("\n").length, 5);
  assert.ok(!replyB.includes("webhook") && !replyB.includes("👥") && !replyB.includes("owner@example.com"), replyB);
  const replyA = await diagReply({ userId: A, settings: await getSettings(A) }, api);
  assert.equal(replyA.split("\n").length, 7);
  assert.ok(replyA.includes("🌐 webhook") && replyA.includes("👥"));
});

test("home program: ladders, the plan, rung advance and seconds", async () => {
  const { bodyweightHint } = await import("@/lib/metrics/strength");
  const { createHomePlan, startingRung } = await import("@/lib/home-program");
  const { copyLastSets, getSessionDetail, listRoutineExercises, listWorkoutTypes, setDayPlan } = await import("@/lib/training");
  const { estimateTypeMinutes } = await import("@/lib/workout-card");
  const { getDayState } = await import("@/lib/rules/dayState");
  const { findUserByEmail } = await import("@/lib/users");
  const { asUserId, forUser } = await import("@/lib/db/scope");
  const { eq } = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  const B = asUserId((await findUserByEmail("ana@example.com"))!.id);
  const uB = forUser(B);

  // The rules, pure.
  const rung = { ladder: "push_up", level: 3, max: 6, next: { id: 2, name: "Push-up" }, prev: { id: 1, name: "Incline push-up (table)" } };
  const sets = (r: number[]) => r.map((reps, i) => ({ setNo: i + 1, weightKg: 0, reps }));
  const up = bodyweightHint([sets([15, 15, 15])], "reps", 3, rung);
  assert.equal(up.mode, "up");
  assert.equal(up.text, "3 × 15/15/15 last time, move to Push-up next time");
  const down = bodyweightHint([sets([15, 15, 7]), sets([10, 9, 7])], "reps", 3, rung);
  assert.equal(down.mode, "down");
  assert.equal(down.text, "Two sessions under 8, try Incline push-up (table) next time");
  assert.equal(bodyweightHint([sets([15, 15, 7])], "reps", 3, rung).mode, "reps", "one session under the bottom is not yet a step down");
  const stall = bodyweightHint([sets([10, 10, 10]), sets([10, 10, 10]), sets([10, 10, 10])], "reps", 3, rung);
  assert.equal(stall.mode, "stall");
  assert.match(stall.text, /3-second lowering or one extra set/);
  assert.equal(bodyweightHint([sets([12, 12, 11])], "reps", 3, rung).text, "3 × 12/12/11 last time, aim for 13s");
  assert.equal(bodyweightHint([sets([45, 45, 45])], "seconds", 3, null).text, "45/45/45 s last time, top of the ladder: add a set");
  assert.equal(bodyweightHint([sets([30])], "seconds", 3, rung).text, "30 s last time, aim for 35 s");
  assert.equal(bodyweightHint([], "seconds", 3, rung).text, "First time, aim for 3 × 20–45 s");

  // Starting rungs per answer: holds and calves always 1; the rest follow the push-up answer.
  assert.deepEqual(["push_up", "row", "squat", "plank", "calves"].map((l) => startingRung(l, "0")), [1, 1, 1, 1, 1]);
  assert.deepEqual(["push_up", "row", "squat", "plank", "calves"].map((l) => startingRung(l, "1-5")), [2, 1, 1, 1, 1]);
  assert.deepEqual(["push_up", "row", "squat", "plank", "calves"].map((l) => startingRung(l, "6-15")), [3, 1, 2, 1, 1]);
  assert.deepEqual(["push_up", "row", "squat", "plank", "calves"].map((l) => startingRung(l, "16+")), [4, 2, 2, 1, 1]);

  // The plan: once, from the push-up answer; the empty "Home" type from the isolation test is archived first.
  // The library is wiped first to prove "Create my plan" seeds it itself (rows nobody has used yet delete cleanly).
  await uB.db.update(schema.routineDays).set({ archived: true }).where(uB.own(schema.routineDays, eq(schema.routineDays.name, "Home")));
  await db.execute(sql`delete from exercises where ladder is not null and not exists (select 1 from sets st where st.exercise_id = exercises.id)`);
  assert.equal((await db.execute<{ n: number }>(sql`select count(*)::int as n from exercises where ladder is not null`)).rows[0].n, 0);
  const first = await createHomePlan(B, "6-15");
  assert.ok((await db.execute<{ n: number }>(sql`select count(*)::int as n from exercises where ladder is not null`)).rows[0].n > 40, "the plan seeded the ladders first");
  assert.equal(first.created, true);
  assert.equal(first.ids.length, 3);
  const again = await createHomePlan(B, "0");
  assert.equal(again.created, false);
  assert.deepEqual(again.ids, first.ids, "a second tap changes nothing");
  const types = await listWorkoutTypes(B);
  assert.deepEqual(types.map((t) => t.name), ["Day A", "Day B", "Day C"]);
  const re = await listRoutineExercises(B);
  const names = (typeName: string) => re.filter((r) => r.routineDayId === types.find((t) => t.name === typeName)!.id).map((r) => r.name);
  assert.deepEqual(names("Day A"), ["Knee push-up", "Bodyweight squat", "Single-leg glute bridge", "Knee plank", "Jumping jacks"]);
  assert.deepEqual(names("Day B"), ["Table row, knees bent", "Walking lunge (bodyweight)", "Single-leg RDL", "Knee side plank", "Dead bug"]);
  assert.deepEqual(names("Day C"), ["Pike push-up", "Step-up (chair)", "Wall sit", "Calf raise on a step", "Dead bug", "High knees"]);
  const row = (name: string) => re.find((r) => r.name === name)!;
  assert.equal(row("Knee plank").targetReps, 20, "holds target the bottom of 20–45 s");
  assert.equal(row("Knee push-up").targetReps, 8);
  assert.deepEqual([row("Jumping jacks").targetSets, row("Jumping jacks").targetReps], [1, 10], "the finisher is one 10-minute block");
  const settingsB = (await uB.db.select().from(schema.settings).where(uB.own(schema.settings)))[0];
  assert.equal(await estimateTypeMinutes(B, types[0].id, settingsB), 4 * 3 * 2 + 10, "2 min a bodyweight set plus the finisher");

  // Rotation (the type after the last one trained), a rung that advances on the next Start, and a hold logged in seconds.
  const mon = "2026-11-09";
  const tue = "2026-11-10";
  assert.equal((await getDayState(B, mon)).nextUp?.typeName, "Day A", "nothing trained yet → the first type");
  const dayA = types[0].id;
  const planMon = await setDayPlan(B, mon, { kind: "workout", typeId: dayA });
  assert.ok(planMon.ok && planMon.sessionId);
  const knee = row("Knee push-up").exerciseId;
  const plank = row("Knee plank").exerciseId;
  await uB.db.insert(schema.sets).values([15, 15, 15].map((reps, i) => uB.stamp({ sessionId: planMon.sessionId!, exerciseId: knee, setNo: i + 1, weightKg: 0, reps })));
  await uB.db.insert(schema.sets).values(uB.stamp({ sessionId: planMon.sessionId!, exerciseId: plank, setNo: 1, weightKg: 0, reps: 30 }));
  const monDetail = (await getSessionDetail(B, planMon.sessionId!))!;
  const plankCard = monDetail.exercises.find((e) => e.exerciseId === plank)!;
  assert.deepEqual([plankCard.bodyweight, plankCard.measure, plankCard.rung?.level, plankCard.rung?.max, plankCard.sets[0].reps], [true, "seconds", 1, 4, 30]);

  assert.equal((await getDayState(B, tue)).nextUp?.typeName, "Day B", "Day A was trained last → Day B next");
  const planTue = await setDayPlan(B, tue, { kind: "workout", typeId: dayA });
  assert.ok(planTue.ok && planTue.sessionId);
  const after = await listRoutineExercises(B);
  assert.ok(after.some((r) => r.routineDayId === dayA && r.name === "Push-up"), "Day A moved up to the push-up rung");
  assert.ok(!after.some((r) => r.routineDayId === dayA && r.name === "Knee push-up"));
  const tueDetail = (await getSessionDetail(B, planTue.sessionId!))!;
  assert.ok(tueDetail.exercises.some((e) => e.name === "Push-up") && !tueDetail.exercises.some((e) => e.name === "Knee push-up"));
  assert.ok((await getSessionDetail(B, planMon.sessionId!))!.exercises.some((e) => e.name === "Knee push-up"), "history stays on the old rung");
  assert.equal(tueDetail.exercises.find((e) => e.exerciseId === plank)!.hint.text, "30 s last time, aim for 35 s");
  assert.equal(tueDetail.exercises.find((e) => e.name === "Push-up")!.hint.mode, "first", "a fresh rung starts over");
  await copyLastSets(B, planTue.sessionId!);
  const copied = (await getSessionDetail(B, planTue.sessionId!))!.exercises.find((e) => e.exerciseId === plank)!;
  assert.deepEqual(copied.sets.map((s) => s.reps), [30], "same as last time copies the seconds");
});
