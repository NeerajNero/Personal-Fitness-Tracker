/** Proactive sends (used by /api/tick). The caller resolves the chat id from the user's settings. */
import { Api } from "grammy";
import type { InlineKeyboardButton } from "grammy/types";
import { botToken } from "./env";

export type SendOptions = { inlineKeyboard?: InlineKeyboardButton[][] };

export async function sendMessage(chatId: string, text: string, opts: SendOptions = {}): Promise<{ sent: boolean }> {
  if (!chatId) return { sent: false };
  const api = new Api(botToken());
  await api.sendMessage(chatId, text, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: opts.inlineKeyboard ? { inline_keyboard: opts.inlineKeyboard } : undefined,
  });
  return { sent: true };
}
