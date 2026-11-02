import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TabBar } from "@/components/tab-bar";
import { asUserId } from "@/lib/db/scope";
import { getUser } from "@/lib/users";

/**
 * Gate for every screen under (app): must be signed in, must be onboarded (users.onboarded_at).
 * This is the gate — there is no proxy.ts guard on top of it.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await getUser(asUserId(session.user.id));
  if (!user?.onboardedAt) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+1rem)]">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
