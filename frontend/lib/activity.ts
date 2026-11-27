"use client";

import { apiResult } from "@/lib/api";
import { getCached, invalidate, setCached } from "@/lib/store";
import { keys } from "@/lib/queries";
import type { StepsRow, WaterRow } from "@/lib/types";

/**
 * Altas y bajas de agua y pasos. Son optimistas: la pantalla cambia al instante y, si falla, vuelve atrás.
 * Después invalidan la caché para que Hoy y Progreso traigan lo real.
 */

/** Cambia la lista en caché ya mismo; devuelve cómo deshacerlo. */
function optimistic<T>(key: string, change: (list: T[]) => T[]) {
  const prev = getCached<T[]>(key);
  if (prev) setCached(key, change(prev));
  return () => {
    if (prev) setCached(key, prev);
  };
}

const tempId = () => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

export async function addWater(date: string, ml: number) {
  const key = keys.water(date);
  const tmp: WaterRow = { id: tempId(), date, ml, drank_at: new Date().toISOString() };
  const undo = optimistic<WaterRow>(key, (l) => [...l, tmp]);
  const { data, error } = await apiResult<WaterRow>("/api/water", { method: "POST", body: { date, ml } });
  const id = data?.id ?? null;
  if (error) undo();
  else if (id) optimistic<WaterRow>(key, (l) => l.map((r) => (r.id === tmp.id ? { ...r, id } : r)));
  invalidate(key, "activity:");
  return { id, error };
}

export async function deleteWater(date: string, id: string) {
  const key = keys.water(date);
  const undo = optimistic<WaterRow>(key, (l) => l.filter((r) => r.id !== id));
  if (id.startsWith("tmp-")) return { error: null };
  const { error } = await apiResult(`/api/water/${id}`, { method: "DELETE" });
  if (error) undo();
  invalidate(key, "activity:");
  return { error };
}

/** Pasos del día (celular/reloj): un solo valor por día, se reemplaza al editarlo. */
export async function setDaySteps(date: string, steps: number, existingId?: string) {
  const key = keys.steps(date);
  const undo = optimistic<StepsRow>(key, (l) =>
    existingId
      ? l.map((r) => (r.id === existingId ? { ...r, steps } : r))
      : [...l, { id: tempId(), date, kind: "dia", steps } as StepsRow],
  );
  // Uno solo por día: el backend reemplaza el que haya
  const { error } = await apiResult<StepsRow>("/api/steps/day", { method: "PUT", body: { date, steps } });
  if (error) undo();
  invalidate(key, "activity:");
  return { error };
}

export async function addTreadmill(date: string, v: { steps: number; minutes: number; speed_kmh: number; distance_km: number }) {
  const key = keys.steps(date);
  const undo = optimistic<StepsRow>(key, (l) => [...l, { id: tempId(), date, kind: "caminadora", ...v } as StepsRow]);
  const { error } = await apiResult<StepsRow>("/api/steps/treadmill", { method: "POST", body: { date, ...v } });
  if (error) undo();
  invalidate(key, "activity:");
  return { error };
}

export async function deleteSteps(date: string, id: string) {
  const key = keys.steps(date);
  const undo = optimistic<StepsRow>(key, (l) => l.filter((r) => r.id !== id));
  if (id.startsWith("tmp-")) return { error: null };
  const { error } = await apiResult(`/api/steps/${id}`, { method: "DELETE" });
  if (error) undo();
  invalidate(key, "activity:");
  return { error };
}
