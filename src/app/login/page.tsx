import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/today");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-4xl font-semibold tracking-tight">Recomp</h1>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/today" });
        }}
      >
        <button
          type="submit"
          className="h-14 rounded-xl bg-accent px-8 text-lg font-medium text-accent-fg active:opacity-80"
        >
          Continue with Google
        </button>
      </form>
      {error ? (
        <p className="text-sm text-danger">That Google account isn&apos;t allowed.</p>
      ) : null}
    </main>
  );
}
