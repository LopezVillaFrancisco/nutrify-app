"use client";

import { apiResult } from "@/lib/api";
import { addDays } from "@/lib/days";
import { isMissingTable, keys } from "@/lib/queries";
import { invalidate, setCached } from "@/lib/store";
import type { WeightRow } from "@/lib/types";

const SCHEMA_MSG = "Falta crear la tabla de pesajes: corré el SQL nuevo en Supabase.";

/**
 * Guarda un pesaje (uno por día: si ya había ese día, se reemplaza).
 * Si es el más reciente, actualiza también tu peso en Perfil (lo usan la meta de agua y los pasos).
 */
export async function saveWeight(list: WeightRow[], date: string, kg: number): Promise<string | null> {
  // Uno por día; si es el más reciente, el backend también actualiza el peso del Perfil
  const { data, error } = await apiResult<WeightRow>("/api/weights", { method: "PUT", body: { date, kg } });
  if (error || !data) return isMissingTable(error) ? SCHEMA_MSG : error?.message ?? "No se pudo guardar. Probá de nuevo.";
  const row = data;
  const next = [...list.filter((w) => w.date !== date), row].sort((a, b) => (a.date < b.date ? -1 : 1));
  setCached(keys.weights, next);
  if (next[next.length - 1]?.date === date) invalidate(keys.settings);
  return null;
}

export async function deleteWeight(list: WeightRow[], id: string): Promise<string | null> {
  const { error } = await apiResult(`/api/weights/${id}`, { method: "DELETE" });
  if (error) return "No se pudo borrar.";
  setCached(
    keys.weights,
    list.filter((w) => w.id !== id),
  );
  return null;
}

/** Promedio móvil de 7 días (suaviza las subidas y bajadas de agua, sal, etc.). */
export function movingAverage(list: WeightRow[]): { date: string; kg: number }[] {
  return list.map((w) => {
    const from = addDays(w.date, -6);
    const win = list.filter((x) => x.date >= from && x.date <= w.date);
    return { date: w.date, kg: win.reduce((s, x) => s + Number(x.kg), 0) / win.length };
  });
}

/** El pesaje más cercano a una fecha (hacia atrás). */
export function weightOn(list: WeightRow[], date: string): WeightRow | undefined {
  let found: WeightRow | undefined;
  for (const w of list) if (w.date <= date) found = w;
  return found;
}

/* ---------- Peso estimado (para los días que no te pesás) ---------- */

export type WeightEstimate = {
  kg: number;
  /** "pesaje" = te pesaste ese día; "tendencia" = calculado con tus últimos pesajes; "ultimo" = sin datos suficientes, se repite el último */
  basis: "pesaje" | "tendencia" | "ultimo";
  /** cambio por semana según la tendencia (null si no hay datos suficientes) */
  perWeek: number | null;
  last: WeightRow;
  daysSince: number;
  /** pasó mucho desde el último pesaje: el estimado ya no es confiable */
  stale: boolean;
};

const dayNum = (d: string) => Math.round(new Date(`${d}T12:00:00Z`).getTime() / 86_400_000);

/**
 * Estima tu peso en una fecha con la tendencia de las últimas 4 semanas (recta que mejor pasa por tus pesajes).
 * Necesita 3 pesajes en al menos 6 días; si no, usa el último. No proyecta más de 14 días hacia adelante.
 */
export function estimateWeight(list: WeightRow[], date: string): WeightEstimate | null {
  const upto = list.filter((w) => w.date <= date);
  const last = upto[upto.length - 1];
  if (!last) return null;
  const daysSince = dayNum(date) - dayNum(last.date);
  // La tendencia se calcula con las 4 semanas previas a tu último pesaje (lo más nuevo que hay)
  const trend = slope(upto, last.date);
  if (daysSince === 0) {
    return { kg: Number(last.kg), basis: "pesaje", perWeek: trend ? trend.b * 7 : null, last, daysSince, stale: false };
  }
  const stale = daysSince > 21;
  if (!trend || stale) return { kg: Number(last.kg), basis: "ultimo", perWeek: trend ? trend.b * 7 : null, last, daysSince, stale };
  // Hasta 14 días después del último pesaje; más allá se queda en ese valor
  const x = Math.min(dayNum(date), dayNum(last.date) + 14);
  return { kg: Math.round((trend.a + trend.b * x) * 10) / 10, basis: "tendencia", perWeek: trend.b * 7, last, daysSince, stale };
}

/** Recta por mínimos cuadrados con los pesajes de los 28 días previos a `date` (inclusive). */
function slope(list: WeightRow[], date: string): { a: number; b: number } | null {
  const from = dayNum(date) - 28;
  const pts = list.filter((w) => dayNum(w.date) >= from).map((w) => [dayNum(w.date), Number(w.kg)] as const);
  if (pts.length < 3) return null;
  const span = pts[pts.length - 1][0] - pts[0][0];
  if (span < 6) return null;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/** "bajando ≈0,3 kg por semana" / "estable" (sin juzgar: solo la dirección). */
export function trendText(perWeek: number | null, fmt: (n: number) => string): string | null {
  if (perWeek === null) return null;
  if (Math.abs(perWeek) < 0.1) return "Estable";
  return `${perWeek < 0 ? "Bajando" : "Subiendo"} ≈${fmt(Math.abs(Math.round(perWeek * 10) / 10))} kg por semana`;
}
