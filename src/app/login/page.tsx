import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { primary } from "@/components/ui";
import { run } from "@/lib/action-result";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  if (session?.user) redirect("/today");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div>
        <h1 className="text-5xl font-extrabold tracking-tight">Recomp</h1>
        <p className="mt-3 text-lg text-muted">Eat, train, weigh. Three things a day, ticked off in seconds.</p>
      </div>
      <form
        action={async () => {
          "use server";
          await run("signIn", async () => {
            await signIn("google", { redirectTo: "/today" });
          });
        }}
      >
        <button type="submit" className={`${primary} h-14 w-full text-lg`}>
          Continue with Google
        </button>
      </form>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          That Google account isn&apos;t on the list. Ask the owner to add it, then try again.
        </p>
      ) : null}
    </main>
  );
}
