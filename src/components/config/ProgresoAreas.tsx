"use client";

import { useEffect, useState } from "react";

import { getAreaProgress } from "@/app/actions/day";
import AreaRadar, { type AreaRadarStat } from "@/components/AreaRadar";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export default function ProgresoAreas() {
  const [period] = useState(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      label: `${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    };
  });
  const [stats, setStats] = useState<AreaRadarStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAreaProgress(period.year, period.month, period.day)
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats([]);
      });

    return () => {
      cancelled = true;
    };
  }, [period]);

  if (stats === null) return <div className="config-soon">Cargando progreso…</div>;
  if (stats.length === 0) return <div className="config-soon">Aún no hay datos suficientes para calcular progreso.</div>;

  return (
    <div>
      <div className="config-soon" style={{ opacity: 0.72, paddingTop: 0 }}>
        Vista acumulada del mes en curso · {period.label}
      </div>
      <AreaRadar stats={stats} />
    </div>
  );
}
