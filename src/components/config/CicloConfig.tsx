"use client";
import { useEffect, useMemo, useState } from "react";
import { getLatestCycleStart, saveCycleStart } from "@/app/actions/day";
import { getCyclePhase } from "@/lib/cycle";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CicloConfig() {
  const [startISO, setStartISO] = useState("");
  const [length, setLength] = useState(28);
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLatestCycleStart()
      .then((info) => {
        if (cancelled) return;
        if (info) { setStartISO(info.date); setLength(info.length); }
        else { setStartISO(todayISO()); }
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) { setStartISO(todayISO()); setLoaded(true); } });
    return () => { cancelled = true; };
  }, []);

  const phase = useMemo(
    () => (startISO ? getCyclePhase(new Date(), new Date(startISO + "T00:00:00"), length) : null),
    [startISO, length]
  );

  const save = async () => {
    if (!startISO) return;
    await saveCycleStart(startISO, length);
    setFlash("✓ Guardado");
    setTimeout(() => setFlash(null), 2200);
  };

  if (!loaded) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="ciclo">
      {flash && <div className="rutina-flash">{flash}</div>}
      <div className="ciclo-field">
        <label>Inicio del último período</label>
        <div className="ciclo-row">
          <input type="date" value={startISO} onChange={(e) => setStartISO(e.target.value)} />
          <button className="ciclo-today" onClick={() => setStartISO(todayISO())}>empezó hoy</button>
        </div>
      </div>
      <div className="ciclo-field">
        <label>Duración del ciclo (días)</label>
        <input type="number" min={20} max={45} value={length}
          onChange={(e) => setLength(Math.min(45, Math.max(20, parseInt(e.target.value || "28", 10))))} />
      </div>
      {phase && (
        <div className="ciclo-preview" style={{ borderColor: phase.color }}>
          <span className="ciclo-ph" style={{ color: phase.color }}>{phase.icon} {phase.name}</span>
          <span className="ciclo-day">día {phase.dayInCycle} del ciclo</span>
          <p className="ciclo-desc">{phase.desc}</p>
        </div>
      )}
      <button className="rit-save" onClick={save}>Guardar</button>
    </div>
  );
}
