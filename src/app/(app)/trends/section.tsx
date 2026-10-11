import type { ReactNode } from "react";

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
