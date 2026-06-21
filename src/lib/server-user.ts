import "server-only";
import { auth } from "@/auth";

// Formatea con componentes LOCALES (no UTC), igual que offline-queue.fmtDate.
// NOTA: la solución de fondo al bug de timezone es que los server actions reciban
// la fecha ya formateada como string `YYYY-MM-DD` desde el cliente; esta función
// queda solo para anclas internas del servidor (p. ej. routine.seedRows).
export function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function getUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.email) return session.user.email;
  if (process.env.NODE_ENV === "development") return process.env.DEV_USER_EMAIL ?? "dev@localhost";
  throw new Error("No autenticado");
}
