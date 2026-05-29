import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/calendar
 * Devuelve los eventos del día actual desde Google Calendar.
 * El cliente (Sentinel.tsx) los llama para enriquecer la espina del día.
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.error === "RefreshTokenError") {
    return NextResponse.json({ error: "RefreshTokenError" }, { status: 401 });
  }

  // Ventana del día. El cliente envía timeMin/timeMax (su día LOCAL, en ISO/UTC)
  // porque el servidor corre en UTC y no conoce la zona del usuario; si no llegan
  // (o son inválidos), caemos a la medianoche del servidor como último recurso.
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

  try {
    const resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        // Next.js cache: no cachear (los eventos cambian)
        cache: "no-store",
      }
    );

    if (!resp.ok) {
      const err = await resp.json();
      console.error("Google Calendar error:", err);
      return NextResponse.json({ error: "CalendarFetchError", detail: err }, { status: resp.status });
    }

    const data = await resp.json();

    // Normalizar al formato CalendarEvent de la app
    const events = (data.items ?? []).map((item: GoogleCalendarItem) => ({
      id: item.id,
      summary: item.summary ?? "(sin título)",
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

// Mapa de colorId de Google Calendar → color hex aproximado
const GCAL_COLORS: Record<string, string> = {
  "1": "#7986cb", // lavanda
  "2": "#33b679", // salvia
  "3": "#8e24aa", // uva
  "4": "#e67c73", // tomate
  "5": "#f6c026", // banana
  "6": "#f5511d", // mandarina
  "7": "#039be5", // pavo real
  "8": "#616161", // grafito
  "9": "#3f51b5", // arándano
  "10": "#0b8043", // albahaca
  "11": "#d60000", // tomate oscuro
};

interface GoogleCalendarItem {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  colorId?: string;
}
