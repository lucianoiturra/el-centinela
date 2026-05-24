# El Centinela — Diseño (app standalone)

> Spec de diseño. Fecha: 2026-05-24. Estado: en revisión.

## Contexto

Luciano necesita una herramienta que elimine la **barrera de decisión** diaria ("¿qué hago ahora?") y revive su sistema TAA (muerto: 2 registros en 30 días). Se prototipó como un HTML de un archivo (`El Centinela 2026.html` en el vault), que validó el concepto: **sin grid de mes, una espina vertical del día guiada por el reloj**. Ahora se promueve a app real, standalone, multiplataforma, conectada a Google Calendar.

Decisión explícita: **no** reutilizar la app anterior (PersonalHub, archivada). Repo nuevo, desde cero.

## Objetivos
- Abrir la app (en teléfono o notebook) y que diga **qué toca ahora**, según la hora real.
- Login con Google (`luciano.iturra.c@gmail.com`) que en un paso da acceso de lectura a su Calendar.
- Que los **eventos de Google Calendar den estructura y contexto al día**, tejidos dentro de la espina junto a las rutinas fijas.
- Estado (TAA, día ganado, checks) **sincronizado entre dispositivos**.
- Instalable como app (PWA).

## No-objetivos (MVP)
- No multiusuario (solo Luciano).
- No escribir/crear eventos en Calendar (solo lectura). Push de rutinas a Calendar = futura fase.
- No apps nativas iOS/Android (PWA cubre "multiplataforma").
- No reconstruir los módulos de finanzas/salud/etc. de la app archivada.

## Stack
- **Next.js (App Router) + TypeScript**, desplegado en **Vercel**.
- **Auth.js (NextAuth v5)** con proveedor **Google**, scope `openid email profile https://www.googleapis.com/auth/calendar.readonly` (+ `access_type=offline`, `prompt=consent` para refresh token).
- **Vercel Postgres** para el estado del usuario.
- **PWA** vía `manifest.json` + service worker.
- Sin framework de UI pesado; CSS propio (porteo de la estética del prototipo: fondo dinámico por hora, tipografía con carácter).

## Arquitectura de datos: la síntesis clave

| Capa | Qué | Fuente |
|------|-----|--------|
| **Esqueleto** (rutina semanal) | Bici L/Mi/V, Gym Ma/J, Basalto mar 14-16, Briefing vie 17:30, Cierre 22:00, Sábado Santo, higiene, hogar | **Plantilla editable por Luciano** (sembrada por defecto, guardada en DB; editable en "Mi rutina") |
| **Carne** (lo que varía día a día) | Reuniones, citas, fechas de pareja, eventos puntuales | **Google Calendar** (lectura en vivo) |
| **Estado** (lo que marca/escribe el usuario) | TAA del día, día ganado, checks, **3 compromisos del sprint**, inicio de período de Michelle | **Vercel Postgres** |
| **Cálculos** (derivados de reglas) | Fase del ciclo (desde último período), fechas financieras del mes, **semana de sprint (ISO)** | **Funciones puras** (desde reglas, no ventana fija) |

> Esto resuelve el "los eventos dan estructura al día": la rutina es el esqueleto estable, los eventos de Calendar son la carne variable. Generaliza más allá de la ventana 24may–22jun del prototipo: todo se computa por reglas para cualquier fecha.

## Cómo se alimenta el sistema (importante)

El prototipo HTML hardcodeaba todo. La app **no**. Tres vías de alimentación:

1. **Auto-calculado (cero input):** qué semana de sprint es (número ISO), fase del día, fase del ciclo (desde el último período), fechas de pago del mes. El sistema sabe que es "Sprint W23"; no se lo dices.
2. **Google Calendar (automático):** reuniones, citas y eventos puntuales se leen en vivo; no se reingresan.
3. **Input de Luciano en la app:**
   - **Rutina semanal** → pantalla **"Mi rutina"**: define qué ritual va en qué día/fase/hora. Mover "lavar ropa" de lunes a domingo = un toque, sin tocar código. Se siembra por defecto con lo conocido.
   - **3 compromisos del sprint** → se ingresan en el **planning del lunes** (la app los pide y los guarda por semana ISO). El sistema sabe la semana; Luciano define el contenido.
   - **TAA + checks + día ganado** → a diario.
   - **Inicio de período de Michelle** → ~cada 28 días, un dato, para recalcular las fases.

## Modelo de datos (Postgres)
```sql
day_state (
  user_id   text not null,      -- sub de Google
  date      date not null,
  taa_text  text,
  taa_done  boolean default false,
  updated_at timestamptz default now(),
  primary key (user_id, date)
)
task_check (
  user_id text not null,
  date    date not null,
  task_id text not null,        -- id del ritual (ej. 'bici','cierre')
  done    boolean default true,
  primary key (user_id, date, task_id)
)
routine_config (                -- "Mi rutina" editable; 1 fila por usuario
  user_id text primary key,
  config  jsonb not null        -- rituales por día/fase/hora; sembrado por defecto
)
sprint_commitment (             -- los 3 compromisos del planning del lunes
  user_id  text not null,
  iso_year int  not null,
  iso_week int  not null,
  position int  not null,       -- 1 | 2 | 3 (orden de prioridad)
  text     text,
  done     boolean default false,
  primary key (user_id, iso_year, iso_week, position)
)
cycle_log (                     -- inicio de período de Michelle
  user_id      text not null,
  period_start date not null,
  cycle_length int default 28,
  primary key (user_id, period_start)
)
```

> `routine_config` como JSON (no tablas normalizadas) porque es un solo usuario y la "Mi rutina" se lee/escribe entera. La semana de sprint se calcula (ISO); solo el contenido (`sprint_commitment`) se guarda.

## Auth + Google Calendar
1. Auth.js Google provider; al iniciar sesión se guarda `access_token` + `refresh_token` (en JWT cifrado o tabla `account`).
2. Route handler `GET /api/calendar/today` (server): usa el token para `events.list` del rango del día (timeMin/timeMax en zona America/Santiago), devuelve eventos normalizados `{start, end, summary, allDay}`.
3. Refresh automático del access token cuando expira (callback `jwt` de Auth.js).
4. El cliente teje esos eventos en la espina: cada evento se ubica en su fase (mañana/tarde/noche) por su hora de inicio y se muestra como ancla con su horario.

## UI (porteo del prototipo a React)
Componentes (client components donde haya interacción):
- `SentinelHero` — héroe "AHORA" guiado por `new Date()` (bloque duro actual + cuenta regresiva / próximo / TAA-norte), estado Día Ganado, chip de ciclo, voz de Vicblaz.
- `DaySpine` — fases Mañana/Tarde/Noche con rituales (config) + eventos (Calendar) entretejidos; checks que persisten en Postgres.
- `MonthChain` — cadena de días ganados/perdidos; click abre detalle del día.
- `TaaGate` — overlay que obliga a definir la TAA al abrir (si no es sábado y no está definida).
- `DynamicBackground` — gradiente HSL interpolado por hora; modo Sábado Santo sereno; nudge de madrugada.
- `lib/rituals.ts`, `lib/cycle.ts`, `lib/finance.ts`, `lib/sprint.ts` — reglas puras (porteadas del HTML).

## Lo que Luciano debe configurar (acciones externas, con guía paso a paso)
1. **Google Cloud Console:** crear proyecto → habilitar *Google Calendar API* → pantalla de consentimiento OAuth (External, agregarse como test user) → crear credencial *OAuth Client ID* (Web) → redirect URIs: `http://localhost:3000/api/auth/callback/google` y la URL de producción de Vercel → copiar **Client ID** y **Client Secret**.
2. **GitHub:** crear el repo `el-centinela` (o lo creo con `gh` si está autenticado).
3. **Vercel:** importar el repo + crear **Vercel Postgres** + setear env vars: `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL` (+ `AUTH_URL` en prod).

## Plan de construcción (fases)
1. **Scaffold:** `create-next-app` (TS, App Router) en `C:\Users\lucia\Documents\el-centinela\`, git init, estructura base, `manifest.json`.
2. **Auth:** Auth.js + Google provider (con env de prueba) + página de login.
3. **Reglas:** portar `rituals/cycle/finance/sprint` desde el HTML a `lib/`.
4. **UI:** portar Hero + Spine + Chain + TaaGate + DynamicBackground.
5. **Persistencia:** Postgres (schema + server actions para TAA/checks/día ganado).
6. **Calendar:** `/api/calendar/today` + tejido de eventos en la espina.
7. **PWA:** manifest + service worker + íconos.
8. **Deploy:** Vercel + env vars + Postgres + probar login y lectura de calendario reales.

## Verificación (end-to-end)
1. `npm run dev` local: login con Google funciona; tras login, el héroe muestra el foco correcto según la hora.
2. Los eventos del día de su Calendar aparecen tejidos en la espina, en la fase correcta.
3. Marcar TAA/checks/día ganado persiste en Postgres y se ve igual al abrir desde otro dispositivo (o navegador).
4. Sábado → modo Sábado Santo (sin entreno/trabajo). Madrugada → nudge de sueño + índigo.
5. Deploy en Vercel accesible desde el teléfono; instalable como PWA.
6. Sin credenciales válidas, la app degrada con mensaje claro (no crashea).

## Ubicación
- Repo local: `C:\Users\lucia\Documents\el-centinela\` (ajustable).
- El prototipo `El Centinela 2026.html` (en el vault) queda como referencia de diseño.
