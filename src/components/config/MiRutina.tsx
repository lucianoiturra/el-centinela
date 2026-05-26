"use client";
import { useEffect, useState } from "react";
import type { RoutineRitual, RitualPhase, Pillar } from "@/lib/types";
import { getRoutine, upsertRitual, deleteRitual } from "@/app/actions/routine";

const DOW = ["D", "L", "M", "X", "J", "V", "S"]; // índice = getDay() (0=Dom)
const PHASES: { id: RitualPhase; label: string }[] = [
  { id: "manana", label: "Mañana" }, { id: "tarde", label: "Tarde" }, { id: "noche", label: "Noche" },
];
const PILLARS: Pillar[] = ["comunion", "salud", "finanzas", "sistema", "basalto", "cab", "pareja", "hogar"];

function emptyRitual(sortOrder: number): RoutineRitual {
  return {
    id: "", label: "", icon: "•", pillar: "sistema", phase: "manana",
    hard: false, optional: false, isTaa: false,
    days: [], intervalWeeks: 1, anchorISO: new Date().toISOString().slice(0, 10), sortOrder,
  };
}

export default function MiRutina() {
  const [rituals, setRituals] = useState<RoutineRitual[] | null>(null);
  const [draft, setDraft] = useState<RoutineRitual | null>(null);

  const reload = () => getRoutine().then(setRituals).catch((e) => { console.error(e); setRituals([]); });
  useEffect(() => { reload(); }, []);

  const save = async (r: RoutineRitual) => {
    await upsertRitual(r);
    setDraft(null);
    await reload();
  };
  const remove = async (id: string) => {
    if (!confirm("¿Borrar este ritual?")) return;
    await deleteRitual(id);
    await reload();
  };

  if (rituals === null) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="rutina">
      {rituals.map((r) => (
        <RitualEditor key={r.id} value={r} onSave={save} onDelete={() => remove(r.id)} />
      ))}
      {draft ? (
        <RitualEditor value={draft} onSave={save} onDelete={() => setDraft(null)} isNew />
      ) : (
        <button className="rutina-add" onClick={() => setDraft(emptyRitual(rituals.length))}>+ nuevo ritual</button>
      )}
    </div>
  );
}

function RitualEditor({
  value, onSave, onDelete, isNew,
}: { value: RoutineRitual; onSave: (r: RoutineRitual) => void; onDelete: () => void; isNew?: boolean }) {
  const [r, setR] = useState<RoutineRitual>(value);
  const toggleDay = (d: number) =>
    setR((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d].sort() }));

  return (
    <div className="rit-card">
      <div className="rit-row">
        <input className="rit-icon" value={r.icon} onChange={(e) => setR({ ...r, icon: e.target.value })} maxLength={2} />
        <input className="rit-label" placeholder="Nombre del ritual" value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} />
      </div>
      <div className="rit-row">
        <select value={r.phase} onChange={(e) => setR({ ...r, phase: e.target.value as RitualPhase })}>
          {PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select value={r.pillar} onChange={(e) => setR({ ...r, pillar: e.target.value as Pillar })}>
          {PILLARS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="rit-time" placeholder="hora (ej 22:00)" value={r.time ?? ""}
          onChange={(e) => setR({ ...r, time: e.target.value || undefined })} />
      </div>
      <div className="rit-days">
        {DOW.map((d, i) => (
          <button key={i} className={r.days.includes(i) ? "on" : ""} onClick={() => toggleDay(i)} type="button">{d}</button>
        ))}
      </div>
      <div className="rit-row">
        <label className="rit-interval">cada
          <input type="number" min={1} value={r.intervalWeeks}
            onChange={(e) => setR({ ...r, intervalWeeks: Math.max(1, parseInt(e.target.value || "1", 10)) })} />
          semana(s)
        </label>
        {r.intervalWeeks > 1 && (
          <label className="rit-anchor">desde
            <input type="date" value={r.anchorISO} onChange={(e) => setR({ ...r, anchorISO: e.target.value })} />
          </label>
        )}
      </div>
      <div className="rit-actions">
        <button className="rit-save" disabled={!r.label.trim() || r.days.length === 0} onClick={() => onSave(r)}>Guardar</button>
        <button className="rit-del" onClick={onDelete}>{isNew ? "Cancelar" : "Borrar"}</button>
      </div>
    </div>
  );
}
