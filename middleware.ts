export { auth as middleware } from "@/auth";

export const config = {
  // Protege todo excepto login, assets estáticos y las rutas de Auth.js
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons).*)"],
};
