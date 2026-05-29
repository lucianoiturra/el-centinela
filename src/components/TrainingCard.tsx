// src/components/TrainingCard.tsx
"use client";
import { useEffect, useState, useCallback } from "react";
import {
  getTrainingCardData,
  markSessionDone,
  saveSetLog,
  type TrainingCardData,
  type TodaySetEntry,
} from "@/app/actions/training";
import type { TrainingExercise } from "@/lib/types";
import { getQueue, enqueue, flushQueue, fmtDate, saveCache, loadCache } from "@/lib/offline-queue";

interface TrainingCardProps {
  date: Date;
  onSessionDone: (done: boolean) => void;
  onSessionLoaded: (hasSession: boolean) => void;
}

export default function TrainingCard({ date, onSessionDone, onSessionLoaded }: TrainingCardProps) {
  const [data, setData] = useState<TrainingCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // checks locales por ejercicio (optimistas)
  const [exChecks, setExChecks] = useState<Record<number, boolean>>({});
  // inputs de peso/reps por ejercicio: { [exerciseId]: { [setNumber]: {w, r, d} } }
  const [setInputs, setSetInputs] = useState<
    Record<number, Record<number, { w: string; r: string; d: string }>>
  >({});
  const { queueSetLog, queueSessionDone, pendingCount, synced } = useOfflineQueue();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const dateKey = fmtDate(date);

    function hydrate(d: TrainingCardData) {
      if (cancelled) return;
      setData(d);
      // "Requiere entrenamiento" solo si hay sesión real de bici/pesas.
      // El descanso activo no se marca como hecho, así que no debe bloquear el Día Ganado.
      onSessionLoaded(d.session !== null && d.session.activityType !== "rest");
      onSessionDone(d.done);
      const inputs: typeof setInputs = {};
      for (const [eid, sets] of Object.entries(d.todaySets)) {
        inputs[Number(eid)] = {};
        for (const s of sets) {
          inputs[Number(eid)][s.setNumber] = {
            w: s.weightKg != null ? String(s.weightKg) : "",
            r: s.repsCompleted != null ? String(s.repsCompleted) : "",
            d: s.durationSeconds != null ? String(s.durationSeconds) : "",
          };
        }
      }
      setSetInputs(inputs);
    }

    getTrainingCardData(date)
      .then((d) => {
        saveCache(dateKey, d);
        hydrate(d);
      })
      .catch(() => {
        const cached = loadCache<TrainingCardData>(dateKey);
        if (cached) hydrate(cached);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const toggleDone = useCallback(async () => {
    if (!data?.session) return;
    const next = !data.done;
    setData((d) => d ? { ...d, done: next } : d);
    onSessionDone(next);
    await queueSessionDone(date, data.session.id, next);
  }, [data, date, onSessionDone, queueSessionDone]);

  const toggleExCheck = useCallback((exId: number) => {
    setExChecks((c) => ({ ...c, [exId]: !c[exId] }));
  }, []);

  const handleSetBlur = useCallback(
    async (
      exId: number,
      setNumber: number,
      field: "w" | "r" | "d",
      value: string
    ) => {
      const num = value.trim() === "" ? null : Number(value);
      await queueSetLog(date, exId, setNumber, {
        weightKg: field === "w" ? num : undefined,
        repsCompleted: field === "r" ? num : undefined,
        durationSeconds: field === "d" ? num : undefined,
      });
    },
    [date, queueSetLog]
  );

  const updateInput = useCallback(
    (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => {
      setSetInputs((prev) => ({
        ...prev,
        [exId]: { ...prev[exId], [setNumber]: { ...(prev[exId]?.[setNumber] ?? { w: "", r: "", d: "" }), [field]: value } },
      }));
    },
    []
  );

  if (loading) {
    return (
      <div className="training-card" style={{ opacity: 0.5 }}>
        <div className="training-label">🚴 Entrenamiento</div>
        <div style={{ color: "var(--ink-dim)", fontSize: ".85rem" }}>Cargando…</div>
      </div>
    );
  }

  if (!data || !data.session) return null;

  const { session, exercises, done } = data;
  const isRest = session.activityType === "rest";
  const isBike = session.activityType === "bike";

  if (isRest) {
    return (
      <div className="training-card rest">
        <div className="training-label">🧘 Descanso activo</div>
        <div className="training-title">{session.title}</div>
        {session.description && <div className="training-meta">{session.description}</div>}
        {session.durationMin && <div className="training-meta">{session.durationMin} min</div>}
      </div>
    );
  }

  return (
    <div className={`training-card${done ? " done" : ""}`}>
      <div className="training-label">🚴 Entrenamiento · {session.activityType === "bike" ? "Bici" : "Pesas"}</div>
      <div className="training-title">{session.title}</div>
      <div className="training-meta">
        {session.durationMin && <>{session.durationMin} min</>}
        {session.intensity && <> · {intensityLabel(session.intensity)}</>}
      </div>

      {isBike && (
        <div className="training-params">
          {session.levelMin != null && `Nivel ${session.levelMin}${session.levelMax && session.levelMax !== session.levelMin ? `–${session.levelMax}` : ""}`}
          {session.rpmMin != null && ` · ${session.rpmMin}${session.rpmMax && session.rpmMax !== session.rpmMin ? `–${session.rpmMax}` : ""} RPM`}
          {session.wattsRef && ` · ${session.wattsRef}`}
        </div>
      )}

      {session.description && <div className="training-meta" style={{ marginTop: 8, fontStyle: "italic" }}>{session.description}</div>}

      {!isBike && exercises.length > 0 && (
        <>
          <button className="training-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "▲ Ocultar ejercicios" : "▶ Ver ejercicios"}
          </button>
          {expanded && (
            <ExerciseList
              exercises={exercises}
              checks={exChecks}
              setInputs={setInputs}
              lastSets={data.lastSets}
              onToggle={toggleExCheck}
              onSetBlur={handleSetBlur}
              onInputChange={updateInput}
            />
          )}
        </>
      )}

      {done ? (
        <div className="training-badge">
          <span>✅ Sesión completada</span>
          <button className="training-badge-undo" onClick={toggleDone}>deshacer</button>
        </div>
      ) : (
        <button className={`training-done-btn${done ? " on" : ""}`} onClick={toggleDone}>
          ✓ Marcar sesión hecha
        </button>
      )}
      {pendingCount > 0 && (
        <div className="training-offline-banner">
          {pendingCount} cambio{pendingCount > 1 ? "s" : ""} pendiente{pendingCount > 1 ? "s" : ""} · sin conexión
        </div>
      )}
      {synced && (
        <div className="training-offline-banner synced">✓ Sincronizado</div>
      )}
    </div>
  );
}

function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [synced, setSynced] = useState(false);

  const flush = useCallback(async () => {
    const before = getQueue().length;
    if (before === 0) return;
    const remaining = await flushQueue(saveSetLog, markSessionDone);
    setPendingCount(remaining);
    if (remaining === 0) setSynced(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // saveSetLog and markSessionDone are stable module-level imports

  useEffect(() => {
    setPendingCount(getQueue().length);
    flush();
  }, [flush]);

  useEffect(() => {
    if (!synced) return;
    const t = setTimeout(() => setSynced(false), 2000);
    return () => clearTimeout(t);
  }, [synced]);

  useEffect(() => {
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  const queueSetLog = useCallback(
    async (
      date: Date,
      exerciseId: number,
      setNumber: number,
      data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
    ) => {
      try {
        await saveSetLog(date, exerciseId, setNumber, data);
      } catch {
        enqueue({
          type: "setLog",
          date: fmtDate(date),
          exerciseId,
          setNumber,
          weightKg: data.weightKg ?? null,
          repsCompleted: data.repsCompleted ?? null,
          durationSeconds: data.durationSeconds ?? null,
        });
        setPendingCount((n) => n + 1);
      }
    },
    []
  );

  const queueSessionDone = useCallback(
    async (date: Date, sessionTemplateId: number, done: boolean) => {
      try {
        await markSessionDone(date, sessionTemplateId, done);
      } catch {
        enqueue({
          type: "sessionDone",
          date: fmtDate(date),
          sessionTemplateId,
          done,
        });
        setPendingCount((n) => n + 1);
      }
    },
    []
  );

  return { queueSetLog, queueSessionDone, pendingCount, synced };
}

function intensityLabel(intensity: string): string {
  const map: Record<string, string> = {
    low: "Baja", moderate: "Moderada", high: "Alta", very_high: "Muy alta", rest: "Descanso",
  };
  return map[intensity] ?? intensity;
}

function ExerciseList({
  exercises, checks, setInputs, lastSets, onToggle, onSetBlur, onInputChange,
}: {
  exercises: TrainingExercise[];
  checks: Record<number, boolean>;
  setInputs: Record<number, Record<number, { w: string; r: string; d: string }>>;
  lastSets: TrainingCardData["lastSets"];
  onToggle: (id: number) => void;
  onSetBlur: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
  onInputChange: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
}) {
  return (
    <div className="training-exercises">
      {exercises.map((ex) => (
        <ExerciseRow
          key={ex.id}
          exercise={ex}
          checked={!!checks[ex.id]}
          inputs={setInputs[ex.id] ?? {}}
          lastSet={lastSets[ex.id] ?? null}
          onToggle={() => onToggle(ex.id)}
          onSetBlur={onSetBlur}
          onInputChange={onInputChange}
        />
      ))}
    </div>
  );
}

function ExerciseRow({
  exercise, checked, inputs, lastSet, onToggle, onSetBlur, onInputChange,
}: {
  exercise: TrainingExercise;
  checked: boolean;
  inputs: Record<number, { w: string; r: string; d: string }>;
  lastSet: { weightKg: number | null; repsCompleted: number | null; durationSeconds: number | null } | null;
  onToggle: () => void;
  onSetBlur: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
  onInputChange: (exId: number, setNumber: number, field: "w" | "r" | "d", value: string) => void;
}) {
  const isIsometric = exercise.repsLabel.includes("seg");
  const sets = exercise.sets;

  const lastSetText = lastSet
    ? lastSet.weightKg != null
      ? `última vez: ${lastSet.weightKg} kg × ${lastSet.repsCompleted ?? "?"} reps`
      : lastSet.durationSeconds != null
      ? `última vez: ${lastSet.durationSeconds} seg`
      : null
    : "primera vez";

  return (
    <div className={`training-ex${checked ? " checked" : ""}`}>
      <div className="training-ex-head" onClick={onToggle}>
        <div className={`training-ex-check${checked ? " on" : ""}`}>{checked ? "✓" : ""}</div>
        <div>
          <div className="training-ex-name">{exercise.name}</div>
          <div className="training-ex-detail">
            {sets} series · {exercise.repsLabel}
            {exercise.restSeconds && ` · ${exercise.restSeconds} seg descanso`}
          </div>
          {exercise.notes && (
            <div className="training-ex-detail" style={{ color: "var(--ink-faint)", marginTop: 2 }}>
              {exercise.notes}
            </div>
          )}
        </div>
      </div>

      {/* Sets con inputs de peso/reps */}
      {Array.from({ length: sets }, (_, i) => i + 1).map((setNum) => {
        const vals = inputs[setNum] ?? { w: "", r: "", d: "" };
        return (
          <div className="training-ex-inputs" key={setNum} onClick={(e) => e.stopPropagation()}>
            <span style={{ fontSize: ".72rem", color: "var(--ink-faint)", alignSelf: "flex-end", paddingBottom: 6, minWidth: 36 }}>
              Set {setNum}
            </span>
            {!isIsometric ? (
              <>
                <div className="training-ex-field">
                  <label>Peso (kg)</label>
                  <input
                    type="number"
                    value={vals.w}
                    onChange={(e) => onInputChange(exercise.id, setNum, "w", e.target.value)}
                    onBlur={(e) => onSetBlur(exercise.id, setNum, "w", e.target.value)}
                    placeholder="–"
                  />
                </div>
                <div className="training-ex-field">
                  <label>Reps</label>
                  <input
                    type="number"
                    value={vals.r}
                    onChange={(e) => onInputChange(exercise.id, setNum, "r", e.target.value)}
                    onBlur={(e) => onSetBlur(exercise.id, setNum, "r", e.target.value)}
                    placeholder="–"
                  />
                </div>
              </>
            ) : (
              <div className="training-ex-field">
                <label>Seg</label>
                <input
                  type="number"
                  value={vals.d}
                  onChange={(e) => onInputChange(exercise.id, setNum, "d", e.target.value)}
                  onBlur={(e) => onSetBlur(exercise.id, setNum, "d", e.target.value)}
                  placeholder="–"
                />
              </div>
            )}
          </div>
        );
      })}

      {lastSetText && <div className="training-ex-prev">{lastSetText}</div>}
    </div>
  );
}
