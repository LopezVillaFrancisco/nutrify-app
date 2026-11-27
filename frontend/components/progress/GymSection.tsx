"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/Icon";
import BarChart from "@/components/charts/BarChart";
import ExerciseProgress from "@/components/gym/ExerciseProgress";
import { addDays } from "@/lib/days";
import { fmtDec, fmtInt, shortDate, todayISO } from "@/lib/format";
import { recentRecords, setsByMuscle, topLifts, weekly } from "@/lib/gym-stats";
import type { WorkoutRow } from "@/lib/types";

type Metric = "count" | "sets" | "volume";
const METRICS: { key: Metric; label: string }[] = [
  { key: "count", label: "Entrenos" },
  { key: "sets", label: "Series" },
  { key: "volume", label: "Volumen" },
];

const kg = (v: number) => (v >= 10000 ? `${fmtDec(Math.round(v / 100) / 10)} t` : `${fmtInt(v)} kg`);

/** Progreso en el gym: constancia por semana, músculos trabajados, fuerza por ejercicio y récords. */
export default function GymSection({ workouts, loading }: { workouts: WorkoutRow[]; loading: boolean }) {
  const [metric, setMetric] = useState<Metric>("count");
  const [progressOf, setProgressOf] = useState<string | null>(null);
  const today = todayISO();

  const weeks = weekly(workouts, today, 8);
  const cur = weeks[weeks.length - 1];
  const prevWeeks = weeks.slice(0, -1).filter((w) => w.count > 0);
  const avg = (k: Metric) => (prevWeeks.length ? prevWeeks.reduce((s, w) => s + w[k], 0) / prevWeeks.length : 0);
  const muscles = setsByMuscle(workouts, addDays(today, -27));
  const maxMuscle = Math.max(1, ...muscles.map((m) => m.sets));
  const lifts = topLifts(workouts);
  const records = recentRecords(workouts, addDays(today, -30));
  const any = workouts.some((w) => w.exercises.some((e) => e.sets.some((s) => s.done)));

  if (!any) {
    return (
      <section className="glass p-5 text-center" aria-label="Gym">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-accent shadow-glass">
          <Icon name="dumbbell" size={22} strokeWidth={2} />
        </span>
        <p className="mt-3 text-[16px] font-bold text-ink">{loading ? "Cargando…" : "Todavía no hay entrenos"}</p>
        {!loading && (
          <>
            <p className="mx-auto mt-1 max-w-[300px] text-[14px] leading-snug text-ink2">
              Anotá tus ejercicios en Gym para ver tu progreso.
            </p>
            <Link href="/gym" className="btn-accent mt-4 w-full">
              Ir a Gym
            </Link>
          </>
        )}
      </section>
    );
  }

  const fmt = (v: number) => (metric === "volume" ? kg(v) : metric === "count" ? `${v} ${v === 1 ? "entreno" : "entrenos"}` : `${v} series`);

  return (
    <section className="space-y-3" aria-label="Gym">
      {/* Esta semana vs tu promedio */}
      <div className="glass p-4 md:p-5">
        <p className="text-[13px] font-bold text-ink2">Esta semana · últimas 8</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Kpi value={String(cur.count)} label={cur.count === 1 ? "entreno" : "entrenos"} avg={avg("count")} fmt={(v) => fmtDec(Math.round(v * 10) / 10)} />
          <Kpi value={fmtInt(cur.sets)} label="series" avg={avg("sets")} fmt={(v) => fmtInt(v)} />
          <Kpi value={kg(cur.volume)} label="levantados" avg={avg("volume")} fmt={kg} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-white/60 p-1" role="tablist" aria-label="Qué mostrar">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={`min-h-[36px] rounded-[10px] text-[13px] transition-colors ${
                metric === m.key ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <BarChart
            key={metric}
            ariaLabel={`${METRICS.find((m) => m.key === metric)!.label} por semana, últimas 8 semanas`}
            format={fmt}
            data={weeks.map((w, i) => ({
              label: i === weeks.length - 1 ? "Esta" : shortDate(w.start),
              value: w[metric],
              detail: i === weeks.length - 1 ? "Esta semana" : `Semana del ${shortDate(w.start)}`,
            }))}
          />
        </div>
      </div>

      {/* Músculos */}
      {muscles.length > 0 && (
        <div className="glass p-4 md:p-5">
          <p className="text-[13px] font-bold text-ink2">Qué trabajaste · últimas 4 semanas</p>
          <ul className="mt-3 space-y-2">
            {muscles.map((m) => (
              <li key={m.muscle} className="grid grid-cols-[96px_minmax(0,1fr)_64px] items-center gap-2">
                <span className="truncate text-[13px] font-semibold text-ink">{m.muscle}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/80">
                  <span className="block h-full rounded-full bg-mint transition-[width] duration-500" style={{ width: `${(m.sets / maxMuscle) * 100}%` }} />
                </span>
                <span className="text-right text-[12.5px] text-ink2">
                  <b className="text-ink">{m.sets}</b> series
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fuerza por ejercicio */}
      {lifts.length > 0 && (
        <div className="glass p-4 md:p-5">
          <p className="text-[13px] font-bold text-ink2">Fuerza · cambio desde la 1ª vez</p>
          <ul className="mt-2 space-y-1.5">
            {lifts.map((l) => (
              <li key={l.name}>
                <button
                  type="button"
                  onClick={() => setProgressOf(l.name)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-white/65 px-3.5 py-2.5 text-left transition active:scale-[0.99]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold text-ink">{l.name}</span>
                    <span className="block truncate text-[12.5px] text-ink2">
                      1RM est. <b className="text-ink">{fmtInt(l.current)} kg</b>
                      {l.best && ` · última ${fmtDec(l.best.kg ?? 0)}×${l.best.reps ?? 0}`}
                    </span>
                  </span>
                  <Spark values={l.values} />
                  <span className="w-[64px] shrink-0 text-right text-[12.5px] font-bold text-ink">
                    {l.delta === null ? "1ª vez" : Math.abs(l.delta) < 0.05 ? "igual" : `${l.delta > 0 ? "+" : "−"}${fmtDec(Math.abs(Math.round(l.delta * 10) / 10))} kg`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Récords */}
      <div className="glass p-4 md:p-5">
        <p className="text-[13px] font-bold text-ink2">Récords del último mes</p>
        {records.length ? (
          <ul className="mt-2 space-y-1.5">
            {records.slice(0, 8).map((r, i) => (
              <li key={`${r.name}-${r.date}-${i}`} className="flex items-center gap-3 rounded-2xl bg-[rgba(240,162,46,0.12)] px-3.5 py-2.5">
                <span className="text-[16px] text-mango" aria-hidden>
                  ★
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                  <b>{r.name}</b> · {fmtDec(r.kg)} kg × {r.reps}
                </span>
                <span className="shrink-0 text-[12.5px] text-ink2">{shortDate(r.date)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13.5px] text-ink2">Ninguno todavía.</p>
        )}
      </div>

      {progressOf && <ExerciseProgress name={progressOf} workouts={workouts} onClose={() => setProgressOf(null)} />}
    </section>
  );
}

function Kpi({ value, label, avg, fmt }: { value: string; label: string; avg: number; fmt: (v: number) => string }) {
  return (
    <div className="rounded-2xl bg-white/60 px-2 py-2.5 text-center">
      <p className="text-[19px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="text-[11.5px] font-semibold text-ink2">{label}</p>
      {avg > 0 && <p className="mt-0.5 truncate text-[11px] text-ink2">prom. {fmt(avg)}</p>}
    </div>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="w-[56px] shrink-0" />;
  const W = 56;
  const H = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 6) + 3, H - 4 - ((v - min) / (max - min || 1)) * (H - 8)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke="#1F9D6B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={3.5} fill="#1F9D6B" stroke="#FCFCFB" strokeWidth={1.5} />
    </svg>
  );
}
