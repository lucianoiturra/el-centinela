"use server";
import { sql } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getUserId } from "@/lib/server-user";
import { isDayWon, isTrainingRequiredOn } from "@/lib/training";
import { getRoutine } from "@/app/actions/routine";
import { getPillarMap } from "@/app/actions/pillar";
import { getFinanceRituals } from "@/lib/finance";
import { getResolvedPillarMeta } from "@/lib/pillars";
import { ritualAppliesOn } from "@/lib/routine-rules";
import type { Pillar } from "@/lib/types";

// Las fechas llegan desde el cliente como string `YYYY-MM-DD` (su día LOCAL),
// no como `Date`. Esto evita el bug de timezone: el servidor corre en UTC y
// deserializar un `Date` de medianoche local lo corría al día anterior UTC.

// ─── TAA ──────────────────────────────────────────────────────────────────────

export async function saveTaa(dateISO: string, taa: string) {
  const userId = await getUserId();
  const d = dateISO;
  await sql`
    INSERT INTO day_state (user_id, date, taa, updated_at)
    VALUES (${userId}, ${d}, ${taa}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET taa = EXCLUDED.taa, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function markTaaDone(dateISO: string, done: boolean) {
  const userId = await getUserId();
  const d = dateISO;
  await sql`
    INSERT INTO day_state (user_id, date, taa_done, updated_at)
    VALUES (${userId}, ${d}, ${done}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET taa_done = EXCLUDED.taa_done, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDayState(dateISO: string) {
  const userId = await getUserId();
  const d = dateISO;
  const rows = await sql`
    SELECT taa, taa_done, linea_espiritual, training_done FROM day_state
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  const row = rows[0];
  return {
    taa: (row?.taa as string | undefined) ?? null,
    taa_done: (row?.taa_done as boolean | undefined) ?? false,
    linea: (row?.linea_espiritual as string | undefined) ?? "",
    training_done: (row?.training_done as boolean | null | undefined) ?? null,
  };
}

// ─── LÍNEA ESPIRITUAL (cierre) ──────────────────────────────────────────────────

export async function saveLineaEspiritual(dateISO: string, text: string) {
  const userId = await getUserId();
  const d = dateISO;
  await sql`
    INSERT INTO day_state (user_id, date, linea_espiritual, updated_at)
    VALUES (${userId}, ${d}, ${text}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET linea_espiritual = EXCLUDED.linea_espiritual, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDiario() {
  const userId = await getUserId();
  const rows = await sql`
    SELECT date::text as date, linea_espiritual FROM day_state
    WHERE user_id = ${userId} AND linea_espiritual IS NOT NULL AND linea_espiritual <> ''
    ORDER BY date DESC
  `;
  return rows.map((r) => ({
    date: r.date as string,
    linea: r.linea_espiritual as string,
  }));
}

// Cadena de un mes calendario concreto.
// `year` y `month` (0-based, enero=0) vienen del cliente para usar SU fecha local,
// no la del servidor (UTC) — evita que la cadena se desfase de noche.
// El "Día Ganado" se calcula con la regla única isDayWon, igual que la vista de hoy,
// teniendo en cuenta si ese día tenía entrenamiento obligatorio (no descanso/sábado).
export async function getMonthChain(year: number, month: number) {
  const userId = await getUserId();
  const mm = String(month + 1).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const rows = await sql`
    SELECT date::text as date, taa_done, training_done
    FROM day_state
    WHERE user_id = ${userId} AND date >= ${first} AND date <= ${last}
    ORDER BY date ASC
  `;

  // Plan + mapa de días con entrenamiento obligatorio (activity_type ≠ 'rest').
  const planRows = await sql`
    SELECT id, start_date::text as start_date, race_date::text as race_date
    FROM training_plan WHERE user_id = ${userId} LIMIT 1
  `;
  let plan: { startDate: Date; raceDate: Date } | null = null;
  let requiredSet: Set<string> | null = null;
  if (planRows[0]) {
    plan = {
      startDate: new Date((planRows[0].start_date as string) + "T00:00:00Z"),
      raceDate: new Date((planRows[0].race_date as string) + "T00:00:00Z"),
    };
    const tmpl = await sql`
      SELECT p.phase_number, t.day_of_week
      FROM training_session_template t
      JOIN training_phase p ON p.id = t.phase_id
      WHERE p.plan_id = ${planRows[0].id as number} AND t.activity_type <> 'rest'
    `;
    requiredSet = new Set(tmpl.map((r) => `${r.phase_number}-${r.day_of_week}`));
  }

  return rows.map((r) => {
    const date = new Date((r.date as string) + "T00:00:00Z");
    const trainingRequired =
      plan && requiredSet ? isTrainingRequiredOn(date, plan, requiredSet) : false;
    return {
      date: r.date as string,
      won: isDayWon({
        taaDone: (r.taa_done as boolean) ?? false,
        trainingRequired,
        trainingDone: (r.training_done as boolean) ?? false,
      }),
    };
  });
}

// ─── TASK CHECKS ──────────────────────────────────────────────────────────────

export async function setTaskCheck(dateISO: string, taskId: string, checked: boolean) {
  const userId = await getUserId();
  const d = dateISO;
  await sql`
    INSERT INTO task_check (user_id, date, task_id, checked, updated_at)
    VALUES (${userId}, ${d}, ${taskId}, ${checked}, NOW())
    ON CONFLICT (user_id, date, task_id)
    DO UPDATE SET checked = EXCLUDED.checked, updated_at = NOW()
  `;
  revalidatePath("/");
}

export async function getDayChecks(dateISO: string): Promise<Record<string, boolean>> {
  const userId = await getUserId();
  const d = dateISO;
  const rows = await sql`
    SELECT task_id, checked FROM task_check
    WHERE user_id = ${userId} AND date = ${d}
  `;
  return Object.fromEntries(
    rows.map((r) => [r.task_id as string, r.checked as boolean])
  );
}

export async function getAreaProgress(year: number, month: number, uptoDay: number) {
  const userId = await getUserId();
  const routine = await getRoutine();
  const pillarMap = await getPillarMap();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const endDay = Math.max(1, Math.min(uptoDay, lastDay));
  const mm = String(month + 1).padStart(2, "0");
  const first = `${year}-${mm}-01`;
  const last = `${year}-${mm}-${String(endDay).padStart(2, "0")}`;

  const rows = await sql`
    SELECT date::text as date, task_id, checked
    FROM task_check
    WHERE user_id = ${userId} AND date >= ${first} AND date <= ${last}
  `;

  const checksByDate = new Map<string, Record<string, boolean>>();
  for (const row of rows) {
    const date = row.date as string;
    const current = checksByDate.get(date) ?? {};
    current[row.task_id as string] = row.checked as boolean;
    checksByDate.set(date, current);
  }

  const planRows = await sql`
    SELECT id, start_date::text as start_date, race_date::text as race_date
    FROM training_plan WHERE user_id = ${userId} LIMIT 1
  `;

  let plan: { startDate: Date; raceDate: Date } | null = null;
  let requiredSet: Set<string> | null = null;
  if (planRows[0]) {
    plan = {
      startDate: new Date((planRows[0].start_date as string) + "T00:00:00Z"),
      raceDate: new Date((planRows[0].race_date as string) + "T00:00:00Z"),
    };
    const tmpl = await sql`
      SELECT p.phase_number, t.day_of_week
      FROM training_session_template t
      JOIN training_phase p ON p.id = t.phase_id
      WHERE p.plan_id = ${planRows[0].id as number} AND t.activity_type <> 'rest'
    `;
    requiredSet = new Set(tmpl.map((r) => `${r.phase_number}-${r.day_of_week}`));
  }

  const trainingRows = await sql`
    SELECT date::text as date, training_done
    FROM day_state
    WHERE user_id = ${userId} AND date >= ${first} AND date <= ${last}
  `;
  const trainingDoneByDate = new Map(
    trainingRows.map((row) => [row.date as string, (row.training_done as boolean | null | undefined) === true])
  );

  const stats = new Map<Pillar, { pillar: Pillar; label: string; color: string; completed: number; total: number }>();
  for (const [pillar, meta] of pillarMap.entries()) {
    stats.set(pillar, { pillar, label: meta.label, color: meta.color, completed: 0, total: 0 });
  }

  for (let day = 1; day <= endDay; day++) {
    const date = new Date(year, month, day);
    const dateKey = `${year}-${mm}-${String(day).padStart(2, "0")}`;
    const dayChecks = checksByDate.get(dateKey) ?? {};
    const rituals = routine
      .filter((ritual) => ritualAppliesOn(ritual, date))
      .map((ritual) => ({ id: ritual.id, pillar: ritual.pillar }));

    for (const ritual of [...rituals, ...getFinanceRituals(date).map((ritual) => ({ id: ritual.id, pillar: ritual.pillar }))]) {
      let stat = stats.get(ritual.pillar);
      if (!stat) {
        const meta = getResolvedPillarMeta(ritual.pillar, pillarMap);
        stat = { pillar: ritual.pillar, label: meta.label, color: meta.color, completed: 0, total: 0 };
        stats.set(ritual.pillar, stat);
      }
      stat.total += 1;
      if (dayChecks[ritual.id]) stat.completed += 1;
    }

    if (plan && requiredSet && isTrainingRequiredOn(new Date(dateKey + "T00:00:00Z"), plan, requiredSet)) {
      const saludMeta = getResolvedPillarMeta("salud", pillarMap);
      const salud = stats.get("salud") ?? {
        pillar: "salud",
        label: saludMeta.label,
        color: saludMeta.color,
        completed: 0,
        total: 0,
      };
      stats.set("salud", salud);
      salud.total += 1;
      if (trainingDoneByDate.get(dateKey)) salud.completed += 1;
    }
  }

  return Array.from(stats.values())
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((stat) => ({
      ...stat,
      ratio: stat.total > 0 ? stat.completed / stat.total : 0,
    }));
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
  const rows = await sql`
    SELECT slot, text FROM sprint_commitment
    WHERE user_id = ${userId} AND iso_year = ${isoYear} AND iso_week = ${isoWeek}
    ORDER BY slot
  `;
  return rows.map((r) => ({
    slot: r.slot as number,
    text: r.text as string,
  }));
}

// ─── CICLO DE MICHELLE ────────────────────────────────────────────────────────

export async function saveCycleStart(cycleStartISO: string, cycleLength: number = 28) {
  const userId = await getUserId();
  const d = cycleStartISO;
  await sql`
    INSERT INTO cycle_log (user_id, cycle_start_date, cycle_length, updated_at)
    VALUES (${userId}, ${d}, ${cycleLength}, NOW())
    ON CONFLICT (user_id, cycle_start_date)
    DO UPDATE SET cycle_length = EXCLUDED.cycle_length, updated_at = NOW()
  `;
}

export async function getLatestCycleStart(): Promise<{ date: string; length: number } | null> {
  const userId = await getUserId();
  const rows = await sql`
    SELECT cycle_start_date::text as date, cycle_length as length
    FROM cycle_log
    WHERE user_id = ${userId}
    ORDER BY cycle_start_date DESC
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return {
    date: rows[0].date as string,
    length: rows[0].length as number,
  };
}
