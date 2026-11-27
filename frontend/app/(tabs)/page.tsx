"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import MealSheet from "@/components/MealSheet";
import Ring from "@/components/Ring";
import Bar from "@/components/ProgressBar";
import WeekCapsules from "@/components/WeekCapsules";
import WaterSheet from "@/components/WaterSheet";
import StepsSheet from "@/components/StepsSheet";
import { addWater, deleteWater } from "@/lib/activity";
import { waterGoal, waterStatus } from "@/lib/health";
import { Toast, useToast } from "@/components/Toast";
import { burst, haptic, takeJustSaved } from "@/lib/fx";
import { useCountUp } from "@/lib/useCountUp";
import { analyzeText, deleteEntries, saveLines, sumEntries } from "@/lib/entries";
import { MEAL_LABEL, MEALS_ORDER, fmtDec, fmtInt, greeting, headerDate, hhmm, mealForNow, todayISO } from "@/lib/format";
import { inRange, streakFrom, weekOf, type DayMap } from "@/lib/days";
import { DEFAULT_CUPS, DEFAULT_SETTINGS } from "@/lib/settings";
import { fetchers, invalidateEntries, isMissingTable, keys, prefetchScreen } from "@/lib/queries";
import { useQuery } from "@/lib/store";
import type { Cup, EntryRow, Meal, SavedMealRow, Settings, StepsRow, WaterRow } from "@/lib/types";

const EMPTY_WEEK: DayMap = {};

export default function HoyPage() {
  const [today, setToday] = useState(() => todayISO());
  const [openMeal, setOpenMeal] = useState<Meal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"water" | "steps" | null>(null);
  const { toast, show, hide } = useToast();
  const [flashMeal, setFlashMeal] = useState<{ meal: Meal; n: number } | null>(null);
  const [ringFrom, setRingFrom] = useState<number | null>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const weekDays = useMemo(() => weekOf(today), [today]);

  // Datos desde la caché compartida: aparecen al instante y se actualizan en segundo plano
  const entriesQ = useQuery<EntryRow[]>(keys.entries(today), () => fetchers.entries(today));
  const savedQ = useQuery<SavedMealRow[]>(keys.saved, fetchers.saved);
  const settingsQ = useQuery<Settings>(keys.settings, fetchers.settings, 5 * 60_000);
  const weekQ = useQuery<DayMap>(keys.week(today), () => fetchers.week(today));
  const loggedQ = useQuery<string[]>(keys.logged(today), () => fetchers.logged(today), 5 * 60_000);
  const waterQ = useQuery<WaterRow[]>(keys.water(today), () => fetchers.water(today));
  const stepsQ = useQuery<StepsRow[]>(keys.steps(today), () => fetchers.steps(today));

  const entries = entriesQ.data;
  const saved = savedQ.data ?? [];
  const settings = settingsQ.data ?? DEFAULT_SETTINGS;
  // (una caché vieja puede no tener los vasos)
  const cups = settings.cups?.length ? settings.cups : DEFAULT_CUPS;
  const week = weekQ.data ?? EMPTY_WEEK;
  const streak = useMemo(() => streakFrom(new Set(loggedQ.data ?? []), today), [loggedQ.data, today]);
  const loadError = entriesQ.error;

  const reload = async () => {
    invalidateEntries();
    await entriesQ.refresh();
  };

  // Precarga las otras pantallas cuando el teléfono está libre: al tocar una tab ya están los datos
  useEffect(() => {
    const run = () => ["/alimentos", "/gym", "/semana", "/perfil"].forEach((h) => prefetchScreen(h, today));
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run);
    else setTimeout(run, 1200);
  }, [today]);

  // Si la app vuelve del segundo plano (o pasó la medianoche), se actualiza
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = todayISO();
      if (now !== today) setToday(now);
      else {
        invalidateEntries();
        waterQ.refresh();
        stepsQ.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Venís de guardar en Anotar: el anillo corre desde el valor anterior y la comida brilla
  useEffect(() => {
    const j = takeJustSaved();
    if (!j) return;
    setRingFrom(j.fromKcal);
    setFlashMeal({ meal: j.meal as Meal, n: Date.now() });
    haptic("ok");
    const t = setTimeout(() => burst("food", ringRef.current), 250);
    return () => clearTimeout(t);
  }, []);

  const list = entries ?? [];
  const water = waterQ.data ?? [];
  const waterTotal = water.reduce((t, w) => t + w.ml, 0);
  const wGoal = waterGoal(settings);
  const wStatus = waterStatus(waterTotal, wGoal.ml, water.length ? water[water.length - 1].drank_at : null);
  const steps = stepsQ.data ?? [];
  const stepsTotal = steps.reduce((t, r) => t + r.steps, 0);
  const treadmillSteps = steps.filter((r) => r.kind === "caminadora").reduce((t, r) => t + r.steps, 0);
  const needsSchema = isMissingTable(waterQ.err) || isMissingTable(stepsQ.err);

  // Feedback inmediato (vibra, gotas que vuelan al número); se guarda en segundo plano
  async function quickWater(cup: Cup, el: HTMLElement) {
    const before = waterTotal;
    haptic("tap");
    burst("water", el, "water");
    const { id, error } = await addWater(today, cup.ml);
    if (error) return show(isMissingTable(error) ? "Falta actualizar la base: corré supabase/schema.sql." : "No se pudo guardar.");
    const undo = id ? { label: "Deshacer", run: () => void deleteWater(today, id) } : undefined;
    if (before < wGoal.ml && before + cup.ml >= wGoal.ml) {
      haptic("goal");
      burst("goal", fxWaterCard.current);
      show({ text: "¡Meta de agua cumplida!", icon: "goal", action: undo });
    } else show({ text: `+${fmtInt(cup.ml)} ml (${cup.name})`, icon: "drop", action: undo });
  }
  const fxWaterCard = useRef<HTMLDivElement>(null);
  const waterShown = useCountUp(waterTotal);
  const stepsShown = useCountUp(stepsTotal);
  const totals = sumEntries(list);
  const remaining = Math.round(settings.kcal - totals.kcal);
  const pastDays = weekDays.filter((d) => d <= today && week[d]);
  const weekHits = pastDays.filter((d) => inRange(week[d].kcal, settings)).length;

  // Las 5 comidas siempre visibles: las vacías quedan como casilleros para completar
  const byMeal = MEALS_ORDER.map((meal) => {
    const items = list.filter((e) => e.meal === meal);
    return { meal, items, t: sumEntries(items), first: items[0]?.eaten_at, review: items.some((e) => e.source === "revisar") };
  });
  const nowMeal = mealForNow();
  // Repetir: primero las comidas guardadas para este momento del día, después las de cualquier momento
  const savedSorted = [...saved].sort((a, b) => rank(a.meal) - rank(b.meal));
  function rank(m?: Meal | null) {
    return m === nowMeal ? 0 : m ? 2 : 1;
  }

  // Repetir: un toque suma la comida guardada a la comida del momento (con opción de deshacer)
  async function repeat(meal: SavedMealRow, el: HTMLElement) {
    haptic("tap");
    setBusy(meal.id);
    const { lines, error } = await analyzeText(meal.items.join("\n"));
    if (error) {
      show(error);
      setBusy(null);
      return;
    }
    const target = mealForNow();
    const { error: dbError, ids } = await saveLines(lines, { date: today, meal: target });
    if (dbError) {
      setBusy(null);
      show("No se pudo guardar. Probá de nuevo.");
      return;
    }
    await reload();
    setBusy(null);
    haptic("ok");
    burst("food", el, "kcal");
    setFlashMeal({ meal: target, n: Date.now() });
    show({
      icon: "food",
      text: `Sumaste ${meal.name} a ${MEAL_LABEL[target].toLowerCase()}${
        lines.some((l) => !l.found) ? ". Algo quedó sin datos: revisalo" : ""
      }`,
      action: {
        label: "Deshacer",
        run: async () => {
          await deleteEntries(ids);
          reload();
        },
      },
    });
  }

  const message =
    totals.kcal === 0
      ? "Cuando comas algo, anotalo con el +."
      : remaining > 0
        ? `Te quedan ${fmtInt(remaining)} kcal. Vas genial.`
        : "Llegaste a tu meta de hoy. Bien ahí.";

  return (
    <>
      <header className="flex items-start justify-between gap-3 pt-1">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink2">{headerDate()}</p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">{greeting()}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {streak > 0 && (
            <span className="pill !min-h-[36px] !px-3.5 text-[13px] !font-bold text-accent">
              {streak} {streak === 1 ? "día seguido" : "días seguidos"}
            </span>
          )}
          <Link
            href="/perfil"
            aria-label="Perfil"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/85 bg-white/70 text-ink2 shadow-glass md:hidden"
          >
            <Icon name="user" size={22} />
          </Link>
        </div>
      </header>

      {/* Celular: una columna. Escritorio: resumen y semana arriba, lado a lado; el resto abajo a lo ancho */}
      <div className="flex flex-col md:grid md:grid-cols-2 md:gap-x-5">
      {/* Resumen: anillo + macros */}
      <section className="glass mt-5 flex items-center gap-4 p-4 md:order-1 md:gap-6 md:p-6" aria-label="Resumen del día">
        <div ref={ringRef}>
          <Ring value={totals.kcal} goal={settings.kcal} from={entries ? ringFrom : null} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-ink">{entries ? message : " "}</p>
          <dl className="mt-3 space-y-2">
            <Macro color="#F0A22E" label="Proteína">
              {fmtInt(totals.protein)} <span className="font-medium text-ink2">/ {fmtInt(settings.protein)} g</span>
            </Macro>
            <Macro color="#1F9D6B" label="Carbos">
              {fmtInt(totals.carbs)} g
            </Macro>
            <Macro color="#8CA39A" label="Grasas">
              {fmtInt(totals.fat)} g
            </Macro>
          </dl>
        </div>
      </section>

      {/* Agua y pasos: se cargan con un toque */}
      <section className="mt-4 grid grid-cols-2 gap-3 md:order-3 md:col-span-2 md:mt-5 md:gap-5" aria-label="Agua y pasos">
        <div ref={fxWaterCard} className="glass flex flex-col p-4 md:p-5">
          <button type="button" onClick={() => setSheet("water")} className="-m-1 rounded-2xl p-1 text-left">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink2">
              <Icon name="drop" size={16} className="text-mint" /> Agua
            </span>
            <span className="mt-1 block text-[22px] font-extrabold leading-tight text-ink">
              <span data-fx-target="water" className="inline-block tabular-nums">{waterQ.loading ? "—" : fmtInt(waterShown)}</span>
              <span className="text-[13px] font-semibold text-ink2"> / {fmtInt(wGoal.ml)} ml</span>
            </span>
            <Bar pct={waterTotal / wGoal.ml} />
            <span className={`mt-2 line-clamp-2 block text-[12.5px] leading-snug ${wStatus.tone === "nudge" ? "font-bold text-accent" : "text-ink2"}`}>
              {needsSchema ? "Falta actualizar la base (schema.sql)." : wStatus.text}
            </span>
          </button>
          {/* Tus vasos de siempre: un toque y listo */}
          <div className="mt-auto flex gap-1.5" style={{ marginTop: 12 }}>
            {cups.slice(0, 2).map((c) => (
              <button
                key={`${c.name}-${c.ml}`}
                type="button"
                onClick={(e) => quickWater(c, e.currentTarget)}
                aria-label={`Sumar ${c.name}, ${c.ml} ml`}
                className="pill min-w-0 flex-1 flex-col !min-h-[46px] !gap-0 !rounded-2xl !px-1.5 !py-1 leading-tight active:scale-[0.97]"
              >
                <span className="block max-w-full truncate text-[13px] font-bold">+ {c.name}</span>
                <span className="block text-[11.5px] font-semibold text-ink2">{c.ml >= 1000 ? `${fmtDec(c.ml / 1000)} L` : `${c.ml} ml`}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="glass flex flex-col p-4 md:p-5">
          <button type="button" onClick={() => setSheet("steps")} className="-m-1 rounded-2xl p-1 text-left">
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink2">
              <Icon name="steps" size={16} className="text-mango" /> Pasos
            </span>
            <span className="mt-1 block text-[22px] font-extrabold leading-tight text-ink">
              <span data-fx-target="steps" className="inline-block tabular-nums">{stepsQ.loading ? "—" : fmtInt(stepsShown)}</span>
              <span className="text-[13px] font-semibold text-ink2"> / {fmtInt(settings.stepsGoal)}</span>
            </span>
            <Bar pct={stepsTotal / settings.stepsGoal} />
            <span className="mt-2 line-clamp-2 block text-[12.5px] leading-snug text-ink2">
              {stepsTotal >= settings.stepsGoal
                ? "Llegaste a tu meta de pasos."
                : treadmillSteps > 0
                  ? `${fmtInt(treadmillSteps)} de caminadora`
                  : "Sumá la caminadora o los del celular."}
            </span>
          </button>
          <button type="button" onClick={() => setSheet("steps")} className="pill mt-auto w-full !min-h-[40px] !px-3 text-[14px]" style={{ marginTop: 12 }}>
            + Agregar
          </button>
        </div>
      </section>

      {loadError && (
        <p className="glass mt-4 px-4 py-3 text-[14px] font-semibold text-ink md:order-4 md:col-span-2">
          No pudimos cargar tus datos. Revisá la conexión.
        </p>
      )}

      {/* Repetir */}
      {saved.length > 0 && (
        <section className="mt-6 md:order-5 md:col-span-2" aria-labelledby="repetir">
          <h2 id="repetir" className="mb-2.5 text-[15px] font-bold text-ink">
            Repetir
          </h2>
          <div className="flex flex-wrap gap-2">
            {savedSorted.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={(e) => repeat(m, e.currentTarget)}
                disabled={busy !== null}
                className="pill max-w-full"
                aria-label={`Sumar ${m.name} a hoy`}
              >
                <Icon name="repeat" size={16} className="shrink-0 text-accent" />
                <span className="truncate">{busy === m.id ? "Sumando…" : m.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Comidas: un casillero por comida, siempre visible */}
      <section className="mt-6 md:order-6 md:col-span-2" aria-labelledby="comidas">
        <h2 id="comidas" className="mb-2.5 text-[15px] font-bold text-ink">
          Comidas
        </h2>
        {entries === undefined ? (
          <div className="space-y-3 md:grid md:grid-cols-2 md:gap-3 md:space-y-0" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass h-[64px] animate-pulse" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
            {byMeal.map((m) =>
              m.items.length > 0 ? (
                <li key={flashMeal?.meal === m.meal ? `${m.meal}-${flashMeal.n}` : m.meal}>
                  <button
                    type="button"
                    onClick={() => setOpenMeal(m.meal)}
                    className={`glass flex h-full w-full items-stretch gap-3 py-3.5 pl-3.5 pr-4 text-left transition-transform hover:bg-white/75 active:scale-[0.99] ${
                      flashMeal?.meal === m.meal ? "animate-highlight" : ""
                    }`}
                  >
                    <span className="w-1 shrink-0 rounded-full grad-v" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-bold text-ink">
                        {MEAL_LABEL[m.meal]}
                        {m.first && <span className="font-medium text-ink2"> · {hhmm(m.first)}</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink2">
                        {m.items.map((e) => e.food_name).join(", ")}
                      </p>
                      {m.review && <p className="mt-1 text-[12.5px] font-extrabold text-accent">revisar</p>}
                    </div>
                    <div className="shrink-0 self-center text-right">
                      <p className="text-[15px] font-bold text-ink">{fmtInt(m.t.kcal)} kcal</p>
                      <p className="text-[13px] text-ink2">{fmtInt(m.t.protein)} g prot.</p>
                    </div>
                  </button>
                </li>
              ) : (
                <li key={m.meal}>
                  <Link
                    href={`/anotar?meal=${m.meal}`}
                    className={`flex h-full min-h-[60px] items-center justify-between gap-3 rounded-[22px] border-2 border-dashed px-4 py-3 transition-colors hover:bg-white/50 ${
                      m.meal === nowMeal ? "border-mint/60 bg-white/45" : "border-white/80 bg-white/25"
                    }`}
                  >
                    <span>
                      <span className="block text-[15px] font-bold text-ink">{MEAL_LABEL[m.meal]}</span>
                      {m.meal === nowMeal && <span className="block text-[12.5px] font-semibold text-accent">Es la hora. ¿Qué comiste?</span>}
                    </span>
                    <span className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-white/80 px-3 text-[13.5px] font-bold text-accent">
                      <Icon name="plus" size={16} strokeWidth={2.4} /> Agregar
                    </span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* Esta semana */}
      <Link
        href="/semana"
        className="glass mt-6 block p-4 transition-colors hover:bg-white/75 md:order-2 md:mt-5 md:flex md:flex-col md:justify-between md:p-6"
        aria-label="Ver la semana"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-bold text-ink">Esta semana</p>
          {pastDays.length > 0 && (
            <p className="text-[13px] font-bold text-accent">
              {weekHits} de {pastDays.length} en tu rango
            </p>
          )}
        </div>
        <div className="mt-4">
          <WeekCapsules days={weekDays} data={week} settings={settings} today={today} />
        </div>
      </Link>
      </div>

      {sheet === "water" && (
        <WaterSheet date={today} list={water} goal={wGoal.ml} goalAuto={wGoal.auto} cups={cups} onClose={() => setSheet(null)} onToast={show} />
      )}
      {sheet === "steps" && (
        <StepsSheet
          date={today}
          list={steps}
          goal={settings.stepsGoal}
          heightCm={settings.heightCm}
          onClose={() => setSheet(null)}
          onToast={show}
        />
      )}

      {openMeal && (
        <MealSheet
          meal={openMeal}
          entries={list.filter((e) => e.meal === openMeal)}
          date={today}
          onClose={() => setOpenMeal(null)}
          onChanged={reload}
          onToast={show}
        />
      )}

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

function Macro({ color, label, children }: { color: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="flex items-center gap-1.5 text-[13px] font-medium text-ink2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </dt>
      <dd className="text-[15px] font-bold text-ink">{children}</dd>
    </div>
  );
}
