"use client";

import { useEffect, useRef } from "react";
import { bump, fxTarget, reducedMotion, type FxEvent, type FxKind } from "@/lib/fx";

/** Capa de partículas (una sola para toda la app). Escucha "nutrify:fx" y anima nodos sueltos, sin React. */

const DROP = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2.5c3.6 4.6 6.5 8.4 6.5 12a6.5 6.5 0 0 1-13 0c0-3.6 2.9-7.4 6.5-12z" fill="currentColor"/></svg>`;
const STAR = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2.5l2.6 6.2 6.7.6-5.1 4.4 1.5 6.6L12 16.8l-5.7 3.5 1.5-6.6-5.1-4.4 6.7-.6z" fill="currentColor"/></svg>`;
const SPARK = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 1.5c.7 5.6 3.4 8.8 10.5 10.5-7.1 1.7-9.8 4.9-10.5 10.5C11.3 16.9 8.6 13.7 1.5 12 8.6 10.3 11.3 7.1 12 1.5z" fill="currentColor"/></svg>`;
const LEAF = `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M20 4C9 4 4 9.5 4 16c0 1.4.3 2.7.8 4 1-4.5 4.3-8.2 9.2-10-4 2.5-6.7 6-7.6 10.2C15.6 21 20 14 20 4z" fill="currentColor"/></svg>`;

type Shape = "drop" | "star" | "spark" | "leaf" | "dot" | "confetti";
type Spec = { count: number; shapes: Shape[]; colors: string[]; size: [number, number]; spread: number; up: number; gravity: number; ms: number };

const SPECS: Record<FxKind, Spec> = {
  water: { count: 12, shapes: ["drop", "drop", "dot"], colors: ["#1E9EC4", "#3FB5CF", "#1F9D6B", "#6CCFE0"], size: [9, 16], spread: 0.95, up: 86, gravity: 50, ms: 820 },
  food: { count: 14, shapes: ["spark", "leaf", "dot", "spark"], colors: ["#F0A22E", "#1F9D6B", "#E8B93C", "#3DB36F"], size: [9, 17], spread: 1.25, up: 95, gravity: 46, ms: 880 },
  steps: { count: 12, shapes: ["dot", "spark"], colors: ["#F0A22E", "#E8B93C", "#1F9D6B"], size: [8, 14], spread: 1.1, up: 80, gravity: 44, ms: 800 },
  gym: { count: 13, shapes: ["spark", "dot"], colors: ["#1F9D6B", "#F0A22E", "#3DB36F"], size: [9, 16], spread: 1.15, up: 86, gravity: 44, ms: 840 },
  star: { count: 18, shapes: ["star", "spark", "star"], colors: ["#F0A22E", "#FFC43D", "#E8B93C"], size: [12, 22], spread: Math.PI, up: 120, gravity: 60, ms: 1150 },
  goal: { count: 40, shapes: ["confetti", "confetti", "star", "dot"], colors: ["#F0A22E", "#1F9D6B", "#FFC43D", "#3DB36F", "#1E9EC4"], size: [10, 18], spread: Math.PI, up: 200, gravity: 190, ms: 1700 },
};

const FLYER: Partial<Record<FxKind, { shape: Shape; color: string }>> = {
  water: { shape: "drop", color: "#3FB5CF" },
  food: { shape: "spark", color: "#F0A22E" },
  steps: { shape: "dot", color: "#F0A22E" },
  gym: { shape: "spark", color: "#1F9D6B" },
};

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

function node(shape: Shape, color: string, size: number) {
  const el = document.createElement("span");
  el.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;color:${color};will-change:transform,opacity;pointer-events:none;`;
  if (shape === "dot") el.style.cssText += `border-radius:999px;background:${color};`;
  else if (shape === "confetti") el.style.cssText += `height:${size * 0.55}px;border-radius:2px;background:${color};`;
  else el.innerHTML = shape === "drop" ? DROP : shape === "star" ? STAR : shape === "leaf" ? LEAF : SPARK;
  return el;
}

export default function FxLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;

    const ripple = (x: number, y: number, color: string, size = 64) => {
      const el = document.createElement("span");
      el.style.cssText = `position:absolute;left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;border-radius:999px;border:2px solid ${color};pointer-events:none;`;
      layer.appendChild(el);
      el.animate([{ transform: "scale(0.2)", opacity: 0.7 }, { transform: "scale(1)", opacity: 0 }], {
        duration: 520,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      }).onfinish = () => el.remove();
    };

    const onFx = (e: Event) => {
      if (reducedMotion()) return;
      const { kind, from, to, target } = (e as CustomEvent<FxEvent>).detail;
      const spec = SPECS[kind];
      ripple(from.x, from.y, spec.colors[0]);

      for (let i = 0; i < spec.count; i++) {
        const size = rnd(spec.size[0], spec.size[1]);
        const el = node(pick(spec.shapes), pick(spec.colors), size);
        layer.appendChild(el);
        // abanico hacia arriba (o círculo completo si spread = π)
        const ang = -Math.PI / 2 + rnd(-spec.spread, spec.spread);
        const dist = rnd(0.45, 1) * spec.up;
        const dx = Math.cos(ang) * dist;
        const dy = Math.sin(ang) * dist;
        const rot = rnd(-200, 200);
        const x0 = from.x - size / 2, y0 = from.y - size / 2;
        el.animate(
          [
            { transform: `translate(${x0}px, ${y0}px) scale(0.3) rotate(0deg)`, opacity: 1 },
            { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(1) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.45 },
            { transform: `translate(${x0 + dx * 1.08}px, ${y0 + dy + spec.gravity * 0.45}px) scale(0.85) rotate(${rot * 0.85}deg)`, opacity: 1, offset: 0.75 },
            { transform: `translate(${x0 + dx * 1.15}px, ${y0 + dy + spec.gravity}px) scale(0.5) rotate(${rot}deg)`, opacity: 0 },
          ],
          { duration: spec.ms * rnd(0.8, 1.15), easing: "cubic-bezier(0.15, 0.7, 0.3, 1)", delay: rnd(0, 60) },
        ).onfinish = () => el.remove();
      }

      // Una partícula vuela hasta el número que se actualiza y lo hace saltar
      const fly = FLYER[kind];
      if (to && fly) {
        const size = 16;
        const el = node(fly.shape, fly.color, size);
        layer.appendChild(el);
        const x0 = from.x - size / 2, y0 = from.y - size / 2, x1 = to.x - size / 2, y1 = to.y - size / 2;
        const mx = (x0 + x1) / 2 + (x1 > x0 ? -30 : 30), my = Math.min(y0, y1) - 60;
        el.animate(
          [
            { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
            { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.9 },
          ],
          { duration: 560, delay: 90, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "backwards" },
        ).onfinish = () => {
          el.remove();
          ripple(to.x, to.y, fly.color, 52);
          bump(target ? fxTarget(target) : null, 1.12);
        };
      }
    };

    window.addEventListener("nutrify:fx", onFx);
    return () => window.removeEventListener("nutrify:fx", onFx);
  }, []);

  return <div ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" />;
}
