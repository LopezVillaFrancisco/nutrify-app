import type { Meal } from "@/lib/types";

export const TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Argentina, formato YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

function hourNow(now = new Date()): number {
  return Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ }).slice(0, 2)) % 24;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Jueves 26 de noviembre" (sin la coma que agrega toLocaleDateString). */
export function headerDate(now = new Date()): string {
  const weekday = now.toLocaleDateString("es-AR", { weekday: "long", timeZone: TZ });
  const day = now.toLocaleDateString("es-AR", { day: "numeric", timeZone: TZ });
  const month = now.toLocaleDateString("es-AR", { month: "long", timeZone: TZ });
  return `${cap(weekday)} ${day} de ${month}`;
}

/** Fecha corta para una ISO: "26 nov". */
export function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00Z")
    .toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "UTC" })
    .replace(".", "");
}

export function greeting(now = new Date()): string {
  const h = hourNow(now);
  if (h >= 5 && h < 13) return "Buen día";
  if (h >= 13 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** "8:30" */
export function hhmm(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** Comida según la hora local: desayuno 5-10, almuerzo 11-15, merienda 16-19, cena el resto. */
export function mealForNow(now = new Date()): Meal {
  const h = hourNow(now);
  if (h >= 5 && h <= 10) return "desayuno";
  if (h >= 11 && h <= 15) return "almuerzo";
  if (h >= 16 && h <= 19) return "merienda";
  return "cena";
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
export const fmtDec = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-AR", { maximumFractionDigits: 1 });

/** Número escrito con coma o punto decimal → número (NaN si no es válido). */
export const parseDecimal = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));

export const MEALS_ORDER: Meal[] = ["desayuno", "almuerzo", "merienda", "colacion", "cena"];

export const MEAL_LABEL: Record<Meal, string> = {
  desayuno: "Desayuno",
  almuerzo: "Almuerzo",
  merienda: "Merienda",
  colacion: "Colación",
  cena: "Cena",
};
