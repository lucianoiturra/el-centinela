import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Script from "next/script";

const SERVICE_WORKER_VERSION = "2026-06-21-2";

export const metadata: Metadata = {
  title: "El Centinela",
  description: "Tu día, guiado por el reloj. Sin barrera de decisión.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0b0d17",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) {
  const swUrl = '/sw.js?v=${SERVICE_WORKER_VERSION}';
  const register = () => navigator.serviceWorker.register(swUrl, { scope: '/', updateViaCache: 'none' });

  navigator.serviceWorker.getRegistration('/').then((registration) => {
    if (!registration) {
      return register();
    }

    if (!registration.active?.scriptURL.includes(swUrl)) {
      return registration.unregister().then(() => register());
    }

    return registration.update();
  }).catch(() => {
    register();
  });
}`,
          }}
        />
      </body>
    </html>
  );
}
