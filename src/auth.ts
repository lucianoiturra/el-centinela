import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { refreshGoogleAccessToken, shouldRefreshGoogleToken } from "@/lib/google-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      const allowed = (process.env.ALLOWED_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (allowed.length === 0) return true;
      return !!user.email && allowed.includes(user.email.toLowerCase());
    },

    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.error = undefined;
      }

      const expiresAt = token.expiresAt as number | undefined;
      if (expiresAt && !shouldRefreshGoogleToken({ expiresAt })) {
        return token;
      }

      if (!token.refreshToken) {
        return token;
      }

      return refreshGoogleAccessToken({
        ...token,
        accessToken: token.accessToken as string | undefined,
        refreshToken: token.refreshToken as string | undefined,
        expiresAt,
        error: token.error as string | undefined,
      });
    },

    async session({ session, token }) {
      session.error = token.error as string | undefined;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
