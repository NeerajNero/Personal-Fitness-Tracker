import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowedEmails, ensureUser, findUserByEmail, normalizeEmail } from "@/lib/users";

/**
 * Google sign-in. Allowed: an email in ALLOWED_EMAILS (comma-separated, case-insensitive; the older ALLOWED_EMAIL
 * name still works) or one that already has a users row. The first allowed sign-in creates the row, and the
 * user's id travels in the JWT so server code never trusts an id from the client.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = normalizeEmail(profile?.email ?? user.email ?? "");
      if (email === "") return false;
      if (!allowedEmails().includes(email) && !(await findUserByEmail(email))) return false;
      await ensureUser({ email, name: profile?.name ?? user.name ?? null });
      return true;
    },
    async jwt({ token }) {
      // Sessions issued before multi-user carry no uid; resolve it once by email.
      const t = token as typeof token & { uid?: string };
      if (!t.uid && typeof t.email === "string") t.uid = (await findUserByEmail(t.email))?.id;
      return t;
    },
    session({ session, token }) {
      const uid = (token as { uid?: string }).uid;
      if (typeof uid === "string") session.user.id = uid;
      return session;
    },
  },
});
