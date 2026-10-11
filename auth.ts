import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Single-user app: only ALLOWED_EMAIL may sign in. Compared case-insensitively.
// If ALLOWED_EMAIL is unset, every sign-in is rejected (fail closed).
const allowedEmail = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ user, profile }) {
      const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
      return allowedEmail !== "" && email === allowedEmail;
    },
  },
});
