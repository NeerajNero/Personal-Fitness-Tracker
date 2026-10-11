import type { Metadata } from "next";
import { signOut } from "@/auth";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-muted">Targets, foods, routine and nudges arrive in later steps.</p>

      <form
        className="mt-10"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="h-12 w-full rounded-xl border border-border bg-surface text-base font-medium text-danger active:opacity-80"
        >
          Sign out
        </button>
      </form>
    </>
  );
}
