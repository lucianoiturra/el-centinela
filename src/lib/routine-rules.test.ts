import { describe, it, expect } from "vitest";
import { weekIndex, ritualAppliesOn } from "./routine-rules";
import type { RoutineRitual } from "./types";

const base: RoutineRitual = {
  id: "x", label: "X", icon: "•", pillar: "hogar", phase: "noche",
  hard: false, optional: false, isTaa: false,
  days: [0], intervalWeeks: 1, anchorISO: "2026-05-24", sortOrder: 0,
};

describe("weekIndex", () => {
  it("misma semana (lun-dom) da el mismo índice", () => {
    expect(weekIndex(new Date(2026, 4, 18))).toBe(weekIndex(new Date(2026, 4, 24))); // lun 18 .. dom 24
  });
  it("semana siguiente difiere en 1", () => {
    expect(weekIndex(new Date(2026, 4, 25)) - weekIndex(new Date(2026, 4, 18))).toBe(1);
  });
});

describe("ritualAppliesOn", () => {
  it("solo aplica en los días configurados", () => {
    expect(ritualAppliesOn(base, new Date(2026, 4, 24))).toBe(true);  // domingo
    expect(ritualAppliesOn(base, new Date(2026, 4, 25))).toBe(false); // lunes
  });
  it("intervalWeeks=1 aplica todas las semanas", () => {
    const r = { ...base, days: [0] };
    expect(ritualAppliesOn(r, new Date(2026, 4, 24))).toBe(true);
    expect(ritualAppliesOn(r, new Date(2026, 4, 31))).toBe(true);
  });
  it("intervalWeeks=2 aplica semana por medio desde el ancla", () => {
    const r = { ...base, days: [0], intervalWeeks: 2, anchorISO: "2026-05-24" };
    expect(ritualAppliesOn(r, new Date(2026, 4, 24))).toBe(true);   // ancla
    expect(ritualAppliesOn(r, new Date(2026, 4, 31))).toBe(false);  // +1 semana
    expect(ritualAppliesOn(r, new Date(2026, 5, 7))).toBe(true);    // +2 semanas
  });
});
