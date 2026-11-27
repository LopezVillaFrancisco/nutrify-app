"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import WeightChart from "@/components/charts/WeightChart";
import Stepper from "@/components/gym/Stepper";
import { addDays } from "@/lib/days";
import { fmtDec, shortDate, todayISO } from "@/lib/format";
import { isMissingTable } from "@/lib/queries";
import { deleteWeight, estimateWeight, movingAverage, saveWeight, trendText, weightOn } from "@/lib/weights";
import type { WeightRow } from "@/lib/types";

type Range = 30 | 90 | 0;
const RANGES: { key: Range; label: string }[] = [
  { key: 30, label: "1 mes" },
  { key: 90, label: "3 meses" },
  { key: 0, label: "Todo" },
];

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtDec(Math.abs(Math.round(v * 10) / 10))} kg`;

/** Peso: último pesaje, cambios (sin juzgar: solo el dato), tendencia y lista. */
export default function WeightSection({
  list,
  error,
  loading,
  fallbackKg,
  onToast,
}: {
  list: WeightRow[];
  error: unknown;
  loading: boolean;
  fallbackKg: number | null;
  onToast: (msg: string) => void;
}) {
  const [range, setRange] = useState<Range>(30);
  const [sheet, setSheet] = useState(false);
  const [all, setAll] = useState(false);
  const today = todayISO();
  const missing = isMissingTable(error);

  const last = list[list.length - 1];
  const from = range ? addDays(today, -range) : list[0]?.date ?? today;
  const inRange = list.filter((w) => w.date >= from);
  const avg = movingAverage(list).filter((p) => p.date >= from);
  const ago = (days: number) => {
    const w = weightOn(list, addDays(today, -days));
    return w && last && w.date !== last.date ? Number(last.kg) - Number(w.kg) : null;
  };
  const d7 = ago(7);
  const d30 = ago(30);
  const kgs = inRange.map((w) => Number(w.kg));
  // Si hoy no te pesaste: estimado con tu tendencia
  const est = estimateWeight(list, today);
  const trend = est ? trendText(est.perWeek, fmtDec) : null;

  return (
    <section aria-labelledby="peso">
      <div className="glass p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="peso" className="text-[13px] font-bold text-ink2">
              Peso
            </h2>
            {last && est ? (
              <>
                <p className="mt-0.5 text-[34px] font-extrabold leading-none tracking-tight text-ink">
                  {est.basis === "tendencia" && <span className="mr-0.5 text-[26px] text-ink2">≈</span>}
                  {fmtDec(est.kg)}
                  <span className="ml-1 text-[15px] font-bold text-ink2">kg</span>
                </p>
                <p className="mt-1 text-[12.5px] leading-snug text-ink2">
                  {est.basis === "pesaje"
                    ? "Pesaje de hoy"
                    : est.basis === "tendencia"
                      ? `Estimado hoy · último pesaje ${fmtDec(Number(last.kg))} kg (${shortDate(last.date)})`
                      : est.stale
                        ? `Último pesaje hace ${est.daysSince} días: pesate para actualizar`
                        : `Último pesaje: ${shortDate(last.date)}`}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[14px] leading-snug text-ink2">
                {missing ? "Falta crear la tabla de pesajes (SQL nuevo)." : loading ? " " : "Todavía no te pesaste en la app."}
              </p>
            )}
          </div>
          <button type="button" className="btn-accent shrink-0 !px-4" onClick={() => setSheet(true)} disabled={missing}>
            <Icon name="plus" size={18} strokeWidth={2.4} /> Pesarme
          </button>
        </div>

        {trend && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-[12.5px] font-semibold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden />
            Tendencia: {trend.toLowerCase()}
          </p>
        )}

        {(d7 !== null || d30 !== null) && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Delta label="En 7 días" v={d7} />
            <Delta label="En 30 días" v={d30} />
          </div>
        )}

        {list.length > 1 && (
          <>
            <div className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-white/60 p-1" role="tablist" aria-label="Período">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  role="tab"
                  aria-selected={range === r.key}
                  onClick={() => setRange(r.key)}
                  className={`min-h-[36px] rounded-[10px] text-[13px] transition-colors ${
                    range === r.key ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="mt-2">
              {inRange.length > 1 ? (
                <WeightChart
                  key={range}
                  points={inRange}
                  avg={avg}
                  estimate={est?.basis === "tendencia" ? { date: today, kg: est.kg } : undefined}
                />
              ) : (
                <p className="rounded-2xl bg-white/60 px-4 py-6 text-center text-[13.5px] text-ink2">Un solo pesaje en este período. Probá con “Todo”.</p>
              )}
            </div>
            {kgs.length > 1 && (
              <p className="mt-2 text-center text-[12.5px] text-ink2">
                En el período: mínimo <b className="text-ink">{fmtDec(Math.min(...kgs))}</b> · máximo <b className="text-ink">{fmtDec(Math.max(...kgs))}</b> ·{" "}
                {inRange.length} pesajes
              </p>
            )}
          </>
        )}

        <p className="mt-3 text-[12px] text-ink2">≈ = estimado con tu tendencia. Pesate a la mañana, en ayunas.</p>
      </div>

      {list.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-2 px-1 text-[13px] font-bold text-ink2">Pesajes</h3>
          <ul className="divide-y divide-white/80 overflow-hidden rounded-[22px] bg-white/60">
            {[...list]
              .reverse()
              .slice(0, all ? undefined : 6)
              .map((w, i, arr) => {
                const prev = list[list.length - 2 - i];
                const diff = prev ? Number(w.kg) - Number(prev.kg) : null;
                return (
                  <li key={w.id} className="flex items-center gap-3 py-1 pl-4 pr-1">
                    <span className="min-w-0 flex-1 text-[14.5px] text-ink">
                      <b>{fmtDec(Number(w.kg))} kg</b> <span className="text-ink2">· {w.date === today ? "hoy" : shortDate(w.date)}</span>
                    </span>
                    {diff !== null && i < arr.length && <span className="text-[12.5px] text-ink2">{signed(diff)}</span>}
                    <button
                      type="button"
                      aria-label={`Borrar el pesaje del ${shortDate(w.date)}`}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink2"
                      onClick={async () => {
                        const err = await deleteWeight(list, w.id);
                        onToast(err ?? "Pesaje borrado");
                      }}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                );
              })}
          </ul>
          {list.length > 6 && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-[44px] w-full text-[14px] font-bold text-accent">
              {all ? "Ver menos" : `Ver todos (${list.length})`}
            </button>
          )}
        </div>
      )}

      {sheet && (
        <WeightSheet
          list={list}
          initial={last ? Number(last.kg) : fallbackKg}
          onClose={() => setSheet(false)}
          onSaved={(msg) => {
            setSheet(false);
            onToast(msg);
          }}
        />
      )}
    </section>
  );
}

function Delta({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="rounded-2xl bg-white/60 px-3 py-2">
      <p className="text-[11.5px] font-semibold text-ink2">{label}</p>
      <p className="text-[16px] font-extrabold text-ink">{v === null ? "—" : signed(v)}</p>
    </div>
  );
}

function WeightSheet({
  list,
  initial,
  onClose,
  onSaved,
}: {
  list: WeightRow[];
  initial: number | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const today = todayISO();
  const [kg, setKg] = useState<number | null>(initial);
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = list.find((w) => w.date === date);
  const valid = kg !== null && kg > 20 && kg < 400 && date <= today;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const err = await saveWeight(list, date, Math.round(kg! * 10) / 10);
    setBusy(false);
    if (err) setError(err);
    else onSaved(`Peso guardado: ${fmtDec(kg!)} kg`);
  }

  return (
    <Sheet
      title="Pesarme"
      subtitle="Un pesaje por día"
      onClose={onClose}
      footer={
        <button type="button" className="btn-accent w-full" disabled={!valid || busy} onClick={save}>
          {busy ? "Guardando…" : existing ? "Reemplazar pesaje" : "Guardar"}
        </button>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <p className="label">Kilos</p>
          <Stepper decimal label="kilos" step={0.1} min={20} max={400} value={kg} placeholder={initial} onChange={setKg} />
        </div>
        <div>
          <p className="label">Día</p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              [today, "Hoy"],
              [addDays(today, -1), "Ayer"],
            ].map(([d, l]) => (
              <button
                key={d}
                type="button"
                aria-pressed={date === d}
                onClick={() => setDate(d)}
                className={`min-h-[44px] rounded-xl text-[14px] transition-colors ${
                  date === d ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                }`}
              >
                {l}
              </button>
            ))}
            <input
              type="date"
              className="input !min-h-[44px] !px-2 text-[14px]"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Otro día"
            />
          </div>
          {existing && <p className="mt-1 text-[12.5px] text-ink2">Ese día ya tenías {fmtDec(Number(existing.kg))} kg: se reemplaza.</p>}
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
