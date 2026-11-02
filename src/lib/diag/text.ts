/** Client-safe shape of a diagnostics report and its plain-text rendering (what "Copy diagnostics" puts on the clipboard). */
export type DiagLine = [label: string, value: string];
/** A section that failed to load carries `error` (class + first line of the message) instead of content. */
export type DiagSection = { title: string; lines?: DiagLine[]; items?: string[]; block?: string; error?: string };
export type DiagReport = { header: { build: string; time: string; user: string }; sections: DiagSection[] };

/**
 * "ErrorClass: first line of the message" — never the SQL or a stack. Drizzle wraps driver errors in one whose message
 * is the query text, with the real error as `cause`, so the innermost cause is what gets reported.
 */
export function errorLine(e: unknown): string {
  let err = e;
  while (err instanceof Error && err.cause instanceof Error) err = err.cause;
  const name = err instanceof Error ? err.name : "Error";
  let msg = (err instanceof Error ? err.message : String(err)).split("\n")[0].trim();
  if (/^failed query:/i.test(msg)) msg = "query failed";
  return `${name}: ${msg.slice(0, 200)}`;
}

export function renderDiagText(r: DiagReport): string {
  const out = [`Recomp diagnostics · build ${r.header.build} · ${r.header.time} · ${r.header.user}`];
  for (const s of r.sections) {
    out.push("", `## ${s.title}`);
    if (s.error) out.push(`ERROR ${s.error}`);
    for (const [k, v] of s.lines ?? []) out.push(`${k}: ${v}`);
    for (const it of s.items ?? []) out.push(`- ${it}`);
    if (s.block) out.push(s.block);
  }
  const errors = r.sections.filter((s) => s.error);
  if (errors.length) {
    out.push("", "## Errors");
    for (const s of errors) out.push(`${s.title}: ${s.error}`);
  }
  return out.join("\n");
}

/** Telegram chat id for display: last 3 digits only. */
export function maskChatId(id: string | null): string {
  if (!id) return "none";
  return `…${id.slice(-3)}`;
}

export const fmtUtc = (d: Date | string | null) => (d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + " UTC" : "never");
