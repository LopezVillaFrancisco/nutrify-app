"use client";

import { apiResult } from "@/lib/api";
import { exerciseKey, findExercise, setUserExercises, type Muscle } from "@/lib/exercises";
import { fetchers, isMissingTable, keys } from "@/lib/queries";
import { invalidate, useQuery } from "@/lib/store";
import type { ExerciseRow } from "@/lib/types";

/** Trae tus ejercicios y los mezcla con la lista de la app (todas las pantallas de Gym lo llaman). */
export function useExercises() {
  const q = useQuery<ExerciseRow[]>(keys.exercises, fetchers.exercises);
  if (q.data) setUserExercises(q.data);
  return q;
}

const SCHEMA_MSG = "Falta crear la tabla de ejercicios: corré el SQL nuevo en Supabase.";

/**
 * Renombra un ejercicio en todos tus entrenos y rutinas, así el historial, el progreso y los récords siguen juntos.
 * Lo hace el backend en una sola transacción.
 */
async function renameEverywhere(oldName: string, newName: string): Promise<string | null> {
  const { error } = await apiResult("/api/exercises/rename", { method: "POST", body: { from: oldName, to: newName } });
  return error ? "No se pudo renombrar en tus entrenos." : null;
}

function refresh() {
  invalidate(keys.exercises, keys.routines, keys.workouts, "workout:");
}

export type ExerciseDraft = { name: string; muscle: Muscle; step: number; hidden?: boolean };

/**
 * Crear o editar. `original` = nombre que tenía (null si es nuevo).
 * Si era de la lista de la app, se guarda tu versión (y si lo renombraste, queda anotado cuál reemplaza).
 */
export async function saveExercise(original: string | null, d: ExerciseDraft): Promise<string | null> {
  const name = d.name.trim().replace(/\s+/g, " ");
  if (!name) return "Poné un nombre.";
  const clash = findExercise(name);
  if (clash && (!original || exerciseKey(original) !== exerciseKey(name))) return `Ya existe “${clash.name}”.`;

  const before = original ? findExercise(original) : undefined;
  const row = { name, muscle: d.muscle, step: d.step, hidden: d.hidden ?? false };
  let error: unknown;
  if (before?.id) {
    // Ya tenía fila tuya: se actualiza (si era de la app y lo renombrás, se anota el nombre original)
    const base = before.base ?? (!before.custom && exerciseKey(before.name) !== exerciseKey(name) ? before.name : null);
    ({ error } = await apiResult(`/api/exercises/${before.id}`, { method: "PUT", body: { ...row, base } }));
  } else {
    const base = before && !before.custom && exerciseKey(before.name) !== exerciseKey(name) ? before.name : null;
    ({ error } = await apiResult("/api/exercises", { method: "POST", body: { ...row, base } }));
  }
  if (error) return isMissingTable(error) ? SCHEMA_MSG : (error as Error).message || "No se pudo guardar. Probá de nuevo.";

  if (original && exerciseKey(original) !== exerciseKey(name)) {
    const err = await renameEverywhere(original, name);
    if (err) {
      refresh();
      return err;
    }
  }
  refresh();
  return null;
}

/** Ocultar o volver a mostrar (sirve para los de la app y los tuyos). */
export async function setHidden(name: string, hidden: boolean): Promise<string | null> {
  const ex = findExercise(name);
  if (!ex) return null;
  const row = { name: ex.name, muscle: ex.muscle, step: ex.step, base: ex.base ?? null, hidden };
  const { error } = ex.id
    ? await apiResult(`/api/exercises/${ex.id}`, { method: "PUT", body: row })
    : await apiResult("/api/exercises", { method: "POST", body: row });
  if (error) return isMissingTable(error) ? SCHEMA_MSG : "No se pudo guardar.";
  refresh();
  return null;
}

/**
 * Borrar tu fila: si lo creaste vos, deja de estar en la lista (tus entrenos quedan);
 * si era de la app, vuelve a como venía (y si lo habías renombrado, recupera el nombre en tus entrenos).
 */
export async function resetExercise(name: string): Promise<string | null> {
  const ex = findExercise(name);
  if (!ex?.id) return null;
  const { error } = await apiResult(`/api/exercises/${ex.id}`, { method: "DELETE" });
  if (error) return "No se pudo borrar.";
  if (ex.base && exerciseKey(ex.base) !== exerciseKey(ex.name)) {
    const err = await renameEverywhere(ex.name, ex.base);
    if (err) {
      refresh();
      return err;
    }
  }
  refresh();
  return null;
}

/** Un ejercicio nuevo que usaste al anotar: se suma a tu lista (con el músculo que elegiste). Sin avisos si falla. */
export async function rememberExercise(name: string, muscle: Muscle) {
  if (findExercise(name)) return;
  const { error } = await apiResult("/api/exercises", { method: "POST", body: { name: name.trim(), muscle, step: 2.5 } });
  if (!error) invalidate(keys.exercises);
}
