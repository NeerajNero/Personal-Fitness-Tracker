"use client";

import { Dumbbell, Settings, Sun, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/today", label: "Today", icon: Sun },
  { href: "/train", label: "Train", icon: Dumbbell },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid h-tabbar grid-cols-4">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-accent" : "text-muted"}`}
              >
                <t.icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
