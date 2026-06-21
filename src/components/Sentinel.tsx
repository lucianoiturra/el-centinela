"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { CalendarEvent, type PillarConfig, Ritual, RitualPhase, RoutineRitual } from "@/lib/types";
import { getRoutineRituals, isSabbath } from "@/lib/rituals";
import { getFinanceRituals } from "@/lib/finance";
import { getRoutine } from "@/app/actions/routine";
import { getPillars } from "@/app/actions/pillar";
import { getCyclePhase } from "@/lib/cycle";
import { sprintLabel } from "@/lib/sprint";
import { PHASE_META, bgGradient, fmtRem, getFocus, nowMinutes, phaseOf } from "@/lib/time";
import {
  getDayState,
  getDayChecks,
  getMonthChain,
  saveTaa as saveTaaAction,
  markTaaDone as markTaaDoneAction,
  setTaskCheck as setTaskCheckAction,
  getLatestCycleStart,
  saveLineaEspiritual as saveLineaAction,
} from "@/app/actions/day";
import { pruneOldKeys } from "@/lib/offline-queue";
import DayDetail from "@/components/DayDetail";
import TrainingCard from "@/components/TrainingCard";
import { getFallbackPillarColor } from "@/lib/pillars";

const DSHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DFULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dk = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => dk(a) === dk(b);

// localStorage solo para preferencias de sesión (taaskip) — no para datos persistentes
const lsGet = (k: string) => (typeof window === "undefined" ? null : localStorage.getItem("cent_" + k));
const lsSet = (k: string, v: string) => typeof window !== "undefined" && localStorage.setItem("cent_" + k, v);

export default function Sentinel() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [taa, setTaaState] = useState("");
  const [taaDone, setTaaDone] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [chainData, setChainData] = useState<{ date: string; won: boolean }[]>([]);
  const [yestHadTaa, setYestHadTaa] = useState(false);
  const [yestDone, setYestDone] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [gateValue, setGateValue] = useState("");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const { status } = useSession();
  // Estado del puente con Google Calendar: si necesitamos reautenticar mostramos el aviso.
  const [calReauth, setCalReauth] = useState(false);
  const [routine, setRoutine] = useState<RoutineRitual[] | null>(null);
  const [pillars, setPillars] = useState<PillarConfig[]>([]);
  const [cycleInfo, setCycleInfo] = useState<{ date: string; length: number } | null>(null);
  const [linea, setLinea] = useState("");
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [trainingDone, setTrainingDone] = useState(false);
  const [trainingRequired, setTrainingRequired] = useState(false);
  // Hasta que TrainingCard reporta, no sabemos si hoy exige entrenamiento. Sin esto,
  // con la TAA cumplida se mostraba "Día Ganado" un instante antes de revertirlo.
  const [trainingLoaded, setTrainingLoaded] = useState(false);

  const today = useMemo(() => startOfDay(now), [now]);
  const ds = dk(today);
  const sabbath = isSabbath(today);
  const min = nowMinutes(now);

  const rituals: Ritual[] = useMemo(
    () => [
      ...(routine ? getRoutineRituals(today, routine) : []),
      ...getFinanceRituals(today),
    ],
    [today, routine]
  );
  const focus = useMemo(() => getFocus(rituals, min, sabbath), [rituals, min, sabbath]);
  const cycle = useMemo(
    () =>
      cycleInfo
        ? getCyclePhase(today, new Date(cycleInfo.date + "T00:00:00"), cycleInfo.length)
        : getCyclePhase(today),
    [today, cycleInfo]
  );
  const pillarColors = useMemo(
    () => Object.fromEntries(pillars.map((pillar) => [pillar.id, pillar.color])),
    [pillars]
  );

  // ── Mount: reloj ──
  useEffect(() => {
    // Hydration gate + reloj de pared: sincronización legítima con estado del
    // navegador post-hidratación, no derivable durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setNow(new Date());
    // Podar datos viejos de localStorage (claves con fecha de >30 días).
    pruneOldKeys(dk(new Date()));
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  // ── Cargar estado del día desde DB ──
  useEffect(() => {
    if (!mounted) return;

    const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

    Promise.all([
      getDayState(dk(today)),
      getDayChecks(dk(today)),
      getMonthChain(today.getFullYear(), today.getMonth()),
      getDayState(dk(yest)),
    ])
      .then(([dayState, dayChecks, chain, yestState]) => {
        setTaaState(dayState.taa ?? "");
        setTaaDone(dayState.taa_done);
        setLinea(dayState.linea ?? "");
        setTrainingDone(dayState.training_done === true);
        setChecks(dayChecks);
        setChainData(chain);
        setYestHadTaa(!!yestState.taa);
        setYestDone(yestState.taa_done);
        // Compuerta TAA: abre si no hay TAA y no se saltó hoy
        if (!sabbath && !dayState.taa && lsGet("taaskip_" + ds) !== "1") {
          setGateOpen(true);
        }
      })
      .catch((err) => {
        console.error("Error cargando estado del día desde DB:", err);
        // Fallback a localStorage si la sesión expiró o DB no está disponible
        setTaaState(lsGet("taa_" + ds) ?? "");
        setTaaDone(lsGet("won_" + ds) === "1");
        const c: Record<string, boolean> = {};
        for (const r of rituals) c[r.id] = lsGet(`task_${ds}_${r.id}`) === "1";
        setChecks(c);
        if (!sabbath && !lsGet("taa_" + ds) && lsGet("taaskip_" + ds) !== "1") {
          setGateOpen(true);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ds, reloadKey]);

  // ── Eventos de Google Calendar (Fase 6) ──
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    // Ventana del día LOCAL del usuario (el servidor corre en UTC y no la conoce).
    const start = new Date(`${ds}T00:00:00`);
    const end = new Date(`${ds}T23:59:59.999`);
    const qs = `?timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
    fetch("/api/calendar" + qs)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setCalReauth(true); // sesión/refresh token vencido → reconectar
          return;
        }
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        setEvents(data.events ?? []);
        setCalReauth(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, ds]);

  // ── Rutina del usuario (DB) ──
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getRoutine()
      .then((r) => { if (!cancelled) setRoutine(r); })
      .catch((e) => { if (!cancelled) { console.error("Error cargando rutina:", e); setRoutine([]); } });
    return () => { cancelled = true; };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getPillars()
      .then((data) => { if (!cancelled) setPillars(data); })
      .catch((e) => { if (!cancelled) console.error("Error cargando pilares:", e); });
    return () => { cancelled = true; };
  }, [mounted]);

  // ── Ciclo de Michelle (DB) ──
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    getLatestCycleStart()
      .then((info) => { if (!cancelled) setCycleInfo(info); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mounted]);

  // ── Fondo dinámico ──
  useEffect(() => {
    if (!mounted) return;
    const [a, b] = bgGradient(min, sabbath);
    document.body.style.background = `linear-gradient(165deg, ${a}, ${b})`;
    document.body.classList.toggle("sabbath", sabbath);
    document.body.classList.toggle("night", !sabbath && (min < 360 || min >= 1080));
  }, [min, sabbath, mounted]);

  // ── Acciones (optimistas: UI instantánea, DB en background) ──

  const toggleCheck = useCallback(
    (id: string) => {
      const next = !checks[id];
      setChecks((c) => ({ ...c, [id]: next }));
      setTaskCheckAction(dk(today), id, next).catch(console.error);
    },
    [checks, today]
  );

  const saveLinea = useCallback(
    (text: string) => {
      setLinea(text);
      saveLineaAction(dk(today), text).catch(console.error);
    },
    [today]
  );

  const toggleWon = useCallback(() => {
    const next = !taaDone;
    setTaaDone(next);
    const newWon = next && trainingLoaded && (trainingDone || !trainingRequired);
    // Actualizar la cadena del mes optimísticamente
    setChainData((prev) => {
      const existing = prev.findIndex((r) => r.date === ds);
      if (existing >= 0) return prev.map((r, i) => (i === existing ? { ...r, won: newWon } : r));
      return newWon ? [...prev, { date: ds, won: true }] : prev;
    });
    markTaaDoneAction(dk(today), next).catch(console.error);
  }, [taaDone, trainingLoaded, trainingDone, trainingRequired, today, ds]);

  const dayWon = taaDone && trainingLoaded && (trainingDone || !trainingRequired);
  // Mostrar "falta el entrenamiento" solo cuando lo sabemos con certeza.
  const trainingPending = taaDone && trainingLoaded && trainingRequired && !trainingDone;

  const handleTrainingDone = useCallback((done: boolean) => {
    setTrainingDone(done);
  }, []);

  const handleSessionLoaded = useCallback((hasSession: boolean) => {
    setTrainingRequired(hasSession);
    setTrainingLoaded(true);
  }, []);

  const saveTaa = useCallback(() => {
    const v = gateValue.trim();
    if (v) {
      setTaaState(v);
      saveTaaAction(dk(today), v).catch(console.error);
    }
    setGateOpen(false);
  }, [gateValue, today]);

  const skipGate = useCallback(() => {
    lsSet("taaskip_" + ds, "1"); // preferencia de sesión, no datos
    setGateOpen(false);
  }, [ds]);

  const openGate = useCallback(
    (edit?: boolean) => {
      setGateValue(edit ? taa : "");
      setGateOpen(true);
    },
    [taa]
  );

  if (!mounted) {
    return <div className="wrap" style={{ minHeight: "100vh" }} />;
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">El&nbsp;<b>Centinela</b></div>
        <div className="clock">
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          <span className="date">{DSHORT[now.getDay()]} {now.getDate()} {MONTHS[now.getMonth()]}</span>
        </div>
        <Link href="/configuracion" className="gear" aria-label="Configuración">⚙</Link>
      </div>

      <Hero
        focus={focus}
        sabbath={sabbath}
        taa={taa}
        taaDone={taaDone}
        won={dayWon}
        trainingPending={trainingPending}
        cycle={cycle}
        min={min}
        today={today}
        yestHadTaa={yestHadTaa}
        yestDone={yestDone}
        onToggleWon={toggleWon}
        onEditTaa={() => openGate(true)}
        onOpenGate={() => openGate(false)}
      />

      <TrainingCard
        date={today}
        onSessionDone={handleTrainingDone}
        onSessionLoaded={handleSessionLoaded}
      />

      {routine === null ? (
        <div className="spine"><div className="spine-title">La espina de hoy</div><div className="node" style={{ opacity: .4 }}>Cargando rutina…</div></div>
      ) : (
        <Spine
          rituals={[...rituals, ...eventsToRituals(events)]}
          checks={checks}
          pillarColors={pillarColors}
          min={min}
          onToggle={toggleCheck}
          showConnect={status !== "authenticated" || calReauth}
          connectLabel={calReauth ? "Reconectar calendario" : "Conectar calendario"}
          onConnect={() => signIn("google", { callbackUrl: "/" })}
          lineaValue={linea}
          onLineaSave={saveLinea}
        />
      )}

      <Chain today={today} chainData={chainData} cycleInfo={cycleInfo} onPick={setDetailDate} />

      {gateOpen && (
        <div className="gate">
          <div className="gate-card">
            <div className="gate-eyebrow">Antes de empezar</div>
            <div className="gate-q">¿Cuál es tu TAA de hoy?</div>
            <div className="gate-hint">
              Tu Tarea de Alto Apalancamiento: la que mueve la aguja, no la que te hace sentir ocupado.
              Decidir sobre la marcha es la barrera.
            </div>
            <input
              className="gate-input"
              autoFocus
              value={gateValue}
              placeholder="Ej: Cerrar render exterior Mario Barra"
              onChange={(e) => setGateValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveTaa()}
            />
            <div className="gate-actions">
              <button className="gate-go" onClick={saveTaa}>Fijar mi norte →</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="gate-skip" onClick={skipGate}>Hoy no tengo trabajo (saltar)</button>
            </div>
          </div>
        </div>
      )}

      {detailDate && (
        <DayDetail
          date={detailDate}
          routine={routine ?? []}
          onClose={() => { setDetailDate(null); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

// ── Eventos de Calendar → rituales tejibles (Fase 6) ──
function eventsToRituals(events: CalendarEvent[]): Ritual[] {
  return events.map((e) => {
    const start = new Date(e.startISO);
    const m = e.allDay ? 0 : start.getHours() * 60 + start.getMinutes();
    const phase: RitualPhase = m < 780 ? "manana" : m < 1080 ? "tarde" : "noche";
    return {
      id: "ev-" + e.id,
      label: e.summary,
      icon: "📅",
      pillar: "cab",
      phase,
      startMin: e.allDay ? undefined : m,
      time: e.allDay ? undefined : `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      source: "calendar" as const,
    };
  });
}

// Minuto base de cada franja: los rituales sin hora se mantienen al inicio de su franja
// (orden manual estable), y los que tienen hora se intercalan cronológicamente.
const PHASE_FLOOR: Record<RitualPhase, number> = { manana: 0, tarde: 780, noche: 1080 };

// ════════════════ HERO ════════════════
type Cycle = ReturnType<typeof getCyclePhase>;
function Hero(props: {
  focus: ReturnType<typeof getFocus>;
  sabbath: boolean;
  taa: string;
  taaDone: boolean;
  won: boolean;
  trainingPending: boolean;
  cycle: Cycle;
  min: number;
  today: Date;
  yestHadTaa: boolean;
  yestDone: boolean;
  onToggleWon: () => void;
  onEditTaa: () => void;
  onOpenGate: () => void;
}) {
  const { focus, sabbath, taa, taaDone, cycle, min, today, yestHadTaa, yestDone } = props;
  const ph = PHASE_META[phaseOf(min)];

  const norte = (
    <div className="taa-norte">
      <div className="q">Tu norte hoy · TAA</div>
      {taa ? (
        <div className="taa-text">{taa}</div>
      ) : (
        <div className="taa-empty">
          Aún no defines tu TAA — <a onClick={props.onOpenGate}>fíjala ahora</a>
        </div>
      )}
    </div>
  );

  return (
    <div className={`hero${sabbath ? " sabbath" : ""}${!sabbath && props.won ? " won" : ""}`}>
      {sabbath ? (
        <div className="hero-phase" style={{ color: "#6ee7b7" }}>✡ Sábado Santo · {DFULL[today.getDay()]}</div>
      ) : (
        <div className="hero-phase"><span className="pulse" />{ph.icon} {ph.name} · {DFULL[today.getDay()]}</div>
      )}

      {focus.mode === "sabbath" && (
        <>
          <div className="hero-label">Reposo</div>
          <div className="verse">
            «Acuérdate del día de reposo para santificarlo… el séptimo día es reposo para Jehová tu Dios.»
            <cite>Éxodo 20:8-10</cite>
          </div>
          <div className="hero-sub">Sin trabajo, sin ejercicio, sin pantallas laborales. Hoy descansas con Dios y con Michelle.</div>
        </>
      )}
      {focus.mode === "madrugada" && (
        <>
          <div className="hero-label">Es madrugada</div>
          <div className="madrugada-msg">Tu meta de salud empieza durmiendo.</div>
          <div className="hero-sub">El pico de las 2am es lo que te roba el sueño y la mañana. Pantallas off.</div>
        </>
      )}
      {focus.mode === "inblock" && (
        <>
          <div className="hero-label">Ahora</div>
          <div className="hero-focus">{focus.ritual.icon} {focus.ritual.label}</div>
          <div className="countdown">⏳ quedan {fmtRem(focus.remaining)}</div>
        </>
      )}
      {focus.mode === "upcoming" && (
        <>
          <div className="hero-label">En {fmtRem(focus.until)}</div>
          <div className="hero-focus">{focus.ritual.icon} {focus.ritual.label}</div>
          {norte}
        </>
      )}
      {focus.mode === "norte" && norte}

      {!sabbath && (props.won ? (
        <>
          <div className="dg">
            <div className="won-banner">🏆 Día Ganado <small>TAA + entrenamiento — esto mueve la aguja</small></div>
          </div>
          <div className="dg" style={{ marginTop: 10 }}>
            <button className="dg-btn on" onClick={props.onToggleWon}><span className="box">✓</span>TAA cumplida</button>
            <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
          </div>
        </>
      ) : taa ? (
        <>
          <div className="dg">
            <button className={`dg-btn${taaDone ? " on" : ""}`} onClick={props.onToggleWon}>
              <span className="box">{taaDone ? "✓" : ""}</span>{taaDone ? "TAA cumplida" : "Marcar TAA cumplida"}
            </button>
            <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
          </div>
          {props.trainingPending && (
            <div className="dg-pending">⏳ TAA lista — falta el entrenamiento para ganar el día.</div>
          )}
        </>
      ) : null)}

      <HeroFoot
        cycle={cycle}
        today={today}
        taaDone={taaDone}
        yestHadTaa={yestHadTaa}
        yestDone={yestDone}
      />
    </div>
  );
}

function HeroFoot({
  cycle, today, taaDone, yestHadTaa, yestDone,
}: {
  cycle: Cycle;
  today: Date;
  taaDone: boolean;
  yestHadTaa: boolean;
  yestDone: boolean;
}) {
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yestLost = yest.getDay() !== 6 && yestHadTaa && !yestDone;

  if (!cycle && !yestLost) return null;
  return (
    <div className="hero-foot">
      {cycle && (
        <div className="mchip">
          {cycle.icon} <span>Michelle:</span>
          <b style={{ color: cycle.color }}>{cycle.name}</b>
          <span style={{ opacity: 0.6 }}>· día {cycle.dayInCycle}</span>
        </div>
      )}
      {yestLost && !taaDone && (
        <div className="vicblaz"><span>⚔</span><span>Ayer no cerraste tu TAA. Hoy es la segunda batalla — esa no se pierde.</span></div>
      )}
    </div>
  );
}

// Campo para anotar la "1 línea espiritual" del cierre (se guarda al salir del campo)
function CierreLinea({ value, onSave }: { value: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(value);
  const [saved, setSaved] = useState(false);
  // Resetear el texto cuando cambia la prop `value` (otro día / recarga): patrón
  // oficial de derived-state-en-render, evita el setState-en-efecto.
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const save = () => {
    if (text.trim() === value.trim()) return;
    onSave(text.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="linea" onClick={(e) => e.stopPropagation()}>
      <textarea
        className="linea-input"
        rows={2}
        placeholder="Tu línea espiritual de hoy…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
      />
      {saved && <span className="linea-saved">✓ guardado</span>}
    </div>
  );
}

// ════════════════ SPINE ════════════════
function Spine({
  rituals, checks, min, onToggle, showConnect, connectLabel, onConnect, lineaValue, onLineaSave,
  pillarColors,
}: {
  rituals: Ritual[];
  checks: Record<string, boolean>;
  pillarColors: Record<string, string>;
  min: number;
  onToggle: (id: string) => void;
  showConnect: boolean;
  connectLabel: string;
  onConnect: () => void;
  lineaValue: string;
  onLineaSave: (t: string) => void;
}) {
  const order: RitualPhase[] = ["manana", "tarde", "noche"];
  const curPhase = phaseOf(min);
  const curIdx = curPhase === "madrugada" ? -1 : order.indexOf(curPhase as RitualPhase);

  return (
    <div className="spine">
      <div className="spine-head">
        <div className="spine-title">La espina de hoy</div>
        {showConnect && (
          <button className="cal-connect" onClick={onConnect}>📅 {connectLabel}</button>
        )}
      </div>
      {order.map((phid, idx) => {
        const items = rituals
          .filter((r) => r.phase === phid)
          .sort((a, b) => (a.startMin ?? PHASE_FLOOR[phid]) - (b.startMin ?? PHASE_FLOOR[phid]));
        if (!items.length) return null;
        const cls = idx === curIdx ? "current" : idx < curIdx ? "past" : "";
        return (
          <div className={`phase ${cls}`} key={phid}>
            <div className="phase-head">{PHASE_META[phid].icon} {PHASE_META[phid].name}</div>
            {items.map((r) => {
              const done = !!checks[r.id];
              return (
                <Fragment key={r.id}>
                  <div
                    className={`node${done ? " done" : ""}${r.hard ? " hard" : ""}${r.optional ? " opt" : ""}`}
                    onClick={() => onToggle(r.id)}
                  >
                    <div className="node-box">{done ? "✓" : ""}</div>
                    <div className="node-t">
                      <span className="acc" style={{ background: pillarColors[r.pillar] ?? getFallbackPillarColor(r.pillar) }} />
                      {r.icon} {r.label}
                      {r.time && <span className="node-time">{r.time}</span>}
                      {r.source === "calendar" && <span className="tag calendar">calendar</span>}
                      {r.source === "finance" && <span className="tag finanzas">finanzas</span>}
                    </div>
                  </div>
                  {r.id === "cierre" && <CierreLinea value={lineaValue} onSave={onLineaSave} />}
                </Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════ CHAIN (mes actual) ════════════════
function Chain({ today, chainData, cycleInfo, onPick }: { today: Date; chainData: { date: string; won: boolean }[]; cycleInfo: { date: string; length: number } | null; onPick: (date: Date) => void }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const cycleStart = cycleInfo ? new Date(cycleInfo.date + "T00:00:00") : undefined;

  // Mapa rápido de fecha → won
  const wonMap = new Map(chainData.map((r) => [r.date, r.won]));

  const cells: { d: number; status: string; cyc: string | null; editable: boolean }[] = [];
  let won = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const dateKey = dk(date);
    let status: string;
    if (date.getDay() === 6) status = "sabbath";
    else if (date > today) status = "future";
    else if (sameDay(date, today)) status = "today";
    else status = wonMap.get(dateKey) === true ? "won" : "lost";
    if (status === "won") won++;
    const cyc = getCyclePhase(date, cycleStart, cycleInfo?.length);
    cells.push({ d, status, cyc: cyc ? cyc.color : null, editable: date <= today });
  }
  const label = (s: string) => (s === "won" ? "✓" : s === "lost" ? "✗" : s === "sabbath" ? "✡" : s === "today" ? "●" : "");

  return (
    <div className="chain-wrap">
      <div className="chain-head">
        <h3>La cadena · {MONTHS[month]} {year} · {sprintLabel(today)}</h3>
        <div className="streak">🏆 {won} día{won === 1 ? "" : "s"} ganado{won === 1 ? "" : "s"}</div>
      </div>
      <div className="chain">
        {cells.map((c) => (
          <div
            className={`cdot ${c.status}${c.editable ? " editable" : ""}`}
            key={c.d}
            title={`${c.d} ${MONTHS[month]}`}
            onClick={c.editable ? () => onPick(new Date(year, month, c.d)) : undefined}
          >
            <span className="num">{c.d}</span>
            {label(c.status)}
            {c.cyc && <span className="cycle-strip" style={{ background: c.cyc }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
