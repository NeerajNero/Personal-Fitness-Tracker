/** Client-side error capture: console.error and unhandled rejections, last 20, in memory. Read by Settings → Diagnostics. */
export type ClientError = { at: string; kind: "console.error" | "unhandledrejection" | "error"; message: string };

const KEY = "__recompClientLog";
const MAX = 20;

type Store = { entries: ClientError[]; installed: boolean };

function store(): Store {
  const w = globalThis as unknown as Record<string, Store | undefined>;
  w[KEY] ??= { entries: [], installed: false };
  return w[KEY];
}

function str(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === "string") return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function installClientLog(): void {
  if (typeof window === "undefined") return;
  const s = store();
  if (s.installed) return;
  s.installed = true;
  const push = (kind: ClientError["kind"], message: string) => {
    s.entries.push({ at: new Date().toISOString(), kind, message: message.slice(0, 300) });
    if (s.entries.length > MAX) s.entries.splice(0, s.entries.length - MAX);
  };
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push("console.error", args.map(str).join(" "));
    orig(...args);
  };
  window.addEventListener("error", (e) => push("error", e.message || str(e.error)));
  window.addEventListener("unhandledrejection", (e) => push("unhandledrejection", str(e.reason)));
}

export function readClientLog(): ClientError[] {
  return [...store().entries].reverse();
}
