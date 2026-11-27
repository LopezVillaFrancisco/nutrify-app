"use client";

import { useState } from "react";
import Sheet from "@/components/Sheet";
import { fmtDec, fmtInt, shortDate } from "@/lib/format";
import { describeSets, exerciseHistory, type Session } from "@/lib/gym";
import { muscleOf } from "@/lib/exercises";
import type { WorkoutRow } from "@/lib/types";

type Metric = "e1rm" | "maxKg" | "volume";
const METRICS: { key: Metric; label: string; unit: string; help: string }[] = [
  { key: "e1rm", label: "Fuerza", unit: "kg", help: "Tu mejor serie, llevada a 1 repetición." },
  { key: "maxKg", label: "Peso máximo", unit: "kg", help: "El peso más alto del día." },
  { key: "volume", label: "Volumen", unit: "kg", help: "Kilos × reps del día." },
];

const val = (s: Session, m: Metric) => (m === "e1rm" ? s.bestE1rm : m === "maxKg" ? s.maxKg : s.volume);

/** Progreso de un ejercicio: récords, gráfico por sesión (con toque/hover) y la tabla de sesiones. */
export default function ExerciseProgress({ name, workouts, onClose }: { name: string; workouts: WorkoutRow[]; onClose: () => void }) {
  const history = exerciseHistory(name, workouts);
  const [metric, setMetric] = useState<Metric>("e1rm");
  const m = METRICS.find((x) => x.key === metric)!;

  const best = history.reduce<Session | null>((b, s) => (!b || s.bestE1rm > b.bestE1rm ? s : b), null);
  const heaviest = history.reduce<Session | null>((b, s) => (!b || s.maxKg > b.maxKg ? s : b), null);
  const first = history[0];
  const last = history.at(-1);
  const change = first && last && history.length > 1 ? last.bestE1rm - first.bestE1rm : null;

  return (
    <Sheet title={name} subtitle={`${muscleOf(name)} · ${history.length} ${history.length === 1 ? "sesión" : "sesiones"}`} onClose={onClose}>
      {history.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-ink2">Todavía no hay series hechas de este ejercicio.</p>
      ) : (
        <div className="pt-1">
          {/* Récords */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Mejor serie" value={best?.best ? `${fmtDec(best.best.kg ?? 0)}×${best.best.reps ?? 0}` : "–"} sub={best ? shortDate(best.date) : ""} />
            <Stat label="1RM estimado" value={best ? `${fmtInt(best.bestE1rm)} kg` : "–"} sub={change !== null ? `${change >= 0 ? "+" : ""}${fmtDec(Math.round(change * 10) / 10)} kg` : "primera vez"} />
            <Stat label="Más pesado" value={heaviest ? `${fmtDec(heaviest.maxKg)} kg` : "–"} sub={heaviest ? shortDate(heaviest.date) : ""} />
          </div>

          {/* Qué mirar */}
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-[16px] bg-white/60 p-1" role="tablist" aria-label="Qué mostrar">
            {METRICS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={metric === x.key}
                onClick={() => setMetric(x.key)}
                className={`min-h-[40px] rounded-[12px] px-1 text-[12.5px] leading-tight transition-colors ${
                  metric === x.key ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          <LineChart key={metric} sessions={history} metric={metric} unit={m.unit} />
          <p className="mt-1.5 text-[12px] leading-snug text-ink2">{m.help}</p>

          {/* Tabla: todas las sesiones (lo mismo que el gráfico, en texto) */}
          <h3 className="mt-5 text-[14px] font-bold text-ink">Sesiones</h3>
          <ul className="mt-2 divide-y divide-white/80 rounded-2xl bg-white/65">
            {[...history].reverse().map((s) => (
              <li key={s.workoutId} className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold text-ink">{shortDate(s.date)}</span>
                  <span className="block text-[12.5px] leading-snug text-ink2">{describeSets(s.sets)}</span>
                </span>
                <span className="shrink-0 text-right text-[13px] font-semibold text-ink">
                  {fmtInt(val(s, metric))} kg
                  {s === best && <span className="ml-1 rounded-full bg-[rgba(240,162,46,0.2)] px-1.5 py-0.5 text-[10.5px] font-extrabold text-accent">récord</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-2.5 py-2.5 text-center">
      <p className="text-[11.5px] font-semibold text-ink2">{label}</p>
      <p className="mt-0.5 text-[16px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="text-[11.5px] text-ink2">{sub}</p>
    </div>
  );
}

/* ---------- Gráfico de línea (una serie): línea 2px, puntos 8px con anillo, grilla tenue, toque/hover = detalle ---------- */

const W = 340;
const H = 170;
const PAD = { l: 34, r: 14, t: 16, b: 24 };
const SERIES = "#1F9D6B";

function niceTicks(min: number, max: number) {
  const span = Math.max(max - min, 1);
  const raw = span / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * pow).find((k) => k >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks };
}

function LineChart({ sessions, metric, unit }: { sessions: Session[]; metric: Metric; unit: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = sessions.map((s) => val(s, metric));
  const { lo, hi, ticks } = niceTicks(Math.min(...vals), Math.max(...vals));
  const n = sessions.length;
  const x = (i: number) => (n === 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const pts = vals.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : "";
  const active = hover ?? n - 1;
  const s = sessions[active];

  // Toque o mouse: el punto más cercano en X
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };

  return (
    <div className="relative mt-3 rounded-2xl bg-white/70 p-2">
      {/* Detalle del punto activo (por defecto, el último) */}
      <div className="flex items-baseline justify-between px-1.5 pt-0.5">
        <p className="text-[12.5px] font-semibold text-ink2">{shortDate(s.date)}</p>
        <p className="text-[13px] text-ink2">
          <b className="text-[15px] font-extrabold text-ink">
            {fmtInt(vals[active])} {unit}
          </b>
          {s.best && ` · ${fmtDec(s.best.kg ?? 0)} kg × ${s.best.reps ?? 0}`}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 block w-full touch-none select-none"
        role="img"
        aria-label={`Evolución: de ${fmtInt(vals[0])} a ${fmtInt(vals[n - 1])} ${unit} en ${n} sesiones`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        {/* Grilla tenue + valores del eje */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#14322A" strokeOpacity={0.08} strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#3F5F55">
              {fmtInt(t)}
            </text>
          </g>
        ))}
        {/* Fechas: primera y última */}
        <text x={x(0)} y={H - 6} textAnchor={n === 1 ? "middle" : "start"} fontSize={10} fill="#3F5F55">
          {shortDate(sessions[0].date)}
        </text>
        {n > 1 && (
          <text x={x(n - 1)} y={H - 6} textAnchor="end" fontSize={10} fill="#3F5F55">
            {shortDate(sessions[n - 1].date)}
          </text>
        )}

        {area && <path d={area} fill={SERIES} fillOpacity={0.1} />}
        {n > 1 && <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="chart-draw" />}

        {/* Guía vertical del punto activo */}
        <line x1={x(active)} x2={x(active)} y1={PAD.t - 4} y2={H - PAD.b} stroke="#14322A" strokeOpacity={0.18} strokeWidth={1} />

        {pts.map(([px, py], i) => (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={i === active ? 6 : 4}
            fill={SERIES}
            stroke="#FCFCFB"
            strokeWidth={2}
            style={{ transition: "r 150ms ease" }}
          />
        ))}
      </svg>
    </div>
  );
}
