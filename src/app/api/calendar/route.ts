import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  refreshGoogleAccessToken,
  shouldRefreshGoogleToken,
  type GoogleJwtToken,
} from "@/lib/google-token";

/**
 * GET /api/calendar
 * Devuelve los eventos del dia actual desde Google Calendar.
 * El access token vive solo server-side en el JWT cifrado.
 */
export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const secureCookie = cookieHeader.includes("__Secure-authjs.session-token");
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let googleToken: GoogleJwtToken = {
    accessToken: token.accessToken as string | undefined,
    refreshToken: token.refreshToken as string | undefined,
    expiresAt: token.expiresAt as number | undefined,
    error: token.error as string | undefined,
  };

  if (googleToken.error === "RefreshTokenError") {
    return NextResponse.json({ error: "RefreshTokenError" }, { status: 401 });
  }

  if (shouldRefreshGoogleToken({ expiresAt: googleToken.expiresAt })) {
    googleToken = await refreshGoogleAccessToken(googleToken);
  }

  if (!googleToken.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (googleToken.error === "RefreshTokenError") {
    return NextResponse.json({ error: "RefreshTokenError" }, { status: 401 });
  }

  const sp = new URL(request.url).searchParams;
  const isISO = (s: string | null): s is string => !!s && !Number.isNaN(Date.parse(s));
  let timeMin = sp.get("timeMin");
  let timeMax = sp.get("timeMax");
  if (!isISO(timeMin) || !isISO(timeMax)) {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    timeMin = startOfDay.toISOString();
    timeMax = endOfDay.toISOString();
  }

  const params = new URLSearchParams({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const fetchEvents = async (accessToken: string) =>
    fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

  try {
    let resp = await fetchEvents(googleToken.accessToken);

    if (resp.status === 401 && googleToken.refreshToken) {
      googleToken = await refreshGoogleAccessToken({
        ...googleToken,
        expiresAt: 0,
      });

      if (googleToken.error === "RefreshTokenError") {
        return NextResponse.json({ error: "RefreshTokenError" }, { status: 401 });
      }

      if (googleToken.accessToken) {
        resp = await fetchEvents(googleToken.accessToken);
      }
    }

    if (!resp.ok) {
      const err = await resp.json();
      console.error("Google Calendar error:", err);
      const status = resp.status === 401 ? 502 : resp.status;
      return NextResponse.json({ error: "CalendarFetchError" }, { status });
    }

    const data = await resp.json();
    const events = (data.items ?? []).map((item: GoogleCalendarItem) => ({
      id: item.id,
      summary: item.summary ?? "(sin titulo)",
      startISO: item.start?.dateTime ?? item.start?.date ?? "",
      endISO: item.end?.dateTime ?? item.end?.date ?? "",
      allDay: !item.start?.dateTime,
      color: item.colorId ? GCAL_COLORS[item.colorId] : undefined,
    }));

    return NextResponse.json({ events });
  } catch (err) {
    console.error("Error fetching calendar:", err);
    return NextResponse.json({ error: "NetworkError" }, { status: 500 });
  }
}

const GCAL_COLORS: Record<string, string> = {
  "1": "#7986cb",
  "2": "#33b679",
  "3": "#8e24aa",
  "4": "#e67c73",
  "5": "#f6c026",
  "6": "#f5511d",
  "7": "#039be5",
  "8": "#616161",
  "9": "#3f51b5",
  "10": "#0b8043",
  "11": "#d60000",
};

interface GoogleCalendarItem {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  colorId?: string;
}
