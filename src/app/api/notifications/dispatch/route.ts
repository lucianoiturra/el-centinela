import { NextResponse } from "next/server";

import { sql } from "@/lib/db/client";
import {
  getDefaultNotificationPreferences,
  localDateParts,
  notificationPayload,
  shouldTriggerAt,
  type ReminderKind,
} from "@/lib/notifications";
import { isPushConfigured, sendWebPush } from "@/lib/push";

type PrefRow = {
  user_id: string;
  timezone: string | null;
  taa_enabled: boolean | null;
  taa_time: string | null;
  cierre_enabled: boolean | null;
  cierre_time: string | null;
};

type SubRow = {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const fallback = request.headers.get("x-cron-secret");
  return bearer === expected || fallback === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "PushNotConfigured" }, { status: 503 });
  }

  const now = new Date();
  const prefRows = (await sql`
    SELECT user_id, timezone, taa_enabled, taa_time, cierre_enabled, cierre_time
    FROM notification_preference
  `) as unknown as PrefRow[];

  const subscriptions = (await sql`
    SELECT user_id, endpoint, p256dh, auth
    FROM push_subscription
  `) as unknown as SubRow[];

  const subscriptionMap = new Map<string, SubRow[]>();
  for (const sub of subscriptions) {
    const list = subscriptionMap.get(sub.user_id) ?? [];
    list.push(sub);
    subscriptionMap.set(sub.user_id, list);
  }

  const delivered = await sql`
    SELECT user_id, local_date::text as local_date, kind
    FROM notification_delivery
    WHERE local_date >= CURRENT_DATE - INTERVAL '120 days'
  `;
  const deliveredSet = new Set(
    delivered.map((row) => `${row.user_id as string}|${row.local_date as string}|${row.kind as string}`)
  );

  const staleEndpoints: string[] = [];
  const summary = { sent: 0, users: 0 };

  for (const prefRow of prefRows) {
    const defaults = getDefaultNotificationPreferences();
    const preferences = {
      timezone: prefRow.timezone ?? defaults.timezone,
      taaEnabled: prefRow.taa_enabled ?? defaults.taaEnabled,
      taaTime: prefRow.taa_time ?? defaults.taaTime,
      cierreEnabled: prefRow.cierre_enabled ?? defaults.cierreEnabled,
      cierreTime: prefRow.cierre_time ?? defaults.cierreTime,
    };

    const parts = localDateParts(now, preferences.timezone);
    const dueKinds: ReminderKind[] = [];
    if (preferences.taaEnabled && shouldTriggerAt(parts.minutes, preferences.taaTime)) dueKinds.push("taa");
    if (preferences.cierreEnabled && shouldTriggerAt(parts.minutes, preferences.cierreTime)) dueKinds.push("cierre");
    if (dueKinds.length === 0) continue;

    const userSubscriptions = subscriptionMap.get(prefRow.user_id) ?? [];
    if (userSubscriptions.length === 0) continue;

    let userSent = false;
    for (const kind of dueKinds) {
      const dedupeKey = `${prefRow.user_id}|${parts.dateISO}|${kind}`;
      if (deliveredSet.has(dedupeKey)) continue;

      const payload = notificationPayload(kind);
      let deliveredForKind = false;
      for (const sub of userSubscriptions) {
        try {
          await sendWebPush(
            {
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
            payload
          );
          deliveredForKind = true;
          summary.sent += 1;
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error("Error enviando push programado:", error);
          }
        }
      }

      if (deliveredForKind) {
        await sql`
          INSERT INTO notification_delivery (user_id, local_date, kind, delivered_at)
          VALUES (${prefRow.user_id}, ${parts.dateISO}, ${kind}, NOW())
          ON CONFLICT (user_id, local_date, kind) DO NOTHING
        `;
        deliveredSet.add(dedupeKey);
        userSent = true;
      }
    }

    if (userSent) summary.users += 1;
  }

  if (staleEndpoints.length > 0) {
    await sql`DELETE FROM push_subscription WHERE endpoint = ANY(${staleEndpoints})`;
  }

  return NextResponse.json(summary);
}
