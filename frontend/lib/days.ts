import { api } from "@/lib/api";
import type { Settings } from "@/lib/types";

export type DayRow = { date: string; kcal: number; protein: number; carbs: number; fat: number; count: number };

export type DayMap = Record<string, DayRow>;

/** Suma de entradas por día (YYYY-MM-DD), calculada en el backend. Objeto plano (se puede guardar en caché). */
export async function fetchDays(from: string, to: string): Promise<DayMap> {
  return api<DayMap>(`/api/days?from=${from}&to=${to}`);
}

/** Días distintos con al menos una comida. */
export async function fetchLoggedDates(from: string, to: string): Promise<string[]> {
  return api<string[]>(`/api/days/logged?from=${from}&to=${to}`);
}

/** Fechas ISO (YYYY-MM-DD) sumando días, sin depender de la zona del dispositivo. */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes a domingo de la semana que contiene `iso`. */
export function weekOf(iso: string): string[] {
  const dow = new Date(iso + "T12:00:00Z").getUTCDay(); // 0 = domingo
  const monday = addDays(iso, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const WEEK_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
export const WEEK_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Racha: días seguidos con al menos una comida. Si hoy todavía no anotaste, cuenta desde ayer. */
export function streakFrom(days: { has: (d: string) => boolean }, today: string): number {
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Un día cuenta "en rango" si queda entre rangeLow% y rangeHigh% de la meta de kcal (80–110 por defecto). */
export const inRange = (kcal: number, s: Pick<Settings, "kcal" | "rangeLow" | "rangeHigh">) =>
  kcal >= (s.kcal * s.rangeLow) / 100 && kcal <= (s.kcal * s.rangeHigh) / 100;
