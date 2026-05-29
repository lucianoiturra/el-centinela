import { describe, it, expect, beforeEach, vi } from "vitest";
import { getQueue, enqueue, flushQueue, fmtDate, saveCache, loadCache } from "./offline-queue";

// Mock de localStorage
let store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { store = {}; },
  length: 0,
  key: () => null,
});

describe("getQueue", () => {
  beforeEach(() => { store = {}; });

  it("devuelve [] cuando no hay nada guardado", () => {
    expect(getQueue()).toEqual([]);
  });

  it("devuelve [] si el JSON está corrupto", () => {
    store["sentinel_offline_sets"] = "no-es-json{{{";
    expect(getQueue()).toEqual([]);
  });
});

describe("enqueue", () => {
  beforeEach(() => { store = {}; });

  it("agrega un setLog a la cola vacía", () => {
    const op = {
      type: "setLog" as const,
      date: "2026-05-28",
      exerciseId: 1,
      setNumber: 1,
      weightKg: 60,
      repsCompleted: 10,
      durationSeconds: null,
    };
    enqueue(op);
    expect(getQueue()).toEqual([op]);
  });

  it("agrega múltiples items en orden", () => {
    const op1 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    const op2 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 2, weightKg: 62.5, repsCompleted: 8, durationSeconds: null };
    enqueue(op1);
    enqueue(op2);
    expect(getQueue()).toEqual([op1, op2]);
  });

  it("agrega un sessionDone a la cola", () => {
    const op = { type: "sessionDone" as const, date: "2026-05-28", sessionTemplateId: 5, done: true };
    enqueue(op);
    expect(getQueue()).toEqual([op]);
  });
});

describe("flushQueue", () => {
  beforeEach(() => { store = {}; });

  it("no llama a nada y devuelve 0 con cola vacía", async () => {
    const doSave = vi.fn();
    const doDone = vi.fn();
    expect(await flushQueue(doSave, doDone)).toBe(0);
    expect(doSave).not.toHaveBeenCalled();
    expect(doDone).not.toHaveBeenCalled();
  });

  it("procesa un setLog y lo elimina de la cola", async () => {
    const doSave = vi.fn().mockResolvedValue(undefined);
    const doDone = vi.fn();
    enqueue({ type: "setLog", date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null });

    const remaining = await flushQueue(doSave, doDone);

    expect(doSave).toHaveBeenCalledWith(
      new Date("2026-05-28T00:00:00"), 1, 1,
      { weightKg: 60, repsCompleted: 10, durationSeconds: null }
    );
    expect(remaining).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it("procesa un sessionDone y lo elimina de la cola", async () => {
    const doSave = vi.fn();
    const doDone = vi.fn().mockResolvedValue(undefined);
    enqueue({ type: "sessionDone", date: "2026-05-28", sessionTemplateId: 5, done: true });

    const remaining = await flushQueue(doSave, doDone);

    expect(doDone).toHaveBeenCalledWith(new Date("2026-05-28T00:00:00"), 5, true);
    expect(remaining).toBe(0);
    expect(getQueue()).toHaveLength(0);
  });

  it("mantiene en cola los ops que fallan", async () => {
    const doSave = vi.fn().mockRejectedValue(new Error("Network"));
    const doDone = vi.fn();
    const op = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    enqueue(op);

    const remaining = await flushQueue(doSave, doDone);

    expect(remaining).toBe(1);
    expect(getQueue()).toEqual([op]);
  });

  it("procesa exitosos y conserva fallidos", async () => {
    const doSave = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Network"));
    const doDone = vi.fn();
    const op1 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 1, weightKg: 60, repsCompleted: 10, durationSeconds: null };
    const op2 = { type: "setLog" as const, date: "2026-05-28", exerciseId: 1, setNumber: 2, weightKg: 62.5, repsCompleted: 8, durationSeconds: null };
    enqueue(op1);
    enqueue(op2);

    const remaining = await flushQueue(doSave, doDone);

    expect(remaining).toBe(1);
    expect(getQueue()).toEqual([op2]);
  });
});

describe("fmtDate", () => {
  it("formatea fecha con padding de ceros", () => {
    expect(fmtDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
  it("formatea fecha de diciembre", () => {
    expect(fmtDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("saveCache / loadCache", () => {
  beforeEach(() => { store = {}; });

  it("loadCache devuelve null cuando no hay datos", () => {
    expect(loadCache("2026-05-28")).toBeNull();
  });

  it("saveCache y loadCache hacen round-trip de un objeto", () => {
    const data = { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };
    saveCache("2026-05-28", data);
    expect(loadCache("2026-05-28")).toEqual(data);
  });

  it("loadCache devuelve null si el JSON está corrupto", () => {
    store["sentinel_tc_2026-05-28"] = "{{bad json";
    expect(loadCache("2026-05-28")).toBeNull();
  });

  it("claves distintas no se solapan", () => {
    saveCache("2026-05-28", { done: true });
    saveCache("2026-05-27", { done: false });
    expect(loadCache<{ done: boolean }>("2026-05-28")).toEqual({ done: true });
    expect(loadCache<{ done: boolean }>("2026-05-27")).toEqual({ done: false });
  });
});
