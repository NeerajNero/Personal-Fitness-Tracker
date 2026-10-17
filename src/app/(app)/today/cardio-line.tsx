"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { repeatCardio } from "../train/actions";

/** "Cardio: 20 min incline walk" once logged; otherwise "+ Cardio" plus a one-tap repeat of the last entry. */
export function CardioLine({ date, href, logged, repeat }: { date: string; href: string; logged: string | null; repeat: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (logged) {
    return (
      <Link href={href} className="flex min-h-11 items-center rounded-2xl border border-border bg-surface px-4 text-sm">
        <span className="text-muted">Cardio:</span>&nbsp;<span className="font-medium">{logged}</span>
      </Link>
    );
  }
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-2xl border border-dashed border-border px-2">
      <Link href={href} className="h-10 shrink-0 px-2 text-sm font-medium leading-10 text-accent">
        + Cardio
      </Link>
      {repeat ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await repeatCardio(date);
              setError(r.ok ? null : r.error);
            })
          }
          className="min-w-0 flex-1 truncate py-2 text-left text-sm text-muted active:opacity-70 disabled:opacity-50"
        >
          ↺ {repeat}
        </button>
      ) : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </div>
  );
}
