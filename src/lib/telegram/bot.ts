/**
 * grammY bot. One linked chat only: before linking, `/start <code>` is the only accepted
 * message; after linking, updates from any other chat are ignored silently.
 * Never log tokens, chat ids or message bodies.
 */
import { eq } from "drizzle-orm";
import { Bot, InlineKeyboard, type Context } from "grammy";
import { db } from "@/db";
import { settings as settingsTable, type Settings } from "@/db/schema";
import { nowTimeIST, todayIST } from "@/lib/dates";
import { entryFromFood, insertFoodEntries, listFoods } from "@/lib/food";
import { n0, n1 } from "@/lib/format";
import { getDayState } from "@/lib/rules/dayState";
import { getSettings } from "@/lib/settings";
import { createPending, expirePending, parseFreeText, takePending, type ParsedItem } from "./ai";
import { botToken } from "./env";
import { entryLine, HELP, runningLine, withOverage } from "./messages";
import { opCopy, opDid, opDone, opFood, opManual, opMeasure, opPlan, opSteps, opToday, opUndo, opWater, opWeight, type Reply } from "./ops";
import { listWorkoutTypes } from "@/lib/training";
import { matchPlanWord, parseCommand } from "./parse";

export type BotContext = Context & { settings: Settings };

const PARSE_FAIL = "couldn't parse that — try <code>paneer 150</code> style";

let bot: Bot<BotContext> | null = null;

export function getBot(): Bot<BotContext> {
  if (bot) return bot;
  bot = new Bot<BotContext>(botToken());

  // Gate: linked chat passes; otherwise only `/start <code>` can link, everything else is dropped.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const s = await getSettings();
    ctx.settings = s;
    if (s.telegramChatId !== null) {
      if (String(chatId) === s.telegramChatId) return next();
      return; // another chat — silent
    }
    const m = /^\/start\s+(\S+)/i.exec(ctx.message?.text ?? "");
    if (m && s.telegramLinkCode && m[1].toUpperCase() === s.telegramLinkCode.toUpperCase()) {
      await db.update(settingsTable).set({ telegramChatId: String(chatId), updatedAt: new Date() }).where(eq(settingsTable.id, 1));
      await ctx.reply(`Linked ✓\n\n${HELP}`, { parse_mode: "HTML" });
    }
  });

  bot.command("start", (ctx) => ctx.reply("Already linked.", { parse_mode: "HTML" }));
  bot.command("help", (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  bot.callbackQuery(/^(log|cancel):(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const pending = await takePending(Number(ctx.match[2]));
    if (!pending) {
      await ctx.answerCallbackQuery({ text: "That one expired — send it again." });
      await ctx.editMessageReplyMarkup().catch(() => {});
      return;
    }
    if (action === "cancel") {
      await ctx.answerCallbackQuery({ text: "Cancelled" });
      await ctx.editMessageText("✗ Cancelled", { parse_mode: "HTML" }).catch(() => {});
      return;
    }
    const foods = await listFoods();
    const byId = new Map(foods.map((f) => [f.id, f]));
    await insertFoodEntries(
      pending.items.map((it) => {
        const food = it.foodId !== null ? byId.get(it.foodId) : undefined;
        return food
          ? entryFromFood(food, it.qty, pending.date, "ai")
          : { date: pending.date, time: nowTimeIST(), foodId: null, label: it.label, qty: it.qty, kcal: it.kcal, proteinG: it.proteinG, costInr: it.costInr, source: "ai" as const };
      }),
    );
    const state = await getDayState(pending.date, { settings: ctx.settings });
    const lines = pending.items.map((it) => entryLine(it.label, it.qty, it.foodId !== null ? (byId.get(it.foodId)?.servingLabel ?? null) : null, it.kcal, it.proteinG));
    await ctx.answerCallbackQuery({ text: "Logged ✓" });
    await ctx.editMessageText(withOverage(`✓ Logged\n${lines.join("\n")}\n${runningLine(state)}`, state), { parse_mode: "HTML" }).catch(() => {});
  });

  const send = (ctx: BotContext, r: Reply) =>
    ctx.reply(r.text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: r.keyboard ? { inline_keyboard: r.keyboard } : undefined });

  // Morning buttons set the day; evening buttons log it. The date travels in the data so late taps hit the right day.
  bot.callbackQuery(/^plan:(\d{4}-\d{2}-\d{2}):(\d+|rest)$/, async (ctx) => {
    const [, date, v] = ctx.match;
    const r = await opPlan(date, v === "rest" ? { kind: "rest" } : { kind: "workout", typeId: Number(v) }, ctx.settings);
    await ctx.answerCallbackQuery({ text: v === "rest" ? "Rest day" : "Set" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, r);
  });
  bot.callbackQuery(/^did:(\d{4}-\d{2}-\d{2}):(\d+|rest|same)$/, async (ctx) => {
    const [, date, v] = ctx.match;
    const r = await opDid(date, v, ctx.settings);
    await ctx.answerCallbackQuery({ text: v === "rest" ? "Rest day" : "Logging…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, r);
  });

  // Legacy day_close buttons still sitting in the chat from before "choose your day".
  bot.callbackQuery("nudge:done", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Logging…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, await opDone(todayIST(), ctx.settings));
  });
  bot.callbackQuery("nudge:skip", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Rest day" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, await opPlan(todayIST(), { kind: "rest" }, ctx.settings));
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const date = todayIST();
    const s = ctx.settings;
    const cmd = parseCommand(text);
    const reply = (html: string) => ctx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });

    // Workout type names and `rest` set the day; checked before food matching.
    if (!cmd || (cmd.type === "food" && cmd.n === null)) {
      const plan = matchPlanWord(text, await listWorkoutTypes());
      if (plan) return void (await send(ctx, await opPlan(date, plan, s)));
    }

    if (cmd) {
      switch (cmd.type) {
        case "weight": return void (await reply(await opWeight(date, cmd.kg)));
        case "steps": return void (await reply(await opSteps(date, cmd.n, s)));
        case "water": return void (await reply(await opWater(date, s)));
        case "done": return void (await send(ctx, await opDone(date, s)));
        case "today": return void (await reply(await opToday(date, s)));
        case "undo": return void (await reply(await opUndo(date, s)));
        case "help": return void (await reply(HELP));
        case "copy": return void (await reply(await opCopy(date, s)));
        case "manual": return void (await reply(await opManual(date, cmd.label, cmd.kcal, cmd.proteinG, s)));
        case "navel":
        case "waist": return void (await reply(await opMeasure(date, cmd.type, cmd.cm)));
        case "food": {
          const out = await opFood(date, cmd.query, cmd.n, s);
          if (out !== null) return void (await reply(out));
          break; // no catalogue match → AI
        }
      }
    }

    // Free text → Gemini → confirm.
    const foods = await listFoods();
    const state = await getDayState(date, { settings: s });
    const items = await parseFreeText(text, foods, state.targets.phase);
    if (!items) return void (await reply(PARSE_FAIL));
    await expirePending();
    const totals = { kcal: items.reduce((a, i) => a + i.kcal, 0), proteinG: items.reduce((a, i) => a + i.proteinG, 0) };
    const id = await createPending({ date, text, items, totals });
    const byId = new Map(foods.map((f) => [f.id, f]));
    const lines = items.map((it: ParsedItem) => {
      const serving = it.foodId !== null ? (byId.get(it.foodId)?.servingLabel ?? null) : null;
      const flag = it.foodId === null ? " <i>(est.)</i>" : "";
      const low = it.confidence < 0.5 ? " ❓" : "";
      return `${entryLine(it.label, it.qty, serving, it.kcal, it.proteinG)}${flag}${low}`;
    });
    await ctx.reply(`🤖 Parsed:\n${lines.join("\n")}\n<b>Total ${n0(totals.kcal)} kcal · ${n1(totals.proteinG)} g protein</b>\nLog it?`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("✓ Log", `log:${id}`).text("✗ Cancel", `cancel:${id}`),
    });
  });

  bot.catch((err) => {
    // No bodies, no ids — just the error class and description.
    const e = err.error;
    console.error("telegram handler failed:", e instanceof Error ? `${e.name}: ${e.message}` : "unknown error");
  });

  return bot;
}
