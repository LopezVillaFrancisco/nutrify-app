"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import WeekCapsules from "@/components/WeekCapsules";
import { Toast, useToast } from "@/components/Toast";
import GymSection from "@/components/progress/GymSection";
import WeightSection from "@/components/progress/WeightSection";
import { useExercises } from "@/lib/exercise-store";
import { workoutStats } from "@/lib/gym";
import { estimateWeight, weightOn } from "@/lib/weights";
import { addDays, inRange, weekOf, WEEK_NAMES, type DayMap } from "@/lib/days";
import { fmtDec, fmtInt, shortDate, todayISO } from "@/lib/format";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { fetchers, keys } from "@/lib/queries";
import { prefetchQuery, useQuery } from "@/lib/store";
import type { Settings, WeightRow, WorkoutRow } from "@/lib/types";

const EMPTY: DayMap = {};

type Tab = "semana" | "peso" | "gym";
const TABS: { key: Tab; label: string }[] = [
  { key: "semana", label: "Semana" },
  { key: "peso", label: "Peso" },
  { key: "gym", label: "Gym" },
];
const TAB_KEY = "nutrify:progreso-tab";

export default function SemanaPage() {
  const today = useMemo(() => todayISO(), []);
  const [anchor, setAnchor] = useState(today); // cualquier día de la semana mostrada
  const [tab, setTabState] = useState<Tab>("semana");
  const { toast, show, hide } = useToast();
  // Recordar la pestaña (si volvés a Progreso, seguís donde estabas)
  useEffect(() => {
    const t = sessionStorage.getItem(TAB_KEY) as Tab | null;
    if (t && TABS.some((x) => x.key === t)) setTabState(t);
  }, []);
  const setTab = (t: Tab) => {
    setTabState(t);
    sessionStorage.setItem(TAB_KEY, t);
    window.scrollTo({ top: 0 });
  };

  const weightsQ = useQuery<WeightRow[]>(keys.weights, fetchers.weights);
  const weights = weightsQ.data ?? [];
  const workoutsQ = useQuery<WorkoutRow[]>(keys.workouts, fetchers.workouts);
  const workouts = workoutsQ.data ?? [];
  useExercises();

  const days = useMemo(() => weekOf(anchor), [anchor]);
  const isCurrentWeek = days.includes(today);

  const settings = useQuery<Settings>(keys.settings, fetchers.settings, 5 * 60_000).data ?? DEFAULT_SETTINGS;
  const weekQ = useQuery<DayMap>(keys.week(anchor), () => fetchers.week(anchor));
  const data = weekQ.data;
  const activity = useQuery<Record<string, { water: number; steps: number; gym: number }>>(keys.activity(anchor), () =>
    fetchers.activity(anchor),
  ).data ?? {};

  // Precarga la semana anterior: al tocar la flecha aparece al instante
  useEffect(() => {
    const prev = addDays(anchor, -7);
    prefetchQuery(keys.week(prev), () => fetchers.week(prev), 5 * 60_000);
    prefetchQuery(keys.activity(prev), () => fetchers.activity(prev), 5 * 60_000);
  }, [anchor]);

  const map = data ?? EMPTY;
  const lastWeight = weights[weights.length - 1];
  const est = estimateWeight(weights, today);
  const weekAgo = lastWeight ? weightOn(weights, addDays(today, -7)) : undefined;
  const weightDelta = lastWeight && weekAgo && weekAgo.date !== lastWeight.date ? Number(lastWeight.kg) - Number(weekAgo.kg) : null;
  const thisWeek = weekOf(today);
  const gymWeek = workouts.filter((w) => w.date >= thisWeek[0] && w.date <= thisWeek[6] && workoutStats(w).sets > 0).length;
  const past = days.filter((d) => d <= today && map[d]);
  const hits = past.filter((d) => inRange(map[d].kcal, settings)).length;
  const gymDays = days.filter((d) => activity[d]?.gym).length;
  const stepsDays = days.filter((d) => (activity[d]?.steps ?? 0) > 0);
  const avgSteps = stepsDays.length ? stepsDays.reduce((t, d) => t + activity[d].steps, 0) / stepsDays.length : 0;

  return (
    <>
      <PageHeader eyebrow="Cómo venís" title="Progreso" />

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-[18px] bg-white/55 p-1 md:max-w-[420px]" role="tablist" aria-label="Sección">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-[44px] rounded-[14px] text-[14px] transition-colors ${tab === t.key ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "peso" && (
        <div className="animate-fade mt-4 md:max-w-[720px]">
          <WeightSection list={weights} error={weightsQ.err} loading={weightsQ.loading} fallbackKg={settings.weightKg} onToast={show} />
        </div>
      )}

      {tab === "gym" && (
        <div className="animate-fade mt-4 md:grid md:grid-cols-2 md:items-start md:gap-4 [&>section]:md:col-span-2">
          <GymSection workouts={workouts} loading={workoutsQ.loading} />
        </div>
      )}

      {tab === "semana" && (
      <div className="animate-fade">
      {/* Atajos: peso y gym de un vistazo (llevan a su pestaña) */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:max-w-[560px]">
        <SummaryCard
          title="Peso"
          value={est ? `${est.basis === "tendencia" ? "≈" : ""}${fmtDec(est.kg)} kg` : "Sin pesajes"}
          sub={
            est?.basis === "tendencia"
              ? "estimado hoy"
              : weightDelta !== null
                ? `${weightDelta > 0 ? "+" : weightDelta < 0 ? "−" : ""}${fmtDec(Math.abs(Math.round(weightDelta * 10) / 10))} kg en 7 días`
                : "Tocá para pesarte"
          }
          onClick={() => setTab("peso")}
        />
        <SummaryCard
          title="Gym"
          value={`${gymWeek} ${gymWeek === 1 ? "entreno" : "entrenos"}`}
          sub="esta semana"
          onClick={() => setTab("gym")}
        />
      </div>

      {/* Escritorio: gráfico a la izquierda (fijo), días a la derecha */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-6">
      <section className="glass mt-4 p-4 md:sticky md:top-8 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink"
            onClick={() => setAnchor(addDays(anchor, -7))}
            aria-label="Semana anterior"
          >
            <Icon name="chevron-left" size={20} />
          </button>
          <div className="text-center">
            <p className="text-[15px] font-bold text-ink">{isCurrentWeek ? "Esta semana" : `${shortDate(days[0])} – ${shortDate(days[6])}`}</p>
            {isCurrentWeek && <p className="text-[12.5px] text-ink2">{`${shortDate(days[0])} – ${shortDate(days[6])}`}</p>}
          </div>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-ink disabled:opacity-30"
            disabled={isCurrentWeek}
            onClick={() => setAnchor(addDays(anchor, 7))}
            aria-label="Semana siguiente"
          >
            <Icon name="chevron-right" size={20} />
          </button>
        </div>

        <div className="mt-5">
          <WeekCapsules days={days} data={map} settings={settings} today={today} size="lg" />
        </div>

        {past.length > 0 && (
          <p className="mt-5 text-center text-[15px] font-extrabold text-accent">
            {hits} de {past.length} en tu rango
          </p>
        )}
        <p className="mt-1.5 text-center text-[12px] text-ink2">
          Rango: {settings.rangeLow}%–{settings.rangeHigh}% de tu meta de {fmtInt(settings.kcal)} kcal.
        </p>

        {(gymDays > 0 || avgSteps > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-white/60 px-2 py-2.5">
              <p className="text-[15px] font-extrabold text-ink">
                {gymDays} {gymDays === 1 ? "día" : "días"}
              </p>
              <p className="text-[12px] font-medium text-ink2">de gym</p>
            </div>
            <div className="rounded-2xl bg-white/60 px-2 py-2.5">
              <p className="text-[15px] font-extrabold text-ink">{avgSteps ? fmtInt(avgSteps) : "—"}</p>
              <p className="text-[12px] font-medium text-ink2">pasos por día</p>
            </div>
          </div>
        )}
      </section>

      <ul className={`mt-4 space-y-2.5 ${data ? "" : "animate-pulse"}`} aria-busy={!data}>
        {days.map((date, i) => {
          const d = map[date];
          const a = activity[date];
          const future = date > today;
          const isToday = date === today;
          return (
            <li key={date} className={`glass flex items-center justify-between gap-3 px-4 py-3.5 ${future ? "opacity-60" : ""}`}>
              <div>
                <p className="text-[15px] font-bold text-ink">
                  {isToday ? "Hoy" : WEEK_NAMES[i]} <span className="font-medium text-ink2">· {shortDate(date)}</span>
                </p>
                {!d && <p className="text-[13px] text-ink2">{future ? "Todavía no llegó" : data ? "Sin anotar" : " "}</p>}
                {a && (a.steps > 0 || a.water > 0 || a.gym > 0) && (
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-ink2">
                    {a.steps > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="steps" size={14} className="text-mango" /> {fmtInt(a.steps)}
                      </span>
                    )}
                    {a.water > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="drop" size={14} className="text-mint" /> {fmtInt(a.water)} ml
                      </span>
                    )}
                    {a.gym > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-accent">
                        <Icon name="dumbbell" size={14} /> Gym
                      </span>
                    )}
                  </p>
                )}
              </div>
              {d && (
                <div className="text-right">
                  <p className="text-[15px] font-bold text-ink">{fmtInt(d.kcal)} kcal</p>
                  <p className="text-[13px] text-ink2">
                    {fmtInt(d.protein)} g prot.
                    {inRange(d.kcal, settings) && <span className="font-bold text-accent"> · en tu rango</span>}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      </div>
      </div>
      )}

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

function SummaryCard({ title, value, sub, onClick }: { title: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="glass flex items-center gap-2 px-4 py-3 text-left transition hover:bg-white/75 active:scale-[0.99]">
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-bold text-ink2">{title}</span>
        <span className="block truncate text-[17px] font-extrabold text-ink">{value}</span>
        <span className="block truncate text-[12px] text-ink2">{sub}</span>
      </span>
      <Icon name="chevron-right" size={18} className="shrink-0 text-ink2/70" />
    </button>
  );
}
