# Diseño: Soporte offline y registro de pesos pasados

**Fecha:** 2026-05-28  
**Estado:** Aprobado

---

## Contexto

El usuario registra pesos en el gimnasio sin internet. Las llamadas a `saveSetLog` (server action) fallan silenciosamente offline. El estado React mantiene los valores en pantalla, pero al reconectarse y recargar la página, `getTrainingCardData` lee la DB vacía y se pierde todo lo registrado.

Además, necesita poder cargar pesos de días pasados (última semana) cuando olvida registrarlos en el momento.

---

## Feature 1: Soporte offline con cola en localStorage

### Problema exacto

`handleSetBlur` en `TrainingCard` llama `saveSetLog` sin manejo de error. Offline → falla → pérdida de datos al recargar.

### Solución

**Hook `useOfflineQueue`** en `src/lib/offline-queue.ts`:

- Expone `queueSetLog(...)` y `queueSessionDone(...)`.
- Al fallar el server action, encola la operación en `localStorage` bajo la clave `sentinel_offline_sets`.
- Escucha `window.online` y vacía la cola en orden al reconectarse.
- En cada mount de `TrainingCard`, intenta vaciar la cola también (por si reconectaron y refrescaron).
- Si una operación falla al sincronizar, permanece en cola para el próximo intento.

**Estructura de la cola (JSON array en localStorage):**

```json
[
  {
    "type": "setLog",
    "date": "2026-05-28",
    "exerciseId": 123,
    "setNumber": 1,
    "weightKg": 60,
    "repsCompleted": 10,
    "durationSeconds": null
  },
  {
    "type": "sessionDone",
    "date": "2026-05-28",
    "sessionTemplateId": 5,
    "done": true
  }
]
```

**Caché del template para hoy:**

- Al cargar exitosamente `getTrainingCardData`, se guarda el resultado en `localStorage` (`sentinel_today_cache`).
- Si el fetch falla offline, se usa el caché para mostrar los ejercicios del día.
- El caché es solo para visualización; los sets nuevos siempre van a la cola.

### UX — indicador visual

- Con items pendientes: línea discreta bajo `TrainingCard` → `"N cambio(s) pendiente(s) · sin conexión"`.
- Al sincronizar exitosamente: `"✓ Sincronizado"` durante 2 segundos, luego desaparece.

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/lib/offline-queue.ts` | Nuevo — hook + lógica de cola |
| `src/components/TrainingCard.tsx` | Usar `useOfflineQueue` en lugar de llamar server actions directamente; mostrar indicador |

---

## Feature 2: Registrar pesos pasados desde la cadena mensual

### Flujo

Al hacer clic en un día pasado en "La cadena" de `Sentinel`, se abre `DayDetail`. Actualmente muestra TAA, rituales y línea espiritual.

**Cambio:** agregar `TrainingCard` dentro de `DayDetail`. Como `TrainingCard` ya acepta `date: Date` como prop, el backend no requiere cambios.

### Días editables

Ya existe `editable: date <= today` en `Chain`. Cualquier día pasado con sesión mostrará la card de entrenamiento en el modal.

### Comportamiento

- `TrainingCard` se renderiza igual que en la vista principal.
- "Marcar sesión hecha" actualiza `day_state.training_done` → afecta `won` en la cadena.
- Al cerrar el modal, `Sentinel` ya ejecuta `setReloadKey((k) => k + 1)` → la cadena se recarga con el estado actualizado.
- La cola offline aplica también para pesos pasados.

### Cambio en DayDetail

- Recibe `date` (ya lo tiene).
- Agrega estado local `trainingDone` / `trainingRequired`.
- Renderiza `<TrainingCard date={date} onSessionDone={...} onSessionLoaded={...} />`.

### Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/components/DayDetail.tsx` | Agregar `TrainingCard` y estado de sesión |

---

## Fuera de alcance

- Service Worker / PWA / Background Sync API.
- Conflictos entre dispositivos.
- Editar días pasados desde `VistaMensual` en `/configuracion` (la cadena ya cubre esto).
- Registro de sesiones de bici pasadas (misma interfaz, pero sin inputs de peso — se cubre automáticamente con el cambio en DayDetail).
