"use client";

import type { ReactNode } from "react";
import { label } from "@/components/ui";

export { btn, Card, input, primary } from "@/components/ui";

export function Field({ label: text, error, children, className = "" }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className={label}>{text}</span>
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </label>
  );
}

export function Status({ saved, error }: { saved: boolean; error: string | null }) {
  return (
    <p className="h-4 text-xs" aria-live="polite">
      {saved ? <span className="text-done">Saved</span> : null}
      {error ? <span className="text-danger">{error}</span> : null}
    </p>
  );
}
