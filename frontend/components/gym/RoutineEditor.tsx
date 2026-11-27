"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import ExercisePicker from "@/components/gym/ExercisePicker";
import Stepper from "@/components/gym/Stepper";
import { apiResult } from "@/lib/api";
import { isCardio, muscleOf, stepOf } from "@/lib/exercises";
import { fmtDec } from "@/lib/format";
import { doneExercises, exerciseHistory } from "@/lib/gym";
import { isMissingTable } from "@/lib/queries";
import type { RoutineExercise, RoutineRow, WorkoutRow } from "@/lib/types";

const RESTS = [60, 90, 120, 180];
const restLabel = (s: number) => (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s / 60} min`);

/** Crear / editar una rutina tocando, sin escribir texto. */
export default function RoutineEditor({
  routine,
  workouts,
  onClose,
  onSaved,
}: {
  routine: RoutineRow | null;
  workouts: WorkoutRow[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(routine?.name ?? "");
  const [list, setList] = useState<RoutineExercise[]>(() =>
    (routine?.exercises ?? []).map((e) => ({ ...e, muscle: muscleOf(e.name, e.muscle), restSec: e.restSec ?? 90 })),
  );
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const valid = name.trim() !== "" && list.length > 0;

  const history = (n: string) => exerciseHistory(n, workouts);
  const lastOf = (n: string) => history(n).at(-1);

  const patch = (i: number, p: Partial<RoutineExercise>) => setList((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setList((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const row = { name: name.trim(), exercises: list };
    const { error: err } = routine
      ? await apiResult(`/api/routines/${routine.id}`, { method: "PUT", body: row })
      : await apiResult("/api/routines", { method: "POST", body: row });
    setBusy(false);
    if (err) return setError(isMissingTable(err) ? "Falta actualizar la base: corré supabase/schema.sql." : err.message || "No se pudo guardar. Probá de nuevo.");
    onSaved(routine ? "Rutina actualizada" : `Rutina creada: ${row.name}`);
  }

  async function remove() {
    if (!routine) return;
    setBusy(true);
    const { error: err } = await apiResult(`/api/routines/${routine.id}`, { method: "DELETE" });
    setBusy(false);
    if (err) return setError("No se pudo borrar.");
    onSaved(`Borraste ${routine.name}`);
  }

  const totalSets = list.reduce((s, e) => s + e.sets, 0);

  return (
    <>
      <Sheet
        title={routine ? "Editar rutina" : "Nueva rutina"}
        subtitle={list.length ? `${list.length} ejercicios · ${totalSets} series` : undefined}
        onClose={onClose}
        footer={
          <button type="button" className="btn-accent w-full" disabled={!valid || busy} onClick={save}>
            {busy ? "Guardando…" : routine ? "Guardar cambios" : "Crear rutina"}
          </button>
        }
      >
        <div className="space-y-4 pt-2">
          <div>
            <label htmlFor="r-name" className="label">
              Nombre
            </label>
            <input id="r-name" className="input" placeholder="ej. Push, Piernas, Full body" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          {list.length > 0 && (
            <ul className="space-y-2.5">
              {list.map((ex, i) => {
                const last = lastOf(ex.name);
                const cardio = isCardio(ex.name, ex.muscle);
                return (
                  <li key={`${ex.name}-${i}`} className="animate-rise rounded-[20px] border border-white/90 bg-white/60 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full grad-d text-[13px] font-extrabold text-white">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-ink">{ex.name}</p>
                        <p className="truncate text-[12.5px] text-ink2">
                          {ex.muscle}
                          {last?.best && ` · última ${fmtDec(last.best.kg ?? 0)} kg × ${last.best.reps ?? 0}`}
                        </p>
                      </div>
                      <div className="flex shrink-0">
                        <IconBtn label="Subir" disabled={i === 0} onClick={() => move(i, -1)}>
                          <Icon name="chevron-left" size={17} className="rotate-90" />
                        </IconBtn>
                        <IconBtn label="Bajar" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                          <Icon name="chevron-left" size={17} className="-rotate-90" />
                        </IconBtn>
                        <IconBtn label={`Quitar ${ex.name}`} onClick={() => setList((l) => l.filter((_, j) => j !== i))}>
                          <Icon name="x" size={16} />
                        </IconBtn>
                      </div>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <Field label="Series">
                        <Stepper compact label="series" step={1} min={1} max={12} value={ex.sets} onChange={(v) => patch(i, { sets: v ?? 1 })} />
                      </Field>
                      <Field label={cardio ? "Minutos" : "Reps"}>
                        <Stepper compact label="repeticiones" step={1} min={1} max={120} value={ex.reps} onChange={(v) => patch(i, { reps: v ?? 1 })} />
                      </Field>
                      {!cardio && (
                        <Field label="Kg objetivo (opcional)">
                          <Stepper
                            compact
                            decimal
                            label="kilos objetivo"
                            step={stepOf(ex.name)}
                            max={1000}
                            value={ex.kg ?? null}
                            placeholder={last?.best?.kg ?? null}
                            onChange={(v) => patch(i, { kg: v })}
                          />
                        </Field>
                      )}
                      <Field label="Descanso">
                        <div className="grid h-10 grid-cols-4 gap-1">
                          {RESTS.map((r) => (
                            <button
                              key={r}
                              type="button"
                              aria-pressed={(ex.restSec ?? 90) === r}
                              onClick={() => patch(i, { restSec: r })}
                              className={`rounded-xl text-[12px] transition-colors ${
                                (ex.restSec ?? 90) === r ? "bg-white font-bold text-accent shadow-glass" : "bg-white/50 font-semibold text-ink2"
                              }`}
                            >
                              {r % 60 ? `${Math.floor(r / 60)}:30` : `${r / 60}'`}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setPicker(true)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-mint/50 bg-white/40 text-[15px] font-bold text-accent transition active:scale-[0.99]"
          >
            <Icon name="plus" size={18} strokeWidth={2.4} /> Agregar ejercicios
          </button>

          {list.length > 0 && (
            <p className="text-[12.5px] leading-snug text-ink2">
              Descanso por defecto {restLabel(90)}. Al marcar una serie hecha arranca el cronómetro de descanso.
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
              {error}
            </p>
          )}

          {routine &&
            (asking ? (
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-[rgba(240,162,46,0.14)] py-1.5 pl-3.5 pr-1.5">
                <span className="text-[14px] font-semibold text-ink">¿Borrar la rutina? Tus entrenos quedan.</span>
                <span className="flex gap-1">
                  <button type="button" className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-ink2" onClick={() => setAsking(false)}>
                    No
                  </button>
                  <button type="button" className="min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold text-ink" onClick={remove} disabled={busy}>
                    Borrar
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => setAsking(true)} className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2">
                <Icon name="trash" size={18} /> Borrar rutina
              </button>
            ))}
        </div>
      </Sheet>

      {picker && (
        <ExercisePicker
          recent={doneExercises(workouts)}
          lastOf={lastOf}
          exclude={list.map((e) => e.name)}
          onClose={() => setPicker(false)}
          onPick={(picked) => {
            setList((l) => [
              ...l,
              ...picked.map((p) => {
                const last = lastOf(p.name);
                return {
                  name: p.name,
                  muscle: p.muscle,
                  sets: Math.max(last?.sets.length ?? 3, 1),
                  reps: last?.best?.reps ?? (p.muscle === "Cardio" ? 20 : 10),
                  kg: null,
                  restSec: 90,
                };
              }),
            ]);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 truncate text-[12px] font-semibold text-ink2">{label}</p>
      {children}
    </div>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink2 transition active:bg-white disabled:opacity-25"
    >
      {children}
    </button>
  );
}
