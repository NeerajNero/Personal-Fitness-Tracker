"use client";

import type { ReactNode } from "react";

export const input = "h-12 w-full rounded-xl border border-border bg-bg px-3 text-base tabular-nums outline-none focus:border-accent";
export const btn = "flex h-11 items-center justify-center rounded-xl border border-border bg-bg px-4 text-sm font-medium active:opacity-70 disabled:opacity-50";
export const primary = "flex h-12 items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-fg active:opacity-80 disabled:opacity-60";

export function Card({ title, sub, children, collapsible, defaultOpen = true }: { title: string; sub?: string; children: ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  if (collapsible) {
    return (
      <details className="group rounded-2xl border border-border bg-surface" open={defaultOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block font-semibold">{title}</span>
            {sub ? <span className="block text-xs text-muted">{sub}</span> : null}
          </span>
          <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="px-4 pb-4">{children}</div>
      </details>
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Field({ label, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Status({ saved, error }: { saved: boolean; error: string | null }) {
  return (
    <p className="h-4 text-xs" aria-live="polite">
      {saved ? <span className="text-accent">Saved ✓</span> : null}
      {error ? <span className="text-danger">{error}</span> : null}
    </p>
  );
}
