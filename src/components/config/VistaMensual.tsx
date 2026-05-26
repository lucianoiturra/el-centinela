"use client";
import { useEffect, useMemo, useState } from "react";
import type { RoutineRitual } from "@/lib/types";
import { getRoutine } from "@/app/actions/routine";
import { ritualAppliesOn } from "@/lib/routine-rules";

const DSHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PHASE_RANK: Record<string, number> = { manana: 0, tarde: 1, noche: 2 };

const todayKey = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
})();

export default function VistaMensual() {
  const [routine, setRoutine] = useState<RoutineRitual[] | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  useEffect(() => {
    let cancelled = false;
    getRoutine().then((r) => { if (!cancelled) setRoutine(r); }).catch(() => { if (!cancelled) setRoutine([]); });
    return () => { cancelled = true; };
  }, []);

  const days = useMemo(() => {
    if (!routine) return [];
    const count = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const out: { date: Date; items: RoutineRitual[] }[] = [];
    for (let d = 1; d <= count; d++) {
      const date = new Date(cursor.y, cursor.m, d);
      const items = routine
        .filter((r) => ritualAppliesOn(r, date))
        .sort((a, b) => (PHASE_RANK[a.phase] - PHASE_RANK[b.phase]) || ((a.startMin ?? 0) - (b.startMin ?? 0)));
      out.push({ date, items });
    }
    return out;
  }, [routine, cursor]);

  const prev = () => setCursor((c) => { const m = c.m - 1; return m < 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m }; });
  const next = () => setCursor((c) => { const m = c.m + 1; return m > 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m }; });

  if (routine === null) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="mensual">
      <div className="mensual-nav">
        <button onClick={prev} aria-label="Mes anterior">‹</button>
        <div className="mensual-title">{MONTHS[cursor.m]} {cursor.y}</div>
        <button onClick={next} aria-label="Mes siguiente">›</button>
      </div>
      <div className="mensual-list">
        {days.map(({ date, items }) => {
          const isToday = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` === todayKey;
          return (
            <div className={`mensual-day${isToday ? " today" : ""}`} key={date.getDate()}>
              <div className="mensual-date">
                <span className="dow">{DSHORT[date.getDay()]}</span>
                <span className="num">{date.getDate()}</span>
              </div>
              <div className="mensual-items">
                {items.length === 0 ? (
                  <span className="mensual-empty">—</span>
                ) : (
                  items.map((r) => (
                    <span className="mensual-chip" key={r.id} title={r.label}>
                      {r.icon} {r.label}{r.time ? ` · ${r.time}` : ""}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
