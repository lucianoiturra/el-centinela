"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getNotificationPreferences,
  getPushSubscriptionCount,
  removePushSubscription,
  saveNotificationPreferences,
  savePushSubscription,
  sendTestNotification,
} from "@/app/actions/notifications";
import type { NotificationPreferences } from "@/lib/types";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const DEFAULTS: NotificationPreferences = {
  timezone: "America/Santiago",
  taaEnabled: true,
  taaTime: "08:00",
  cierreEnabled: true,
  cierreTime: "21:30",
};

const SERVICE_WORKER_URL = "/sw.js?v=2026-06-21-2";
const SERVICE_WORKER_TIMEOUT_MS = 4000;

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  return navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: "/",
    updateViaCache: "none",
  });
}

async function getPushSubscriptionWithTimeout() {
  const registration = await Promise.race([
    getServiceWorkerRegistration(),
    new Promise<never>((_, reject) =>
      window.setTimeout(() => reject(new Error("Service worker timeout")), SERVICE_WORKER_TIMEOUT_MS)
    ),
  ]);

  return registration.pushManager.getSubscription();
}

export default function NotificacionesConfig() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULTS);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [testMessage, setTestMessage] = useState("Prueba desde El Centinela");
  const [flash, setFlash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "default" : Notification.permission
  );

  const isIOS = useMemo(
    () => typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent),
    []
  );
  const isStandalone = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
    []
  );

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash(null), 2600);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const canPush = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
      if (!cancelled) {
        setSupported(canPush);
        setPermission(typeof Notification === "undefined" ? "default" : Notification.permission);
      }

      try {
        const [preferencesResult, countResult] = await Promise.allSettled([
          getNotificationPreferences(),
          getPushSubscriptionCount(),
        ]);

        if (cancelled) return;

        const notificationState =
          preferencesResult.status === "fulfilled"
            ? preferencesResult.value
            : { configured: false, preferences: DEFAULTS };
        const count = countResult.status === "fulfilled" ? countResult.value : 0;

        setConfigured(notificationState.configured);
        setPreferences({
          ...notificationState.preferences,
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || notificationState.preferences.timezone,
        });
        setSubscriptionCount(count);
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (!canPush) return;

      try {
        const sub = await getPushSubscriptionWithTimeout();
        if (!cancelled) setSubscription(sub);
      } catch (error) {
        console.error("No se pudo obtener la suscripcion push:", error);
      }
    }

    load().catch((error) => {
      console.error(error);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribeToPush() {
    if (!configured) {
      showFlash("Faltan las claves VAPID del servidor.");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      showFlash("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el cliente.");
      return;
    }

    if (isIOS && !isStandalone) {
      showFlash("Instala la app en la pantalla de inicio para activar push.");
      return;
    }

    setBusy(true);

    try {
      const granted =
        typeof Notification !== "undefined" && Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      setPermission(granted);

      if (granted !== "granted") {
        showFlash("Debes permitir notificaciones en el navegador.");
        return;
      }

      const registration = await getServiceWorkerRegistration();
      const existing = await registration.pushManager.getSubscription();
      const sub =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const result = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      if (!result.ok) {
        showFlash("No se pudo guardar la suscripcion.");
        return;
      }

      setSubscription(sub);
      setSubscriptionCount((count) => (existing ? count : count + 1));
      showFlash("Push activado");
    } catch (error) {
      console.error("Error activando push:", error);
      showFlash("No se pudo activar push. Revisa permisos del navegador.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribeFromPush() {
    if (!subscription) return;

    setBusy(true);

    try {
      await subscription.unsubscribe();
      await removePushSubscription(subscription.endpoint);
      setSubscription(null);
      setSubscriptionCount((count) => Math.max(0, count - 1));
      showFlash("Push desactivado");
    } catch (error) {
      console.error("Error desactivando push:", error);
      showFlash("No se pudo desactivar push.");
    } finally {
      setBusy(false);
    }
  }

  async function savePrefs() {
    await saveNotificationPreferences(preferences);
    showFlash("Horarios guardados");
  }

  async function sendTest() {
    const result = await sendTestNotification(testMessage);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    showFlash(`Prueba enviada (${result.sent})`);
  }

  if (loading) return <div className="config-soon">Cargando...</div>;

  return (
    <div className="rutina">
      {flash && <div className="rutina-flash">{flash}</div>}
      <div className="rit-card">
        <div className="training-label">Push real</div>
        {!supported ? (
          <div className="config-soon" style={{ padding: 0 }}>
            Este navegador no soporta push notifications.
          </div>
        ) : (
          <>
            {!configured && (
              <div className="config-soon" style={{ padding: 0 }}>
                Falta configurar las claves VAPID del servidor para habilitar notificaciones reales.
              </div>
            )}
            {isIOS && !isStandalone && (
              <div className="config-soon" style={{ padding: 0 }}>
                En iPhone/iPad necesitas instalar la app en la pantalla de inicio para recibir push.
              </div>
            )}
            {permission === "denied" && (
              <div className="config-soon" style={{ padding: 0 }}>
                Las notificaciones estan bloqueadas para este sitio en el navegador.
              </div>
            )}
            <div className="rit-row" style={{ justifyContent: "space-between" }}>
              <div className="radar-note" style={{ textAlign: "left", maxWidth: "none" }}>
                Dispositivos suscritos: {subscriptionCount}
              </div>
              {subscription ? (
                <button className="rit-del" onClick={unsubscribeFromPush} disabled={busy}>
                  {busy ? "Procesando..." : "Desactivar push"}
                </button>
              ) : (
                <button
                  className="rit-save"
                  onClick={subscribeToPush}
                  disabled={!configured || busy || (isIOS && !isStandalone)}
                >
                  {busy ? "Procesando..." : "Activar push"}
                </button>
              )}
            </div>
            <div className="rit-row">
              <input
                className="rit-label"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Mensaje de prueba"
              />
              <button className="rit-save" onClick={sendTest} disabled={!subscription || !configured || busy}>
                Enviar prueba
              </button>
            </div>
          </>
        )}
      </div>

      <div className="rit-card">
        <div className="training-label">Recordatorios</div>
        <div className="rit-row">
          <label className="notif-toggle">
            <input
              type="checkbox"
              checked={preferences.taaEnabled}
              onChange={(e) => setPreferences((p) => ({ ...p, taaEnabled: e.target.checked }))}
            />
            <span>Recordatorio para definir la TAA</span>
          </label>
          <input
            type="time"
            value={preferences.taaTime}
            onChange={(e) => setPreferences((p) => ({ ...p, taaTime: e.target.value }))}
          />
        </div>
        <div className="rit-row">
          <label className="notif-toggle">
            <input
              type="checkbox"
              checked={preferences.cierreEnabled}
              onChange={(e) => setPreferences((p) => ({ ...p, cierreEnabled: e.target.checked }))}
            />
            <span>Recordatorio de cierre nocturno</span>
          </label>
          <input
            type="time"
            value={preferences.cierreTime}
            onChange={(e) => setPreferences((p) => ({ ...p, cierreTime: e.target.value }))}
          />
        </div>
        <div className="rit-row">
          <div className="radar-note" style={{ textAlign: "left", maxWidth: "none" }}>
            Zona horaria detectada: {preferences.timezone}
          </div>
          <button className="rit-save" onClick={savePrefs}>Guardar horarios</button>
        </div>
      </div>
    </div>
  );
}
