import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
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
    // Guarda access_token y refresh_token en el JWT para poder llamar Calendar API
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at; // segundos Unix
      }

      // Si el token no expiró, lo devolvemos tal cual
      if (Date.now() < (token.expiresAt as number) * 1000 - 60_000) {
        return token;
      }

      // Token expirado → refrescar con Google
      try {
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            grant_type: "refresh_token",
            refresh_token: token.refreshToken as string,
          }),
        });

        const data = await resp.json();
        if (!resp.ok) throw data;

        return {
          ...token,
          accessToken: data.access_token,
          expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
          // Google solo devuelve refresh_token la primera vez; conservamos el anterior
          refreshToken: data.refresh_token ?? token.refreshToken,
        };
      } catch (err) {
        console.error("Error refrescando token de Google:", err);
        return { ...token, error: "RefreshTokenError" };
      }
    },

    // Expone accessToken y error al cliente (para la ruta de Calendar)
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
});
