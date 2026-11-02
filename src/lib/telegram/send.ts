/** Proactive sends (used by /api/tick). The caller resolves the chat id from the user's settings. */
import { Api, GrammyError, HttpError } from "grammy";
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

/** What a failed send was, without its message: the error class and, for Telegram API errors, the status code. */
export type SendFailure = { error: string; code: number | null; blocked: boolean };

export function describeSendError(err: unknown): SendFailure {
  if (err instanceof GrammyError) return { error: "GrammyError", code: err.error_code, blocked: err.error_code === 403 };
  if (err instanceof HttpError) return { error: "HttpError", code: null, blocked: false };
  return { error: err instanceof Error ? err.constructor.name : "Error", code: null, blocked: false };
}
