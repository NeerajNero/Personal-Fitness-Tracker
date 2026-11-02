"use client";

import { ChevronDown } from "lucide-react";
import { useState, useTransition } from "react";
import { ICON } from "@/components/icons";
import { readClientLog } from "@/lib/diag/client-log";
import { renderDiagText, type DiagReport, type DiagSection } from "@/lib/diag/text";
import { loadDiagnostics, runTickDry } from "./diag-actions";
import { btn } from "./ui";

const IST_OFFSET_MIN = 330;

/** Phone clock / timezone, PWA state and the in-memory client error log. Appended to the server report. */
async function clientSections(serverUtc: string | null): Promise<DiagSection[]> {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const skew = serverUtc ? Math.round((now.getTime() - Date.parse(serverUtc.replace(" ", "T").replace(" UTC", "Z"))) / 1000) : null;
  const nav = navigator as Navigator & { connection?: { effectiveType?: string }; standalone?: boolean };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  let sw = "unsupported";
  let swVersion = "—";
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    sw = reg ? (reg.active ? "active" : reg.waiting ? "waiting" : reg.installing ? "installing" : "registered") : "not registered";
    if (navigator.serviceWorker.controller) {
      swVersion = await new Promise<string>((resolve) => {
        const ch = new MessageChannel();
        const t = setTimeout(() => resolve("no reply"), 1500);
        ch.port1.onmessage = (e) => { clearTimeout(t); resolve(String(e.data?.version ?? "?")); };
        navigator.serviceWorker.controller!.postMessage({ type: "version" }, [ch.port2]);
      });
    } else sw += " (not controlling this page yet)";
  }
  const errors = readClientLog();
  return [
    {
      title: "Device",
      lines: [
        ["Phone time", `${now.toString()} · zone ${Intl.DateTimeFormat().resolvedOptions().timeZone} · ${offset === IST_OFFSET_MIN ? "same as IST" : `${offset - IST_OFFSET_MIN > 0 ? "+" : ""}${offset - IST_OFFSET_MIN} min vs IST`}`],
        ["Clock vs server", skew === null ? "unknown" : `${skew > 0 ? "+" : ""}${skew} s`],
        ["Network", `${navigator.onLine ? "online" : "OFFLINE"}${nav.connection?.effectiveType ? ` · ${nav.connection.effectiveType}` : ""}`],
        ["App", `${navigator.userAgent}`],
      ],
    },
    { title: "PWA", lines: [["Installed", standalone ? "yes (standalone)" : "no (browser tab)"], ["Service worker", `${sw} · version ${swVersion}`]] },
    { title: "Client errors (last 20)", items: errors.length ? errors.map((e) => `${e.at} · ${e.kind} · ${e.message}`) : ["none"] },
  ];
}

export function Diagnostics() {
  const [report, setReport] = useState<DiagReport | null>(null);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"done" | "fallback" | null>(null);
  const [tick, setTick] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = () =>
    start(async () => {
      setError(null);
      const r = await loadDiagnostics();
      if (!r.ok) return setError(r.error);
      const serverTime = r.report.sections.find((s) => s.title === "System")?.lines?.find(([k]) => k === "Server time")?.[1]?.split(" · ")[0] ?? r.report.header.time;
      setReport({ ...r.report, sections: [...r.report.sections, ...(await clientSections(serverTime))] });
      setAdmin(r.admin);
    });

  // Always copyable: before/while loading the text says so, and a section that failed shows up under "Errors".
  const text = renderDiagText(
    report ?? { header: { build: "?", time: new Date().toISOString(), user: "?" }, sections: [{ title: "Status", error: error ? `load failed: ${error}` : pending ? "still loading" : "not loaded yet — open the card" }] },
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("done");
    } catch {
      setCopied("fallback");
    }
  };

  return (
    <details className="group rounded-2xl border border-border bg-surface" onToggle={(e) => { if (e.currentTarget.open && !report && !pending) load(); }}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold">Diagnostics</span>
          <span className="block text-xs text-muted">Is everything working? Copy and send this when something&apos;s off. No secrets.</span>
        </span>
        {/* Inside the summary on purpose: copy without toggling the card (preventDefault stops the toggle). */}
        <button type="button" className={`${btn} shrink-0`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); copy(); }}>
          {copied === "done" ? "Copied ✓" : "Copy"}
        </button>
        <ChevronDown {...ICON} className="shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {!report ? <p className="text-sm text-muted">{pending ? "Checking…" : "Open to load."}</p> : null}
        {report ? (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={load} disabled={pending} className={btn}>↻ Reload</button>
              {admin ? (
                <button type="button" disabled={pending} className={btn} onClick={() => start(async () => { const r = await runTickDry(); setTick(r.ok ? JSON.stringify(r.result, null, 2) : r.error); })}>
                  Run tick (dry)
                </button>
              ) : null}
            </div>
            {copied === "fallback" ? (
              <textarea readOnly value={text} onFocus={(e) => e.currentTarget.select()} className="h-40 w-full rounded-xl border border-border bg-bg p-2 font-mono text-[11px]" aria-label="Diagnostics text (select all and copy)" />
            ) : null}
            {tick ? <pre className="max-h-64 overflow-auto rounded-xl bg-bg p-2 font-mono text-[11px]">{tick}</pre> : null}
            <p className="text-xs text-muted">build {report.header.build} · {report.header.time}</p>
            {report.sections.map((s) => (
              <section key={s.title}>
                <h3 className="text-sm font-semibold">{s.title}</h3>
                {s.error ? <p className="mt-1 break-words text-xs text-danger">⚠ {s.error}</p> : null}
                {s.lines ? (
                  <dl className="mt-1 text-xs">
                    {s.lines.map(([k, v]) => (
                      <div key={k} className="flex gap-2 border-t border-border py-1 first:border-t-0">
                        <dt className="w-24 shrink-0 text-muted">{k}</dt>
                        <dd className="min-w-0 break-words">{v}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {s.items ? <ul className="mt-1 list-disc pl-4 text-xs">{s.items.map((it, i) => <li key={i} className="break-words">{it}</li>)}</ul> : null}
                {s.block ? <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-bg p-2 font-mono text-[11px]">{s.block}</pre> : null}
              </section>
            ))}
          </>
        ) : null}
      </div>
    </details>
  );
}
