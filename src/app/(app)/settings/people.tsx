import type { PersonRow } from "@/lib/users";

/** Admin-only, read-only: who has an account, whether they finished onboarding and linked Telegram. */
export function People({ rows }: { rows: PersonRow[] }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between p-4 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold">People</span>
          <span className="block text-xs text-muted">{rows.length} {rows.length === 1 ? "account" : "accounts"} · admin only, read-only</span>
        </span>
        <span className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <ul className="divide-y divide-border px-4 pb-2">
        {rows.map((p) => (
          <li key={p.email} className="flex items-center gap-3 py-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.email}</span>
              <span className="block truncate text-xs text-muted">{p.name ?? "—"}{p.isAdmin ? " · admin" : ""}</span>
            </span>
            <span className={`text-xs ${p.onboarded ? "text-accent" : "text-muted"}`}>{p.onboarded ? "onboarded" : "not yet"}</span>
            <span className={`text-xs ${p.linked ? "text-accent" : "text-muted"}`}>{p.linked ? "linked" : "no chat"}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
