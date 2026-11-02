/** Client-safe shape of a diagnostics report and its plain-text rendering (what "Copy diagnostics" puts on the clipboard). */
export type DiagLine = [label: string, value: string];
export type DiagSection = { title: string; lines?: DiagLine[]; items?: string[]; block?: string };
export type DiagReport = { header: { build: string; time: string; user: string }; sections: DiagSection[] };

export function renderDiagText(r: DiagReport): string {
  const out = [`Recomp diagnostics · build ${r.header.build} · ${r.header.time} · ${r.header.user}`];
  for (const s of r.sections) {
    out.push("", `## ${s.title}`);
    for (const [k, v] of s.lines ?? []) out.push(`${k}: ${v}`);
    for (const it of s.items ?? []) out.push(`- ${it}`);
    if (s.block) out.push(s.block);
  }
  return out.join("\n");
}

/** Telegram chat id for display: last 3 digits only. */
export function maskChatId(id: string | null): string {
  if (!id) return "none";
  return `…${id.slice(-3)}`;
}

export const fmtUtc = (d: Date | string | null) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never");
