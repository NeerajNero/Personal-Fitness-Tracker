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
import { opDone, opFood, opMeasure, opSteps, opToday, opUndo, opWater, opWeight } from "./ops";
import { markNoTraining } from "@/lib/rules/marks";
import { parseCommand } from "./parse";

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

  // Buttons on the day_close nudge.
  bot.callbackQuery("nudge:done", async (ctx) => {
    const text = await opDone(todayIST(), ctx.settings);
    await ctx.answerCallbackQuery({ text: "Starting…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply(text, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  });
  bot.callbackQuery("nudge:skip", async (ctx) => {
    await markNoTraining(todayIST());
    await ctx.answerCallbackQuery({ text: "Rest day noted" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await ctx.reply("Okay — no training today. I'll stop asking.", { parse_mode: "HTML" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const date = todayIST();
    const s = ctx.settings;
    const cmd = parseCommand(text);
    const reply = (html: string) => ctx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });

    if (cmd) {
      switch (cmd.type) {
        case "weight": return void (await reply(await opWeight(date, cmd.kg)));
        case "steps": return void (await reply(await opSteps(date, cmd.n, s)));
        case "water": return void (await reply(await opWater(date, s)));
        case "done": return void (await reply(await opDone(date, s)));
        case "today": return void (await reply(await opToday(date, s)));
        case "undo": return void (await reply(await opUndo(date, s)));
        case "help": return void (await reply(HELP));
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
