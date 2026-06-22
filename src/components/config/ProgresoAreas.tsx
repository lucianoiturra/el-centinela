"use client";

import { useEffect, useMemo, useState } from "react";

import { getAreaProgressRange } from "@/app/actions/day";
import AreaRadar, { type AreaRadarStat } from "@/components/AreaRadar";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type RangeKey = "week" | "month" | "quarter";

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfWeek(d: Date) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const jsDay = copy.getDay();
  const diff = jsDay === 0 ? -6 : 1 - jsDay;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function formatShortDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function buildRanges(now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = startOfWeek(today);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const quarterStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 89);

  return {
    week: {
      key: "week" as const,
      label: `Semana · ${formatShortDate(weekStart)}-${formatShortDate(today)}`,
      startISO: isoDate(weekStart),
      endISO: isoDate(today),
      button: "Semana",
    },
    month: {
      key: "month" as const,
      label: `Mes en curso · ${MONTHS[today.getMonth()]} ${today.getFullYear()}`,
      startISO: isoDate(monthStart),
      endISO: isoDate(today),
      button: "Mes",
    },
    quarter: {
      key: "quarter" as const,
      label: `Ultimos 90 dias · ${formatShortDate(quarterStart)}-${formatShortDate(today)}`,
      startISO: isoDate(quarterStart),
      endISO: isoDate(today),
      button: "90 dias",
    },
  };
}

export default function ProgresoAreas() {
  const ranges = useMemo(() => buildRanges(new Date()), []);
  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [loadedRangeKey, setLoadedRangeKey] = useState<RangeKey | null>(null);
  const [stats, setStats] = useState<AreaRadarStat[] | null>(null);
  const currentRange = ranges[rangeKey];
  const summary = useMemo(() => {
    if (!stats) return null;
    let up = 0;
    let down = 0;
    let same = 0;
    for (const stat of stats) {
      const delta = stat.deltaRatio ?? 0;
      if (delta > 0.001) up += 1;
      else if (delta < -0.001) down += 1;
      else same += 1;
    }
    return { up, down, same };
  }, [stats]);

  const previousRange = useMemo(() => {
    const currentStart = new Date(`${currentRange.startISO}T00:00:00`);
    const currentEnd = new Date(`${currentRange.endISO}T00:00:00`);
    const spanDays = Math.round((currentEnd.getTime() - currentStart.getTime()) / 86_400_000) + 1;
    const prevEnd = addDays(currentStart, -1);
    const prevStart = addDays(prevEnd, -(spanDays - 1));
    return {
      startISO: isoDate(prevStart),
      endISO: isoDate(prevEnd),
      label: `${formatShortDate(prevStart)}-${formatShortDate(prevEnd)}`,
    };
  }, [currentRange.endISO, currentRange.startISO]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getAreaProgressRange(currentRange.startISO, currentRange.endISO),
      getAreaProgressRange(previousRange.startISO, previousRange.endISO),
    ])
      .then(([current, previous]) => {
        if (!cancelled) {
          const previousMap = new Map(previous.map((stat) => [stat.pillar, stat]));
          const merged = current.map((stat) => {
            const prev = previousMap.get(stat.pillar);
            return {
              ...stat,
              previousCompleted: prev?.completed ?? 0,
              previousTotal: prev?.total ?? 0,
              previousRatio: prev?.ratio ?? 0,
              deltaRatio: stat.ratio - (prev?.ratio ?? 0),
            };
          });
          setStats(merged);
          setLoadedRangeKey(rangeKey);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStats([]);
          setLoadedRangeKey(rangeKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentRange.endISO, currentRange.startISO, previousRange.endISO, previousRange.startISO, rangeKey]);

  if (stats === null || loadedRangeKey !== rangeKey) {
    return <div className="config-soon">Cargando progreso…</div>;
  }

  if (stats.length === 0) {
    return <div className="config-soon">Aún no hay datos suficientes para calcular progreso.</div>;
  }

  return (
    <div>
      <div className="config-tabs" style={{ marginTop: 0, marginBottom: 10 }}>
        {(["week", "month", "quarter"] as RangeKey[]).map((key) => (
          <button
            key={key}
            className={rangeKey === key ? "on" : ""}
            onClick={() => setRangeKey(key)}
          >
            {ranges[key].button}
          </button>
        ))}
      </div>
      <div className="config-soon" style={{ opacity: 0.72, paddingTop: 0 }}>
        Vista acumulada · {currentRange.label}
      </div>
      <div className="config-soon" style={{ opacity: 0.58, paddingTop: 0, marginTop: -10 }}>
        Comparado contra · {previousRange.label}
      </div>
      {summary && (
        <div className="radar-summary">
          <span className="radar-summary-chip up">{summary.up} suben</span>
          <span className="radar-summary-chip down">{summary.down} bajan</span>
          <span className="radar-summary-chip same">{summary.same} estables</span>
        </div>
      )}
      <AreaRadar stats={stats} />
    </div>
  );
}
