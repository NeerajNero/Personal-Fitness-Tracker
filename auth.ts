import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Only emails listed in ALLOWED_EMAIL may sign in. Comma-separated, compared
// case-insensitively, whitespace around each entry is ignored.
// If ALLOWED_EMAIL is unset or empty, every sign-in is rejected (fail closed).
const allowedEmails = new Set(
  (process.env.ALLOWED_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== ""),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ user, profile }) {
      const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
      return email !== "" && allowedEmails.has(email);
    },
  },
});
