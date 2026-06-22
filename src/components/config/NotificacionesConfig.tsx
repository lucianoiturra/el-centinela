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

export default function NotificacionesConfig() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULTS);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(0);
  const [testMessage, setTestMessage] = useState("Prueba desde El Centinela");
  const [flash, setFlash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    setTimeout(() => setFlash(null), 2200);
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const canPush = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
      if (!cancelled) setSupported(canPush);

      const [{ configured, preferences }, count] = await Promise.all([
        getNotificationPreferences(),
        getPushSubscriptionCount(),
      ]);

      if (cancelled) return;
      setConfigured(configured);
      setPreferences({
        ...preferences,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.timezone,
      });
      setSubscriptionCount(count);

      if (canPush) {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        if (!cancelled) setSubscription(sub);
      }

      if (!cancelled) setLoading(false);
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
      alert("Faltan las claves VAPID del servidor.");
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      alert("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en el cliente.");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const result = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
    if (result.ok) {
      setSubscription(sub);
      setSubscriptionCount((count) => count + 1);
      showFlash("✓ Dispositivo suscrito");
    }
  }

  async function unsubscribeFromPush() {
    if (!subscription) return;
    await subscription.unsubscribe();
    await removePushSubscription(subscription.endpoint);
    setSubscription(null);
    setSubscriptionCount((count) => Math.max(0, count - 1));
    showFlash("✓ Suscripcion eliminada");
  }

  async function savePrefs() {
    await saveNotificationPreferences(preferences);
    showFlash("✓ Horarios guardados");
  }

  async function sendTest() {
    const result = await sendTestNotification(testMessage);
    if (!result.ok) {
      alert(result.message);
      return;
    }
    showFlash(`✓ Prueba enviada (${result.sent})`);
  }

  if (loading) return <div className="config-soon">Cargando…</div>;

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
            <div className="rit-row" style={{ justifyContent: "space-between" }}>
              <div className="radar-note" style={{ textAlign: "left", maxWidth: "none" }}>
                Dispositivos suscritos: {subscriptionCount}
              </div>
              {subscription ? (
                <button className="rit-del" onClick={unsubscribeFromPush}>Desactivar push</button>
              ) : (
                <button className="rit-save" onClick={subscribeToPush} disabled={!configured}>Activar push</button>
              )}
            </div>
            <div className="rit-row">
              <input
                className="rit-label"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                placeholder="Mensaje de prueba"
              />
              <button className="rit-save" onClick={sendTest} disabled={!subscription || !configured}>Enviar prueba</button>
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
