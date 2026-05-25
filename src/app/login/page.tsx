"use client";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        background: "linear-gradient(160deg, #0b0d17 0%, #12172e 100%)",
        fontFamily: "system-ui, sans-serif",
        color: "#c8cfe8",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <p
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "clamp(2rem, 8vw, 3rem)",
            letterSpacing: "0.15em",
            margin: 0,
            color: "#e8e0c8",
          }}
        >
          EL CENTINELA
        </p>
        <p style={{ marginTop: "0.5rem", opacity: 0.6, fontSize: "0.9rem" }}>
          Tu día, guiado por el reloj.
        </p>
      </div>

      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.85rem 2rem",
          borderRadius: "0.5rem",
          border: "1px solid rgba(200,207,232,0.2)",
          background: "rgba(255,255,255,0.05)",
          color: "#e8e0c8",
          fontSize: "1rem",
          cursor: "pointer",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "rgba(255,255,255,0.05)")
        }
      >
        <GoogleIcon />
        Entrar con Google
      </button>

      <p style={{ opacity: 0.35, fontSize: "0.75rem", textAlign: "center" }}>
        Usá la cuenta luciano.iturra.c@gmail.com
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
