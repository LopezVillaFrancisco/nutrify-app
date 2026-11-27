"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import type { ToastData } from "@/components/Toast";
import { addTreadmill, deleteSteps, setDaySteps } from "@/lib/activity";
import { fmtDec, fmtInt, parseDecimal } from "@/lib/format";
import { DEFAULT_HEIGHT_CM, treadmillSteps } from "@/lib/health";
import type { StepsRow } from "@/lib/types";
import { burst, haptic } from "@/lib/fx";
import { useCountUp } from "@/lib/useCountUp";

const TIMES = [15, 20, 30, 45, 60, 90];
const SPEEDS = [4, 5, 5.5, 6, 7, 8];

// La última caminadora que cargaste: se propone igual la próxima (casi siempre es la misma rutina)
const LAST_KEY = "nutrify:treadmill-last";
function readLast(): { minutes: string; speed: string } {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null") as { minutes?: number; speed?: number } | null;
    if (v && v.minutes && v.speed) return { minutes: String(v.minutes), speed: String(v.speed).replace(".", ",") };
  } catch {}
  return { minutes: "30", speed: "5,5" };
}

export default function StepsSheet({
  date,
  list,
  goal,
  heightCm,
  onClose,
  onToast,
}: {
  date: string;
  list: StepsRow[];
  goal: number;
  heightCm: number | null;
  onClose: () => void;
  onToast: (t: ToastData | string) => void;
}) {
  const day = list.find((s) => s.kind === "dia");
  const treadmill = list.filter((s) => s.kind === "caminadora");
  const total = list.reduce((s, r) => s + r.steps, 0);

  const [mode, setMode] = useState<"caminadora" | "dia">("caminadora");
  const [daySteps, setDayStepsInput] = useState(day ? String(day.steps) : "");
  const [minutes, setMinutes] = useState(() => readLast().minutes);
  const [speed, setSpeed] = useState(() => readLast().speed);
  const [busy, setBusy] = useState(false);

  const h = heightCm ?? DEFAULT_HEIGHT_CM;
  const min = parseDecimal(minutes);
  const kmh = parseDecimal(speed);
  const valid = min > 0 && min <= 600 && kmh >= 1 && kmh <= 25;
  const est = valid ? treadmillSteps(min, kmh, h) : null;
  const dayN = parseDecimal(daySteps);
  const shown = useCountUp(total);

  /** Vibra, partículas hacia el total y, si cruzaste la meta, festejo. */
  function celebrate(el: HTMLElement | null, after: number, text: string) {
    if (total < goal && after >= goal) {
      haptic("goal");
      burst("goal", el);
      onToast({ text: "¡Meta de pasos cumplida!", icon: "goal" });
    } else {
      haptic("ok");
      burst("steps", el, "steps-sheet");
      onToast({ text, icon: "steps" });
    }
  }

  async function saveTreadmill(el: HTMLElement | null) {
    if (!est || busy) return;
    setBusy(true);
    const { error } = await addTreadmill(date, { steps: est.steps, minutes: min, speed_kmh: kmh, distance_km: est.distanceKm });
    setBusy(false);
    if (error) return onToast("No se pudo guardar. Probá de nuevo.");
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ minutes: min, speed: kmh }));
    } catch {}
    celebrate(el, total + est.steps, `+${fmtInt(est.steps)} pasos de caminadora`);
  }

  async function saveDay(el: HTMLElement | null) {
    if (!(dayN >= 0) || busy) return;
    setBusy(true);
    const { error } = await setDaySteps(date, Math.round(dayN), day?.id);
    setBusy(false);
    if (error) return onToast("No se pudo guardar. Probá de nuevo.");
    celebrate(el, total - (day?.steps ?? 0) + Math.round(dayN), day ? "Pasos del día actualizados" : "Pasos del día guardados");
  }

  return (
    <Sheet
      title="Pasos"
      subtitle={
        <>
          <b data-fx-target="steps-sheet" className="inline-block tabular-nums text-ink">{fmtInt(shown)}</b> de {fmtInt(goal)}
        </>
      }
      onClose={onClose}
    >
      <div className="pt-2">
        <div className="grid grid-cols-2 gap-1 rounded-[16px] bg-white/60 p-1" role="tablist">
          {(
            [
              ["caminadora", "Caminadora"],
              ["dia", "Resto del día"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={`min-h-[44px] rounded-[12px] text-[14px] ${mode === k ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "caminadora" ? (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveTreadmill(e.currentTarget.querySelector("button[type=submit]"));
            }}
          >
            <p className="text-[13.5px] leading-snug text-ink2">Tocá el tiempo y la velocidad (o escribilos) y calculo los pasos.</p>
            <div className="grid grid-cols-2 gap-3">
              <Picker
                id="t-min"
                label="Tiempo"
                unit="min"
                value={minutes}
                onChange={setMinutes}
                options={TIMES}
                current={min}
              />
              <Picker
                id="t-speed"
                label="Velocidad"
                unit="km/h"
                value={speed}
                onChange={setSpeed}
                options={SPEEDS}
                current={kmh}
              />
            </div>

            <div className="rounded-2xl bg-white/75 px-4 py-3.5" aria-live="polite">
              {est ? (
                <>
                  <p className="text-[22px] font-extrabold leading-tight text-ink">≈ {fmtInt(est.steps)} pasos</p>
                  <p className="text-[13.5px] text-ink2">
                    {fmtDec(est.distanceKm)} km · {kmh > 7 ? "trotando" : "caminando"}
                  </p>
                </>
              ) : (
                <p className="text-[14px] text-ink2">Poné un tiempo (hasta 600 min) y una velocidad (1 a 25 km/h).</p>
              )}
              <p className="mt-1.5 text-[12px] leading-snug text-ink2">
                {heightCm
                  ? `Calculado con tu altura (${fmtInt(heightCm)} cm) y el largo de paso típico a esa velocidad.`
                  : `Uso una altura de ${DEFAULT_HEIGHT_CM} cm. Cargá la tuya en Perfil para que sea más preciso.`}
              </p>
            </div>

            <button type="submit" className="btn-accent w-full" disabled={!est || busy}>
              {busy ? "Guardando…" : "Sumar caminadora"}
            </button>
          </form>
        ) : (
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveDay(e.currentTarget.querySelector("button[type=submit]"));
            }}
          >
            <p className="text-[13.5px] leading-snug text-ink2">Lo que marca el celular o el reloj. Uno por día.</p>
            <div>
              <label htmlFor="d-steps" className="label">
                Pasos fuera de la caminadora
              </label>
              <input
                id="d-steps"
                className="input"
                inputMode="numeric"
                placeholder="ej. 4500"
                value={daySteps}
                onChange={(e) => setDayStepsInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-accent w-full" disabled={!(dayN >= 0 && dayN <= 200000) || busy}>
              {busy ? "Guardando…" : day ? "Actualizar" : "Guardar"}
            </button>
          </form>
        )}

        <h3 className="mt-6 text-[15px] font-bold text-ink">Hoy</h3>
        {list.length === 0 ? (
          <p className="mt-1 text-[14px] text-ink2">Todavía no cargaste pasos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/80 rounded-2xl bg-white/70">
            {[...(day ? [day] : []), ...treadmill].map((s) => (
              <li key={s.id} className={`${s.id.startsWith("tmp-") ? "animate-rise" : ""} flex items-center justify-between gap-2 py-1.5 pl-4 pr-1`}>
                <span className="min-w-0 text-[15px] text-ink">
                  <b>{fmtInt(s.steps)}</b>{" "}
                  <span className="text-ink2">
                    {s.kind === "dia"
                      ? "· resto del día"
                      : `· caminadora ${fmtInt(Number(s.minutes))} min a ${fmtDec(Number(s.speed_kmh))} km/h`}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Borrar"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 disabled:opacity-40"
                  disabled={s.id.startsWith("tmp-")}
                  onClick={async () => {
                    const { error } = await deleteSteps(date, s.id);
                    if (error) onToast("No se pudo borrar.");
                    else if (s.kind === "dia") setDayStepsInput("");
                  }}
                >
                  <Icon name="x" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/** Campo + atajos en grilla (sin scroll lateral). */
function Picker({
  id,
  label,
  unit,
  value,
  onChange,
  options,
  current,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  options: number[];
  current: number;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input id={id} className="input !pr-14" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink2">{unit}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5" role="group" aria-label={`${label}: valores comunes`}>
        {options.map((v) => {
          const on = current === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(String(v).replace(".", ","))}
              className={`min-h-[40px] rounded-xl text-[14px] transition-colors active:scale-[0.97] ${
                on ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/60" : "bg-white/55 font-semibold text-ink"
              }`}
            >
              {fmtDec(v)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
