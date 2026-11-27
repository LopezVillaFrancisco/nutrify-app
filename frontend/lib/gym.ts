"use client";

import { apiResult } from "@/lib/api";
import { fmtDec, todayISO } from "@/lib/format";
import { invalidate, setCached } from "@/lib/store";
import { keys } from "@/lib/queries";
import type { RoutineExercise, RoutineRow, WorkoutExercise, WorkoutRow, WorkoutSet } from "@/lib/types";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** "Press banca 4x8" → { name, sets: 4, reps: 8 }. Sin series × reps usa 3 × 10. */
export function parseRoutineText(text: string): RoutineExercise[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-•*·\d.)\s]+(?=\D)/, ""))
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s:,-]+(\d{1,2})\s*[x×*]\s*(\d{1,3})\s*$/i);
      if (m && m[1].trim()) return { name: m[1].trim(), sets: Number(m[2]), reps: Number(m[3]) };
      return { name: line, sets: 3, reps: 10 };
    })
    .filter((e) => e.sets > 0 && e.sets <= 20 && e.reps > 0);
}

export const routineToText = (ex: RoutineExercise[]) => ex.map((e) => `${e.name} ${e.sets}x${e.reps}`).join("\n");

/** Lo que hiciste la última vez en ese ejercicio (otro entreno, el más reciente con datos). */
export function previousFor(name: string, workouts: WorkoutRow[], excludeId?: string): WorkoutSet[] | null {
  const n = norm(name);
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    const ex = w.exercises.find((e) => norm(e.name) === n);
    const sets = ex?.sets.filter((s) => s.reps || s.kg);
    if (sets?.length) return sets;
  }
  return null;
}

export function describeSets(sets: WorkoutSet[]): string {
  const kgs = [...new Set(sets.map((s) => s.kg).filter((k): k is number => k !== null))];
  const reps = sets.map((s) => s.reps ?? "–").join(", ");
  if (kgs.length === 1) return `${fmtDec(kgs[0])} kg × ${reps}`;
  return sets.map((s) => `${s.kg !== null ? fmtDec(s.kg) : "–"}×${s.reps ?? "–"}`).join(" · ");
}

/** Series hechas, series totales y volumen (kg × reps, sin calentamiento) de un entreno. */
export function workoutStats(w: Pick<WorkoutRow, "exercises">) {
  let sets = 0;
  let total = 0;
  let volume = 0;
  for (const e of w.exercises)
    for (const s of e.sets) {
      total++;
      if (!s.done) continue;
      sets++;
      if (!s.warmup) volume += (s.kg ?? 0) * (s.reps ?? 0);
    }
  return { sets, total, volume, exercises: w.exercises.length };
}

/** 1RM estimado (Epley): cuánto levantarías a 1 repetición. Sirve para comparar 60×10 con 70×6. */
export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));

export type Session = {
  workoutId: string;
  date: string;
  sets: WorkoutSet[];
  maxKg: number;
  bestE1rm: number;
  best: WorkoutSet | null;
  volume: number;
};

/** Historial de un ejercicio: una entrada por entreno (series hechas, sin calentamiento), de la más vieja a la más nueva. */
export function exerciseHistory(name: string, workouts: WorkoutRow[], excludeId?: string): Session[] {
  const n = norm(name);
  const out: Session[] = [];
  for (const w of workouts) {
    if (w.id === excludeId) continue;
    const sets = w.exercises
      .filter((e) => norm(e.name) === n)
      .flatMap((e) => e.sets)
      .filter((s) => s.done && !s.warmup && (s.reps || s.kg));
    if (!sets.length) continue;
    let best: WorkoutSet | null = null;
    let bestE1rm = 0;
    let maxKg = 0;
    let volume = 0;
    for (const s of sets) {
      const kg = s.kg ?? 0;
      const reps = s.reps ?? 0;
      maxKg = Math.max(maxKg, kg);
      volume += kg * reps;
      const v = e1rm(kg, reps);
      if (v > bestE1rm) {
        bestE1rm = v;
        best = s;
      }
    }
    out.push({ workoutId: w.id, date: w.date, sets, maxKg, bestE1rm, best, volume });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Récords previos de un ejercicio (para avisar cuando los superás). */
export function recordsFor(name: string, workouts: WorkoutRow[], excludeId?: string) {
  const h = exerciseHistory(name, workouts, excludeId);
  return {
    maxKg: Math.max(0, ...h.map((s) => s.maxKg)),
    bestE1rm: Math.max(0, ...h.map((s) => s.bestE1rm)),
    sessions: h.length,
  };
}

/** Todos los ejercicios que hiciste alguna vez, del más reciente al más viejo. */
export function doneExercises(workouts: WorkoutRow[]): { name: string; muscle?: string; last: string; count: number }[] {
  const map = new Map<string, { name: string; muscle?: string; last: string; count: number }>();
  for (const w of workouts)
    for (const e of w.exercises) {
      if (!e.sets.some((s) => s.done)) continue;
      const k = norm(e.name);
      const cur = map.get(k);
      if (!cur) map.set(k, { name: e.name, muscle: e.muscle, last: w.date, count: 1 });
      else {
        cur.count++;
        if (w.date > cur.last) cur.last = w.date;
      }
    }
  return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : b.count - a.count));
}

/** Minutos que duró (o lleva) un entreno. */
export function durationMin(w: Pick<WorkoutRow, "started_at" | "finished_at">, now = Date.now()) {
  const end = w.finished_at ? new Date(w.finished_at).getTime() : now;
  return Math.max(0, Math.round((end - new Date(w.started_at).getTime()) / 60000));
}

/** Crea un entreno a partir de una rutina (o libre) y devuelve su id. */
export async function startWorkout(routine: RoutineRow | null): Promise<{ id: string | null; error: unknown }> {
  const exercises: WorkoutExercise[] = (routine?.exercises ?? []).map((e) => ({
    name: e.name,
    muscle: e.muscle,
    restSec: e.restSec,
    sets: Array.from({ length: e.sets }, () => ({ reps: null, kg: null, done: false })),
  }));
  const { data, error } = await apiResult<WorkoutRow>("/api/workouts", {
    method: "POST",
    body: { date: todayISO(), routine_id: routine?.id ?? null, name: routine?.name ?? "Entreno libre", exercises },
  });
  if (data) {
    setCached(keys.workout(data.id), data);
    invalidate(keys.workouts, "activity:");
  }
  return { id: data?.id ?? null, error };
}

/** Objetivo de reps de la rutina para un ejercicio (para mostrar de referencia). */
export function targetReps(routine: RoutineRow | undefined, name: string): number | null {
  const n = norm(name);
  return routine?.exercises.find((e) => norm(e.name) === n)?.reps ?? null;
}

/** Ejercicio de la rutina (objetivo de series, reps, kilos y descanso). */
export function routineExercise(routine: RoutineRow | undefined, name: string) {
  const n = norm(name);
  return routine?.exercises.find((e) => norm(e.name) === n);
}

/* ---------- Carga rápida: lo que hiciste hoy, ejercicio por ejercicio ---------- */

/** El entreno del día (hoy por defecto) si ya hay uno, o uno nuevo vacío. */
export async function todayWorkout(workouts: WorkoutRow[], date = todayISO()): Promise<{ w: WorkoutRow | null; error: unknown }> {
  const today = date;
  const existing = workouts.find((x) => x.date === today);
  if (existing) return { w: existing, error: null };
  // El backend devuelve el de ese día si ya existe (aunque no esté en la lista local) o crea uno vacío
  const { data, error } = await apiResult<WorkoutRow>("/api/workouts/today", { method: "POST", body: { date: today } });
  return { w: data, error };
}

/**
 * Guarda los ejercicios del entreno (agregar, editar o borrar uno) y marca la hora de lo último cargado
 * como fin, así la duración se calcula sola sin tener que tocar "Terminar".
 */
export async function saveWorkoutExercises(
  w: WorkoutRow,
  exercises: WorkoutExercise[],
  list: WorkoutRow[] = [],
): Promise<{ w: WorkoutRow; error: unknown }> {
  const next: WorkoutRow = { ...w, exercises, finished_at: w.routine_id && !w.finished_at ? null : new Date().toISOString() };
  const { error } = await apiResult<WorkoutRow>(`/api/workouts/${w.id}`, {
    method: "PATCH",
    body: { exercises: next.exercises, finished_at: next.finished_at },
  });
  if (!error) {
    setCached(keys.workout(w.id), next);
    // La lista se actualiza al instante (sin esperar a la base)
    setCached(keys.workouts, [next, ...list.filter((x) => x.id !== w.id)]);
    invalidate("activity:");
  }
  return { w: next, error };
}
