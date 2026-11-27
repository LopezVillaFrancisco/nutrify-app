"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import ScreenSkeleton from "@/components/ScreenSkeleton";
import Sheet from "@/components/Sheet";
import { Toast, useToast } from "@/components/Toast";
import { burst, haptic } from "@/lib/fx";
import ExercisePicker from "@/components/gym/ExercisePicker";
import ExerciseProgress from "@/components/gym/ExerciseProgress";
import Stepper from "@/components/gym/Stepper";
import { apiResult } from "@/lib/api";
import { fmtDec, fmtInt, hhmm, shortDate, todayISO } from "@/lib/format";
import { describeSets, doneExercises, durationMin, e1rm, exerciseHistory, recordsFor, routineExercise, workoutStats } from "@/lib/gym";
import { isCardio, muscleOf, stepOf } from "@/lib/exercises";
import { fetchers, keys } from "@/lib/queries";
import { useExercises } from "@/lib/exercise-store";
import { invalidate, setCached, useQuery } from "@/lib/store";
import type { RoutineRow, WorkoutExercise, WorkoutRow, WorkoutSet } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";
type Rest = { endsAt: number; total: number; exercise: string };
type NewRecord = { exercise: string; kg: number; reps: number };

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

export default function WorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const q = useQuery<WorkoutRow>(keys.workout(id), () => fetchers.workout(id), Infinity);
  const workouts = useQuery<WorkoutRow[]>(keys.workouts, fetchers.workouts).data ?? [];
  const routines = useQuery<RoutineRow[]>(keys.routines, fetchers.routines).data ?? [];
  const { toast, show, hide } = useToast();
  useExercises();

  // Copia local editable: la base se actualiza sola (con una pequeña espera) mientras cargás series
  const [w, setW] = useState<WorkoutRow | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const [askDelete, setAskDelete] = useState(false);
  const [picker, setPicker] = useState(false);
  const [progressOf, setProgressOf] = useState<string | null>(null);
  const [rest, setRest] = useState<Rest | null>(null);
  const [summary, setSummary] = useState<{ min: number; sets: number; volume: number; records: NewRecord[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<WorkoutRow | null>(null);

  useEffect(() => {
    if (q.data && !w) setW(q.data);
  }, [q.data, w]);

  // Reloj: duración del entreno y cuenta regresiva del descanso
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const restLeft = rest ? (rest.endsAt - now) / 1000 : 0;
  const restOver = rest !== null && restLeft <= 0;
  useEffect(() => {
    if (!restOver) return;
    navigator.vibrate?.([180, 90, 180]);
    const t = setTimeout(() => setRest(null), 4000);
    return () => clearTimeout(t);
  }, [restOver]);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    setSave("saving");
    const { error } = await apiResult(`/api/workouts/${next.id}`, { method: "PATCH", body: { exercises: next.exercises, name: next.name } });
    setSave(error ? "error" : "saved");
    if (!error) setCached(keys.workout(next.id), next);
  }, []);

  // Guardar lo pendiente si salís de la pantalla
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (pending.current) {
        flush();
        invalidate(keys.workouts, "activity:");
      }
    },
    [flush],
  );

  function update(fn: (exs: WorkoutExercise[]) => WorkoutExercise[]) {
    setW((cur) => {
      if (!cur) return cur;
      const next = { ...cur, exercises: fn(cur.exercises) };
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
      setSave("saving");
      return next;
    });
  }

  const setSet = (ei: number, si: number, patch: Partial<WorkoutSet>) =>
    update((exs) => exs.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j !== si ? s : { ...s, ...patch })) })));

  const routine = w ? routines.find((r) => r.id === w.routine_id) : undefined;

  /** Lo sugerido para una serie: lo de la vez anterior (misma serie) o el objetivo de la rutina. */
  function suggestion(ex: WorkoutExercise, si: number) {
    const prev = exerciseHistory(ex.name, workouts, w?.id).at(-1);
    const ps = prev?.sets[si] ?? prev?.sets.at(-1);
    const target = routineExercise(routine, ex.name);
    return { kg: ps?.kg ?? target?.kg ?? null, reps: target?.reps ?? ps?.reps ?? null };
  }

  function toggleDone(ei: number, si: number) {
    if (!w) return;
    const ex = w.exercises[ei];
    const s = ex.sets[si];
    if (s.done) return setSet(ei, si, { done: false });
    // Serie vacía: se completa con lo sugerido
    const sug = suggestion(ex, si);
    const kg = s.kg ?? sug.kg;
    const reps = s.reps ?? sug.reps;
    setSet(ei, si, { done: true, kg, reps });
    // Récord: supera tu mejor 1RM estimado de entrenos anteriores
    const rec = recordsFor(ex.name, workouts, w.id);
    if (!s.warmup && kg && reps && rec.sessions > 0 && e1rm(kg, reps) > rec.bestE1rm + 0.01) {
      haptic("goal");
      burst("star");
      show({ text: `Récord en ${ex.name}: ${fmtDec(kg)} kg × ${reps}`, icon: "star" });
    } else haptic("tap");
    // Descanso (salvo en la última serie del entreno)
    const isLast = ei === w.exercises.length - 1 && si === ex.sets.length - 1;
    if (!isLast && !isCardio(ex.name, ex.muscle)) {
      const total = ex.restSec ?? routineExercise(routine, ex.name)?.restSec ?? 90;
      setRest({ endsAt: Date.now() + total * 1000, total, exercise: ex.name });
    }
  }

  function records(): NewRecord[] {
    if (!w) return [];
    const out: NewRecord[] = [];
    for (const ex of w.exercises) {
      const rec = recordsFor(ex.name, workouts, w.id);
      if (!rec.sessions) continue;
      let best: WorkoutSet | null = null;
      for (const s of ex.sets)
        if (s.done && !s.warmup && s.kg && s.reps && e1rm(s.kg, s.reps) > rec.bestE1rm + 0.01 && (!best || e1rm(s.kg, s.reps) > e1rm(best.kg!, best.reps!)))
          best = s;
      if (best) out.push({ exercise: ex.name, kg: best.kg!, reps: best.reps! });
    }
    return out;
  }

  async function finish() {
    if (!w) return;
    clearTimeout(timer.current);
    pending.current = w;
    await flush();
    const finished_at = new Date().toISOString();
    const { error } = await apiResult(`/api/workouts/${w.id}`, { method: "PATCH", body: { finished_at } });
    if (error) return show("No se pudo terminar. Probá de nuevo.");
    const done = { ...w, finished_at };
    setW(done);
    setCached(keys.workout(w.id), done);
    invalidate(keys.workouts, "activity:");
    setRest(null);
    const st = workoutStats(w);
    setSummary({ min: durationMin(done), sets: st.sets, volume: st.volume, records: records() });
  }

  async function remove() {
    if (!w) return;
    clearTimeout(timer.current);
    pending.current = null;
    const { error } = await apiResult(`/api/workouts/${w.id}`, { method: "DELETE" });
    if (error) return show("No se pudo borrar.");
    invalidate(keys.workouts, "activity:");
    router.push("/gym");
  }

  if (!w) {
    if (q.error)
      return (
        <div className="pt-4">
          <Link href="/gym" className="text-[15px] font-bold text-accent">
            ← Volver a Gym
          </Link>
          <p className="glass mt-4 px-4 py-3 text-[14px] font-semibold text-ink">No encontramos ese entreno.</p>
        </div>
      );
    return <ScreenSkeleton title="Entreno" />;
  }

  const st = workoutStats(w);
  const finished = Boolean(w.finished_at);
  const elapsed = (finished ? new Date(w.finished_at!).getTime() - new Date(w.started_at).getTime() : now - new Date(w.started_at).getTime()) / 1000;

  return (
    <>
      <header className="pt-1">
        <div className="flex items-center justify-between gap-3">
          <Link href="/gym" className="-ml-1 inline-flex min-h-[36px] items-center gap-0.5 text-[13px] font-semibold text-ink2">
            <Icon name="chevron-left" size={16} /> Gym
          </Link>
          <span className="text-[12.5px] font-semibold text-ink2" aria-live="polite">
            {save === "saving" ? "Guardando…" : save === "saved" ? "✓ Guardado" : save === "error" ? "Sin guardar: revisá internet" : ""}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight text-ink">{w.name}</h1>
            <p className="text-[13px] text-ink2">
              {w.date === todayISO() ? "Hoy" : shortDate(w.date)} · {hhmm(w.started_at)}
              {finished && w.finished_at ? ` a ${hhmm(w.finished_at)}` : ""}
            </p>
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[15px] font-extrabold tabular-nums ${
              finished ? "bg-white/60 text-ink2" : "bg-white text-ink shadow-glass"
            }`}
          >
            <Icon name="clock" size={16} className={finished ? "" : "text-mint"} />
            {clock(elapsed)}
          </span>
        </div>
      </header>

      {/* Avance del entreno */}
      <div className="glass mt-3 px-4 py-3">
        <div className="flex items-baseline justify-between text-[13px] text-ink2">
          <span>
            <b className="text-[16px] font-extrabold text-ink">{st.sets}</b> de {st.total} series
          </span>
          <span>
            <b className="text-[16px] font-extrabold text-ink">{fmtInt(st.volume)}</b> kg levantados
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/85" aria-hidden>
          <div className="h-full rounded-full grad-d transition-[width] duration-500" style={{ width: `${st.total ? (st.sets / st.total) * 100 : 0}%` }} />
        </div>
      </div>

      {w.exercises.length === 0 && (
        <div className="glass mt-3 px-5 py-8 text-center">
          <p className="text-[16px] font-bold text-ink">Entreno libre</p>
          <p className="mt-1 text-[14px] text-ink2">Agregá los ejercicios que vas a hacer.</p>
        </div>
      )}

      <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
        {w.exercises.map((ex, ei) => (
          <ExerciseCard
            key={`${ex.name}-${ei}`}
            index={ei}
            ex={ex}
            workouts={workouts}
            workoutId={w.id}
            routine={routine}
            suggestion={(si) => suggestion(ex, si)}
            onSet={(si, p) => setSet(ei, si, p)}
            onToggle={(si) => toggleDone(ei, si)}
            onAddSet={() =>
              update((exs) =>
                exs.map((e, i) => {
                  if (i !== ei) return e;
                  const last = e.sets[e.sets.length - 1];
                  return { ...e, sets: [...e.sets, { reps: last?.reps ?? null, kg: last?.kg ?? null, done: false }] };
                }),
              )
            }
            onRemoveSet={() => update((exs) => exs.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.slice(0, -1) })))}
            onRemove={() => update((exs) => exs.filter((_, i) => i !== ei))}
            onMove={(d) =>
              update((exs) => {
                const j = ei + d;
                if (j < 0 || j >= exs.length) return exs;
                const next = [...exs];
                [next[ei], next[j]] = [next[j], next[ei]];
                return next;
              })
            }
            onProgress={() => setProgressOf(ex.name)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setPicker(true)}
        className="mt-3 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-mint/50 bg-white/40 text-[15px] font-bold text-accent transition active:scale-[0.99]"
      >
        <Icon name="plus" size={18} strokeWidth={2.4} /> Agregar ejercicio
      </button>

      <div className="mt-6">
        {askDelete ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-[rgba(240,162,46,0.14)] py-1.5 pl-3.5 pr-1.5">
            <span className="text-[14px] font-semibold text-ink">¿Borrar este entreno?</span>
            <span className="flex gap-1">
              <button type="button" className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-ink2" onClick={() => setAskDelete(false)}>
                No
              </button>
              <button type="button" className="min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold text-ink" onClick={remove}>
                Borrar
              </button>
            </span>
          </div>
        ) : (
          <button type="button" onClick={() => setAskDelete(true)} className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2">
            <Icon name="trash" size={18} /> Borrar entreno
          </button>
        )}
      </div>

      {/* Abajo, fijo: descanso (si corre) y terminar */}
      {(!finished || rest) && (
        <div className="sticky bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 mt-4 space-y-2 md:bottom-6">
          {rest && (
            <RestBar
              left={restLeft}
              total={rest.total}
              exercise={rest.exercise}
              onAdd={(d) => setRest((r) => (r ? { ...r, endsAt: Math.max(Date.now(), r.endsAt + d * 1000), total: Math.max(15, r.total + d) } : r))}
              onSkip={() => setRest(null)}
            />
          )}
          {!finished && (
            <button type="button" className="btn-accent w-full" onClick={finish} disabled={st.sets === 0}>
              <Icon name="check" size={20} strokeWidth={2.4} /> Terminar entreno
            </button>
          )}
        </div>
      )}

      {picker && (
        <ExercisePicker
          recent={doneExercises(workouts)}
          lastOf={(n) => exerciseHistory(n, workouts, w.id).at(-1)}
          exclude={w.exercises.map((e) => e.name)}
          onClose={() => setPicker(false)}
          onPick={(picked) => {
            update((exs) => [
              ...exs,
              ...picked.map((p) => {
                const last = exerciseHistory(p.name, workouts, w.id).at(-1);
                const n = Math.max(last?.sets.length ?? 3, 1);
                return { name: p.name, muscle: p.muscle, sets: Array.from({ length: n }, () => ({ reps: null, kg: null, done: false })) };
              }),
            ]);
            setPicker(false);
          }}
        />
      )}
      {progressOf && <ExerciseProgress name={progressOf} workouts={workouts} onClose={() => setProgressOf(null)} />}
      {summary && (
        <Summary
          {...summary}
          onClose={() => {
            sessionStorage.setItem("nutrify:flash", `¡Buen entreno! ${summary.sets} series${summary.volume ? ` · ${fmtInt(summary.volume)} kg` : ""}`);
            router.push("/gym");
          }}
        />
      )}

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

/* ---------- Un ejercicio ---------- */

function ExerciseCard({
  index,
  ex,
  workouts,
  workoutId,
  routine,
  suggestion,
  onSet,
  onToggle,
  onAddSet,
  onRemoveSet,
  onRemove,
  onMove,
  onProgress,
}: {
  index: number;
  ex: WorkoutExercise;
  workouts: WorkoutRow[];
  workoutId: string;
  routine?: RoutineRow;
  suggestion: (si: number) => { kg: number | null; reps: number | null };
  onSet: (si: number, p: Partial<WorkoutSet>) => void;
  onToggle: (si: number) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onProgress: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const prev = exerciseHistory(ex.name, workouts, workoutId).at(-1);
  const rec = recordsFor(ex.name, workouts, workoutId);
  const target = routineExercise(routine, ex.name);
  const cardio = isCardio(ex.name, ex.muscle);
  const doneCount = ex.sets.filter((s) => s.done).length;
  const allDone = doneCount === ex.sets.length && ex.sets.length > 0;

  return (
    <li className={`glass animate-rise p-4 transition-shadow ${allDone ? "ring-2 ring-mint/40" : ""}`} style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}>
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
            allDone ? "grad-d text-white" : "bg-white text-ink2 shadow-glass"
          }`}
        >
          {allDone ? <Icon name="check" size={16} strokeWidth={2.8} /> : index + 1}
        </span>
        <button type="button" onClick={onProgress} className="min-w-0 flex-1 text-left">
          <p className="text-[16px] font-bold leading-snug text-ink">{ex.name}</p>
          <p className="text-[12.5px] text-ink2">
            {muscleOf(ex.name, ex.muscle)}
            {target && ` · objetivo ${target.sets}×${target.reps}${target.kg ? ` con ${fmtDec(target.kg)} kg` : ""}`}
          </p>
        </button>
        <div className="relative -mr-1.5 -mt-1 flex shrink-0">
          <button
            type="button"
            onClick={onProgress}
            aria-label={`Progreso de ${ex.name}`}
            className="flex h-10 w-10 items-center justify-center rounded-full text-accent active:bg-white/70"
          >
            <Icon name="chart" size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label="Más opciones"
            aria-expanded={menu}
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink2 active:bg-white/70"
          >
            <span className="text-[20px] font-bold leading-none">⋯</span>
          </button>
          {menu && <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />}
          {menu && (
            <div className="animate-pop absolute right-0 top-11 z-20 w-48 overflow-hidden rounded-2xl border border-white/90 bg-[rgba(250,252,246,0.97)] py-1 shadow-nav">
              {[
                ["Subir", () => onMove(-1)],
                ["Bajar", () => onMove(1)],
                ["Quitar ejercicio", onRemove],
              ].map(([label, fn]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    (fn as () => void)();
                  }}
                  className="block min-h-[44px] w-full px-4 text-left text-[14px] font-semibold text-ink active:bg-white"
                >
                  {label as string}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(prev || rec.bestE1rm > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          {prev && (
            <span className="rounded-full bg-white/75 px-2.5 py-1 text-ink2">
              Anterior ({shortDate(prev.date)}): <b className="font-semibold text-ink">{describeSets(prev.sets)}</b>
            </span>
          )}
          {!cardio && rec.bestE1rm > 0 && (
            <span className="rounded-full bg-[rgba(240,162,46,0.16)] px-2.5 py-1 font-semibold text-accent">Récord 1RM est. {fmtInt(rec.bestE1rm)} kg</span>
          )}
        </div>
      )}

      {/* Series */}
      <div className="mt-3 grid grid-cols-[30px_minmax(0,1fr)_minmax(0,1fr)_46px] items-center gap-x-1.5 gap-y-2">
        <span className="text-center text-[11px] font-bold uppercase text-ink2">Serie</span>
        <span className="text-center text-[11px] font-bold uppercase text-ink2">{cardio ? "km/h" : "Kg"}</span>
        <span className="text-center text-[11px] font-bold uppercase text-ink2">{cardio ? "Min" : "Reps"}</span>
        <span aria-hidden />
        {ex.sets.map((s, si) => {
          const sug = suggestion(si);
          const isRecord =
            s.done && !s.warmup && !cardio && s.kg && s.reps && rec.sessions > 0 && e1rm(s.kg, s.reps) > rec.bestE1rm + 0.01;
          return (
            <SetRow
              key={si}
              index={si}
              set={s}
              sug={sug}
              step={cardio ? 0.5 : stepOf(ex.name)}
              record={Boolean(isRecord)}
              onChange={(p) => onSet(si, p)}
              onToggle={() => onToggle(si)}
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" className="inline-flex min-h-[40px] items-center gap-1 rounded-full px-1 text-[14px] font-bold text-accent" onClick={onAddSet}>
          <Icon name="plus" size={16} strokeWidth={2.4} /> Serie
        </button>
        <span className="text-[12.5px] text-ink2">
          {doneCount}/{ex.sets.length} hechas
        </span>
        {ex.sets.length > 1 ? (
          <button type="button" className="min-h-[40px] px-1 text-[13px] font-semibold text-ink2" onClick={onRemoveSet}>
            Quitar última
          </button>
        ) : (
          <span className="w-[86px]" />
        )}
      </div>
    </li>
  );
}

function SetRow({
  index,
  set,
  sug,
  step,
  record,
  onChange,
  onToggle,
}: {
  index: number;
  set: WorkoutSet;
  sug: { kg: number | null; reps: number | null };
  step: number;
  record: boolean;
  onChange: (p: Partial<WorkoutSet>) => void;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Tocar el número: serie de calentamiento (C), no cuenta para récords ni volumen */}
      <button
        type="button"
        onClick={() => onChange({ warmup: !set.warmup })}
        aria-label={set.warmup ? `Serie ${index + 1}: calentamiento. Tocá para que sea normal` : `Serie ${index + 1}. Tocá para marcarla como calentamiento`}
        className={`flex h-10 w-[30px] items-center justify-center rounded-xl text-[14px] font-extrabold ${
          set.warmup ? "bg-[rgba(240,162,46,0.2)] text-accent" : set.done ? "text-accent" : "text-ink2"
        }`}
      >
        {set.warmup ? "C" : index + 1}
      </button>
      <Stepper compact decimal label={`Serie ${index + 1}: kilos`} step={step} max={1000} value={set.kg} placeholder={sug.kg} done={set.done} onChange={(v) => onChange({ kg: v })} />
      <Stepper compact label={`Serie ${index + 1}: repeticiones`} step={1} max={300} value={set.reps} placeholder={sug.reps} done={set.done} onChange={(v) => onChange({ reps: v })} />
      <button
        type="button"
        aria-label={set.done ? `Desmarcar serie ${index + 1}` : `Marcar serie ${index + 1} como hecha`}
        aria-pressed={set.done}
        onClick={onToggle}
        className={`flex h-10 w-[46px] items-center justify-center rounded-xl transition-colors ${
          set.done ? "animate-check grad-d text-white shadow-fab" : "border border-white/90 bg-white/75 text-ink2"
        }`}
      >
        <Icon name="check" size={20} strokeWidth={set.done ? 2.8 : 2} />
      </button>
      {record && (
        <span className="animate-pop col-span-4 -mt-1 justify-self-center rounded-full bg-[rgba(240,162,46,0.18)] px-3 py-0.5 text-[12px] font-extrabold text-accent">
          ★ Récord personal
        </span>
      )}
    </>
  );
}

/* ---------- Descanso ---------- */

function RestBar({ left, total, exercise, onAdd, onSkip }: { left: number; total: number; exercise: string; onAdd: (d: number) => void; onSkip: () => void }) {
  const over = left <= 0;
  const pct = Math.min(1, Math.max(0, 1 - left / total));
  return (
    <div className="animate-rise overflow-hidden rounded-[22px] border border-white/90 bg-[rgba(250,252,246,0.95)] shadow-nav backdrop-blur-xl" role="timer" aria-live="polite">
      <div className="h-1.5 bg-white/80">
        <div className="h-full grad-d transition-[width] duration-500 ease-linear" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="flex items-center gap-2 py-2 pl-4 pr-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-ink2">{over ? "¡A la próxima serie!" : `Descanso · ${exercise}`}</p>
          <p className={`text-[24px] font-extrabold leading-none tabular-nums ${over ? "text-accent" : "text-ink"}`}>{over ? "0:00" : clock(left)}</p>
        </div>
        {!over && (
          <>
            <button type="button" onClick={() => onAdd(-15)} className="h-10 rounded-xl bg-white/80 px-2.5 text-[13px] font-bold text-ink2 active:scale-95">
              −15
            </button>
            <button type="button" onClick={() => onAdd(15)} className="h-10 rounded-xl bg-white/80 px-2.5 text-[13px] font-bold text-ink2 active:scale-95">
              +15
            </button>
          </>
        )}
        <button type="button" onClick={onSkip} className="h-10 rounded-xl bg-white px-3 text-[13px] font-bold text-accent shadow-glass active:scale-95">
          {over ? "Listo" : "Saltar"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Resumen al terminar ---------- */

function Summary({ min, sets, volume, records, onClose }: { min: number; sets: number; volume: number; records: NewRecord[]; onClose: () => void }) {
  return (
    <Sheet
      title="¡Entreno terminado!"
      subtitle="Bien ahí. Esto es lo que hiciste."
      onClose={onClose}
      footer={
        <button type="button" className="btn-accent w-full" onClick={onClose}>
          Listo
        </button>
      }
    >
      <div className="grid grid-cols-3 gap-2 pt-1">
        {[
          ["Duración", min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`],
          ["Series", String(sets)],
          ["Volumen", `${fmtInt(volume)} kg`],
        ].map(([label, value], i) => (
          <div key={label} className="animate-rise rounded-2xl bg-white/75 px-2 py-3 text-center" style={{ animationDelay: `${i * 70}ms` }}>
            <p className="text-[12px] font-semibold text-ink2">{label}</p>
            <p className="mt-0.5 text-[18px] font-extrabold text-ink">{value}</p>
          </div>
        ))}
      </div>
      {records.length > 0 ? (
        <div className="animate-rise mt-4 rounded-2xl bg-[rgba(240,162,46,0.14)] p-3.5" style={{ animationDelay: "220ms" }}>
          <p className="text-[14px] font-extrabold text-ink">★ {records.length === 1 ? "1 récord nuevo" : `${records.length} récords nuevos`}</p>
          <ul className="mt-1.5 space-y-1 text-[13.5px] text-ink">
            {records.map((r) => (
              <li key={r.exercise}>
                {r.exercise}: <b>{fmtDec(r.kg)} kg × {r.reps}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-[13.5px] text-ink2">Sin récords esta vez.</p>
      )}
    </Sheet>
  );
}
