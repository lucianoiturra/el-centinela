import type { PillarConfig } from "@/lib/types";

const DEFAULT_PILLARS: PillarConfig[] = [
  { id: "comunion", label: "Comunion", color: "#a78bfa", sortOrder: 0 },
  { id: "salud", label: "Salud", color: "#2dd4bf", sortOrder: 1 },
  { id: "finanzas", label: "Finanzas", color: "#4ade80", sortOrder: 2 },
  { id: "sistema", label: "Sistema", color: "#94a3b8", sortOrder: 3 },
  { id: "basalto", label: "Basalto", color: "#fb923c", sortOrder: 4 },
  { id: "cab", label: "CAB", color: "#93c5fd", sortOrder: 5 },
  { id: "pareja", label: "Pareja", color: "#f9a8d4", sortOrder: 6 },
  { id: "hogar", label: "Hogar", color: "#7dd3fc", sortOrder: 7 },
];

const RESERVED_PILLAR_IDS = new Set(["salud", "finanzas", "sistema", "cab"]);
const FALLBACK_COLORS = ["#60a5fa", "#f472b6", "#34d399", "#f59e0b", "#a78bfa", "#fb7185", "#22d3ee", "#facc15"];

export function getDefaultPillars() {
  return DEFAULT_PILLARS.map((pillar) => ({ ...pillar }));
}

export function getReservedPillarIds() {
  return new Set(RESERVED_PILLAR_IDS);
}

export function getFallbackPillarColor(pillarId: string) {
  const known = DEFAULT_PILLARS.find((pillar) => pillar.id === pillarId);
  if (known) return known.color;

  let hash = 0;
  for (const char of pillarId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

export function getFallbackPillarLabel(pillarId: string) {
  const known = DEFAULT_PILLARS.find((pillar) => pillar.id === pillarId);
  if (known) return known.label;
  return pillarId
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function normalizePillarId(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isReservedPillarId(pillarId: string) {
  return RESERVED_PILLAR_IDS.has(pillarId);
}

export function getResolvedPillarMeta(
  pillarId: string,
  map?: Map<string, { label: string; color: string }>
) {
  return map?.get(pillarId) ?? {
    label: getFallbackPillarLabel(pillarId),
    color: getFallbackPillarColor(pillarId),
  };
}
