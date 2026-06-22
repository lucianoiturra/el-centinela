import type { NotificationPreferences } from "@/lib/types";

export type ReminderKind = "taa" | "cierre";

export function getDefaultNotificationPreferences(): NotificationPreferences {
  return {
    timezone: "America/Santiago",
    taaEnabled: true,
    taaTime: "08:00",
    cierreEnabled: true,
    cierreTime: "21:30",
  };
}

export function timeToMinutes(value: string) {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

export function localDateParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

export function shouldTriggerAt(currentMinutes: number, targetTime: string, toleranceMinutes = 10) {
  const targetMinutes = timeToMinutes(targetTime);
  return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + toleranceMinutes;
}

export function notificationPayload(kind: ReminderKind) {
  if (kind === "taa") {
    return {
      title: "El Centinela",
      body: "Define tu TAA antes de que el dia te gane.",
      url: "/",
      tag: "taa-reminder",
    };
  }

  return {
    title: "El Centinela",
    body: "Hora de cerrar el dia y escribir tu linea espiritual.",
    url: "/",
    tag: "cierre-reminder",
  };
}
