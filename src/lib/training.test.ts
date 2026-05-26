// src/lib/training.test.ts
import { describe, it, expect } from "vitest";
import { calculatePhaseNumber, jsDayToPlanDay, isSabbathDay } from "./training";

const START = new Date("2026-03-04");
const RACE = new Date("2026-10-04");

describe("calculatePhaseNumber", () => {
  it("Fase 1 — mes 1 (marzo)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-03-15"), RACE)).toBe(1);
  });
  it("Fase 1 — mes 2 (abril)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-04-20"), RACE)).toBe(1);
  });
  it("Fase 2 — mes 3 (mayo)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-05-10"), RACE)).toBe(2);
  });
  it("Fase 2 — mes 4 (junio)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-06-15"), RACE)).toBe(2);
  });
  it("Fase 3 — mes 5 (julio)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-07-01"), RACE)).toBe(3);
  });
  it("Fase 3 — mes 6 (agosto)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-08-20"), RACE)).toBe(3);
  });
  it("Fase 4 — últimas 3 semanas (taper)", () => {
    expect(calculatePhaseNumber(START, new Date("2026-09-20"), RACE)).toBe(4);
  });
  it("Exactamente en el inicio del taper (21 días antes)", () => {
    const taperStart = new Date(RACE);
    taperStart.setUTCDate(taperStart.getUTCDate() - 21);
    expect(calculatePhaseNumber(START, taperStart, RACE)).toBe(4);
  });
  it("Un día antes del taper sigue en Fase 3", () => {
    const beforeTaper = new Date(RACE);
    beforeTaper.setUTCDate(beforeTaper.getUTCDate() - 22);
    expect(calculatePhaseNumber(START, beforeTaper, RACE)).toBe(3);
  });
});

describe("jsDayToPlanDay", () => {
  it("Sunday (0) → 7", () => expect(jsDayToPlanDay(0)).toBe(7));
  it("Monday (1) → 1", () => expect(jsDayToPlanDay(1)).toBe(1));
  it("Tuesday (2) → 2", () => expect(jsDayToPlanDay(2)).toBe(2));
  it("Saturday (6) → 6", () => expect(jsDayToPlanDay(6)).toBe(6));
});

describe("isSabbathDay", () => {
  it("sábado 2026-05-23 → true", () => {
    expect(isSabbathDay(new Date("2026-05-23"))).toBe(true);
  });
  it("lunes 2026-05-25 → false", () => {
    expect(isSabbathDay(new Date("2026-05-25"))).toBe(false);
  });
  it("domingo 2026-05-24 → false", () => {
    expect(isSabbathDay(new Date("2026-05-24"))).toBe(false);
  });
});
