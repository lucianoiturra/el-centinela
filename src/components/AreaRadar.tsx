"use client";

import { PILLAR_COLORS, PILLARS, PILLAR_LABELS, type Pillar } from "@/lib/types";

export type AreaRadarStat = {
  pillar: Pillar;
  label: string;
  completed: number;
  total: number;
  ratio: number;
};

const SIZE = 320;
const CENTER = SIZE / 2;
const MAX_RADIUS = 108;
const LEVELS = 4;

type Point = { x: number; y: number };

function polarPoint(index: number, count: number, radius: number): Point {
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: CENTER + Math.cos(angle) * radius,
    y: CENTER + Math.sin(angle) * radius,
  };
}

function pointsToString(points: Point[]) {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

function percentLabel(ratio: number, total: number) {
  if (total === 0) return "sin carga";
  return `${Math.round(ratio * 100)}%`;
}

export default function AreaRadar({ stats }: { stats: AreaRadarStat[] }) {
  const ordered = PILLARS.map((pillar) => {
    const stat = stats.find((item) => item.pillar === pillar);
    return stat ?? { pillar, label: PILLAR_LABELS[pillar], completed: 0, total: 0, ratio: 0 };
  });

  const gridPolygons = Array.from({ length: LEVELS }, (_, level) => {
    const radius = (MAX_RADIUS / LEVELS) * (level + 1);
    const points = ordered.map((_, index) => polarPoint(index, ordered.length, radius));
    return pointsToString(points);
  });

  const axisLines = ordered.map((_, index) => {
    const point = polarPoint(index, ordered.length, MAX_RADIUS);
    return { x2: point.x, y2: point.y };
  });

  const shapePoints = ordered.map((stat, index) =>
    polarPoint(index, ordered.length, Math.max(12, stat.ratio * MAX_RADIUS))
  );

  const labelPoints = ordered.map((stat, index) => ({
    stat,
    point: polarPoint(index, ordered.length, MAX_RADIUS + 28),
  }));

  return (
    <section className="radar-card" aria-label="Progreso por area">
      <div className="radar-head">
        <div>
          <div className="radar-kicker">Pulso del dia</div>
          <h3>Progreso por area</h3>
        </div>
        <div className="radar-note">Rituales completados por pilar</div>
      </div>

      <div className="radar-wrap">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" role="img" aria-label="Grafico radial de progreso por area">
          {gridPolygons.map((points, index) => (
            <polygon key={index} points={points} className="radar-grid" />
          ))}

          {axisLines.map((line, index) => (
            <line
              key={index}
              x1={CENTER}
              y1={CENTER}
              x2={line.x2}
              y2={line.y2}
              className="radar-axis"
            />
          ))}

          <polygon points={pointsToString(shapePoints)} className="radar-shape-fill" />
          <polygon points={pointsToString(shapePoints)} className="radar-shape-stroke" />

          {shapePoints.map((point, index) => (
            <circle
              key={ordered[index].pillar}
              cx={point.x}
              cy={point.y}
              r="4.5"
              fill={PILLAR_COLORS[ordered[index].pillar]}
              className="radar-dot"
            />
          ))}

          {labelPoints.map(({ stat, point }) => (
            <text
              key={stat.pillar}
              x={point.x}
              y={point.y}
              textAnchor={point.x < CENTER - 8 ? "end" : point.x > CENTER + 8 ? "start" : "middle"}
              className="radar-label"
            >
              {stat.label}
            </text>
          ))}
        </svg>

        <div className="radar-legend">
          {ordered.map((stat) => (
            <div className="radar-pill" key={stat.pillar}>
              <span className="radar-pill-dot" style={{ background: PILLAR_COLORS[stat.pillar] }} />
              <span className="radar-pill-label">{stat.label}</span>
              <span className="radar-pill-metric">
                {percentLabel(stat.ratio, stat.total)} · {stat.completed}/{stat.total}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
