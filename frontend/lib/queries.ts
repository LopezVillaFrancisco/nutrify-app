"use client";

import { createClient } from "@/lib/supabase/browser";
import { api } from "@/lib/api";
import { addDays, fetchDays, fetchLoggedDates, weekOf } from "@/lib/days";
import { loadSettings } from "@/lib/settings";
import { invalidate, prefetchQuery } from "@/lib/store";
import type { EntryRow, ExerciseRow, WeightRow, FoodRow, RoutineRow, SavedMealRow, StepsRow, WaterRow, WorkoutRow } from "@/lib/types";

/** Claves y consultas de la app, en un solo lugar (las usan las pantallas y la precarga). Los datos vienen del backend Java. */
const sb = () => createClient(); // solo para la sesión

export const keys = {
  entries: (date: string) => `entries:${date}`,
  week: (date: string) => `week:${weekOf(date)[0]}`,
  logged: (date: string) => `logged:${date}`,
  saved: "saved",
  settings: "settings",
  foods: "foods",
  email: "email",
  water: (date: string) => `water:${date}`,
  steps: (date: string) => `steps:${date}`,
  routines: "routines",
  exercises: "exercises",
  weights: "weights",
  workouts: "workouts",
  workout: (id: string) => `workout:${id}`,
  activity: (date: string) => `activity:${weekOf(date)[0]}`,
};

/** Error de tabla inexistente: falta correr el schema.sql actualizado. */
export const isMissingTable = (e: unknown) => {
  const err = e as { code?: string; message?: string } | null;
  return err?.code === "42P01" || err?.code === "PGRST205" || /relation .* does not exist|Could not find the table/i.test(err?.message ?? "");
};

export const fetchers = {
  entries: (date: string) => api<EntryRow[]>(`/api/entries?date=${date}`),
  week: (date: string) => {
    const days = weekOf(date);
    return fetchDays(days[0], days[6]);
  },
  logged: (date: string) => fetchLoggedDates(addDays(date, -365), date),
  saved: () => api<SavedMealRow[]>("/api/saved-meals"),
  settings: () => loadSettings(),
  foods: () => api<FoodRow[]>("/api/foods"),
  water: (date: string) => api<WaterRow[]>(`/api/water?date=${date}`),
  steps: (date: string) => api<StepsRow[]>(`/api/steps?date=${date}`),
  weights: () => api<WeightRow[]>("/api/weights"),
  exercises: () => api<ExerciseRow[]>("/api/exercises"),
  routines: () => api<RoutineRow[]>("/api/routines"),
  workouts: () => api<WorkoutRow[]>("/api/workouts?limit=60"),
  workout: (id: string) => api<WorkoutRow>(`/api/workouts/${id}`),
  /** Pasos, agua y gym por día de la semana (para Progreso), sumados en el backend. */
  activity: (date: string) => {
    const days = weekOf(date);
    return api<Record<string, { water: number; steps: number; gym: number }>>(`/api/activity?from=${days[0]}&to=${days[6]}`);
  },
  // getSession lee la cookie local: no hace pedido a la red
  email: async () => (await sb().auth.getSession()).data.session?.user.email ?? "",
};

/** Después de anotar, corregir o borrar comidas. */
export function invalidateEntries() {
  invalidate("entries:", "week:", "logged:");
}

/** Precarga los datos de una pantalla (al tocar la tab, antes de que se abra). */
export function prefetchScreen(href: string, today: string) {
  if (href === "/") {
    prefetchQuery(keys.entries(today), () => fetchers.entries(today));
    prefetchQuery(keys.saved, fetchers.saved);
    prefetchQuery(keys.settings, fetchers.settings);
    prefetchQuery(keys.week(today), () => fetchers.week(today));
    prefetchQuery(keys.logged(today), () => fetchers.logged(today));
    prefetchQuery(keys.water(today), () => fetchers.water(today));
    prefetchQuery(keys.steps(today), () => fetchers.steps(today));
  } else if (href === "/gym") {
    prefetchQuery(keys.routines, fetchers.routines);
    prefetchQuery(keys.workouts, fetchers.workouts);
  } else if (href === "/alimentos") {
    prefetchQuery(keys.foods, fetchers.foods);
    prefetchQuery(keys.saved, fetchers.saved);
  } else if (href === "/semana") {
    prefetchQuery(keys.settings, fetchers.settings);
    prefetchQuery(keys.week(today), () => fetchers.week(today));
    prefetchQuery(keys.activity(today), () => fetchers.activity(today));
  } else if (href === "/perfil") {
    prefetchQuery(keys.settings, fetchers.settings);
    prefetchQuery(keys.email, fetchers.email);
  }
}
