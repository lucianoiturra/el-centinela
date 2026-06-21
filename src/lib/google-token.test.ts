import { describe, expect, it, vi } from "vitest";

import { refreshGoogleAccessToken, shouldRefreshGoogleToken } from "./google-token";

describe("shouldRefreshGoogleToken", () => {
  it("refreshes when there is no expiry timestamp", () => {
    expect(shouldRefreshGoogleToken({ expiresAt: undefined }, 1_000)).toBe(true);
  });

  it("does not refresh when the token is still comfortably valid", () => {
    expect(shouldRefreshGoogleToken({ expiresAt: 10_000 }, 1_000)).toBe(false);
  });
});

describe("refreshGoogleAccessToken", () => {
  it("keeps the previous refresh token when Google does not rotate it", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "new-access", expires_in: 3600 }),
    } as Response);

    const refreshed = await refreshGoogleAccessToken(
      {
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: 1,
      },
      fetchMock
    );

    expect(refreshed.accessToken).toBe("new-access");
    expect(refreshed.refreshToken).toBe("old-refresh");
    expect(refreshed.error).toBeUndefined();
  });

  it("marks the token for reauth on invalid_grant", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "invalid_grant" }),
    } as Response);

    const refreshed = await refreshGoogleAccessToken(
      {
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: 1,
      },
      fetchMock
    );

    expect(refreshed.error).toBe("RefreshTokenError");
  });
});
