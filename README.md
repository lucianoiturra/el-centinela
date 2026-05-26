# El Centinela

App personal de seguimiento diario para Luciano Iturra. Construida con Next.js 16 (App Router), Neon Postgres y Vercel.

## Qué hace

- **TAA** — Tarea de Alto Apalancamiento: la una cosa que mueve la aguja cada día
- **La Espina** — Rutina de rituales diarios por fases (mañana / tarde / noche), con rituales de Google Calendar integrados
- **La Cadena** — Calendario mensual que muestra los días ganados
- **Día Ganado** — `TAA cumplida AND entrenamiento completado` (o solo TAA en días sin entrenamiento)
- **Módulo de ciclismo** — Plan de 6 meses hacia una carrera de 30 km en octubre 2026:
  - Tarjeta de entrenamiento del día (bici o pesas) con fase calculada dinámicamente
  - Pesas: lista expandible de ejercicios con inputs de peso/reps por serie
  - Historial "última vez: X kg × Y reps" por ejercicio
  - Auto-seed del plan completo en el primer uso
- **Diario espiritual** — Línea de cierre diaria, tab "Diario" para releer entradas
- **Ciclo de Michelle** — Fase del ciclo de la pareja visible en Hero y cadena
- **Edición de días pasados** — Desde la cadena se puede editar TAA, checks, entrenamiento y línea de cualquier día pasado

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| Base de datos | Neon Postgres (serverless) |
| ORM / cliente | `postgres` tagged template |
| Auth | NextAuth.js (Google OAuth) |
| Tests | Vitest |
| Deploy | Vercel Hobby |

## Estructura de archivos clave

```
src/
  app/
    actions/
      day.ts          — TAA, checks, cadena, línea espiritual
      training.ts     — Plan de entrenamiento, sesiones, sets (auto-seed)
      routine.ts      — Rutinas de rituales
    globals.css       — Estilos globales (BEM-like, CSS custom properties)
  components/
    Sentinel.tsx      — Componente raíz de la app
    TrainingCard.tsx  — Tarjeta de entrenamiento del día
    DayDetail.tsx     — Modal de edición de días pasados
  lib/
    training.ts       — Lógica pura: calculatePhaseNumber, isSabbathDay
    training-data.ts  — Datos estáticos del plan (seed)
    training.test.ts  — Tests de lógica pura (16 tests)
    types.ts          — Tipos compartidos
    db/
      client.ts       — Cliente Neon (postgres tagged template)
      migrations/     — Migraciones SQL (aplicar manualmente en Neon)
```

## Base de datos

Migraciones en `src/lib/db/migrations/`. Se aplican manualmente en el SQL Editor de Neon (console.neon.tech). Son idempotentes (`CREATE TABLE IF NOT EXISTS`).

### Tablas principales

| Tabla | Propósito |
|-------|-----------|
| `day_state` | Estado diario: TAA, taa_done, training_done, línea espiritual |
| `task_check` | Checks de rituales por día |
| `training_plan` | Plan de entrenamiento (1 por usuario) |
| `training_phase` | Fases del plan (1–4) |
| `training_session_template` | Plantilla de sesión por fase y día de semana |
| `training_exercise` | Ejercicios por sesión |
| `training_session_log` | Log de sesiones completadas |
| `training_set_log` | Log de sets: peso, reps, duración |

## Desarrollo local

```bash
npm install
npm run dev
```

Variables de entorno necesarias: `DATABASE_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## Tests

```bash
npm test
```

## Deploy

Push a `main` deploya automáticamente en Vercel. Logs en Vercel Dashboard (efímeros en plan Hobby).
