import { api } from "@/lib/api";
import type { Cup, Settings } from "@/lib/types";

/** Tus vasos: copa sin pie (~400 ml de agua) y vaso térmico con sorbete de 40 oz (1.180 ml). */
export const DEFAULT_CUPS: Cup[] = [
  { name: "Copa", ml: 400 },
  { name: "Vaso térmico", ml: 1180 },
];

export function parseCups(v: unknown): Cup[] | null {
  if (!Array.isArray(v)) return null;
  const cups = v
    .map((c) => ({ name: String((c as Cup)?.name ?? "").trim().slice(0, 24), ml: Math.round(Number((c as Cup)?.ml)) }))
    .filter((c) => c.name && c.ml > 0 && c.ml <= 5000)
    .slice(0, 4);
  return cups.length ? cups : null;
}

export const DEFAULT_SETTINGS: Settings = {
  kcal: 2350,
  protein: 160,
  rangeLow: 80,
  rangeHigh: 110,
  weightKg: null,
  heightCm: null,
  stepsGoal: 10000,
  waterGoalMl: null,
  aiMode: "ask",
  cups: DEFAULT_CUPS,
};

/** Lee las metas del usuario (el backend completa lo que falte con los valores por defecto). */
export async function loadSettings(): Promise<Settings> {
  return api<Settings>("/api/settings");
}
