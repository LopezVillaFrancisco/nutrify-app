"use client";

import { useState } from "react";
import { fmtDec, shortDate } from "@/lib/format";

const SERIES = "#1F9D6B";

/**
 * Peso en el tiempo: cada pesaje es un punto chico y la línea es el promedio de 7 días
 * (el peso diario sube y baja por agua y comida; la línea muestra la tendencia real).
 * Eje X proporcional a las fechas. Tocar = ver ese día.
 */
export default function WeightChart({
  points,
  avg,
  estimate,
}: {
  points: { date: string; kg: number }[];
  avg: { date: string; kg: number }[];
  /** peso estimado de hoy (punto hueco al final) */
  estimate?: { date: string; kg: number };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 340;
  const H = 180;
  const PAD = { l: 34, r: 12, t: 14, b: 24 };
  const n = points.length;
  const t = (d: string) => new Date(`${d}T12:00:00Z`).getTime();
  const t0 = t(points[0].date);
  const t1 = t(estimate && estimate.date > points[n - 1].date ? estimate.date : points[n - 1].date);
  const all = [...points.map((p) => Number(p.kg)), ...avg.map((p) => p.kg), ...(estimate ? [estimate.kg] : [])];
  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const step = rawMax - rawMin > 6 ? 2 : rawMax - rawMin > 2.5 ? 1 : 0.5;
  const lo = Math.floor((rawMin - 0.3) / step) * step;
  const hi = Math.ceil((rawMax + 0.3) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  const shown = ticks.length > 5 ? ticks.filter((_, i) => i % Math.ceil(ticks.length / 4) === 0) : ticks;

  const x = (d: string) => (t1 === t0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((t(d) - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const line = avg.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const area = avg.length > 1 ? `${line} L${x(avg[avg.length - 1].date).toFixed(1)},${H - PAD.b} L${x(avg[0].date).toFixed(1)},${H - PAD.b} Z` : "";
  const active = hover ?? n - 1;

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setHover(best);
  };

  return (
    <div className="rounded-2xl bg-white/70 p-2">
      <div className="flex items-baseline justify-between gap-2 px-1.5 pt-0.5">
        <p className="text-[12.5px] font-semibold text-ink2">{shortDate(points[active].date)}</p>
        <p className="text-[13px] text-ink2">
          <b className="text-[15px] font-extrabold text-ink">{fmtDec(Number(points[active].kg))} kg</b> · promedio {fmtDec(Math.round(avg[active].kg * 10) / 10)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block w-full touch-none select-none"
        role="img"
        aria-label={`Peso: de ${fmtDec(Number(points[0].kg))} a ${fmtDec(Number(points[n - 1].kg))} kg en ${n} pesajes`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        {shown.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="#14322A" strokeOpacity={0.08} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="#3F5F55">
              {fmtDec(v)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} textAnchor="start" fontSize={10} fill="#3F5F55">
          {shortDate(points[0].date)}
        </text>
        {n > 1 && (
          <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={10} fill="#3F5F55">
            {estimate ? "Hoy" : shortDate(points[n - 1].date)}
          </text>
        )}

        {area && <path d={area} fill={SERIES} fillOpacity={0.1} />}
        {/* Pesajes: puntos chicos y suaves */}
        {points.map((p, i) => (
          <circle key={p.date} cx={x(p.date)} cy={y(Number(p.kg))} r={i === active ? 5 : 3} fill={SERIES} fillOpacity={i === active ? 1 : 0.4} stroke="#FCFCFB" strokeWidth={i === active ? 2 : 0} />
        ))}
        {/* Tendencia (promedio 7 días) */}
        {avg.length > 1 && <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="chart-draw" />}
        {/* Estimado de hoy: punto hueco unido al último pesaje */}
        {estimate && (
          <>
            <line
              x1={x(points[n - 1].date)}
              y1={y(Number(points[n - 1].kg))}
              x2={x(estimate.date)}
              y2={y(estimate.kg)}
              stroke={SERIES}
              strokeOpacity={0.35}
              strokeWidth={1.5}
            />
            <circle cx={x(estimate.date)} cy={y(estimate.kg)} r={5} fill="#FCFCFB" stroke={SERIES} strokeWidth={2} />
          </>
        )}
        <line x1={x(points[active].date)} x2={x(points[active].date)} y1={PAD.t - 4} y2={H - PAD.b} stroke="#14322A" strokeOpacity={0.16} strokeWidth={1} />
      </svg>
      {/* Leyenda: dos marcas, mismo color, distinta forma */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-1.5 pb-0.5 text-[11.5px] text-ink2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-mint/50" aria-hidden /> Cada pesaje
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-mint" aria-hidden /> Promedio de 7 días
        </span>
        {estimate && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-mint bg-white" aria-hidden /> Estimado hoy
          </span>
        )}
      </div>
    </div>
  );
}
