import { addDays, weekOf } from "@/lib/days";
import { e1rm, exerciseHistory, workoutStats } from "@/lib/gym";
import { MUSCLES, exerciseKey, muscleOf, type Muscle } from "@/lib/exercises";
import type { WorkoutRow } from "@/lib/types";

/** Entrenos, series y volumen por semana (lunes a domingo), de la más vieja a la actual. */
export function weekly(workouts: WorkoutRow[], today: string, weeks = 8) {
  const thisMonday = weekOf(today)[0];
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(thisMonday, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    const ws = workouts.filter((w) => w.date >= start && w.date <= end && workoutStats(w).sets > 0);
    return {
      start,
      count: ws.length,
      sets: ws.reduce((s, w) => s + workoutStats(w).sets, 0),
      volume: ws.reduce((s, w) => s + workoutStats(w).volume, 0),
    };
  });
}

/** Series hechas por músculo desde una fecha (sin calentamiento). */
export function setsByMuscle(workouts: WorkoutRow[], from: string) {
  const map = new Map<Muscle, number>();
  for (const w of workouts) {
    if (w.date < from) continue;
    for (const e of w.exercises) {
      const n = e.sets.filter((s) => s.done && !s.warmup).length;
      if (!n) continue;
      const m = muscleOf(e.name, e.muscle);
      map.set(m, (map.get(m) ?? 0) + n);
    }
  }
  return MUSCLES.map((m) => ({ muscle: m, sets: map.get(m) ?? 0 })).filter((x) => x.sets > 0).sort((a, b) => b.sets - a.sets);
}

/** Récords de los últimos días: series que superaron tu mejor 1RM estimado de antes. */
export function recentRecords(workouts: WorkoutRow[], from: string) {
  const chrono = [...workouts].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.started_at < b.started_at ? -1 : 1));
  const best = new Map<string, number>();
  const out: { date: string; name: string; kg: number; reps: number }[] = [];
  for (const w of chrono)
    for (const e of w.exercises) {
      if (muscleOf(e.name, e.muscle) === "Cardio") continue;
      const k = exerciseKey(e.name);
      let top: { kg: number; reps: number; v: number } | null = null;
      for (const s of e.sets) {
        if (!s.done || s.warmup || !s.kg || !s.reps) continue;
        const v = e1rm(s.kg, s.reps);
        if (!top || v > top.v) top = { kg: s.kg, reps: s.reps, v };
      }
      if (!top) continue;
      const prev = best.get(k);
      if (prev !== undefined && top.v > prev + 0.01 && w.date >= from) out.push({ date: w.date, name: e.name, kg: top.kg, reps: top.reps });
      if (prev === undefined || top.v > prev) best.set(k, top.v);
    }
  return out.reverse();
}

/** Tus ejercicios más hechos, con cómo cambió la fuerza (1RM estimado) desde la primera vez. */
export function topLifts(workouts: WorkoutRow[], limit = 6) {
  const names = new Map<string, { name: string; n: number }>();
  for (const w of workouts)
    for (const e of w.exercises) {
      if (!e.sets.some((s) => s.done && s.kg)) continue;
      if (muscleOf(e.name, e.muscle) === "Cardio") continue;
      const k = exerciseKey(e.name);
      const cur = names.get(k);
      names.set(k, { name: cur?.name ?? e.name, n: (cur?.n ?? 0) + 1 });
    }
  return [...names.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(({ name }) => {
      const h = exerciseHistory(name, workouts);
      const first = h[0];
      const last = h[h.length - 1];
      return {
        name,
        sessions: h.length,
        values: h.map((s) => s.bestE1rm),
        current: last?.bestE1rm ?? 0,
        best: last?.best ?? null,
        delta: h.length > 1 && first && last ? last.bestE1rm - first.bestE1rm : null,
        since: first?.date,
      };
    });
}
