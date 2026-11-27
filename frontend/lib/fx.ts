"use client";

/**
 * Feedback al sumar cosas: vibración suave, partículas y "destellos".
 * Todo se dibuja en una capa aparte (components/FxLayer) con la Web Animations API: no re-renderiza React.
 * Con "reducir movimiento" activado no hay partículas (la vibración y los avisos siguen).
 */

export type FxKind = "water" | "food" | "steps" | "gym" | "star" | "goal";
type Point = { x: number; y: number };
export type FxOrigin = Element | Point | null | undefined;

export type FxEvent = { kind: FxKind; from: Point; to?: Point; target?: string };

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Vibración corta (Android). "tap" al tocar, "ok" al guardar, "goal" al llegar a una meta. */
export function haptic(kind: "tap" | "ok" | "goal" = "ok") {
  try {
    const p = kind === "tap" ? 8 : kind === "ok" ? [10, 40, 16] : [14, 50, 14, 50, 28];
    navigator.vibrate?.(p);
  } catch {}
}

const center = (o: FxOrigin): Point => {
  if (o && "getBoundingClientRect" in o) {
    const r = o.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (o && "x" in o) return o;
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.62 };
};

/** Elemento marcado con data-fx-target="nombre" (ej. el número de agua en Hoy). */
export const fxTarget = (name: string) => document.querySelector<HTMLElement>(`[data-fx-target="${name}"]`);

/**
 * Partículas desde `from`. Si hay un destino (`target`) en pantalla, además vuela una gota/punto hasta ahí
 * y el destino da un pequeño salto.
 */
export function burst(kind: FxKind, from?: FxOrigin, target?: string) {
  if (typeof window === "undefined") return;
  const t = target ? fxTarget(target) : null;
  const detail: FxEvent = { kind, from: center(from), to: t ? center(t) : undefined, target };
  window.dispatchEvent(new CustomEvent<FxEvent>("nutrify:fx", { detail }));
}

/** Salto de un elemento (al recibir algo). */
export function bump(el: Element | null | undefined, scale = 1.08) {
  if (!el || reducedMotion() || !("animate" in el)) return;
  (el as HTMLElement).animate(
    [{ transform: "scale(1)" }, { transform: `scale(${scale})`, offset: 0.35 }, { transform: "scale(1)" }],
    { duration: 420, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.3)" },
  );
}

/* Entre pantallas: Anotar guarda → Hoy resalta la comida y anima el anillo desde el valor anterior */
const JUST = "nutrify:just-saved";
export type JustSaved = { meal: string; fromKcal: number; at: number };

export function markJustSaved(v: Omit<JustSaved, "at">) {
  try {
    sessionStorage.setItem(JUST, JSON.stringify({ ...v, at: Date.now() }));
  } catch {}
}

export function takeJustSaved(): JustSaved | null {
  try {
    const raw = sessionStorage.getItem(JUST);
    if (!raw) return null;
    sessionStorage.removeItem(JUST);
    const v = JSON.parse(raw) as JustSaved;
    return Date.now() - v.at < 15_000 ? v : null;
  } catch {
    return null;
  }
}
