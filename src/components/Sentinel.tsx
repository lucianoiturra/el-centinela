"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarEvent, PILLAR_COLORS, Ritual, RitualPhase } from "@/lib/types";
import { DEFAULT_ROUTINE, getRoutineRituals, isSabbath } from "@/lib/rituals";
import { getFinanceRituals } from "@/lib/finance";
import { getCyclePhase } from "@/lib/cycle";
import { sprintLabel } from "@/lib/sprint";
import { PHASE_META, bgGradient, fmtRem, getFocus, nowMinutes, phaseOf } from "@/lib/time";

const DSHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const DFULL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const dk = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => dk(a) === dk(b);

// ── localStorage (provisional; Fase 5 lo reemplaza por Postgres) ──
const lsGet = (k: string) => (typeof window === "undefined" ? null : localStorage.getItem("cent_" + k));
const lsSet = (k: string, v: string) => typeof window !== "undefined" && localStorage.setItem("cent_" + k, v);
const lsDel = (k: string) => typeof window !== "undefined" && localStorage.removeItem("cent_" + k);

export default function Sentinel() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState<Date>(new Date());
  const [taa, setTaaState] = useState("");
  const [taaDone, setTaaDone] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [gateOpen, setGateOpen] = useState(false);
  const [gateValue, setGateValue] = useState("");
  const [events] = useState<CalendarEvent[]>([]); // Fase 6: Google Calendar

  const today = useMemo(() => startOfDay(now), [now]);
  const ds = dk(today);
  const sabbath = isSabbath(today);
  const min = nowMinutes(now);

  const rituals: Ritual[] = useMemo(
    () => [...getRoutineRituals(today, DEFAULT_ROUTINE), ...getFinanceRituals(today)],
    [today]
  );
  const focus = useMemo(() => getFocus(rituals, min, sabbath), [rituals, min, sabbath]);
  const cycle = useMemo(() => getCyclePhase(today), [today]);

  // ── Mount: cargar estado del día ──
  useEffect(() => {
    setMounted(true);
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setTaaState(lsGet("taa_" + ds) ?? "");
    setTaaDone(lsGet("won_" + ds) === "1");
    const c: Record<string, boolean> = {};
    for (const r of rituals) c[r.id] = lsGet(`task_${ds}_${r.id}`) === "1";
    setChecks(c);
    // Compuerta TAA
    if (!sabbath && !lsGet("taa_" + ds) && lsGet("taaskip_" + ds) !== "1") {
      setGateOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, ds]);

  // ── Fondo dinámico ──
  useEffect(() => {
    if (!mounted) return;
    const [a, b] = bgGradient(min, sabbath);
    document.body.style.background = `linear-gradient(165deg, ${a}, ${b})`;
    document.body.classList.toggle("sabbath", sabbath);
    document.body.classList.toggle("night", !sabbath && (min < 360 || min >= 1080));
  }, [min, sabbath, mounted]);

  const toggleCheck = useCallback(
    (id: string) => {
      const next = !checks[id];
      setChecks((c) => ({ ...c, [id]: next }));
      if (next) lsSet(`task_${ds}_${id}`, "1");
      else lsDel(`task_${ds}_${id}`);
    },
    [checks, ds]
  );

  const toggleWon = useCallback(() => {
    const next = !taaDone;
    setTaaDone(next);
    if (next) lsSet("won_" + ds, "1");
    else lsDel("won_" + ds);
  }, [taaDone, ds]);

  const saveTaa = useCallback(() => {
    const v = gateValue.trim();
    if (v) {
      lsSet("taa_" + ds, v);
      lsDel("taaskip_" + ds);
      setTaaState(v);
    }
    setGateOpen(false);
  }, [gateValue, ds]);

  const skipGate = useCallback(() => {
    lsSet("taaskip_" + ds, "1");
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
      </div>

      <Hero
        focus={focus}
        sabbath={sabbath}
        taa={taa}
        taaDone={taaDone}
        cycle={cycle}
        min={min}
        today={today}
        onToggleWon={toggleWon}
        onEditTaa={() => openGate(true)}
        onOpenGate={() => openGate(false)}
      />

      <Spine rituals={[...rituals, ...eventsToRituals(events)]} checks={checks} min={min} onToggle={toggleCheck} />

      <Chain today={today} />

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
      time: e.allDay ? undefined : `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`,
      source: "calendar" as const,
    };
  });
}

// ════════════════ HERO ════════════════
type Cycle = ReturnType<typeof getCyclePhase>;
function Hero(props: {
  focus: ReturnType<typeof getFocus>;
  sabbath: boolean;
  taa: string;
  taaDone: boolean;
  cycle: Cycle;
  min: number;
  today: Date;
  onToggleWon: () => void;
  onEditTaa: () => void;
  onOpenGate: () => void;
}) {
  const { focus, sabbath, taa, taaDone, cycle, min, today } = props;
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
    <div className={`hero${sabbath ? " sabbath" : ""}${!sabbath && taaDone ? " won" : ""}`}>
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

      {!sabbath && (taaDone ? (
        <>
          <div className="dg">
            <div className="won-banner">🏆 Día Ganado <small>cerraste tu TAA — esto mueve la aguja</small></div>
          </div>
          <div className="dg" style={{ marginTop: 10 }}>
            <button className="dg-btn on" onClick={props.onToggleWon}><span className="box">✓</span>TAA cumplida</button>
            <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
          </div>
        </>
      ) : taa ? (
        <div className="dg">
          <button className="dg-btn" onClick={props.onToggleWon}><span className="box" />Marcar TAA cumplida</button>
          <button className="dg-edit" onClick={props.onEditTaa}>editar TAA</button>
        </div>
      ) : null)}

      <HeroFoot cycle={cycle} today={today} taaDone={taaDone} />
    </div>
  );
}

function HeroFoot({ cycle, today, taaDone }: { cycle: Cycle; today: Date; taaDone: boolean }) {
  // Vicblaz: ¿ayer (día laboral) quedó sin cerrar?
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const yestLost =
    yest.getDay() !== 6 &&
    typeof window !== "undefined" &&
    !!lsGet("taa_" + dk(yest)) &&
    lsGet("won_" + dk(yest)) !== "1";

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

// ════════════════ SPINE ════════════════
function Spine({
  rituals, checks, min, onToggle,
}: { rituals: Ritual[]; checks: Record<string, boolean>; min: number; onToggle: (id: string) => void; }) {
  const order: RitualPhase[] = ["manana", "tarde", "noche"];
  const curPhase = phaseOf(min);
  const curIdx = curPhase === "madrugada" ? -1 : order.indexOf(curPhase as RitualPhase);

  return (
    <div className="spine">
      <div className="spine-title">La espina de hoy</div>
      {order.map((phid, idx) => {
        const items = rituals.filter((r) => r.phase === phid);
        if (!items.length) return null;
        const cls = idx === curIdx ? "current" : idx < curIdx ? "past" : "";
        return (
          <div className={`phase ${cls}`} key={phid}>
            <div className="phase-head">{PHASE_META[phid].icon} {PHASE_META[phid].name}</div>
            {items.map((r) => {
              const done = !!checks[r.id];
              return (
                <div
                  key={r.id}
                  className={`node${done ? " done" : ""}${r.hard ? " hard" : ""}${r.optional ? " opt" : ""}`}
                  onClick={() => onToggle(r.id)}
                >
                  <div className="node-box">{done ? "✓" : ""}</div>
                  <div className="node-t">
                    <span className="acc" style={{ background: PILLAR_COLORS[r.pillar] }} />
                    {r.icon} {r.label}
                    {r.time && <span className="node-time">{r.time}</span>}
                    {r.source === "calendar" && <span className="tag calendar">calendar</span>}
                    {r.source === "finance" && <span className="tag finanzas">finanzas</span>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ════════════════ CHAIN (mes actual) ════════════════
function Chain({ today }: { today: Date }) {
  const year = today.getFullYear();
  const month = today.getMonth();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: { d: number; status: string; cyc: string | null }[] = [];
  let won = 0;
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    let status: string;
    if (date.getDay() === 6) status = "sabbath";
    else if (date > today) status = "future";
    else if (sameDay(date, today)) status = "today";
    else status = lsGet("won_" + dk(date)) === "1" ? "won" : "lost";
    if (status === "won") won++;
    const cyc = getCyclePhase(date);
    cells.push({ d, status, cyc: cyc ? cyc.color : null });
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
          <div className={`cdot ${c.status}`} key={c.d} title={`${c.d} ${MONTHS[month]}`}>
            <span className="num">{c.d}</span>
            {label(c.status)}
            {c.cyc && <span className="cycle-strip" style={{ background: c.cyc }} />}
          </div>
        ))}
      </div>
    </div>
  );
}
