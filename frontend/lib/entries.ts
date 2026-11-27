import type { AiStatus, AnalyzedLine, EntryRow, Meal } from "@/lib/types";
import { apiFetch, apiResult } from "@/lib/api";

/* Resultados ya calculados (en el teléfono): "Repetir" o recalcular el mismo texto no vuelve a llamar al servidor ni a la IA.
   Se borra cuando cambiás tus alimentos (porque cambiarían los resultados). */
const ANALYZE_KEY = "nutrify:analyze:v1";
const ANALYZE_TTL = 1000 * 60 * 60 * 24 * 7;
type AnalyzeCache = Record<string, { ts: number; lines: AnalyzedLine[] }>;
const normText = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

function readAnalyzeCache(): AnalyzeCache {
  try {
    return JSON.parse(localStorage.getItem(ANALYZE_KEY) ?? "{}") as AnalyzeCache;
  } catch {
    return {};
  }
}

export function clearAnalyzeCache() {
  try {
    localStorage.removeItem(ANALYZE_KEY);
  } catch {}
}

type AnalyzeOut = { lines: AnalyzedLine[]; ai?: AiStatus; error?: string };

/**
 * Llama al route handler (la lógica de nutrición y las API keys viven en el servidor).
 * allowAi: el usuario tocó "Completar con IA" (en modo "preguntarme").
 */
export async function analyzeText(text: string, opts: { allowAi?: boolean } = {}): Promise<AnalyzeOut> {
  const key = normText(text);
  const cached = readAnalyzeCache()[key];
  if (!opts.allowAi && cached && Date.now() - cached.ts < ANALYZE_TTL && cached.lines?.length) return { lines: cached.lines };
  const res = await analyzeRemote(text, opts.allowAi);
  // Solo se guarda si quedó completo (si la IA todavía puede mejorar algo, no se fija ese resultado)
  if (!res.error && res.lines.length && !(res.ai && res.ai.pending > 0)) {
    try {
      const all = readAnalyzeCache();
      all[key] = { ts: Date.now(), lines: res.lines };
      // Se guardan los 60 más recientes
      const kept = Object.entries(all)
        .sort((a, b) => b[1].ts - a[1].ts)
        .slice(0, 60);
      localStorage.setItem(ANALYZE_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {}
  }
  return res;
}

async function analyzeRemote(text: string, allowAi?: boolean): Promise<AnalyzeOut> {
  try {
    const res = await apiFetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, allowAi: Boolean(allowAi) }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = "/login";
      return { lines: [], error: "Tu sesión venció. Volvé a entrar." };
    }
    if (!res.ok) return { lines: [], error: data.error ?? "No pudimos calcular. Probá de nuevo." };
    return { lines: (data.lines ?? []) as AnalyzedLine[], ai: data.ai as AiStatus | undefined };
  } catch {
    return { lines: [], error: "Sin conexión. Revisá internet y probá de nuevo." };
  }
}

const toRows = (lines: AnalyzedLine[], opts: { date: string; meal: Meal; eatenAt?: string }) => {
  const eatenAt = opts.eatenAt ?? new Date().toISOString();
  return lines.map((l) => ({
    date: opts.date,
    meal: opts.meal,
    eaten_at: eatenAt,
    raw_text: l.raw,
    food_name: l.food_name,
    grams: l.grams,
    kcal: l.kcal,
    protein: l.protein,
    carbs: l.carbs,
    fat: l.fat,
    source: l.source,
  }));
};

/** Guarda líneas calculadas como entradas de una comida (todas o ninguna). Devuelve los ids creados (para deshacer). */
export async function saveLines(
  lines: AnalyzedLine[],
  opts: { date: string; meal: Meal; eatenAt?: string },
): Promise<{ error: unknown; ids: string[] }> {
  const entries = toRows(lines, opts);
  if (!entries.length) return { error: null, ids: [] };
  const { data, error } = await apiResult<EntryRow[]>("/api/entries", { method: "POST", body: { entries } });
  return { error, ids: (data ?? []).map((r) => r.id) };
}

/** Corrige una entrada: la reemplaza por las líneas nuevas en una sola transacción. */
export async function replaceEntry(id: string, lines: AnalyzedLine[], opts: { date: string; meal: Meal; eatenAt?: string }) {
  const { error } = await apiResult<EntryRow[]>(`/api/entries/${id}/replace`, { method: "POST", body: { entries: toRows(lines, opts) } });
  return { error };
}

/** Borra varias entradas (Deshacer). */
export async function deleteEntries(ids: string[]) {
  if (!ids.length) return { error: null };
  return apiResult(`/api/entries?ids=${ids.map(encodeURIComponent).join(",")}`, { method: "DELETE" });
}

export async function deleteEntry(id: string) {
  return apiResult(`/api/entries/${id}`, { method: "DELETE" });
}

export function sumEntries(entries: Pick<EntryRow, "kcal" | "protein" | "carbs" | "fat">[]) {
  return entries.reduce(
    (t, e) => ({
      kcal: t.kcal + Number(e.kcal),
      protein: t.protein + Number(e.protein),
      carbs: t.carbs + Number(e.carbs),
      fat: t.fat + Number(e.fat),
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/** Link a Alimentos con el formulario precargado (valores por 100 g). */
export function saveFoodHref(
  food: { name: string; kcal: number; protein: number; carbs: number; fat: number },
  from?: "anotar" | "hoy",
) {
  const r = (n: number) => String(Math.round(n * 10) / 10);
  const q = new URLSearchParams({
    nuevo: "1",
    name: food.name,
    kcal: r(food.kcal),
    protein: r(food.protein),
    carbs: r(food.carbs),
    fat: r(food.fat),
  });
  if (from) q.set("from", from);
  return `/alimentos?${q.toString()}`;
}
