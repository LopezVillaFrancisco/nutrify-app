"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import { Toast, useToast } from "@/components/Toast";
import { burst, haptic } from "@/lib/fx";
import ExerciseProgress from "@/components/gym/ExerciseProgress";
import RoutineEditor from "@/components/gym/RoutineEditor";
import LogExerciseSheet from "@/components/gym/LogExerciseSheet";
import ExercisesManager from "@/components/gym/ExercisesManager";
import { rememberExercise, useExercises } from "@/lib/exercise-store";
import { clearPending, isOffline, pendingFor, setPending, syncPending } from "@/lib/gym-offline";
import { fmtDec, fmtInt, hhmm, shortDate, todayISO } from "@/lib/format";
import {
  describeSets,
  doneExercises,
  durationMin,
  e1rm,
  exerciseHistory,
  recordsFor,
  saveWorkoutExercises,
  startWorkout,
  todayWorkout,
  workoutStats,
} from "@/lib/gym";
import { allExercises, muscleOf, type Muscle } from "@/lib/exercises";
import { addDays, weekOf } from "@/lib/days";
import { fetchers, isMissingTable, keys } from "@/lib/queries";
import { invalidate, useQuery } from "@/lib/store";
import type { RoutineRow, WorkoutExercise, WorkoutRow } from "@/lib/types";

export default function GymPage() {
  const router = useRouter();
  const routinesQ = useQuery<RoutineRow[]>(keys.routines, fetchers.routines);
  const workoutsQ = useQuery<WorkoutRow[]>(keys.workouts, fetchers.workouts);
  const [editor, setEditor] = useState<{ routine: RoutineRow | null } | null>(null);
  const [progressOf, setProgressOf] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [manager, setManager] = useState(false);
  useExercises();
  // Carga a mano: null = cerrado; index null = ejercicio nuevo; número = editar ese
  const [logger, setLogger] = useState<{ index: number | null } | null>(null);
  const { toast, show, hide } = useToast();

  useEffect(() => {
    const flash = sessionStorage.getItem("nutrify:flash");
    if (flash) {
      sessionStorage.removeItem("nutrify:flash");
      show(flash);
    }
  }, [show]);

  const routines = routinesQ.data;
  const workouts = workoutsQ.data;
  const list = workouts ?? [];
  const today = todayISO();
  // Lo anotado sin señal (queda en el teléfono hasta que vuelve la conexión)
  const [pending, setPendingState] = useState<WorkoutExercise[] | null>(null);
  useEffect(() => {
    const load = () => setPendingState(pendingFor(todayISO()));
    load();
    window.addEventListener("nutrify:gym-pending", load);
    return () => window.removeEventListener("nutrify:gym-pending", load);
  }, []);
  const serverToday = list.find((w) => w.date === today);
  const todayW: WorkoutRow | undefined = pending
    ? {
        ...(serverToday ?? { id: "pendiente", date: today, routine_id: null, name: "Entreno", started_at: new Date().toISOString(), finished_at: null }),
        exercises: pending,
      }
    : serverToday;

  // Subir lo pendiente: al abrir, al volver la señal y al volver a la app
  useEffect(() => {
    if (!workouts) return;
    const run = () =>
      syncPending(workouts).then((n) => {
        if (n > 0) show("Listo: se subió lo que anotaste sin señal");
      });
    run();
    const onVis = () => document.visibilityState === "visible" && run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [workouts, show]);
  const inProgress = list.find((w) => !w.finished_at && w.date === today && w.routine_id);
  const needsSchema = isMissingTable(routinesQ.err) || isMissingTable(workoutsQ.err);

  // Esta semana
  const week = weekOf(today);
  const thisWeek = list.filter((w) => w.date >= week[0] && w.date <= week[6] && workoutStats(w).sets > 0);
  const weekVolume = thisWeek.reduce((s, w) => s + workoutStats(w).volume, 0);
  const weekSets = thisWeek.reduce((s, w) => s + workoutStats(w).sets, 0);
  const lastWeekCount = list.filter((w) => w.date >= addDays(week[0], -7) && w.date < week[0] && workoutStats(w).sets > 0).length;

  const exercises = doneExercises(list);

  async function start(routine: RoutineRow | null) {
    if (inProgress) return router.push(`/gym/${inProgress.id}`);
    setStarting(routine?.id ?? "libre");
    const { id, error } = await startWorkout(routine);
    if (!id) {
      setStarting(null);
      return show(isMissingTable(error) ? "Falta actualizar la base: corré supabase/schema.sql." : "No se pudo empezar. Probá de nuevo.");
    }
    router.push(`/gym/${id}`);
  }

  /** Guarda un ejercicio en el entreno de hoy (lo crea si hace falta). */
  /** Sin señal: queda en el teléfono y se sube solo después. */
  function keepLocal(exs: WorkoutExercise[], msg: string) {
    setPending(today, exs);
    setLogger(null);
    haptic("ok");
    show({ text: `${msg} · sin señal, se sube solo`, icon: "gym" });
    return null;
  }

  async function saveExercise(ex: WorkoutExercise, index: number | null): Promise<string | null> {
    const base = todayW?.exercises ?? [];
    const exs = index === null ? [...base, ex] : base.map((e, i) => (i === index ? ex : e));
    const label = index === null ? `Anotado: ${ex.name}` : "Cambios guardados";
    if (isOffline()) return keepLocal(exs, label);
    const { w, error } = await todayWorkout(list);
    if (!w) return isOffline(error) ? keepLocal(exs, label) : isMissingTable(error) ? "Falta actualizar la base." : "No se pudo guardar. Probá de nuevo.";
    const rec = recordsFor(ex.name, list, w.id);
    const best = Math.max(0, ...ex.sets.map((x) => (x.kg && x.reps ? e1rm(x.kg, x.reps) : 0)));
    const r = await saveWorkoutExercises(w, exs, list);
    if (r.error) return isOffline(r.error) ? keepLocal(exs, label) : "No se pudo guardar. Probá de nuevo.";
    clearPending(today);
    rememberExercise(ex.name, muscleOf(ex.name, ex.muscle) as Muscle);
    setLogger(null);
    if (rec.sessions > 0 && best > rec.bestE1rm + 0.01) {
      haptic("goal");
      burst("star");
      show({ text: `Récord en ${ex.name}`, icon: "star" });
    } else {
      haptic("ok");
      burst("gym");
      show({ text: label, icon: "gym" });
    }
    return null;
  }

  async function removeExercise(index: number): Promise<string | null> {
    if (!todayW) return null;
    const exs = todayW.exercises.filter((_, i) => i !== index);
    if (isOffline() || !serverToday) return keepLocal(exs, "Ejercicio quitado");
    const r = await saveWorkoutExercises(serverToday, exs, list);
    if (r.error) return isOffline(r.error) ? keepLocal(exs, "Ejercicio quitado") : "No se pudo quitar.";
    clearPending(today);
    setLogger(null);
    show("Ejercicio quitado");
    return null;
  }

  const lastByRoutine = (id: string) => list.find((w) => w.routine_id === id && workoutStats(w).sets > 0);
  const history = list.filter((w) => w.finished_at || w.id !== inProgress?.id);

  return (
    <>
      <PageHeader
        eyebrow="Tu entrenamiento"
        title="Gym"
        right={
          <button type="button" className="btn-accent hidden shrink-0 md:inline-flex" onClick={() => setEditor({ routine: null })}>
            <Icon name="plus" size={20} strokeWidth={2.4} /> Nueva rutina
          </button>
        }
      />

      {needsSchema && (
        <p className="glass mt-4 px-4 py-3 text-[14px] font-semibold text-ink">
          Para usar Gym falta actualizar la base: corré <b>supabase/schema.sql</b> en Supabase (SQL Editor).
        </p>
      )}

      {/* Hoy: lo que hiciste, ejercicio por ejercicio */}
      <section className="glass animate-rise mt-3 p-4 md:p-5" aria-labelledby="hoy">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="hoy" className="text-[17px] font-extrabold text-ink">
            Hoy
          </h2>
          {pending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(240,162,46,0.18)] px-2.5 py-0.5 text-[12px] font-bold text-accent">
              <Icon name="clock" size={13} /> Sin subir
            </span>
          ) : todayW && workoutStats(todayW).sets > 0 && (
            <p className="text-[12.5px] text-ink2">
              {todayW.exercises.length} {todayW.exercises.length === 1 ? "ejercicio" : "ejercicios"} · {workoutStats(todayW).sets} series
              {workoutStats(todayW).volume > 0 && ` · ${fmtInt(workoutStats(todayW).volume)} kg`}
            </p>
          )}
        </div>

        {todayW && todayW.exercises.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {todayW.exercises.map((ex, i) => {
              const done = ex.sets.filter((x) => x.done || x.reps);
              const rec = recordsFor(ex.name, list, todayW.id);
              const best = Math.max(0, ...done.map((x) => (x.kg && x.reps && !x.warmup ? e1rm(x.kg, x.reps) : 0)));
              const isRecord = rec.sessions > 0 && best > rec.bestE1rm + 0.01;
              return (
                <li key={`${ex.name}-${i}`} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                  <button
                    type="button"
                    onClick={() => setLogger({ index: i })}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/90 bg-white/70 px-3.5 py-3 text-left transition active:scale-[0.99]"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full grad-d text-[13px] font-extrabold text-white">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-bold text-ink">{ex.name}</span>
                        {isRecord && <span className="shrink-0 rounded-full bg-[rgba(240,162,46,0.2)] px-2 py-0.5 text-[11px] font-extrabold text-accent">★ récord</span>}
                      </span>
                      <span className="block truncate text-[13px] text-ink2">{done.length ? describeSets(done) : "Sin series"}</span>
                    </span>
                    <Icon name="edit" size={17} className="shrink-0 text-ink2/70" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-[14px] leading-snug text-ink2">
            Anotá cada ejercicio con series, reps y kilos.
          </p>
        )}

        <button type="button" className="btn-accent mt-3 w-full" onClick={() => setLogger({ index: null })}>
          <Icon name="plus" size={20} strokeWidth={2.4} /> Anotar ejercicio
        </button>
        {todayW && !pending && todayW.exercises.length > 0 && (
          <Link href={`/gym/${todayW.id}`} className="mt-2 flex min-h-[40px] items-center justify-center gap-1 text-[13.5px] font-bold text-accent">
            Modo entreno: serie por serie, con descanso <Icon name="chevron-right" size={15} />
          </Link>
        )}
      </section>

      {/* Semana */}
      <section className="glass animate-rise mt-3 p-4 md:p-5" aria-label="Esta semana">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-ink2">Esta semana</p>
          {lastWeekCount > 0 && <p className="text-[12.5px] text-ink2">La anterior: {lastWeekCount}</p>}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5" aria-hidden>
          {week.map((d) => {
            const trained = thisWeek.some((w) => w.date === d);
            return (
              <div key={d} className="flex flex-col items-center gap-1">
                <span
                  className={`flex h-9 w-full max-w-[40px] items-center justify-center rounded-xl text-[12px] font-bold transition ${
                    trained ? "grad-d text-white shadow-fab" : d === today ? "bg-white text-ink ring-2 ring-mint/50" : d > today ? "bg-white/40 text-ink2/50" : "bg-white/60 text-ink2"
                  }`}
                >
                  {trained ? <Icon name="check" size={15} strokeWidth={2.8} /> : Number(d.slice(8))}
                </span>
                <span className="text-[10.5px] font-semibold text-ink2">{["L", "M", "M", "J", "V", "S", "D"][week.indexOf(d)]}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <WeekStat value={String(thisWeek.length)} label={thisWeek.length === 1 ? "entreno" : "entrenos"} />
          <WeekStat value={fmtInt(weekSets)} label="series" />
          <WeekStat value={weekVolume >= 10000 ? `${fmtDec(Math.round(weekVolume / 100) / 10)} t` : `${fmtInt(weekVolume)} kg`} label="levantados" />
        </div>
      </section>

      {inProgress && (
        <Link
          href={`/gym/${inProgress.id}`}
          className="grad-border animate-rise mt-3 flex items-center gap-3 rounded-[22px] px-4 py-3.5 shadow-glass"
        >
          <span className="flex h-11 w-11 shrink-0 animate-pulse items-center justify-center rounded-full grad-d text-white">
            <Icon name="play" size={20} strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-ink">Seguir: {inProgress.name}</span>
            <span className="block text-[13px] text-ink2">
              Desde las {hhmm(inProgress.started_at)} · {workoutStats(inProgress).sets} de {workoutStats(inProgress).total} series
            </span>
          </span>
          <Icon name="chevron-right" size={20} className="text-ink2/70" />
        </Link>
      )}

      <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
        <div>
          {/* Rutinas */}
          <section className="mt-6" aria-labelledby="rutinas">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 id="rutinas" className="text-[15px] font-bold text-ink">
                Tus rutinas <span className="font-semibold text-ink2">(opcional)</span>
              </h2>
              <button type="button" onClick={() => setEditor({ routine: null })} className="min-h-[40px] text-[14px] font-bold text-accent md:hidden">
                + Nueva
              </button>
            </div>

            {routines === undefined && !routinesQ.error ? (
              <div className="space-y-2.5" aria-hidden>
                {[0, 1].map((i) => (
                  <div key={i} className="glass shimmer h-[112px]" />
                ))}
              </div>
            ) : !routines?.length ? (
              <div className="rounded-[22px] border-2 border-dashed border-white/80 px-5 py-4">
                <p className="text-[14px] leading-snug text-ink2">
                  ¿Hacés siempre lo mismo? Armá una rutina.
                </p>
                <button type="button" className="mt-2 min-h-[40px] text-[14px] font-bold text-accent" onClick={() => setEditor({ routine: null })}>
                  + Crear rutina
                </button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {routines.map((r, i) => {
                  const last = lastByRoutine(r.id);
                  const muscles = [...new Set(r.exercises.map((e) => muscleOf(e.name, e.muscle)))].slice(0, 4);
                  const sets = r.exercises.reduce((s, e) => s + e.sets, 0);
                  return (
                    <li key={r.id} className="glass animate-rise p-4" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex items-start gap-3">
                        <button type="button" onClick={() => setEditor({ routine: r })} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-[16px] font-bold text-ink">{r.name}</p>
                          <p className="mt-0.5 text-[12.5px] text-ink2">
                            {r.exercises.length} ejercicios · {sets} series · ~{Math.round(sets * 2.5)} min
                            {last ? ` · ${last.date === today ? "hoy" : shortDate(last.date)}` : " · sin hacer"}
                          </p>
                          <span className="mt-2 flex flex-wrap gap-1">
                            {muscles.map((m) => (
                              <span key={m} className="rounded-full bg-white/75 px-2 py-0.5 text-[11.5px] font-semibold text-ink2">
                                {m}
                              </span>
                            ))}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => start(r)}
                          disabled={starting !== null}
                          className="flex h-12 shrink-0 items-center gap-1.5 rounded-2xl px-4 text-[15px] font-bold text-white grad-d shadow-fab transition active:scale-95 disabled:opacity-60"
                        >
                          {starting === r.id ? (
                            <span className="dot-pulse" aria-label="Empezando">
                              <span />
                              <span />
                              <span />
                            </span>
                          ) : (
                            <>
                              <Icon name="play" size={16} strokeWidth={2.2} /> {inProgress ? "Seguir" : "Empezar"}
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

          </section>

          <button
            type="button"
            onClick={() => setManager(true)}
            className="glass mt-3 flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/75 active:scale-[0.99]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-accent shadow-glass">
              <Icon name="dumbbell" size={18} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-bold text-ink">Mis ejercicios</span>
              <span className="block text-[12.5px] text-ink2">{allExercises().length} en tu lista · creá, editá u ocultá</span>
            </span>
            <Icon name="chevron-right" size={18} className="shrink-0 text-ink2/70" />
          </button>

          {/* Progreso por ejercicio */}
          {exercises.length > 0 && (
            <section className="mt-6" aria-labelledby="progreso">
              <h2 id="progreso" className="mb-2.5 text-[15px] font-bold text-ink">
                Tu progreso
              </h2>
              <ul className="space-y-2">
                {exercises.slice(0, 8).map((ex, i) => {
                  const h = exerciseHistory(ex.name, list);
                  const last = h.at(-1);
                  const first = h[0];
                  const diff = h.length > 1 && last && first ? last.bestE1rm - first.bestE1rm : null;
                  return (
                    <li key={ex.name} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
                      <button
                        type="button"
                        onClick={() => setProgressOf(ex.name)}
                        className="glass flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/75 active:scale-[0.99]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14.5px] font-bold text-ink">{ex.name}</span>
                          <span className="block truncate text-[12.5px] text-ink2">
                            {last?.best ? `${fmtDec(last.best.kg ?? 0)} kg × ${last.best.reps ?? 0}` : "–"} · {h.length}{" "}
                            {h.length === 1 ? "sesión" : "sesiones"}
                          </span>
                        </span>
                        <Spark values={h.map((s) => s.bestE1rm)} />
                        {diff !== null && (
                          <span className={`w-[52px] shrink-0 text-right text-[12.5px] font-bold ${diff > 0 ? "text-accent" : "text-ink2"}`}>
                            {diff > 0 ? "+" : ""}
                            {fmtDec(Math.round(diff * 10) / 10)} kg
                          </span>
                        )}
                        <Icon name="chevron-right" size={18} className="shrink-0 text-ink2/70" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        {/* Historial */}
        <section className="mt-6" aria-labelledby="historial">
          <h2 id="historial" className="mb-2.5 text-[15px] font-bold text-ink">
            Historial
          </h2>
          {workouts === undefined && !workoutsQ.error ? (
            <div className="glass shimmer h-[72px]" aria-hidden />
          ) : !history.length ? (
            <p className="glass px-5 py-4 text-[14px] text-ink2">Cuando termines tu primer entreno, aparece acá.</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {(showAll ? history : history.slice(0, 6)).map((w, i) => {
                  const st = workoutStats(w);
                  const min = durationMin(w);
                  return (
                    <li key={w.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                      <Link href={`/gym/${w.id}`} className="glass flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/75">
                        <span className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-white/75 py-1">
                          <span className="text-[16px] font-extrabold leading-tight text-ink">{Number(w.date.slice(8))}</span>
                          <span className="text-[10.5px] font-bold uppercase text-ink2">
                            {new Date(`${w.date}T12:00:00`).toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-bold text-ink">{w.name}</span>
                          <span className="block truncate text-[12.5px] text-ink2">
                            {st.exercises} ejercicios · {st.sets} series{w.finished_at && min > 0 ? ` · ${min} min` : ""}
                            {!w.finished_at && <b className="text-accent"> · sin terminar</b>}
                          </span>
                        </span>
                        {st.volume > 0 && (
                          <span className="shrink-0 text-right">
                            <span className="block text-[15px] font-bold text-ink">{fmtInt(st.volume)}</span>
                            <span className="block text-[11.5px] text-ink2">kg</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {history.length > 6 && (
                <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-[44px] w-full text-[14px] font-bold text-accent">
                  {showAll ? "Ver menos" : `Ver todos (${history.length})`}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {editor && (
        <RoutineEditor
          routine={editor.routine}
          workouts={list}
          onClose={() => setEditor(null)}
          onSaved={(msg) => {
            setEditor(null);
            invalidate(keys.routines);
            show(msg);
          }}
        />
      )}
      {logger && (
        <LogExerciseSheet
          workouts={list}
          workoutId={todayW?.id}
          initial={logger.index !== null ? todayW?.exercises[logger.index] : undefined}
          onClose={() => setLogger(null)}
          onSave={(ex) => saveExercise(ex, logger.index)}
          onDelete={logger.index !== null ? () => removeExercise(logger.index!) : undefined}
        />
      )}
      {manager && <ExercisesManager onClose={() => setManager(false)} onToast={show} />}
      {progressOf && <ExerciseProgress name={progressOf} workouts={list} onClose={() => setProgressOf(null)} />}

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

function WeekStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/60 py-2">
      <p className="text-[18px] font-extrabold leading-tight text-ink">{value}</p>
      <p className="text-[11.5px] font-semibold text-ink2">{label}</p>
    </div>
  );
}

/** Mini línea de tendencia (sin ejes: el detalle está al tocar). */
function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="w-[64px] shrink-0" />;
  const W = 64;
  const H = 26;
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
