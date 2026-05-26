"use server";
import { sql } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getUserId, fmtDate } from "@/lib/server-user";
import { seedRowsFromDefault } from "@/lib/rituals";
import type { RoutineRitual } from "@/lib/types";

type Row = {
  id: string; label: string; icon: string; pillar: string; phase: string;
  start_min: number | null; end_min: number | null; time: string | null;
  hard: boolean; optional: boolean; is_taa: boolean;
  days: number[]; interval_weeks: number; anchor_iso: string; sort_order: number;
};

function rowToRitual(r: Row): RoutineRitual {
  return {
    id: r.id, label: r.label, icon: r.icon,
    pillar: r.pillar as RoutineRitual["pillar"],
    phase: r.phase as RoutineRitual["phase"],
    startMin: r.start_min ?? undefined, endMin: r.end_min ?? undefined,
    time: r.time ?? undefined,
    hard: r.hard, optional: r.optional, isTaa: r.is_taa,
    days: r.days, intervalWeeks: r.interval_weeks, anchorISO: r.anchor_iso,
    sortOrder: r.sort_order,
  };
}

async function insertRitual(userId: string, r: RoutineRitual) {
  await sql`
    INSERT INTO routine_ritual
      (user_id, id, label, icon, pillar, phase, start_min, end_min, time,
       hard, optional, is_taa, days, interval_weeks, anchor_date, sort_order, updated_at)
    VALUES
      (${userId}, ${r.id}, ${r.label}, ${r.icon}, ${r.pillar}, ${r.phase},
       ${r.startMin ?? null}, ${r.endMin ?? null}, ${r.time ?? null},
       ${r.hard}, ${r.optional}, ${r.isTaa}, ${r.days},
       ${Math.max(1, r.intervalWeeks)}, ${r.anchorISO}, ${r.sortOrder}, NOW())
    ON CONFLICT (user_id, id) DO UPDATE SET
      label=EXCLUDED.label, icon=EXCLUDED.icon, pillar=EXCLUDED.pillar, phase=EXCLUDED.phase,
      start_min=EXCLUDED.start_min, end_min=EXCLUDED.end_min, time=EXCLUDED.time,
      hard=EXCLUDED.hard, optional=EXCLUDED.optional, is_taa=EXCLUDED.is_taa,
      days=EXCLUDED.days, interval_weeks=EXCLUDED.interval_weeks,
      anchor_date=EXCLUDED.anchor_date, sort_order=EXCLUDED.sort_order, updated_at=NOW()
  `;
}

const SELECT_COLS = sql`
  id, label, icon, pillar, phase, start_min, end_min, time, hard, optional, is_taa,
  days, interval_weeks, anchor_date::text AS anchor_iso, sort_order
`;

export async function getRoutine(): Promise<RoutineRitual[]> {
  const userId = await getUserId();
  let rows = (await sql`SELECT ${SELECT_COLS} FROM routine_ritual WHERE user_id=${userId} ORDER BY sort_order`) as unknown as Row[];
  if (rows.length === 0) {
    const seed = seedRowsFromDefault(fmtDate(new Date()));
    for (const r of seed) await insertRitual(userId, r);
    rows = (await sql`SELECT ${SELECT_COLS} FROM routine_ritual WHERE user_id=${userId} ORDER BY sort_order`) as unknown as Row[];
  }
  return rows.map(rowToRitual);
}

export async function upsertRitual(r: RoutineRitual) {
  const userId = await getUserId();
  const id = r.id && r.id.trim() ? r.id : "cust-" + Math.random().toString(36).slice(2, 9);
  await insertRitual(userId, { ...r, id, intervalWeeks: Math.max(1, r.intervalWeeks) });
  revalidatePath("/");
  revalidatePath("/configuracion");
}

export async function deleteRitual(id: string) {
  const userId = await getUserId();
  await sql`DELETE FROM routine_ritual WHERE user_id=${userId} AND id=${id}`;
  revalidatePath("/");
  revalidatePath("/configuracion");
}
