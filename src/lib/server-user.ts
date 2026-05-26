import "server-only";
import { auth } from "@/auth";

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getUserId(): Promise<string> {
  const session = await auth();
  if (session?.user?.email) return session.user.email;
  if (process.env.NODE_ENV === "development") return "luciano.iturra.c@gmail.com";
  throw new Error("No autenticado");
}
