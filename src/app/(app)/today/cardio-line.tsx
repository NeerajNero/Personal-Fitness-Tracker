"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CardioIcon, RepeatIcon } from "@/components/icons";
import { link } from "@/components/ui";
import { repeatCardio } from "../train/actions";

/** "Cardio: 20 min incline walk" once logged; otherwise a link to log one plus a one-tap repeat of the last entry. */
export function CardioLine({ date, href, logged, repeat }: { date: string; href: string; logged: string | null; repeat: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (logged) {
    return (
      <Link href={href} className="flex min-h-11 items-center gap-2 px-1 text-sm">
        <CardioIcon className="text-done" />
        <span className="text-muted">Cardio</span>
        <span className="font-medium">{logged}</span>
      </Link>
    );
  }
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 px-1">
      <Link href={href} className={link}>
        <CardioIcon className="mr-1.5" /> Log cardio
      </Link>
      {repeat ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { const r = await repeatCardio(date); setError(r.ok ? null : `${r.error}. Log it on Train instead.`); })}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 truncate text-left text-sm text-muted active:opacity-70 disabled:opacity-50"
        >
          <RepeatIcon className="shrink-0" /> <span className="truncate">Same as last time: {repeat}</span>
        </button>
      ) : null}
      {error ? <span className="basis-full text-xs text-danger">{error}</span> : null}
    </div>
  );
}
