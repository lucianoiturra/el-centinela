"use server";

import { revalidatePath } from "next/cache";

import { sql } from "@/lib/db/client";
import { getUserId } from "@/lib/server-user";
import { getDefaultNotificationPreferences, type ReminderKind } from "@/lib/notifications";
import { isPushConfigured, sendWebPush } from "@/lib/push";
import type { NotificationPreferences } from "@/lib/types";

type PushSubscriptionInput = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type NotificationPreferenceRow = {
  timezone: string;
  taa_enabled: boolean;
  taa_time: string;
  cierre_enabled: boolean;
  cierre_time: string;
};

function rowToPreferences(row?: NotificationPreferenceRow): NotificationPreferences {
  if (!row) return getDefaultNotificationPreferences();
  return {
    timezone: row.timezone,
    taaEnabled: row.taa_enabled,
    taaTime: row.taa_time,
    cierreEnabled: row.cierre_enabled,
    cierreTime: row.cierre_time,
  };
}

export async function getNotificationPreferences() {
  const userId = await getUserId();
  const rows = (await sql`
    SELECT timezone, taa_enabled, taa_time, cierre_enabled, cierre_time
    FROM notification_preference
    WHERE user_id = ${userId}
    LIMIT 1
  `) as unknown as NotificationPreferenceRow[];

  return {
    configured: isPushConfigured(),
    preferences: rowToPreferences(rows[0]),
  };
}

export async function saveNotificationPreferences(input: NotificationPreferences) {
  const userId = await getUserId();
  await sql`
    INSERT INTO notification_preference (
      user_id, timezone, taa_enabled, taa_time, cierre_enabled, cierre_time, updated_at
    )
    VALUES (
      ${userId}, ${input.timezone}, ${input.taaEnabled}, ${input.taaTime},
      ${input.cierreEnabled}, ${input.cierreTime}, NOW()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      timezone = EXCLUDED.timezone,
      taa_enabled = EXCLUDED.taa_enabled,
      taa_time = EXCLUDED.taa_time,
      cierre_enabled = EXCLUDED.cierre_enabled,
      cierre_time = EXCLUDED.cierre_time,
      updated_at = NOW()
  `;

  revalidatePath("/configuracion");
  return { ok: true as const };
}

export async function savePushSubscription(input: PushSubscriptionInput, userAgent: string) {
  const userId = await getUserId();
  const defaults = getDefaultNotificationPreferences();
  await sql`
    INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, user_agent, updated_at)
    VALUES (${userId}, ${input.endpoint}, ${input.keys.p256dh}, ${input.keys.auth}, ${userAgent}, NOW())
    ON CONFLICT (endpoint)
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      user_agent = EXCLUDED.user_agent,
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO notification_preference (
      user_id, timezone, taa_enabled, taa_time, cierre_enabled, cierre_time, updated_at
    )
    VALUES (
      ${userId}, ${defaults.timezone}, ${defaults.taaEnabled}, ${defaults.taaTime},
      ${defaults.cierreEnabled}, ${defaults.cierreTime}, NOW()
    )
    ON CONFLICT (user_id) DO NOTHING
  `;

  return { ok: true as const };
}

export async function removePushSubscription(endpoint: string) {
  const userId = await getUserId();
  await sql`
    DELETE FROM push_subscription
    WHERE user_id = ${userId} AND endpoint = ${endpoint}
  `;
  return { ok: true as const };
}

export async function getPushSubscriptionCount() {
  const userId = await getUserId();
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM push_subscription
    WHERE user_id = ${userId}
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function sendTestNotification(message: string) {
  const userId = await getUserId();
  if (!isPushConfigured()) {
    return { ok: false as const, message: "Faltan las claves VAPID en el servidor." };
  }

  const rows = await sql`
    SELECT endpoint, p256dh, auth
    FROM push_subscription
    WHERE user_id = ${userId}
  `;

  if (rows.length === 0) {
    return { ok: false as const, message: "Este dispositivo aun no esta suscrito." };
  }

  const staleEndpoints: string[] = [];
  let sent = 0;

  for (const row of rows) {
    try {
      await sendWebPush(
        {
          endpoint: row.endpoint as string,
          p256dh: row.p256dh as string,
          auth: row.auth as string,
        },
        {
          title: "El Centinela",
          body: message.trim() || "Esta es una notificacion de prueba.",
          url: "/configuracion",
          tag: "test-notification",
        }
      );
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        staleEndpoints.push(row.endpoint as string);
      } else {
        console.error("Error enviando push de prueba:", error);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await sql`DELETE FROM push_subscription WHERE endpoint = ANY(${staleEndpoints})`;
  }

  return sent > 0
    ? { ok: true as const, sent }
    : { ok: false as const, message: "No se pudo entregar la notificacion de prueba." };
}

export async function markNotificationDelivered(userId: string, localDate: string, kind: ReminderKind) {
  await sql`
    INSERT INTO notification_delivery (user_id, local_date, kind, delivered_at)
    VALUES (${userId}, ${localDate}, ${kind}, NOW())
    ON CONFLICT (user_id, local_date, kind) DO NOTHING
  `;
}
