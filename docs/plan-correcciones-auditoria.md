# Plan de correcciones — Auditoría 2026-06-11

Plan detallado para corregir los 14 hallazgos de la auditoría de código (frontend + backend).
Estado al momento de la auditoría: 48 tests pasando, `tsc --noEmit` limpio, `npm run lint` con 4 errores y 19 warnings.

**Orden recomendado de ejecución:** Fase 1 (media) → Fase 2 (baja) → Fase 3 (higiene).
Cada ítem es independiente salvo que se indique lo contrario. Después de cada fase: `npm test && npx tsc --noEmit && npm run lint`.

---

## Fase 1 — Severidad media

### 1.1 Sacar el access token de Google de la sesión del cliente

**Problema:** `src/auth.ts` (callback `session`, línea ~79) copia `token.accessToken` a la sesión, que se serializa al navegador vía `/api/auth/session`. Un XSS podría robar el token con acceso de lectura al Calendar. El único consumidor real es `src/app/api/calendar/route.ts`, que corre en el servidor.

**Pasos:**
1. En `src/auth.ts`, modificar el callback `session` para exponer **solo** `session.error` (necesario para que el cliente sepa mostrar "Reconectar calendario"). Eliminar `session.accessToken = ...`.
2. En `src/app/api/calendar/route.ts`, reemplazar la lectura de `session.accessToken` por la lectura del JWT en el servidor:
   - Opción A (recomendada con next-auth v5): usar `auth()` igual que ahora, pero mover el token a un campo no expuesto. En v5 la forma limpia es leer el JWT con `getToken` de `next-auth/jwt`:
     ```ts
     import { getToken } from "next-auth/jwt";
     const token = await getToken({ req, secret: process.env.AUTH_SECRET });
     const accessToken = token?.accessToken as string | undefined;
     ```
   - Verificar el nombre real del helper en `node_modules/next-auth` (está en beta; la API puede diferir).
3. Actualizar `src/types/next-auth.d.ts`: quitar `accessToken` de la interfaz `Session` (dejar `error`).
4. Verificar que `Sentinel.tsx` no use `session.accessToken` (hoy solo usa `status` y el fetch a `/api/calendar`) — no debería requerir cambios.

**Verificación:** loguearse, abrir DevTools → Network → `/api/auth/session` y confirmar que la respuesta ya no contiene `accessToken`. Confirmar que los eventos del calendario siguen cargando.

---

### 1.2 Unificar `fmtDate` a fecha local (bug de timezone)

**Problema:** `src/lib/server-user.ts:4-6` formatea con `toISOString()` (UTC). El cliente envía `Date` de medianoche **local**; en zonas horarias al este de UTC eso cae en el día anterior UTC y todos los registros se guardan con fecha equivocada. El cliente (`src/lib/offline-queue.ts:28-30`) ya usa componentes locales — el servidor debe hacer lo mismo.

**Pasos:**
1. En `src/lib/server-user.ts`, reemplazar:
   ```ts
   export function fmtDate(d: Date): string {
     return d.toISOString().slice(0, 10);
   }
   ```
   por la misma implementación local que `offline-queue.ts`:
   ```ts
   export function fmtDate(d: Date): string {
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
   }
   ```
   ⚠️ Matiz importante: en Vercel el servidor corre en UTC, así que `getFullYear()` etc. sobre el `Date` deserializado devuelven valores UTC — esto NO arregla el caso por sí solo. La solución completa es **dejar de pasar `Date` por el cable** (ver paso 2).
2. **Cambio de contrato (la solución de fondo):** cambiar las firmas de los server actions para recibir el string `YYYY-MM-DD` ya formateado por el cliente, en vez de `Date`:
   - `src/app/actions/day.ts`: `saveTaa(dateISO: string, taa: string)`, `markTaaDone`, `getDayState`, `saveLineaEspiritual`, `setTaskCheck`, `getDayChecks`, `saveCycleStart`.
   - `src/app/actions/training.ts`: `getTrainingCardData(dateISO: string)`, `markSessionDone`, `saveSetLog`.
   - Dentro de cada action, donde haga falta un `Date` para lógica (fase, día de semana), construirlo con `new Date(dateISO + "T00:00:00Z")` y usar siempre los getters UTC (`getUTCDay`, etc.) — coherente con `lib/training.ts`.
   - En los llamadores del cliente (`Sentinel.tsx`, `DayDetail.tsx`, `TrainingCard.tsx`, `CicloConfig.tsx`, `offline-queue.ts` → `flushQueue`), formatear con la `fmtDate` local de `offline-queue.ts` antes de llamar.
3. Revisar `src/lib/training.ts`: `isSabbathDay` y `isTrainingRequiredOn` usan `getUTCDay()`. Con el contrato nuevo (fechas construidas como `T00:00:00Z`) quedan correctos sin cambios. `getTrainingCardData` hoy mezcla `date.getDay()` (línea ~137) con lógica UTC — unificar a `getUTCDay()` una vez que la fecha llegue como string.
4. En `getRoutine` (`src/app/actions/routine.ts:56`), `seedRowsFromDefault(fmtDate(new Date()))` usa la fecha del servidor (UTC) como ancla — aceptable, pero documentar o pasar la fecha del cliente si se quiere precisión.

**Verificación:** agregar tests en `src/lib/training.test.ts` para fechas borde (sábado a medianoche, cambio de día). Probar manualmente cambiando la TZ del sistema a UTC+2 y verificando que marcar la TAA guarda la fecha de hoy local.

**Esfuerzo:** es el ítem más grande del plan (toca ~6 archivos + tests). Hacerlo en una rama propia.

---

### 1.3 Corregir los 4 errores de lint (`react-hooks/set-state-in-effect`)

**Problema:** `npm run lint` sale con código 1. Errores en:
- `src/components/TrainingCard.tsx:227` — `setPendingCount(getQueue().length)` dentro de efecto.
- `src/components/Sentinel.tsx:518` — `CierreLinea` re-sincroniza `setText(value)` en un efecto.
- 2 errores más en componentes de config (correr `npm run lint` para ubicarlos; ~`MiRutina.tsx:44` y otro a línea 88).

**Pasos:**
1. **TrainingCard (`useOfflineQueue`)**: inicializar el contador en el `useState` en vez del efecto:
   ```ts
   const [pendingCount, setPendingCount] = useState(() => getQueue().length);
   ```
   ⚠️ `getQueue()` lee `localStorage`; en SSR devuelve `[]` (ya tiene guard), pero un initializer distinto entre server y cliente puede dar warning de hidratación. Si aparece, mantener `useState(0)` y mover la lectura a un efecto con guard `queueMicrotask`/`useSyncExternalStore`. La opción más limpia: `useSyncExternalStore` suscrito a un evento propio de la cola.
2. **CierreLinea (Sentinel.tsx)**: reemplazar el patrón "sincronizar prop→estado en efecto" por el patrón de *derived state durante render*:
   ```ts
   const [text, setText] = useState(value);
   const [lastValue, setLastValue] = useState(value);
   if (value !== lastValue) { setLastValue(value); setText(value); }
   ```
   (patrón oficial de react.dev para resetear estado cuando cambia una prop). Alternativa más simple: `key={value}` en el componente desde el padre, pero eso pierde el texto en edición — evaluar cuál molesta menos.
3. **Config components**: aplicar el mismo criterio (inicializador de `useState` o derived-state-en-render según el caso).
4. Limpiar de paso los 19 warnings de variables sin usar (varios están en `.agents/` — si `.agents/` no es código de la app, excluirlo en `eslint.config.mjs` con `ignores: [".agents/**"]`).
5. Eliminar la directiva `eslint-disable` sin efecto en `TrainingCard.tsx:223` (el propio lint la marca).

**Verificación:** `npm run lint` sale con código 0. Probar en el navegador que la cola offline sigue mostrando el contador y que la línea espiritual se sigue cargando al abrir el día.

---

### 1.4 Arreglar el modo offline del PWA (cachear `/_next/static/`)

**Problema:** `public/sw.js:37-41` excluye todo `/_next/`, así que los bundles JS/CSS nunca se cachean. Offline: el SW sirve el HTML cacheado pero los chunks no existen → pantalla rota.

**Pasos:**
1. En el handler `fetch` de `sw.js`, separar `/_next/static/` (inmutable, con hash en el nombre → ideal cache-first) de `/_next/` dinámico:
   ```js
   // API y rutas dinámicas de Next: siempre red
   if (url.pathname.startsWith("/api/") ||
       (url.pathname.startsWith("/_next/") && !url.pathname.startsWith("/_next/static/"))) {
     return;
   }
   ```
   Con eso, `/_next/static/` cae al bloque final cache-first existente (líneas 63-74), que ya cachea en el primer fetch.
2. Subir la versión del caché: `CACHE_NAME = "centinela-v3"` (fuerza limpieza del caché viejo en `activate`).
3. Opcional (mejora): en `activate`, además de borrar caches viejos, podar entradas de `/_next/static/` de deploys anteriores. Como los nombres tienen hash, los stale quedan huérfanos pero inofensivos; una poda por antigüedad con `cache.keys()` evita crecimiento indefinido. No bloqueante.

**Verificación:** `npm run build && npm start`, cargar la app, DevTools → Application → Cache Storage: confirmar que hay entradas `/_next/static/...`. Luego Network → Offline y recargar: la app debe renderizar (con datos del caché localStorage / cola offline).

---

## Fase 2 — Severidad baja

### 2.1 Validar pertenencia de IDs de entrenamiento

**Archivos:** `src/app/actions/training.ts` (`markSessionDone` ~línea 257, `saveSetLog` ~línea 285).

**Pasos:**
1. En `markSessionDone`, antes del INSERT, verificar que el template pertenece al plan del usuario:
   ```sql
   SELECT 1 FROM training_session_template t
   JOIN training_phase p ON p.id = t.phase_id
   JOIN training_plan pl ON pl.id = p.plan_id
   WHERE t.id = ${sessionTemplateId} AND pl.user_id = ${userId}
   ```
   Si no hay fila → `throw new Error("Sesión inválida")`.
2. En `saveSetLog`, lo análogo vía `training_exercise → training_session_template → training_phase → training_plan`.
3. Para no pagar un round-trip extra por cada set: cachear la verificación con un `EXISTS` dentro del propio INSERT (`INSERT ... SELECT ... WHERE EXISTS (...)`) o aceptar el SELECT previo (la app es monousuario; el costo es irrelevante).

### 2.2 Validar números en el servidor (`saveSetLog`)

**Pasos:**
1. Al inicio de `saveSetLog`, sanear:
   ```ts
   const clean = (v: number | null | undefined) =>
     v == null || !Number.isFinite(v) || v < 0 || v > 10000 ? null : v;
   ```
   y aplicarlo a `weightKg`, `repsCompleted` (entero: `Math.round`), `durationSeconds` (entero).
2. Mismo criterio en `markTaaDone`/`setTaskCheck` no aplica (booleanos), pero en `saveSprintCommitment` validar `slot ∈ {1,2,3}` (la DB ya tiene CHECK — basta dejar que falle) y truncar `text` (ver 2.6).

### 2.3 No reenviar el error crudo de Google al cliente

**Archivo:** `src/app/api/calendar/route.ts:56-60`.

**Pasos:** dejar el `console.error` y devolver solo `{ error: "CalendarFetchError" }` con el status. Eliminar `detail: err` de la respuesta.

### 2.4 Mitigar la carrera del refresh de token

**Archivo:** `src/auth.ts` callback `jwt`.

**Pasos (mitigación pragmática, no solución perfecta):**
1. Ampliar el margen de expiración de 60 s a 5 min (refresca antes, menos ventanas concurrentes).
2. En el `catch`, conservar el `refreshToken` viejo y NO marcar `error` si el fallo fue de red (solo marcar `RefreshTokenError` cuando Google responde `invalid_grant`):
   ```ts
   } catch (err) {
     const isInvalidGrant = typeof err === "object" && err !== null && (err as any).error === "invalid_grant";
     return isInvalidGrant ? { ...token, error: "RefreshTokenError" } : token;
   }
   ```
3. Documentar en un comentario que la carrera entre requests concurrentes es una limitación conocida de next-auth v5 con JWT strategy; la solución real (lock distribuido o session en DB) no se justifica para una app monousuario.

### 2.5 Limpieza de localStorage viejo

**Archivos:** `src/components/Sentinel.tsx` (claves `cent_taaskip_*`, `cent_task_*`, `cent_taa_*`, `cent_won_*`) y `src/lib/offline-queue.ts` (claves `sentinel_tc_*`).

**Pasos:**
1. Crear helper en `offline-queue.ts` (módulo puro, testeable):
   ```ts
   export function pruneOldKeys(todayISO: string, maxAgeDays = 30): void
   ```
   que itere `localStorage`, parsee la fecha embebida en las claves con prefijos conocidos (`sentinel_tc_`, `cent_taaskip_`, `cent_task_`, `cent_taa_`, `cent_won_`) y borre las de más de `maxAgeDays`. Claves sin fecha parseable: no tocar.
2. Llamarla una vez en el efecto de mount de `Sentinel.tsx`.
3. Test unitario en `offline-queue.test.ts`: claves viejas se borran, recientes y ajenas sobreviven.

### 2.6 Sacar el email personal del código

**Archivos:** `src/lib/server-user.ts:11`, `src/app/login/page.tsx:64`.

**Pasos:**
1. En `server-user.ts`: `return process.env.DEV_USER_EMAIL ?? "dev@localhost";` (y agregar `DEV_USER_EMAIL` a `.env.local`).
2. En `login/page.tsx`: eliminar el párrafo con el email, o reemplazarlo por texto genérico ("Usá tu cuenta de Google autorizada").
3. Nota: el email ya está en el historial de git. Si el repo se hiciera público algún día, eso requeriría reescribir historia — fuera de alcance; con dejar de exponerlo hacia adelante alcanza para un repo privado.

### 2.7 Allowlist de usuarios en el login

**Archivo:** `src/auth.ts`.

**Pasos:**
1. Agregar variable de entorno `ALLOWED_EMAILS` (CSV).
2. Agregar callback:
   ```ts
   async signIn({ user }) {
     const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
     if (allowed.length === 0) return true; // sin allowlist configurada → abierto (comportamiento actual)
     return !!user.email && allowed.includes(user.email.toLowerCase());
   }
   ```
3. Configurar `ALLOWED_EMAILS` en Vercel con el email real.
4. Opcional: página de error amable — next-auth redirige a `/login?error=AccessDenied`; mostrar un mensaje en `login/page.tsx` leyendo el query param.

### 2.8 Fijar la versión de next-auth

**Pasos:**
1. En `package.json`, cambiar `"next-auth": "^5.0.0-beta.31"` → `"next-auth": "5.0.0-beta.31"` (sin caret).
2. `npm install` para regenerar el lock.
3. Cuando salga la 5.0 estable, migrar deliberadamente (revisar changelog; el shape de callbacks puede cambiar).

### 2.9 Headers de seguridad

**Archivo:** `next.config.ts`.

**Pasos:**
1. Agregar:
   ```ts
   async headers() {
     return [{
       source: "/(.*)",
       headers: [
         { key: "X-Frame-Options", value: "DENY" },
         { key: "X-Content-Type-Options", value: "nosniff" },
         { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
         { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
       ],
     }];
   }
   ```
   ⚠️ Antes de escribir: leer `node_modules/next/dist/docs/` — esta versión de Next tiene breaking changes y la API de `headers()` puede diferir (regla del AGENTS.md del proyecto).
2. CSP completa: opcional. Si se intenta, empezar con `Content-Security-Policy-Report-Only` para no romper next-auth ni los estilos inline del login.

### 2.10 `.gitignore`

**Pasos:** agregar al `.gitignore`:
```
# local
dev-server.log
*.docx
tsconfig.tsbuildinfo
```
Decidir qué hacer con los archivos personales sueltos en la raíz (`8 Remedios Naturales.md`, `Plan_Integral_Ciclismo_*.docx`): moverlos fuera del repo o a `docs/` si son material del proyecto.

---

## Fase 3 — Verificación final

1. `npm test` → 48+ tests verdes (los nuevos de 1.2 y 2.5 incluidos).
2. `npx tsc --noEmit` → sin errores.
3. `npm run lint` → **0 errores, 0 warnings** (tras 1.3).
4. `npm run build` → build limpio.
5. Prueba manual del flujo completo: login → fijar TAA → marcar entrenamiento → ver cadena → modo offline (avión) → volver online y verificar sync.
6. Verificar en producción (Vercel): `/api/auth/session` sin `accessToken`, headers de seguridad presentes (`curl -I`), calendario funcionando.

## Resumen de prioridades

| # | Ítem | Severidad | Esfuerzo | Riesgo de regresión |
|---|------|-----------|----------|---------------------|
| 1.1 | Token fuera de la sesión cliente | Media | Bajo | Bajo (solo calendar) |
| 1.2 | Unificar fmtDate / fechas como string | Media | **Alto** | Medio (toca todos los actions) |
| 1.3 | Errores de lint | Media | Bajo | Bajo |
| 1.4 | SW: cachear /_next/static | Media | Bajo | Bajo |
| 2.1–2.10 | Hallazgos bajos | Baja | Bajo c/u | Bajo |

Recomendación: hacer 1.1, 1.3 y 1.4 juntos en una sesión corta; dedicar una rama propia a 1.2; y batchear la Fase 2 en una o dos sesiones.
