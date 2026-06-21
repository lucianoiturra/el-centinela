export const GOOGLE_REFRESH_BUFFER_MS = 5 * 60_000;

export type GoogleJwtToken = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
};

type GoogleRefreshSuccess = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type GoogleRefreshFailure = {
  error?: string;
  error_description?: string;
};

export function shouldRefreshGoogleToken(
  token: Pick<GoogleJwtToken, "expiresAt">,
  now = Date.now()
) {
  return !token.expiresAt || now >= token.expiresAt * 1000 - GOOGLE_REFRESH_BUFFER_MS;
}

export async function refreshGoogleAccessToken(
  token: GoogleJwtToken,
  fetchImpl: typeof fetch = fetch
): Promise<GoogleJwtToken> {
  if (!token.refreshToken) {
    return token;
  }

  try {
    const resp = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const data = (await resp.json()) as GoogleRefreshSuccess | GoogleRefreshFailure;
    if (!resp.ok) {
      throw data;
    }

    const successData = data as GoogleRefreshSuccess;

    return {
      ...token,
      accessToken: successData.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + successData.expires_in,
      refreshToken: successData.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch (err) {
    console.error("Error refrescando token de Google:", err);
    const isInvalidGrant =
      typeof err === "object" &&
      err !== null &&
      (err as GoogleRefreshFailure).error === "invalid_grant";

    return isInvalidGrant ? { ...token, error: "RefreshTokenError" } : token;
  }
}
