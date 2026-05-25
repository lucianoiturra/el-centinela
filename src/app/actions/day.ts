"use server";
import { sql } from "@/lib/db/client";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

// Helpers
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new Error("No autenticado");
  return session.user.email;
}

// ─── TAA ──────────────────────────────────────────────────────────────────────

export async function saveTaa(date: Date, taa: string) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO day_state (user_id, date, taa, updated_at)
    VALUES (${userId}, ${d}, ${taa}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET taa = EXCLUDED.taa, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function markTaaDone(date: Date, done: boolean) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO day_state (user_id, date, taa_done, updated_at)
    VALUES (${userId}, ${d}, ${done}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET taa_done = EXCLUDED.taa_done, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDayState(date: Date) {
  const userId = await getUserId();
  const d = fmtDate(date);
  const { rows } = await sql`
    SELECT taa, taa_done FROM day_state
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  return rows[0] ?? { taa: null, taa_done: false };
}

// Últimos N días para la cadena del mes
export async function getMonthChain(days: number = 30) {
  const userId = await getUserId();
  const { rows } = await sql`
    SELECT date, taa_done FROM day_state
    WHERE user_id = ${userId}
      AND date >= CURRENT_DATE - INTERVAL '${days} days'
    ORDER BY date ASC
  `;
  return rows.map((r) => ({ date: r.date as string, taa_done: r.taa_done as boolean }));
}

// ─── TASK CHECKS ──────────────────────────────────────────────────────────────

export async function setTaskCheck(date: Date, taskId: string, checked: boolean) {
  const userId = await getUserId();
  const d = fmtDate(date);
  await sql`
    INSERT INTO task_check (user_id, date, task_id, checked, updated_at)
    VALUES (${userId}, ${d}, ${taskId}, ${checked}, NOW())
    ON CONFLICT (user_id, date, task_id)
    DO UPDATE SET checked = EXCLUDED.checked, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDayChecks(date: Date): Promise<Record<string, boolean>> {
  const userId = await getUserId();
  const d = fmtDate(date);
  const { rows } = await sql`
    SELECT task_id, checked FROM task_check
    WHERE user_id = ${userId} AND date = ${d}
  `;
  return Object.fromEntries(rows.map((r) => [r.task_id, r.checked]));
}

// ─── SPRINT COMMITMENTS ───────────────────────────────────────────────────────

export async function saveSprintCommitment(
  isoYear: number,
  isoWeek: number,
  slot: 1 | 2 | 3,
  text: string
) {
  const userId = await getUserId();
  await sql`
    INSERT INTO sprint_commitment (user_id, iso_year, iso_week, slot, text, updated_at)
    VALUES (${userId}, ${isoYear}, ${isoWeek}, ${slot}, ${text}, NOW())
    ON CONFLICT (user_id, iso_year, iso_week, slot)
    DO UPDATE SET text = EXCLUDED.text, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getSprintCommitments(isoYear: number, isoWeek: number) {
  const userId = await getUserId();
  const { rows } = await sql`
    SELECT slot, text FROM sprint_commitment
    WHERE user_id = ${userId} AND iso_year = ${isoYear} AND iso_week = ${isoWeek}
    ORDER BY slot
  `;
  return rows.map((r) => ({ slot: r.slot as number, text: r.text as string }));
}

// ─── CICLO DE MICHELLE ────────────────────────────────────────────────────────

export async function saveCycleStart(cycleStartDate: Date, cycleLength: number = 28) {
  const userId = await getUserId();
  const d = fmtDate(cycleStartDate);
  await sql`
    INSERT INTO cycle_log (user_id, cycle_start_date, cycle_length, updated_at)
    VALUES (${userId}, ${d}, ${cycleLength}, NOW())
    ON CONFLICT (user_id, cycle_start_date)
    DO UPDATE SET cycle_length = EXCLUDED.cycle_length, updated_at = NOW()
  `;
}

export async function getLatestCycleStart(): Promise<{ date: string; length: number } | null> {
  const userId = await getUserId();
  const { rows } = await sql`
    SELECT cycle_start_date::text as date, cycle_length as length
    FROM cycle_log
    WHERE user_id = ${userId}
    ORDER BY cycle_start_date DESC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return { date: rows[0].date as string, length: rows[0].length as number };
}
