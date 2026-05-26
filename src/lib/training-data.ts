// src/lib/training-data.ts
// Datos estáticos del plan de entrenamiento. Solo se usa en el servidor para el auto-seed.

export type ExerciseSeed = {
  name: string;
  sets: number;
  reps_label: string;
  rest_seconds: number;
  muscle_group: string;
  notes: string;
};

export type SessionSeed = {
  day_of_week: number; // 1=Lun … 7=Dom (sin sábado)
  activity_type: "bike" | "weights" | "rest";
  title: string;
  description: string | null;
  duration_min: number;
  intensity: "low" | "moderate" | "high" | "very_high" | "rest";
  level_min: number | null;
  level_max: number | null;
  rpm_min: number | null;
  rpm_max: number | null;
  watts_ref: string | null;
  routine_label: "A" | "B" | "A_reducida" | "B_reducida" | null;
  exercises: ExerciseSeed[];
};

export type PhaseSeed = {
  phase_number: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  start_month: number;
  end_month: number;
  bike_km_week_min: number | null;
  bike_km_week_max: number | null;
  weights_days_per_week: number;
  sessions: SessionSeed[];
};

// ─── Ejercicios ───────────────────────────────────────────────────────────────

const RUTINA_A: ExerciseSeed[] = [
  { name: "Sentadilla en máquina o libre", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Cuádriceps / Glúteos", notes: "Rodilla sobre pie, espalda recta" },
  { name: "Prensa de piernas (Leg Press)", sets: 3, reps_label: "15", rest_seconds: 75, muscle_group: "Cuádriceps / Isquios", notes: "El ejercicio más específico para bici" },
  { name: "Zancadas con mancuerna", sets: 3, reps_label: "12 c/lado", rest_seconds: 75, muscle_group: "Glúteos / Estabiliz.", notes: "Simula el pedaleo unilateral" },
  { name: "Curl de isquiotibiales (máquina)", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Isquiotibiales", notes: "Equilibrio con cuádriceps" },
  { name: "Elevación de pantorrillas de pie", sets: 3, reps_label: "20", rest_seconds: 45, muscle_group: "Gemelos / Sóleo", notes: "Clave para pedaleo eficiente" },
  { name: "Plancha frontal", sets: 3, reps_label: "40-60 seg", rest_seconds: 60, muscle_group: "Core / Transverso", notes: "Espalda recta, sin hundir caderas" },
  { name: "Crunch en máquina", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Recto abdominal", notes: "Lento y controlado" },
  { name: "Plancha lateral", sets: 2, reps_label: "30 seg c/lado", rest_seconds: 45, muscle_group: "Oblicuos", notes: "Estabilidad lateral en la bici" },
];

const RUTINA_B: ExerciseSeed[] = [
  { name: "Jalón al pecho (polea alta)", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Dorsal / Bíceps", notes: "Pecho adelante, espalda recta" },
  { name: "Remo en máquina sentado", sets: 3, reps_label: "12-15", rest_seconds: 75, muscle_group: "Romboides / Trapecio", notes: "Fundamental para postura en bici" },
  { name: "Press de hombros con mancuernas", sets: 3, reps_label: "12", rest_seconds: 75, muscle_group: "Deltoides", notes: "Peso moderado, sin arquear lumbar" },
  { name: "Elevaciones laterales", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Hombro lateral", notes: "Codos ligeramente flexionados" },
  { name: "Press de pecho en máquina", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Pectoral / Tríceps", notes: "Complementario" },
  { name: "Curl de bíceps con barra", sets: 3, reps_label: "12", rest_seconds: 60, muscle_group: "Bíceps", notes: "Control en la bajada" },
  { name: "Extensión tríceps en polea", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Tríceps", notes: "Codos pegados al cuerpo" },
  { name: "Superman en suelo o banco", sets: 3, reps_label: "15", rest_seconds: 60, muscle_group: "Lumbar / Glúteos", notes: "Protege la espalda baja en bici" },
  { name: "Plancha con rotación (Spider)", sets: 3, reps_label: "10 c/lado", rest_seconds: 60, muscle_group: "Core dinámico", notes: "Control de cadera" },
];

const RUTINA_A_REDUCIDA: ExerciseSeed[] = [
  { name: "Prensa de piernas (Leg Press)", sets: 3, reps_label: "15", rest_seconds: 75, muscle_group: "Cuádriceps / Isquios", notes: "Principal estímulo para bici" },
  { name: "Plancha frontal", sets: 3, reps_label: "40-60 seg", rest_seconds: 60, muscle_group: "Core / Transverso", notes: "Espalda recta" },
  { name: "Plancha lateral", sets: 2, reps_label: "30 seg c/lado", rest_seconds: 45, muscle_group: "Oblicuos", notes: "Estabilidad lateral" },
];

const RUTINA_B_REDUCIDA: ExerciseSeed[] = [
  { name: "Jalón al pecho (polea alta)", sets: 3, reps_label: "12-15", rest_seconds: 90, muscle_group: "Dorsal / Bíceps", notes: "Pecho adelante, espalda recta" },
  { name: "Remo en máquina sentado", sets: 3, reps_label: "12-15", rest_seconds: 75, muscle_group: "Romboides / Trapecio", notes: "Postura en bici" },
  { name: "Plancha con rotación (Spider)", sets: 3, reps_label: "10 c/lado", rest_seconds: 60, muscle_group: "Core dinámico", notes: "Control de cadera" },
];

// ─── Plan completo ────────────────────────────────────────────────────────────
// Horario ajustado: Sábado = Sábado Santo (sin sesión). Domingo = Rodada larga.

export const TRAINING_SEED: {
  name: string;
  start_date: string;
  race_date: string;
  phases: PhaseSeed[];
} = {
  name: "Plan Ciclismo — L'Étape 2026",
  start_date: "2026-03-04",
  race_date: "2026-10-04", // Confirmar fecha exacta antes del seed
  phases: [
    // ── FASE 1 — Adaptación (meses 1-2: mar-abr) ────────────────────────────
    {
      phase_number: 1,
      name: "Fase 1 — Adaptación",
      description: "Base aeróbica + hábito. Meses 1–2.",
      start_month: 1, end_month: 2,
      bike_km_week_min: 30, bike_km_week_max: 50,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — base aeróbica", description: null, duration_min: 40, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 85, watts_ref: "~50W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A (Tren Inferior + Core)", description: "Sentadillas, prensa, zancadas, core. Calentar 8-10 min en bici antes.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A", exercises: RUTINA_A },
        { day_of_week: 3, activity_type: "bike", title: "Bici — técnica y cadencia", description: null, duration_min: 45, intensity: "low", level_min: 2, level_max: 3, rpm_min: 80, rpm_max: 85, watts_ref: "~40W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B (Tren Superior + Core)", description: "Jalón, remo, hombros, core. Finalizar con 5 min stretching.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B", exercises: RUTINA_B },
        { day_of_week: 5, activity_type: "bike", title: "Bici — continua moderada", description: null, duration_min: 50, intensity: "moderate", level_min: 5, level_max: 5, rpm_min: 78, rpm_max: 78, watts_ref: "~65W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada larga 🚵", description: "Objetivo distancia: 12–15 km. El más importante de la semana.", duration_min: 75, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 80, watts_ref: null, routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 2 — Resistencia (meses 3-4: may-jun) ───────────────────────────
    {
      phase_number: 2,
      name: "Fase 2 — Resistencia",
      description: "Volumen + fuerza. Meses 3–4.",
      start_month: 3, end_month: 4,
      bike_km_week_min: 60, bike_km_week_max: 100,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — resistencia", description: null, duration_min: 60, intensity: "moderate", level_min: 7, level_max: 8, rpm_min: 80, rpm_max: 80, watts_ref: "~90W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A (cargas mayores)", description: "Aumentar peso vs Fase 1. Sentadillas, prensa, zancadas, core.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A", exercises: RUTINA_A },
        { day_of_week: 3, activity_type: "bike", title: "Bici — intervalos", description: "5×3 min Nivel 11-12 / 2 min Nivel 3 de recuperación.", duration_min: 50, intensity: "high", level_min: 11, level_max: 12, rpm_min: 90, rpm_max: 95, watts_ref: "120-150W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B (cargas mayores)", description: "Aumentar peso vs Fase 1. Jalón, remo, hombros, core.", duration_min: 55, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B", exercises: RUTINA_B },
        { day_of_week: 5, activity_type: "bike", title: "Bici — ritmo carrera", description: "Objetivo: 20 km.", duration_min: 75, intensity: "moderate", level_min: 8, level_max: 9, rpm_min: 82, rpm_max: 82, watts_ref: null, routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada larga 🚵", description: "Objetivo: 20–25 km.", duration_min: 105, intensity: "moderate", level_min: 6, level_max: 7, rpm_min: 80, rpm_max: 80, watts_ref: null, routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 3 — Velocidad (meses 5-6: jul-ago) ─────────────────────────────
    {
      phase_number: 3,
      name: "Fase 3 — Velocidad",
      description: "Velocidad + simulacros de 30 km. Meses 5–6.",
      start_month: 5, end_month: 6,
      bike_km_week_min: 100, bike_km_week_max: 130,
      weights_days_per_week: 2,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — velocidad", description: "Series de 1 km. RPM 90+.", duration_min: 45, intensity: "very_high", level_min: 15, level_max: 16, rpm_min: 90, rpm_max: 100, watts_ref: "180-220W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A reducida", description: "Solo prensa de piernas + core (3 ejercicios).", duration_min: 40, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A_reducida", exercises: RUTINA_A_REDUCIDA },
        { day_of_week: 3, activity_type: "bike", title: "Bici — recuperación activa", description: "Suave. No forzar.", duration_min: 35, intensity: "low", level_min: 2, level_max: 3, rpm_min: 70, rpm_max: 70, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "weights", title: "Pesas — Rutina B reducida", description: "Jalón + remo + core (3 ejercicios).", duration_min: 40, intensity: "moderate", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "B_reducida", exercises: RUTINA_B_REDUCIDA },
        { day_of_week: 5, activity_type: "bike", title: "Bici — HIIT", description: "8×1 min máximo / 90 seg recuperación.", duration_min: 50, intensity: "very_high", level_min: 16, level_max: 25, rpm_min: 95, rpm_max: 100, watts_ref: ">200W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — Simulacro 30 km 🏆", description: "Ritmo carrera real.", duration_min: 90, intensity: "high", level_min: 10, level_max: 12, rpm_min: 85, rpm_max: 90, watts_ref: "150-180W", routine_label: null, exercises: [] },
      ],
    },
    // ── FASE 4 — Taper (últimas 3 semanas: sep) ─────────────────────────────
    {
      phase_number: 4,
      name: "Fase 4 — Taper",
      description: "Descarga + preparación carrera. Últimas 3 semanas.",
      start_month: 7, end_month: 8, // calculado desde race_date en calculatePhaseNumber
      bike_km_week_min: 40, bike_km_week_max: 60,
      weights_days_per_week: 1,
      sessions: [
        { day_of_week: 1, activity_type: "bike", title: "Bici — mantenimiento", description: null, duration_min: 35, intensity: "low", level_min: 5, level_max: 8, rpm_min: 75, rpm_max: 80, watts_ref: "60-90W", routine_label: null, exercises: [] },
        { day_of_week: 2, activity_type: "weights", title: "Pesas — Rutina A reducida (activación)", description: "Solo activación. Cargas 50% de lo habitual.", duration_min: 30, intensity: "low", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: "A_reducida", exercises: RUTINA_A_REDUCIDA },
        { day_of_week: 3, activity_type: "bike", title: "Bici — suave", description: "Sin esfuerzo. Piernas sueltas.", duration_min: 30, intensity: "low", level_min: 1, level_max: 2, rpm_min: 70, rpm_max: 75, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 4, activity_type: "rest", title: "Descanso activo", description: "Stretching completo: cuádriceps, cadera, espalda.", duration_min: 20, intensity: "rest", level_min: null, level_max: null, rpm_min: null, rpm_max: null, watts_ref: null, routine_label: null, exercises: [] },
        { day_of_week: 5, activity_type: "bike", title: "Bici — activación", description: "Piernas frescas.", duration_min: 25, intensity: "low", level_min: 3, level_max: 4, rpm_min: 75, rpm_max: 78, watts_ref: "<50W", routine_label: null, exercises: [] },
        { day_of_week: 7, activity_type: "bike", title: "Bici — rodada corta", description: "15–20 km cómodos. Sin reventar.", duration_min: 45, intensity: "low", level_min: 5, level_max: 5, rpm_min: 75, rpm_max: 80, watts_ref: "~60W", routine_label: null, exercises: [] },
      ],
    },
  ],
};
