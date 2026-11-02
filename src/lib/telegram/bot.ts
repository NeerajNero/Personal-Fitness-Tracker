/**
 * grammY bot, one bot for every user. Each inbound update is resolved to a user by chat id (settings.telegram_chat_id);
 * an unlinked chat can only send `/start <code>`, which links it to whoever owns the code. Everything else from an
 * unlinked chat is dropped silently. Never log tokens, chat ids or message bodies.
 */
import { Bot, InlineKeyboard, type Context } from "grammy";
import { nowTimeIST, todayIST } from "@/lib/dates";
import { entryFromFood, insertFoodEntries, listFoods } from "@/lib/food";
import { n0, n1 } from "@/lib/format";
import { getDayState } from "@/lib/rules/dayState";
import { getSettings } from "@/lib/settings";
import { listWorkoutTypes } from "@/lib/training";
import { clearChatBlocked, linkChatByCode, userIdByChat } from "@/lib/users";
import { createPending, expirePending, parseFreeText, takePending, type ParsedItem } from "./ai";
import { botToken } from "./env";
import { entryLine, HELP, runningLine, withOverage } from "./messages";
import { opCardio, opCardioRepeat, opCopy, opDid, opDone, opFood, opManual, opMeasure, opPlan, opSteps, opToday, opUndo, opWater, opWeight, type Reply, type Who } from "./ops";
import { matchPlanWord, parseCommand } from "./parse";

export type BotContext = Context & { who: Who };

const PARSE_FAIL = "couldn't parse that — try <code>paneer 150</code> style";

let bot: Bot<BotContext> | null = null;

export function getBot(): Bot<BotContext> {
  if (bot) return bot;
  bot = new Bot<BotContext>(botToken());

  // Gate: a linked chat is resolved to its user; otherwise only `/start <code>` can link, everything else is dropped.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    const chat = String(chatId);
    const userId = await userIdByChat(chat);
    if (userId !== null) {
      const settings = await getSettings(userId);
      // Any message from a chat marked blocked (a send got 403) proves they unblocked us: reminders resume.
      if (settings.telegramBlockedAt !== null) await clearChatBlocked(userId);
      ctx.who = { userId, settings: { ...settings, telegramBlockedAt: null } };
      return next();
    }
    const m = /^\/start\s+(\S+)/i.exec(ctx.message?.text ?? "");
    if (!m) return; // unlinked chat — silent
    const linked = await linkChatByCode(m[1], chat);
    if (linked !== null) await ctx.reply(`Linked ✓\n\n${HELP}`, { parse_mode: "HTML" });
  });

  bot.command("start", (ctx) => ctx.reply("Already linked.", { parse_mode: "HTML" }));
  bot.command("help", (ctx) => ctx.reply(HELP, { parse_mode: "HTML" }));

  bot.callbackQuery(/^(log|cancel):(\d+)$/, async (ctx) => {
    const action = ctx.match[1];
    const { userId, settings } = ctx.who;
    const pending = await takePending(userId, Number(ctx.match[2]));
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
    const foods = await listFoods(userId);
    const byId = new Map(foods.map((f) => [f.id, f]));
    await insertFoodEntries(
      userId,
      pending.items.map((it) => {
        const food = it.foodId !== null ? byId.get(it.foodId) : undefined;
        return food
          ? entryFromFood(food, it.qty, pending.date, "ai")
          : { date: pending.date, time: nowTimeIST(), foodId: null, label: it.label, qty: it.qty, kcal: it.kcal, proteinG: it.proteinG, costInr: it.costInr, source: "ai" as const };
      }),
    );
    const state = await getDayState(userId, pending.date, { settings });
    const lines = pending.items.map((it) => entryLine(it.label, it.qty, it.foodId !== null ? (byId.get(it.foodId)?.servingLabel ?? null) : null, it.kcal, it.proteinG));
    await ctx.answerCallbackQuery({ text: "Logged ✓" });
    await ctx.editMessageText(withOverage(`✓ Logged\n${lines.join("\n")}\n${runningLine(state)}`, state), { parse_mode: "HTML" }).catch(() => {});
  });

  const send = (ctx: BotContext, r: Reply) =>
    ctx.reply(r.text, { parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: r.keyboard ? { inline_keyboard: r.keyboard } : undefined });

  // Morning buttons set the day; evening buttons log it. The date travels in the data so late taps hit the right day.
  bot.callbackQuery(/^plan:(\d{4}-\d{2}-\d{2}):(\d+|rest)$/, async (ctx) => {
    const [, date, v] = ctx.match;
    const r = await opPlan(ctx.who, date, v === "rest" ? { kind: "rest" } : { kind: "workout", typeId: Number(v) });
    await ctx.answerCallbackQuery({ text: v === "rest" ? "Rest day" : "Set" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, r);
  });
  bot.callbackQuery(/^did:(\d{4}-\d{2}-\d{2}):(\d+|rest|same)$/, async (ctx) => {
    const [, date, v] = ctx.match;
    const r = await opDid(ctx.who, date, v);
    await ctx.answerCallbackQuery({ text: v === "rest" ? "Rest day" : "Logging…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, r);
  });

  // Day-close "＋ <last cardio>" button.
  bot.callbackQuery(/^cardio:(\d{4}-\d{2}-\d{2}):repeat$/, async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Logging…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, { text: await opCardioRepeat(ctx.who, ctx.match[1]) });
  });

  // Legacy day_close buttons still sitting in the chat from before "choose your day".
  bot.callbackQuery("nudge:done", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Logging…" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, await opDone(ctx.who, todayIST()));
  });
  bot.callbackQuery("nudge:skip", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Rest day" });
    await ctx.editMessageReplyMarkup().catch(() => {});
    await send(ctx, await opPlan(ctx.who, todayIST(), { kind: "rest" }));
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    const date = todayIST();
    const who = ctx.who;
    const cmd = parseCommand(text);
    const reply = (html: string) => ctx.reply(html, { parse_mode: "HTML", link_preview_options: { is_disabled: true } });

    // Workout type names and `rest` set the day; checked before food matching.
    if (!cmd || (cmd.type === "food" && cmd.n === null)) {
      const plan = matchPlanWord(text, await listWorkoutTypes(who.userId));
      if (plan) return void (await send(ctx, await opPlan(who, date, plan)));
    }

    if (cmd) {
      switch (cmd.type) {
        case "weight": return void (await reply(await opWeight(who, date, cmd.kg)));
        case "steps": return void (await reply(await opSteps(who, date, cmd.n)));
        case "water": return void (await reply(await opWater(who, date)));
        case "done": return void (await send(ctx, await opDone(who, date)));
        case "today": return void (await reply(await opToday(who, date)));
        case "undo": return void (await reply(await opUndo(who, date)));
        case "help": return void (await reply(HELP));
        case "copy": return void (await reply(await opCopy(who, date)));
        case "cardio": return void (await reply(await opCardio(who, date, cmd.input)));
        case "cardioRepeat": return void (await reply(await opCardioRepeat(who, date)));
        case "cardioError": return void (await reply(cmd.error));
        case "manual": return void (await reply(await opManual(who, date, cmd.label, cmd.kcal, cmd.proteinG)));
        case "navel":
        case "waist": return void (await reply(await opMeasure(who, date, cmd.type, cmd.cm)));
        case "food": {
          const out = await opFood(who, date, cmd.query, cmd.n);
          if (out !== null) return void (await reply(out));
          break; // no catalogue match → AI
        }
      }
    }

    // Free text → Gemini → confirm.
    const foods = await listFoods(who.userId);
    const state = await getDayState(who.userId, date, { settings: who.settings });
    const items = await parseFreeText(text, foods, state.targets.phase);
    if (!items) return void (await reply(PARSE_FAIL));
    await expirePending(who.userId);
    const totals = { kcal: items.reduce((a, i) => a + i.kcal, 0), proteinG: items.reduce((a, i) => a + i.proteinG, 0) };
    const id = await createPending(who.userId, { date, text, items, totals });
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
