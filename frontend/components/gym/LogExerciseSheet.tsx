"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import Stepper from "@/components/gym/Stepper";
import { MUSCLES, allExercises, exerciseKey, findExercise, isCardio, muscleOf, stepOf, type Muscle } from "@/lib/exercises";
import { fmtDec, fmtInt, shortDate } from "@/lib/format";
import { describeSets, doneExercises, e1rm, exerciseHistory, recordsFor } from "@/lib/gym";
import type { WorkoutExercise, WorkoutRow } from "@/lib/types";

type Row = { kg: number | null; reps: number | null };

/**
 * Anotar un ejercicio a mano: elegís (o escribís) el ejercicio y cargás series, reps y kilos.
 * Simple: "3 series × 10 reps con 60 kg". Si cambiaste el peso entre series, se carga serie por serie.
 */
export default function LogExerciseSheet({
  workouts,
  workoutId,
  initial,
  onSave,
  onDelete,
  onClose,
}: {
  workouts: WorkoutRow[];
  workoutId?: string;
  initial?: WorkoutExercise;
  onSave: (ex: WorkoutExercise) => Promise<string | null>;
  onDelete?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [muscle, setMuscle] = useState<string | undefined>(initial?.muscle);
  const [rows, setRows] = useState<Row[]>(() => (initial ? initial.sets.map((s) => ({ kg: s.kg, reps: s.reps })) : []));
  const [perSet, setPerSet] = useState(() => (initial ? !uniform(initial.sets) : false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  /** Elegir ejercicio: arranca con lo que hiciste la última vez (lo más probable es que repitas). */
  function choose(n: string, m?: string) {
    const prev = exerciseHistory(n, workouts, workoutId).at(-1);
    setName(n);
    setMuscle(m ?? muscleOf(n));
    const start = prev ? prev.sets.map((s) => ({ kg: s.kg, reps: s.reps })) : [{ kg: null, reps: 10 }, { kg: null, reps: 10 }, { kg: null, reps: 10 }];
    setRows(start);
    setPerSet(!uniform(start));
  }

  // Misma hoja para los dos pasos (no se cierra y se vuelve a abrir)
  if (!name)
    return (
      <Sheet title="¿Qué ejercicio hiciste?" subtitle="Buscalo o escribilo" onClose={onClose}>
        <PickStep workouts={workouts} onChoose={choose} />
      </Sheet>
    );

  const prev = exerciseHistory(name, workouts, workoutId).at(-1);
  const rec = recordsFor(name, workouts, workoutId);
  const cardio = isCardio(name, muscle);
  // Ejercicio que no está en tu lista: elegís el músculo y queda guardado en "Mis ejercicios"
  const isNew = !findExercise(name) && !exerciseHistory(name, workouts).length;
  const step = cardio ? 0.5 : stepOf(name);
  const kgLabel = cardio ? "km/h" : "Kg";
  const repsLabel = cardio ? "Minutos" : "Reps";

  const first = rows[0] ?? { kg: null, reps: null };
  const setAll = (p: Partial<Row>) => setRows((rs) => rs.map((r) => ({ ...r, ...p })));
  const setCount = (n: number) =>
    setRows((rs) => (n > rs.length ? [...rs, ...Array.from({ length: n - rs.length }, () => ({ ...(rs.at(-1) ?? first) }))] : rs.slice(0, n)));

  const valid = rows.length > 0 && rows.every((r) => r.reps !== null && r.reps > 0);
  const volume = rows.reduce((s, r) => s + (r.kg ?? 0) * (r.reps ?? 0), 0);
  const best = rows.reduce((b, r) => Math.max(b, r.kg && r.reps ? e1rm(r.kg, r.reps) : 0), 0);
  const isRecord = !cardio && rec.sessions > 0 && best > rec.bestE1rm + 0.01;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const err = await onSave({ name, muscle, sets: rows.map((r) => ({ kg: r.kg, reps: r.reps, done: true })) });
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Sheet
      title={name}
      subtitle={
        initial ? (
          muscleOf(name, muscle)
        ) : (
          <button type="button" className="font-semibold text-accent" onClick={() => setName("")}>
            {muscleOf(name, muscle)} · Cambiar ejercicio
          </button>
        )
      }
      onClose={onClose}
      footer={
        <button type="button" className="btn-accent w-full" disabled={!valid || busy} onClick={save}>
          {busy ? "Guardando…" : initial ? "Guardar cambios" : "Guardar ejercicio"}
        </button>
      }
    >
      <div className="space-y-4 pt-1">
        {prev && (
          <div className="flex items-center gap-2 rounded-2xl bg-white/65 py-2 pl-3.5 pr-2">
            <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink2">
              Última vez ({shortDate(prev.date)}): <b className="font-semibold text-ink">{describeSets(prev.sets)}</b>
            </p>
            <button
              type="button"
              onClick={() => {
                const r = prev.sets.map((s) => ({ kg: s.kg, reps: s.reps }));
                setRows(r);
                setPerSet(!uniform(r));
              }}
              className="shrink-0 rounded-xl bg-white px-3 py-2 text-[13px] font-bold text-accent shadow-glass active:scale-95"
            >
              Repetir
            </button>
          </div>
        )}

        {isNew && (
          <div>
            <p className="label">Es nuevo: ¿qué músculo trabaja?</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Músculo">
              {MUSCLES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={(muscle ?? "Otro") === m}
                  onClick={() => setMuscle(m)}
                  className={`min-h-[38px] rounded-xl px-1 text-[12.5px] leading-tight transition-colors ${
                    (muscle ?? "Otro") === m ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {!perSet ? (
          <div className="animate-fade grid grid-cols-2 gap-2">
            <Field label="Series">
              <Stepper label="series" step={1} min={1} max={20} value={rows.length} onChange={(v) => setCount(Math.max(1, v ?? 1))} />
            </Field>
            <Field label={repsLabel}>
              <Stepper label={repsLabel} step={1} min={1} max={300} value={first.reps} placeholder={10} onChange={(v) => setAll({ reps: v })} />
            </Field>
            <Field label={cardio ? kgLabel : "Kilos"} wide>
              <Stepper decimal label={kgLabel} step={step} max={1000} value={first.kg} placeholder={prev?.best?.kg ?? null} onChange={(v) => setAll({ kg: v })} />
            </Field>
          </div>
        ) : (
          <div className="animate-fade">
            <div className="grid grid-cols-[52px_minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-x-1.5 gap-y-2">
              <span />
              <span className="text-center text-[11px] font-bold uppercase text-ink2">{kgLabel}</span>
              <span className="text-center text-[11px] font-bold uppercase text-ink2">{repsLabel}</span>
              <span />
              {rows.map((r, i) => (
                <RowEdit
                  key={i}
                  i={i}
                  row={r}
                  step={step}
                  kgLabel={kgLabel}
                  repsLabel={repsLabel}
                  canRemove={rows.length > 1}
                  onChange={(p) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                  onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, { ...(rs.at(-1) ?? { kg: null, reps: 10 }) }])}
              className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-[14px] font-bold text-accent"
            >
              <Icon name="plus" size={16} strokeWidth={2.4} /> Serie
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (perSet) setRows((rs) => rs.map(() => ({ ...rs[0] })));
            setPerSet((v) => !v);
          }}
          className="text-[13.5px] font-bold text-accent"
        >
          {perSet ? "Todas iguales" : "Cambié el peso o las reps entre series"}
        </button>

        {/* Resumen en vivo */}
        <div className={`rounded-2xl px-4 py-3 transition-colors ${isRecord ? "bg-[rgba(240,162,46,0.16)]" : "bg-white/65"}`} aria-live="polite">
          <p className="text-[15px] font-bold text-ink">
            {uniform(rows) && first.reps
              ? `${rows.length} × ${first.reps}${first.kg ? ` con ${fmtDec(first.kg)} ${cardio ? "km/h" : "kg"}` : ""}`
              : `${rows.length} series`}
          </p>
          <p className="text-[13px] text-ink2">
            {!cardio && volume > 0 ? `${fmtInt(volume)} kg levantados` : cardio ? "Cardio" : "Sin peso (peso corporal)"}
            {!cardio && best > 0 && ` · 1RM est. ${fmtDec(Math.round(best * 10) / 10)} kg`}
          </p>
          {isRecord && <p className="animate-pop mt-1 text-[13px] font-extrabold text-accent">★ Récord personal (antes {fmtDec(Math.round(rec.bestE1rm * 10) / 10)} kg)</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}

        {initial &&
          onDelete &&
          (asking ? (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-[rgba(240,162,46,0.14)] py-1.5 pl-3.5 pr-1.5">
              <span className="text-[14px] font-semibold text-ink">¿Quitar este ejercicio?</span>
              <span className="flex gap-1">
                <button type="button" className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-ink2" onClick={() => setAsking(false)}>
                  No
                </button>
                <button
                  type="button"
                  className="min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold text-ink"
                  onClick={async () => {
                    setBusy(true);
                    const err = await onDelete();
                    setBusy(false);
                    if (err) setError(err);
                  }}
                >
                  Quitar
                </button>
              </span>
            </div>
          ) : (
            <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2">
              <Icon name="trash" size={18} /> Quitar ejercicio
            </button>
          ))}
      </div>
    </Sheet>
  );
}

const uniform = (rows: { kg: number | null; reps: number | null }[]) => rows.every((r) => r.kg === rows[0]?.kg && r.reps === rows[0]?.reps);

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <p className="mb-1 text-center text-[12px] font-bold uppercase tracking-wide text-ink2">{label}</p>
      {children}
    </div>
  );
}

function RowEdit({
  i,
  row,
  step,
  kgLabel,
  repsLabel,
  canRemove,
  onChange,
  onRemove,
}: {
  i: number;
  row: Row;
  step: number;
  kgLabel: string;
  repsLabel: string;
  canRemove: boolean;
  onChange: (p: Partial<Row>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <span className="text-[13px] font-bold text-ink2">Serie {i + 1}</span>
      <Stepper compact decimal label={`Serie ${i + 1}: ${kgLabel}`} step={step} max={1000} value={row.kg} onChange={(v) => onChange({ kg: v })} />
      <Stepper compact label={`Serie ${i + 1}: ${repsLabel}`} step={1} min={1} max={300} value={row.reps} onChange={(v) => onChange({ reps: v })} />
      <button
        type="button"
        aria-label={`Quitar serie ${i + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 disabled:opacity-25"
      >
        <Icon name="x" size={15} />
      </button>
    </>
  );
}

/* ---------- Paso 1: qué ejercicio ---------- */

function PickStep({ workouts, onChoose }: { workouts: WorkoutRow[]; onChoose: (name: string, muscle?: string) => void }) {
  const [q, setQ] = useState("");
  const nq = exerciseKey(q);
  const recent = doneExercises(workouts);
  const custom = recent.filter((r) => !allExercises(true).some((x) => exerciseKey(x.name) === exerciseKey(r.name)));
  const all = [...allExercises().map((x) => ({ name: x.name, muscle: x.muscle as string })), ...custom.map((c) => ({ name: c.name, muscle: muscleOf(c.name, c.muscle) as string }))];
  const exact = all.some((x) => exerciseKey(x.name) === nq);
  const matches = nq ? all.filter((x) => exerciseKey(x.name).includes(nq)) : [];
  const last = (n: string) => exerciseHistory(n, workouts).at(-1);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-1 bg-[rgba(250,252,246,0.94)] px-1 pb-2 pt-1">
        <div className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2" />
          <input
            className="input !pl-11"
            type="search"
            placeholder="ej. Press banca, sentadilla…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) onChoose(matches[0]?.name ?? q.trim().replace(/^./, (c) => c.toUpperCase()), matches[0]?.muscle);
            }}
            aria-label="Buscar ejercicio"
            autoFocus
          />
        </div>
      </div>

      {q.trim() && !exact && (
        <button
          type="button"
          onClick={() => onChoose(q.trim().replace(/^./, (c) => c.toUpperCase()))}
          className="mb-2 mt-1 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-mint/50 bg-white/60 px-3.5 py-3 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-accent shadow-glass">
            <Icon name="plus" size={18} strokeWidth={2.4} />
          </span>
          <span className="text-[14.5px] text-ink">
            Usar <b>“{q.trim()}”</b>
          </span>
        </button>
      )}

      {nq ? (
        <List title="Resultados" items={matches} last={last} onChoose={onChoose} />
      ) : (
        <>
          {recent.length > 0 && (
            <List title="Los que hacés" items={recent.slice(0, 8).map((r) => ({ name: r.name, muscle: muscleOf(r.name, r.muscle) }))} last={last} onChoose={onChoose} />
          )}
          {MUSCLES.filter((m) => m !== "Otro").map((m) => (
            <List key={m} title={m} items={all.filter((x) => x.muscle === m)} last={last} onChoose={onChoose} />
          ))}
        </>
      )}
    </>
  );
}

function List({
  title,
  items,
  last,
  onChoose,
}: {
  title: string;
  items: { name: string; muscle: string }[];
  last: (n: string) => ReturnType<typeof exerciseHistory>[number] | undefined;
  onChoose: (name: string, muscle?: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-3 first:mt-1">
      <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-ink2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((x) => {
          const l = last(x.name);
          return (
            <li key={`${title}-${x.name}`}>
              <button
                type="button"
                onClick={() => onChoose(x.name, x.muscle)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/90 bg-white/65 px-3.5 py-2.5 text-left transition active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-ink">{x.name}</span>
                  <span className="block truncate text-[12.5px] text-ink2">{l?.best ? `Última: ${fmtDec(l.best.kg ?? 0)} kg × ${l.best.reps ?? 0}` : x.muscle}</span>
                </span>
                <Icon name="chevron-right" size={18} className="shrink-0 text-ink2/70" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
