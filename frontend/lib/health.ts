import { TZ, fmtInt } from "@/lib/format";
import type { Settings } from "@/lib/types";

/* ---------- Agua ---------- */

/** Meta de agua: la que pusiste, o 35 ml por kg de peso (2.500 ml si no cargaste el peso). */
export function waterGoal(s: Settings): { ml: number; auto: boolean } {
  if (s.waterGoalMl) return { ml: s.waterGoalMl, auto: false };
  if (s.weightKg) return { ml: Math.round((s.weightKg * 35) / 50) * 50, auto: true };
  return { ml: 2500, auto: true };
}

const minutesOfDay = (d: Date) => {
  const [h, m] = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }).split(":").map(Number);
  return (h % 24) * 60 + m;
};

// Día "despierto" para repartir el agua: de 8 a 22 h
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;

/**
 * ¿Cómo venís con el agua? Compara lo tomado con lo esperable a esta hora
 * (la meta repartida entre las 8 y las 22) y mira hace cuánto fue el último vaso.
 * Mensajes tranquilos, nunca de reto.
 */
export function waterStatus(totalMl: number, goalMl: number, lastAt: string | null, now = new Date()) {
  const mins = minutesOfDay(now);
  const frac = Math.min(Math.max((mins - DAY_START) / (DAY_END - DAY_START), 0), 1);
  const expected = Math.round(goalMl * frac);
  const sinceLast = lastAt ? Math.round((now.getTime() - new Date(lastAt).getTime()) / 60000) : null;

  // La meta es un mínimo orientativo, no un tope: pasarse está bien
  if (totalMl >= goalMl * 1.8 && totalMl - goalMl >= 1500) {
    return { tone: "ok" as const, text: `Ya tomaste ${fmtInt(totalMl - goalMl)} ml más que tu meta. Está bien; desde acá, tomá cuando tengas sed.` };
  }
  if (totalMl > goalMl) return { tone: "ok" as const, text: `Meta cumplida y ${fmtInt(totalMl - goalMl)} ml de más. Pasarte está bien.` };
  if (totalMl >= goalMl) return { tone: "ok" as const, text: "Llegaste a tu meta de agua. Bien ahí." };
  if (totalMl === 0) {
    return mins < DAY_START + 60
      ? { tone: "ok" as const, text: "Arrancá el día con un vaso de agua." }
      : { tone: "nudge" as const, text: "Todavía no anotaste agua hoy. ¿Un vaso ahora?" };
  }
  if (totalMl >= expected - 250) {
    return { tone: "ok" as const, text: `Vas al día. Te quedan ${fmtInt(goalMl - totalMl)} ml.` };
  }
  if (sinceLast !== null && sinceLast >= 120) {
    const h = Math.floor(sinceLast / 60);
    return { tone: "nudge" as const, text: `Tu último vaso fue hace ${h} h. Buen momento para tomar algo.` };
  }
  return { tone: "nudge" as const, text: `A esta hora conviene ir por ${fmtInt(expected)} ml. Un vaso más y te acomodás.` };
}

/* ---------- Pasos ---------- */

/**
 * Largo de paso estimado según altura y velocidad (aproximación de uso común en podómetros):
 * caminando ~41 % de la altura a 5 km/h, crece con la velocidad; corriendo ~60-70 % de la altura.
 */
export function stepLengthM(heightCm: number, speedKmh: number): number {
  const h = heightCm / 100;
  let k: number;
  if (speedKmh <= 6.5) k = 0.32 + 0.019 * speedKmh; // 5 km/h → 0,415
  else if (speedKmh >= 8) k = 0.6 + 0.025 * (speedKmh - 8); // 10 km/h → 0,65
  else k = 0.4435 + ((speedKmh - 6.5) / 1.5) * (0.6 - 0.4435); // transición caminar → trotar
  return h * k;
}

/** Caminadora: minutos × km/h → distancia y pasos aproximados. */
export function treadmillSteps(minutes: number, speedKmh: number, heightCm: number) {
  const distanceKm = (speedKmh * minutes) / 60;
  const steps = Math.round((distanceKm * 1000) / stepLengthM(heightCm, speedKmh));
  return { distanceKm: Math.round(distanceKm * 100) / 100, steps };
}

export const DEFAULT_HEIGHT_CM = 170;
