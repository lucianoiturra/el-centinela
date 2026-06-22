import "server-only";

import webpush from "web-push";

type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

let vapidConfigured = false;

export function isPushConfigured() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

function ensureWebPush() {
  if (!isPushConfigured()) return false;
  if (!vapidConfigured) {
    webpush.setVapidDetails(
      "mailto:notifications@centinela.app",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );
    vapidConfigured = true;
  }
  return true;
}

export async function sendWebPush(
  subscription: StoredSubscription,
  payload: { title: string; body: string; url?: string; tag?: string }
) {
  if (!ensureWebPush()) {
    throw new Error("Push notifications are not configured.");
  }

  return webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      url: payload.url ?? "/",
      tag: payload.tag,
    })
  );
}
