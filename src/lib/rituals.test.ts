import { describe, it, expect } from "vitest";
import { seedRowsFromDefault, getRoutineRituals } from "./rituals";

describe("seedRowsFromDefault", () => {
  const seed = seedRowsFromDefault("2026-05-25");
  it("crea una fila por id único", () => {
    const ids = seed.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("'cierre' aparece todos los días (0..6)", () => {
    const cierre = seed.find((r) => r.id === "cierre")!;
    expect([...cierre.days].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("'lavar' (semilla) está solo en lunes (1)", () => {
    const lavar = seed.find((r) => r.id === "lavar")!;
    expect(lavar.days).toEqual([1]);
  });
});

describe("getRoutineRituals", () => {
  it("devuelve los rituales que aplican ese día con source=routine", () => {
    const seed = seedRowsFromDefault("2026-05-25");
    const lunes = new Date(2026, 4, 25); // lunes
    const out = getRoutineRituals(lunes, seed);
    expect(out.every((r) => r.source === "routine")).toBe(true);
    expect(out.some((r) => r.id === "lavar")).toBe(true);
    const domingo = new Date(2026, 4, 24);
    expect(getRoutineRituals(domingo, seed).some((r) => r.id === "lavar")).toBe(false);
  });
});
