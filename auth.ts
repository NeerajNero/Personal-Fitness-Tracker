import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { ensureUser, findUserByEmail, isAllowedEmail, normalizeEmail } from "@/lib/users";

/**
 * Google sign-in. ALLOWED_EMAILS (comma-separated, case-insensitive; the older ALLOWED_EMAIL name still works) is the
 * only authority: the first allowed sign-in creates the users row, but a row never grants access by itself. The list is
 * re-read in the jwt callback on every request, so removing someone from the env and redeploying ends their session
 * immediately. The user's id travels in the JWT so server code never trusts an id from the client.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      const email = normalizeEmail(profile?.email ?? user.email ?? "");
      if (!isAllowedEmail(email)) return false;
      await ensureUser({ email, name: profile?.name ?? user.name ?? null });
      return true;
    },
    async jwt({ token }) {
      // Runs on every session read. Returning null drops the session: the allowlist is re-checked each time.
      const t = token as typeof token & { uid?: string };
      if (typeof t.email !== "string" || !isAllowedEmail(t.email)) return null;
      // Sessions issued before multi-user carry no uid; resolve it once by email.
      if (!t.uid) t.uid = (await findUserByEmail(t.email))?.id;
      return t;
    },
    session({ session, token }) {
      const { uid, iat } = token as { uid?: string; iat?: number };
      if (typeof uid === "string") session.user.id = uid;
      // Issued-at of the JWT, shown as "session age" in Diagnostics.
      if (typeof iat === "number") (session as typeof session & { iat?: number }).iat = iat;
      return session;
    },
  },
});
