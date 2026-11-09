import NextAuth from "next-auth";
import Okta from "next-auth/providers/okta";

/**
 * Okta sign-in via Auth.js. Provider settings come from the environment:
 * AUTH_OKTA_ID, AUTH_OKTA_SECRET, AUTH_OKTA_ISSUER, AUTH_SECRET.
 *
 * The login session only proves who the user is. Their Confluence access
 * comes from the personal access token stored separately (see
 * src/server/auth/session.ts), so Okta tokens are never stored or reused.
 */
const maxAgeDays = Number(process.env.SESSION_MAX_AGE_DAYS || 30);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Okta],
  session: { strategy: "jwt", maxAge: maxAgeDays * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, profile }) {
      if (profile?.sub) token.sub = profile.sub;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
