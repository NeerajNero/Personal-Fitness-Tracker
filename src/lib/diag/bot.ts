/** `diag` in Telegram: five lines for the user; admins also get the webhook and the per-user tick line. */
import type { Api } from "grammy";
import { esc } from "@/lib/format";
import { getDayState } from "@/lib/rules/dayState";
import { todayIST } from "@/lib/dates";
import type { Who } from "@/lib/telegram/ops";
import { getUser } from "@/lib/users";
import { dayStateLine } from "./me";
import { buildInfo, dbCheck, tickStatus, tickUserLine, webhookStatus } from "./system";
import { fmtUtc, maskChatId } from "./text";

export async function diagReply(who: Who, api?: Api): Promise<string> {
  const [user, db, tick, state] = await Promise.all([getUser(who.userId), dbCheck(), tickStatus(), getDayState(who.userId, todayIST(), { settings: who.settings })]);
  const build = buildInfo();
  const s = who.settings;
  const me = tick?.users.find((u) => u.user === who.userId.slice(0, 8));
  const lines = [
    `🔧 build ${esc(build.sha)} · Next ${esc(build.next)}`,
    `🗄 db ${db.ok ? `ok ${db.ms} ms · ${esc(db.migration ?? "?")}` : `<b>FAILED</b> ${esc(db.error ?? "")}`}`,
    `🔗 ${s.telegramChatId ? `linked (chat ${esc(maskChatId(s.telegramChatId))})` : "not linked"}${s.telegramBlockedAt ? " · <b>blocked</b>" : ""}`,
    `⏰ tick ${tick ? `${esc(fmtUtc(tick.at))}${tick.dry ? " (dry)" : ""} · ${me ? esc(tickUserLine(me).replace(/^\S+ /, "")) : "not in that run"}` : "no run recorded"}`,
    `📅 ${esc(dayStateLine(state))}`,
  ];
  if (user?.isAdmin) {
    const w = await webhookStatus(api);
    lines.push(
      `🌐 webhook ${w.ok ? `${w.matches === false ? "<b>URL mismatch</b>" : w.url ? "ok" : "<b>not set</b>"} · ${w.pending} pending · ${w.lastError ? `last error ${esc(w.lastError)} at ${esc(w.lastErrorAt ?? "")}` : "no error"}` : `<b>check failed</b> ${esc(w.error ?? "")}`}`,
      `👥 ${tick && tick.users.length ? esc(tick.users.map(tickUserLine).join(" · ")) : "no per-user tick results"}`,
    );
  }
  return lines.join("\n");
}
