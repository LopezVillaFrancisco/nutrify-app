"use client";

import { saveWorkoutExercises, todayWorkout } from "@/lib/gym";
import type { WorkoutExercise, WorkoutRow } from "@/lib/types";

/**
 * Gym sin señal: si no hay internet, lo que anotás del día queda guardado en el teléfono
 * y se sube solo cuando vuelve la conexión. Se guarda la lista completa de ejercicios de ese día.
 */
const KEY = "nutrify:gym-pending";
type Pending = Record<string, WorkoutExercise[]>; // fecha → ejercicios del día

function read(): Pending {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Pending;
  } catch {
    return {};
  }
}

function write(p: Pending) {
  try {
    if (Object.keys(p).length) localStorage.setItem(KEY, JSON.stringify(p));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event("nutrify:gym-pending"));
}

export const pendingFor = (date: string): WorkoutExercise[] | null => read()[date] ?? null;
export const hasPending = () => Object.keys(read()).length > 0;

export function clearPending(date: string) {
  const p = read();
  if (!(date in p)) return;
  delete p[date];
  write(p);
}

export function setPending(date: string, exercises: WorkoutExercise[]) {
  write({ ...read(), [date]: exercises });
}

/** ¿El error es por falta de conexión (y no de la base)? */
export const isOffline = (error?: unknown) =>
  (typeof navigator !== "undefined" && !navigator.onLine) ||
  (error as { status?: number } | null)?.status === 0 ||
  /fetch|network|load failed/i.test(String((error as { message?: string })?.message ?? error ?? ""));

let syncing = false;

/** Sube lo pendiente. Devuelve cuántos días se subieron (0 si no había o sigue sin señal). */
export async function syncPending(workouts: WorkoutRow[]): Promise<number> {
  if (syncing || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
  const pending = read();
  const dates = Object.keys(pending);
  if (!dates.length) return 0;
  syncing = true;
  let done = 0;
  let list = workouts;
  try {
    for (const date of dates) {
      const { w } = await todayWorkout(list, date);
      if (!w) break;
      const r = await saveWorkoutExercises(w, pending[date], list);
      if (r.error) break;
      list = [r.w, ...list.filter((x) => x.id !== r.w.id)];
      const rest = read();
      delete rest[date];
      write(rest);
      done++;
    }
  } finally {
    syncing = false;
  }
  return done;
}
