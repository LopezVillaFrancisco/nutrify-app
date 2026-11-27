"use client";

import { useEffect, useRef, useState } from "react";
import { fmtInt } from "@/lib/format";
import { useCountUp } from "@/lib/useCountUp";

const SIZE = 150;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Anillo de calorías: pista blanca, progreso con el degradé de acento en diagonal y puntas redondeadas.
 * Al sumar, el número corre hasta el valor nuevo y el anillo late una vez.
 * `from`: valor anterior si venís de guardar en otra pantalla (anima desde ahí).
 */
export default function Ring({ value, goal, from }: { value: number; goal: number; from?: number | null }) {
  const shown = useCountUp(value, { from, ms: 900 });
  const pct = goal > 0 ? Math.min(shown / goal, 1) : 0;

  // Late solo cuando sube (no al cargar ni al borrar)
  const prev = useRef(value);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (value > prev.current + 0.5 || (from != null && value > from + 0.5)) setPulse((n) => n + 1);
    prev.current = value;
  }, [value, from]);

  return (
    <div key={pulse} className={`relative shrink-0 ${pulse ? "ring-pulse" : ""}`} style={{ width: SIZE, height: SIZE }} data-fx-target="kcal">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#F0A22E" />
            <stop offset="100%" stopColor="#1F9D6B" />
          </linearGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={STROKE} />
        {/* Con 0 no se dibuja: una línea de largo 0 con punta redonda mostraría un punto */}
        {pct > 0.002 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${pct * C} ${C}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`${fmtInt(value)} de ${fmtInt(goal)} kcal`}>
        <span className="text-[38px] font-extrabold leading-none tracking-tight text-ink tabular-nums">{fmtInt(shown)}</span>
        <span className="mt-1.5 text-[13px] font-medium text-ink2">de {fmtInt(goal)} kcal</span>
      </div>
    </div>
  );
}
