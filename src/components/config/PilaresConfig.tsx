"use client";

import { useEffect, useState } from "react";

import { deletePillar, getPillars, upsertPillar } from "@/app/actions/pillar";
import type { PillarConfig } from "@/lib/types";

function emptyPillar(sortOrder: number): PillarConfig {
  return {
    id: "",
    label: "",
    color: "#60a5fa",
    sortOrder,
  };
}

export default function PilaresConfig() {
  const [pillars, setPillars] = useState<PillarConfig[] | null>(null);
  const [draft, setDraft] = useState<PillarConfig | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const showFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  };

  const reload = () => {
    getPillars().then(setPillars).catch((e) => {
      console.error(e);
      setPillars([]);
    });
  };

  useEffect(() => {
    reload();
  }, []);

  const save = async (pillar: PillarConfig) => {
    try {
      await upsertPillar(pillar);
      setDraft(null);
      reload();
      showFlash("✓ Pilar guardado");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo guardar el pilar.");
    }
  };

  const remove = async (id: string) => {
    try {
      await deletePillar(id);
      reload();
      showFlash("✓ Pilar borrado");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo borrar el pilar.");
    }
  };

  if (pillars === null) return <div className="config-soon">Cargando…</div>;

  return (
    <div className="rutina">
      {flash && <div className="rutina-flash">{flash}</div>}
      {pillars.map((pillar) => (
        <PillarEditor key={pillar.id} value={pillar} onSave={save} onDelete={() => remove(pillar.id)} />
      ))}
      {draft ? (
        <PillarEditor value={draft} onSave={save} onDelete={() => setDraft(null)} isNew />
      ) : (
        <button className="rutina-add" onClick={() => setDraft(emptyPillar(pillars.length))}>+ nuevo pilar</button>
      )}
    </div>
  );
}

function PillarEditor({
  value, onSave, onDelete, isNew,
}: { value: PillarConfig; onSave: (pillar: PillarConfig) => void; onDelete: () => void; isNew?: boolean }) {
  const [pillar, setPillar] = useState(value);

  return (
    <div className="rit-card">
      <div className="rit-row">
        <input
          className="rit-label"
          placeholder="Nombre del pilar"
          value={pillar.label}
          onChange={(e) => setPillar({ ...pillar, label: e.target.value })}
        />
        <input
          type="color"
          value={pillar.color}
          onChange={(e) => setPillar({ ...pillar, color: e.target.value })}
          aria-label="Color del pilar"
        />
      </div>
      <div className="rit-actions">
        <button className="rit-save" disabled={!pillar.label.trim()} onClick={() => onSave(pillar)}>Guardar</button>
        <button className="rit-del" onClick={onDelete}>{isNew ? "Cancelar" : "Borrar"}</button>
      </div>
    </div>
  );
}
