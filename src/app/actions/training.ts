"use server";
import { sql } from "@/lib/db/client";
import { revalidatePath } from "next/cache";
import { getUserId } from "@/lib/server-user";
import { calculatePhaseNumber, jsDayToPlanDay, isSabbathDay } from "@/lib/training";
import { TRAINING_SEED } from "@/lib/training-data";
import type { TrainingSessionTemplate, TrainingExercise } from "@/lib/types";

// ─── Auto-seed ────────────────────────────────────────────────────────────────

async function seedTrainingPlan(userId: string) {
  const { name, start_date, race_date, phases } = TRAINING_SEED;

  const [planRow] = await sql`
    INSERT INTO training_plan (user_id, name, start_date, race_date)
    VALUES (${userId}, ${name}, ${start_date}, ${race_date})
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id
  `;
  if (!planRow) return; // ya existía

  const planId = planRow.id as number;

  for (const phase of phases) {
    const [phaseRow] = await sql`
      INSERT INTO training_phase
        (plan_id, phase_number, name, description,
         start_month, end_month,
         bike_km_week_min, bike_km_week_max, weights_days_per_week)
      VALUES
        (${planId}, ${phase.phase_number}, ${phase.name}, ${phase.description},
         ${phase.start_month}, ${phase.end_month},
         ${phase.bike_km_week_min}, ${phase.bike_km_week_max}, ${phase.weights_days_per_week})
      RETURNING id
    `;
    const phaseId = phaseRow.id as number;

    for (const session of phase.sessions) {
      const [sessionRow] = await sql`
        INSERT INTO training_session_template
          (phase_id, day_of_week, activity_type, title, description,
           duration_min, intensity,
           level_min, level_max, rpm_min, rpm_max, watts_ref, routine_label)
        VALUES
          (${phaseId}, ${session.day_of_week}, ${session.activity_type},
           ${session.title}, ${session.description ?? null},
           ${session.duration_min}, ${session.intensity},
           ${session.level_min ?? null}, ${session.level_max ?? null},
           ${session.rpm_min ?? null}, ${session.rpm_max ?? null},
           ${session.watts_ref ?? null}, ${session.routine_label ?? null})
        RETURNING id
      `;
      const sessionId = sessionRow.id as number;

      for (let i = 0; i < session.exercises.length; i++) {
        const ex = session.exercises[i];
        await sql`
          INSERT INTO training_exercise
            (session_template_id, sort_order, name, sets, reps_label,
             rest_seconds, muscle_group, notes)
          VALUES
            (${sessionId}, ${i}, ${ex.name}, ${ex.sets}, ${ex.reps_label},
             ${ex.rest_seconds}, ${ex.muscle_group}, ${ex.notes})
        `;
      }
    }
  }
}

// ─── getTrainingPlan ──────────────────────────────────────────────────────────

export async function getTrainingPlan(): Promise<{
  id: number;
  startDate: string;
  raceDate: string;
} | null> {
  const userId = await getUserId();
  let rows = await sql`
    SELECT id, start_date::text as start_date, race_date::text as race_date
    FROM training_plan WHERE user_id = ${userId} LIMIT 1
  `;
  if (rows.length === 0) {
    await seedTrainingPlan(userId);
    rows = await sql`
      SELECT id, start_date::text as start_date, race_date::text as race_date
      FROM training_plan WHERE user_id = ${userId} LIMIT 1
    `;
  }
  if (rows.length === 0) return null;
  return {
    id: rows[0].id as number,
    startDate: rows[0].start_date as string,
    raceDate: rows[0].race_date as string,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type LastSet = {
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
};

export type TodaySetEntry = {
  setNumber: number;
  weightKg: number | null;
  repsCompleted: number | null;
  durationSeconds: number | null;
};

export type TrainingCardData = {
  session: TrainingSessionTemplate | null;
  exercises: TrainingExercise[];
  done: boolean;
  // exerciseId → datos de la última vez antes de hoy
  lastSets: Record<number, LastSet>;
  // exerciseId → sets de hoy
  todaySets: Record<number, TodaySetEntry[]>;
};

// ─── getTrainingCardData ──────────────────────────────────────────────────────

export async function getTrainingCardData(dateISO: string): Promise<TrainingCardData> {
  const userId = await getUserId();

  // Construir el Date en UTC (medianoche UTC) para que getUTCDay/getUTCMonth sean
  // coherentes con el resto de la lógica del plan (lib/training.ts usa UTC).
  const date = new Date(dateISO + "T00:00:00Z");

  if (isSabbathDay(date)) {
    return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };
  }

  const plan = await getTrainingPlan();
  if (!plan) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };

  const startDate = new Date(plan.startDate + "T00:00:00Z");
  const raceDate = new Date(plan.raceDate + "T00:00:00Z");
  const phaseNumber = calculatePhaseNumber(startDate, date, raceDate);
  const planDay = jsDayToPlanDay(date.getUTCDay());
  const d = dateISO;

  // Fase activa
  const phaseRows = await sql`
    SELECT id FROM training_phase
    WHERE plan_id = ${plan.id} AND phase_number = ${phaseNumber}
    LIMIT 1
  `;
  if (!phaseRows[0]) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };
  const phaseId = phaseRows[0].id as number;

  // Template de sesión para hoy
  const sessionRows = await sql`
    SELECT id, phase_id, day_of_week, activity_type, title, description,
           duration_min, intensity,
           level_min, level_max, rpm_min, rpm_max, watts_ref, routine_label
    FROM training_session_template
    WHERE phase_id = ${phaseId} AND day_of_week = ${planDay}
    LIMIT 1
  `;
  if (!sessionRows[0]) return { session: null, exercises: [], done: false, lastSets: {}, todaySets: {} };

  const sr = sessionRows[0];
  const session: TrainingSessionTemplate = {
    id: sr.id as number,
    phaseId: sr.phase_id as number,
    dayOfWeek: sr.day_of_week as number,
    activityType: sr.activity_type as TrainingSessionTemplate["activityType"],
    title: sr.title as string,
    description: sr.description as string | null,
    durationMin: sr.duration_min as number | null,
    intensity: sr.intensity as TrainingSessionTemplate["intensity"],
    levelMin: sr.level_min as number | null,
    levelMax: sr.level_max as number | null,
    rpmMin: sr.rpm_min as number | null,
    rpmMax: sr.rpm_max as number | null,
    wattsRef: sr.watts_ref as string | null,
    routineLabel: sr.routine_label as TrainingSessionTemplate["routineLabel"],
  };

  // Ejercicios (si es sesión de pesas)
  let exercises: TrainingExercise[] = [];
  if (session.activityType === "weights") {
    const exRows = await sql`
      SELECT id, session_template_id, sort_order, name, sets, reps_label,
             rest_seconds, muscle_group, notes
      FROM training_exercise
      WHERE session_template_id = ${session.id}
      ORDER BY sort_order
    `;
    exercises = exRows.map((r) => ({
      id: r.id as number,
      sessionTemplateId: r.session_template_id as number,
      sortOrder: r.sort_order as number,
      name: r.name as string,
      sets: r.sets as number,
      repsLabel: r.reps_label as string,
      restSeconds: r.rest_seconds as number | null,
      muscleGroup: r.muscle_group as string | null,
      notes: r.notes as string | null,
    }));
  }

  // ¿Sesión hecha hoy?
  const logRows = await sql`
    SELECT done FROM training_session_log
    WHERE user_id = ${userId} AND date = ${d}
    LIMIT 1
  `;
  const done = (logRows[0]?.done as boolean) ?? false;

  // Última sesión por ejercicio (antes de hoy)
  const lastSetRows = exercises.length > 0
    ? await sql`
        SELECT DISTINCT ON (exercise_id)
               exercise_id, weight_kg, reps_completed, duration_seconds
        FROM training_set_log
        WHERE user_id = ${userId}
          AND date < ${d}
          AND exercise_id = ANY(${exercises.map((e) => e.id)})
        ORDER BY exercise_id, date DESC, set_number DESC
      `
    : [];
  const lastSets: Record<number, LastSet> = {};
  for (const r of lastSetRows) {
    lastSets[r.exercise_id as number] = {
      weightKg: r.weight_kg as number | null,
      repsCompleted: r.reps_completed as number | null,
      durationSeconds: r.duration_seconds as number | null,
    };
  }

  // Sets de hoy por ejercicio
  const todaySetRows = exercises.length > 0
    ? await sql`
        SELECT exercise_id, set_number, weight_kg, reps_completed, duration_seconds
        FROM training_set_log
        WHERE user_id = ${userId} AND date = ${d}
          AND exercise_id = ANY(${exercises.map((e) => e.id)})
        ORDER BY exercise_id, set_number
      `
    : [];
  const todaySets: Record<number, TodaySetEntry[]> = {};
  for (const r of todaySetRows) {
    const eid = r.exercise_id as number;
    if (!todaySets[eid]) todaySets[eid] = [];
    todaySets[eid].push({
      setNumber: r.set_number as number,
      weightKg: r.weight_kg as number | null,
      repsCompleted: r.reps_completed as number | null,
      durationSeconds: r.duration_seconds as number | null,
    });
  }

  return { session, exercises, done, lastSets, todaySets };
}

// ─── markSessionDone ──────────────────────────────────────────────────────────

export async function markSessionDone(
  dateISO: string,
  sessionTemplateId: number,
  done: boolean
) {
  const userId = await getUserId();
  const d = dateISO;

  // Verificar que la plantilla de sesión pertenece al plan del usuario.
  const ok = await sql`
    SELECT 1 FROM training_session_template t
    JOIN training_phase p ON p.id = t.phase_id
    JOIN training_plan pl ON pl.id = p.plan_id
    WHERE t.id = ${sessionTemplateId} AND pl.user_id = ${userId}
    LIMIT 1
  `;
  if (!ok[0]) throw new Error("Sesión inválida");

  await sql`
    INSERT INTO training_session_log (user_id, date, session_template_id, done, completed_at, updated_at)
    VALUES (${userId}, ${d}, ${sessionTemplateId}, ${done},
            ${done ? new Date().toISOString() : null}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET done = EXCLUDED.done,
                  completed_at = EXCLUDED.completed_at,
                  updated_at = NOW()
  `;
  // Actualizar columna denormalizada en day_state
  await sql`
    INSERT INTO day_state (user_id, date, training_done, updated_at)
    VALUES (${userId}, ${d}, ${done}, NOW())
    ON CONFLICT (user_id, date)
    DO UPDATE SET training_done = EXCLUDED.training_done, updated_at = NOW()
  `;
  revalidatePath("/");
}

// ─── saveSetLog ───────────────────────────────────────────────────────────────

export async function saveSetLog(
  dateISO: string,
  exerciseId: number,
  setNumber: number,
  data: { weightKg?: number | null; repsCompleted?: number | null; durationSeconds?: number | null }
) {
  const userId = await getUserId();
  const d = dateISO;

  // Verificar que el ejercicio pertenece al plan del usuario.
  const ok = await sql`
    SELECT 1 FROM training_exercise e
    JOIN training_session_template t ON t.id = e.session_template_id
    JOIN training_phase p ON p.id = t.phase_id
    JOIN training_plan pl ON pl.id = p.plan_id
    WHERE e.id = ${exerciseId} AND pl.user_id = ${userId}
    LIMIT 1
  `;
  if (!ok[0]) throw new Error("Ejercicio inválido");

  // Sanear números: descartar no-finitos, negativos o absurdamente grandes.
  const cleanNum = (v: number | null | undefined) =>
    v == null || !Number.isFinite(v) || v < 0 || v > 10000 ? null : v;
  const cleanInt = (v: number | null | undefined) => {
    const c = cleanNum(v);
    return c == null ? null : Math.round(c);
  };
  const weightKg = cleanNum(data.weightKg);
  const repsCompleted = cleanInt(data.repsCompleted);
  const durationSeconds = cleanInt(data.durationSeconds);

  await sql`
    INSERT INTO training_set_log
      (user_id, date, exercise_id, set_number, weight_kg, reps_completed, duration_seconds, updated_at)
    VALUES
      (${userId}, ${d}, ${exerciseId}, ${setNumber},
       ${weightKg}, ${repsCompleted},
       ${durationSeconds}, NOW())
    ON CONFLICT (user_id, date, exercise_id, set_number)
    DO UPDATE SET
      weight_kg = EXCLUDED.weight_kg,
      reps_completed = EXCLUDED.reps_completed,
      duration_seconds = EXCLUDED.duration_seconds,
      updated_at = NOW()
  `;
}
