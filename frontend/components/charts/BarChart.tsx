"use client";

import { useState } from "react";

/**
 * Columnas de una sola serie (ej. entrenos por semana). Columnas finas (≤24 px) con punta redondeada,
 * línea de base tenue y el valor de la columna elegida arriba. Tocar o pasar el mouse = ver el detalle.
 */
export default function BarChart({
  data,
  format,
  ariaLabel,
}: {
  data: { label: string; value: number; detail?: string }[];
  format: (v: number) => string;
  ariaLabel: string;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const W = 340;
  const H = 150;
  const PAD = { l: 6, r: 6, t: 22, b: 22 };
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = Math.min(24, slot * 0.55);
  const active = sel ?? n - 1;
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);

  return (
    <div className="rounded-2xl bg-white/70 p-2">
      <div className="flex items-baseline justify-between px-1.5 pt-0.5">
        <p className="text-[12.5px] font-semibold text-ink2">{data[active]?.detail ?? data[active]?.label}</p>
        <p className="text-[15px] font-extrabold text-ink">{format(data[active]?.value ?? 0)}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 block w-full select-none" role="img" aria-label={ariaLabel} onPointerLeave={() => setSel(null)}>
        <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="#14322A" strokeOpacity={0.16} strokeWidth={1} />
        {data.map((d, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          const top = y(d.value);
          const h = H - PAD.b - top;
          const r = Math.min(4, h / 2, bw / 2);
          const on = i === active;
          return (
            <g key={i} onPointerEnter={() => setSel(i)} onPointerDown={() => setSel(i)}>
              {/* Zona de toque más grande que la columna */}
              <rect x={cx - slot / 2} y={PAD.t - 10} width={slot} height={H - PAD.t + 10} fill="transparent" />
              {d.value > 0 && (
                <path
                  d={`M${cx - bw / 2},${H - PAD.b} V${top + r} Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top} H${cx + bw / 2 - r} Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r} V${H - PAD.b} Z`}
                  fill="#1F9D6B"
                  fillOpacity={on ? 1 : 0.45}
                  className="transition-[fill-opacity] duration-150"
                />
              )}
              {on && d.value > 0 && (
                <text x={cx} y={top - 6} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#14322A">
                  {format(d.value)}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill="#3F5F55" fontWeight={on ? 700 : 400}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
