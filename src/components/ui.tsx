/**
 * Shared class strings and the few layout primitives (docs/design.md). Server-safe: no hooks, no state.
 * Buttons: `primary` is the one accent-filled action on a screen; `btn` is a quiet bordered action; `link` is text only.
 * Numbers: `hero` for the answer on a screen, `big` for a section's number; both tabular (globals.css sets tnum).
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ICON } from "./icons";

export const primary = "flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-accent-fg active:opacity-80 disabled:opacity-60";
export const btn = "flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium active:opacity-70 disabled:opacity-50";
export const link = "inline-flex min-h-11 items-center text-sm font-medium text-accent active:opacity-70";
export const input = "h-12 w-full rounded-xl border border-border bg-bg px-3 text-base outline-none focus:border-accent";
export const chip = "flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium active:opacity-70 disabled:opacity-50";

export const hero = "text-[2.75rem] font-extrabold leading-none tracking-tight";
export const big = "text-[1.75rem] font-bold leading-none tracking-tight";
export const label = "text-[13px] font-medium text-muted";

/** A bordered group. Use only where things belong together; a single number or line needs no card. */
export function Card({ title, sub, children, collapsible, defaultOpen = true, className = "" }: { title?: string; sub?: string; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean; className?: string }) {
  if (collapsible) {
    return (
      <details className={`group rounded-2xl border border-border bg-surface ${className}`} open={defaultOpen}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block font-semibold">{title}</span>
            {sub ? <span className={`block ${label}`}>{sub}</span> : null}
          </span>
          <ChevronDown {...ICON} className="shrink-0 text-muted group-open:rotate-180 motion-safe:transition-transform motion-safe:duration-150" />
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    );
  }
  return (
    <section className={`rounded-2xl border border-border bg-surface p-4 ${className}`}>
      {title ? <h2 className="font-semibold">{title}</h2> : null}
      {sub ? <p className={`mt-0.5 ${label}`}>{sub}</p> : null}
      <div className={title ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

/** A plain section heading with an optional right-hand element; no box. */
export function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <h2 className={label}>{children}</h2>
      {aside}
    </div>
  );
}

/** What to do next when there is nothing yet. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">{children}</p>;
}

/** What went wrong and how to fix it. */
export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-danger" role="alert">{children}</p>;
}
