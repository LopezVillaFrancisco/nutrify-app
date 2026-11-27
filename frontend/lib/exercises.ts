/**
 * Biblioteca de ejercicios (nombres como se dicen en un gimnasio de Argentina), agrupados por músculo.
 * step = cuánto suben/bajan los botones − / + de kilos (barra 2,5; mancuernas y máquinas 2 o 5).
 */
export type Muscle =
  | "Pecho"
  | "Espalda"
  | "Hombros"
  | "Bíceps"
  | "Tríceps"
  | "Cuádriceps"
  | "Femorales y glúteos"
  | "Pantorrillas"
  | "Abdomen"
  | "Cardio"
  | "Otro";

export const MUSCLES: Muscle[] = [
  "Pecho",
  "Espalda",
  "Hombros",
  "Bíceps",
  "Tríceps",
  "Cuádriceps",
  "Femorales y glúteos",
  "Pantorrillas",
  "Abdomen",
  "Cardio",
  "Otro",
];

export type Equipment = "Barra" | "Mancuernas" | "Máquina" | "Polea" | "Peso corporal" | "Cardio";

export type ExerciseDef = { name: string; muscle: Muscle; equipment: Equipment; step: number };

const e = (name: string, muscle: Muscle, equipment: Equipment, step?: number): ExerciseDef => ({
  name,
  muscle,
  equipment,
  step: step ?? (equipment === "Barra" ? 2.5 : equipment === "Mancuernas" ? 2 : equipment === "Peso corporal" ? 2.5 : 5),
});

export const EXERCISES: ExerciseDef[] = [
  // Pecho
  e("Press banca", "Pecho", "Barra"),
  e("Press banca inclinado", "Pecho", "Barra"),
  e("Press banca declinado", "Pecho", "Barra"),
  e("Press con mancuernas", "Pecho", "Mancuernas"),
  e("Press inclinado con mancuernas", "Pecho", "Mancuernas"),
  e("Aperturas con mancuernas", "Pecho", "Mancuernas"),
  e("Cruces en polea", "Pecho", "Polea"),
  e("Peck deck", "Pecho", "Máquina"),
  e("Press de pecho en máquina", "Pecho", "Máquina"),
  e("Fondos en paralelas", "Pecho", "Peso corporal"),
  e("Flexiones", "Pecho", "Peso corporal"),
  // Espalda
  e("Dominadas", "Espalda", "Peso corporal"),
  e("Jalón al pecho", "Espalda", "Polea"),
  e("Jalón agarre cerrado", "Espalda", "Polea"),
  e("Remo con barra", "Espalda", "Barra"),
  e("Remo con mancuerna", "Espalda", "Mancuernas"),
  e("Remo en polea baja", "Espalda", "Polea"),
  e("Remo en máquina", "Espalda", "Máquina"),
  e("Remo T", "Espalda", "Barra"),
  e("Pullover en polea", "Espalda", "Polea"),
  e("Peso muerto", "Espalda", "Barra"),
  e("Hiperextensiones", "Espalda", "Peso corporal"),
  // Hombros
  e("Press militar", "Hombros", "Barra"),
  e("Press de hombros con mancuernas", "Hombros", "Mancuernas"),
  e("Press de hombros en máquina", "Hombros", "Máquina"),
  e("Elevaciones laterales", "Hombros", "Mancuernas", 1),
  e("Elevaciones laterales en polea", "Hombros", "Polea", 2.5),
  e("Elevaciones frontales", "Hombros", "Mancuernas", 1),
  e("Pájaros (posterior)", "Hombros", "Mancuernas", 1),
  e("Face pull", "Hombros", "Polea", 2.5),
  e("Vuelos posteriores en máquina", "Hombros", "Máquina"),
  e("Remo al mentón", "Hombros", "Barra"),
  e("Encogimientos (trapecio)", "Hombros", "Mancuernas"),
  // Bíceps
  e("Curl con barra", "Bíceps", "Barra"),
  e("Curl con mancuernas", "Bíceps", "Mancuernas", 1),
  e("Curl martillo", "Bíceps", "Mancuernas", 1),
  e("Curl predicador", "Bíceps", "Máquina", 2.5),
  e("Curl en polea", "Bíceps", "Polea", 2.5),
  e("Curl concentrado", "Bíceps", "Mancuernas", 1),
  // Tríceps
  e("Extensión de tríceps en polea", "Tríceps", "Polea", 2.5),
  e("Tríceps con soga", "Tríceps", "Polea", 2.5),
  e("Press francés", "Tríceps", "Barra"),
  e("Extensión sobre la cabeza", "Tríceps", "Mancuernas", 1),
  e("Press banca agarre cerrado", "Tríceps", "Barra"),
  e("Fondos en banco", "Tríceps", "Peso corporal"),
  e("Patada de tríceps", "Tríceps", "Mancuernas", 1),
  // Cuádriceps
  e("Sentadilla", "Cuádriceps", "Barra"),
  e("Sentadilla frontal", "Cuádriceps", "Barra"),
  e("Sentadilla búlgara", "Cuádriceps", "Mancuernas"),
  e("Sentadilla goblet", "Cuádriceps", "Mancuernas"),
  e("Prensa", "Cuádriceps", "Máquina", 10),
  e("Hack squat", "Cuádriceps", "Máquina"),
  e("Sillón de cuádriceps", "Cuádriceps", "Máquina"),
  e("Estocadas", "Cuádriceps", "Mancuernas"),
  // Femorales y glúteos
  e("Peso muerto rumano", "Femorales y glúteos", "Barra"),
  e("Camilla de femorales", "Femorales y glúteos", "Máquina"),
  e("Femorales sentado", "Femorales y glúteos", "Máquina"),
  e("Hip thrust", "Femorales y glúteos", "Barra", 5),
  e("Patada de glúteo en polea", "Femorales y glúteos", "Polea", 2.5),
  e("Abductores", "Femorales y glúteos", "Máquina"),
  e("Aductores", "Femorales y glúteos", "Máquina"),
  e("Buenos días", "Femorales y glúteos", "Barra"),
  // Pantorrillas
  e("Gemelos de pie", "Pantorrillas", "Máquina"),
  e("Gemelos sentado", "Pantorrillas", "Máquina"),
  e("Gemelos en prensa", "Pantorrillas", "Máquina", 10),
  // Abdomen
  e("Crunch", "Abdomen", "Peso corporal"),
  e("Crunch en polea", "Abdomen", "Polea", 2.5),
  e("Plancha", "Abdomen", "Peso corporal"),
  e("Elevación de piernas", "Abdomen", "Peso corporal"),
  e("Rueda abdominal", "Abdomen", "Peso corporal"),
  e("Russian twist", "Abdomen", "Peso corporal"),
  // Cardio (reps = minutos)
  e("Cinta", "Cardio", "Cardio", 0.5),
  e("Bici fija", "Cardio", "Cardio", 1),
  e("Elíptico", "Cardio", "Cardio", 1),
  e("Remo (máquina de cardio)", "Cardio", "Cardio", 1),
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const exerciseKey = norm;

/* ---------- Lista combinada: la de la app + tus ejercicios (tabla exercises) ---------- */

export type ExerciseItem = ExerciseDef & {
  /** id de tu fila (si lo creaste o lo editaste) */
  id?: string;
  /** true = lo creaste vos (no está en la lista de la app) */
  custom: boolean;
  /** nombre original de la app, si lo renombraste */
  base?: string | null;
  hidden: boolean;
};

type UserRow = { id: string; name: string; muscle: string; step: number; base: string | null; hidden: boolean };

let userRows: UserRow[] = [];
let cache: { all: ExerciseItem[]; byName: Map<string, ExerciseItem> } | null = null;

/** Carga tus ejercicios (lo llama useExercises). */
export function setUserExercises(rows: UserRow[]) {
  if (rows === (userRows as unknown)) return;
  userRows = rows;
  cache = null;
}

const asMuscle = (m: string): Muscle => ((MUSCLES as string[]).includes(m) ? (m as Muscle) : "Otro");

function build() {
  if (cache) return cache;
  const byName = new Map<string, ExerciseItem>();
  const replaced = new Set<string>();
  for (const r of userRows) if (r.base) replaced.add(norm(r.base));
  // 1) La lista de la app (lo que reemplazaste con otro nombre no aparece)
  for (const x of EXERCISES) {
    if (replaced.has(norm(x.name))) continue;
    byName.set(norm(x.name), { ...x, custom: false, hidden: false });
  }
  // 2) Tus filas: cambian uno de la app (mismo nombre o base) o son nuevos
  for (const r of userRows) {
    const lib = EXERCISES.find((x) => norm(x.name) === norm(r.base ?? r.name));
    byName.set(norm(r.name), {
      name: r.name,
      muscle: asMuscle(r.muscle),
      equipment: lib?.equipment ?? "Máquina",
      step: Number(r.step) > 0 ? Number(r.step) : (lib?.step ?? 2.5),
      id: r.id,
      custom: !lib,
      base: r.base,
      hidden: r.hidden,
    });
  }
  const all = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  cache = { all, byName };
  return cache;
}

/** Todos los ejercicios (sin los ocultos, salvo que pidas includeHidden). */
export const allExercises = (includeHidden = false) => build().all.filter((x) => includeHidden || !x.hidden);

export const findExercise = (name: string) => build().byName.get(norm(name));

/** Músculo de un ejercicio: el tuyo/el de la lista primero; si no, el guardado en el entreno; si no, "Otro". */
export function muscleOf(name: string, saved?: string): Muscle {
  const found = findExercise(name);
  if (found) return found.muscle;
  if (saved && (MUSCLES as string[]).includes(saved)) return saved as Muscle;
  return "Otro";
}

/** Cuánto sube/baja el botón de kilos. */
export const stepOf = (name: string) => findExercise(name)?.step ?? 2.5;

export const isCardio = (name: string, muscle?: string) => muscleOf(name, muscle) === "Cardio";

/** Saltos de kilos para elegir (barra 2,5; mancuernas 1 o 2; máquinas 5, 7 o 10). */
export const STEPS = [0.5, 1, 1.25, 2, 2.5, 5, 7, 10];
