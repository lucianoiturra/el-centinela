"use client";
import { useEffect, useMemo, useState } from "react";
import type { RoutineRitual } from "@/lib/types";
import { getRoutineRituals } from "@/lib/rituals";
import { getFinanceRituals } from "@/lib/finance";
import {
  getDayState, getDayChecks, setTaskCheck, saveTaa, markTaaDone, saveLineaEspiritual,
} from "@/app/actions/day";

const DFULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PHASE_RANK: Record<string, number> = { manana: 0, tarde: 1, noche: 2 };

export default function DayDetail({ date, routine, onClose }: { date: Date; routine: RoutineRitual[]; onClose: () => void }) {
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [taa, setTaa] = useState("");
  const [taaDone, setTaaDone] = useState(false);
  const [linea, setLinea] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = () => { setFlash("✓ guardado"); setTimeout(() => setFlash(null), 1600); };

  const rituals = useMemo(
    () => [...getRoutineRituals(date, routine), ...getFinanceRituals(date)]
      .sort((a, b) => (PHASE_RANK[a.phase] - PHASE_RANK[b.phase]) || ((a.startMin ?? 0) - (b.startMin ?? 0))),
    [date, routine]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDayState(date), getDayChecks(date)])
      .then(([s, c]) => {
        if (cancelled) return;
        setTaa(s.taa ?? ""); setTaaDone(s.taa_done); setLinea(s.linea ?? ""); setChecks(c); setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [date]);

  const toggle = (id: string) => {
    const next = !checks[id];
    setChecks((c) => ({ ...c, [id]: next }));
    setTaskCheck(date, id, next).then(showFlash).catch(console.error);
  };
  const toggleDone = () => {
    const next = !taaDone;
    setTaaDone(next);
    markTaaDone(date, next).then(showFlash).catch(console.error);
  };
  const saveTaaText = () => { saveTaa(date, taa.trim()).then(showFlash).catch(console.error); };
  const saveLineaText = () => { saveLineaEspiritual(date, linea.trim()).then(showFlash).catch(console.error); };

  return (
    <div className="gate" onClick={onClose}>
      <div className="gate-card daydetail" onClick={(e) => e.stopPropagation()}>
        <div className="dd-head">
          <div className="dd-title">{DFULL[date.getDay()]} {date.getDate()} {MONTHS[date.getMonth()]}</div>
          <button className="dd-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {flash && <div className="rutina-flash">{flash}</div>}
        {!loaded ? (
          <div className="config-soon">Cargando…</div>
        ) : (
          <>
            <label className="dd-label">TAA del día</label>
            <input className="dd-input" value={taa} placeholder="Tu TAA de ese día…"
              onChange={(e) => setTaa(e.target.value)} onBlur={saveTaaText} />
            <button className={`dd-done${taaDone ? " on" : ""}`} onClick={toggleDone}>
              <span className="dd-box">{taaDone ? "✓" : ""}</span>{taaDone ? "TAA cumplida" : "Marcar TAA cumplida"}
            </button>

            <label className="dd-label">Rituales</label>
            <div className="dd-rituals">
              {rituals.length === 0 ? (
                <div className="config-soon">Sin rituales ese día.</div>
              ) : rituals.map((r) => (
                <div key={r.id} className={`dd-node${checks[r.id] ? " done" : ""}`} onClick={() => toggle(r.id)}>
                  <span className="dd-box">{checks[r.id] ? "✓" : ""}</span>
                  <span>{r.icon} {r.label}{r.time ? ` · ${r.time}` : ""}</span>
                </div>
              ))}
            </div>

            <label className="dd-label">Línea espiritual</label>
            <textarea className="dd-input" rows={2} value={linea} placeholder="Tu línea de ese día…"
              onChange={(e) => setLinea(e.target.value)} onBlur={saveLineaText} />
          </>
        )}
      </div>
    </div>
  );
}
