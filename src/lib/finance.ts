import { Ritual } from "./types";

/**
 * Tareas financieras de una fecha, derivadas por día del mes
 * (Plan Financiero — estrategia avalanche). Generaliza a cualquier mes.
 */
export function getFinanceRituals(date: Date): Ritual[] {
  const day = date.getDate();
  const dow = date.getDay();
  const out: Ritual[] = [];

  if (day === 1) {
    out.push({ id: "ahorro", label: "Día 1 — Transferir $75.000 al ahorro (intocable)", icon: "💰", pillar: "finanzas", phase: "manana", source: "finance" });
    out.push({ id: "taskmaster", label: "Taskmaster Todoist (30 min) — limpiar ruido", icon: "📝", pillar: "sistema", phase: "tarde", source: "finance" });
  }
  if (day === 5) {
    out.push({ id: "sobres", label: "Día 5 — Finanzas: costos fijos / sistema de sobres", icon: "💰", pillar: "finanzas", phase: "tarde", source: "finance" });
  }
  // 2° lunes del mes → IVA CTV
  if (dow === 1 && day >= 8 && day <= 14) {
    out.push({ id: "iva", label: "2° lunes — Declaración IVA CTV", icon: "🧾", pillar: "finanzas", phase: "tarde", source: "finance" });
  }
  if (day >= 15 && day <= 17) {
    out.push({ id: "consorcio", label: "Días 15–17 — Pagar Consorcio (antes del corte ~20)", icon: "💳", pillar: "finanzas", phase: "tarde", source: "finance" });
  }
  if (day >= 18 && day <= 20) {
    out.push({ id: "santander", label: "Días 18–20 — Pagar Santander (antes del corte ~22)", icon: "💳", pillar: "finanzas", phase: "tarde", source: "finance" });
  }
  if (day >= 22 && day <= 24) {
    out.push({ id: "lider", label: "Días 22–24 — Pagar Lider BCI: máximo posible (antes del corte ~27)", icon: "💳", pillar: "finanzas", phase: "tarde", source: "finance" });
  }
  return out;
}
