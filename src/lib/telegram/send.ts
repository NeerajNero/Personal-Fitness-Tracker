/** Proactive sends to the linked chat (used by /api/tick in step 8). */
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { getSettings } from "@/lib/settings";
import { botToken } from "./env";

export type SendOptions = { inlineKeyboard?: InlineKeyboardButton[][] };

export async function sendMessage(text: string, opts: SendOptions = {}): Promise<{ sent: boolean }> {
  const s = await getSettings();
  if (!s.telegramChatId) return { sent: false };
  const api = new Api(botToken());
  await api.sendMessage(s.telegramChatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: opts.inlineKeyboard ? { inline_keyboard: opts.inlineKeyboard } : undefined,
  });
  return { sent: true };
}
