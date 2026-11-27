"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import { AiConfirmSheet } from "@/components/AiCheck";
import SavedPicker, { foodLine, sortMealsFor } from "@/components/SavedPicker";
import { analyzeText, saveFoodHref, saveLines, sumEntries } from "@/lib/entries";
import { MEAL_LABEL, MEALS_ORDER, fmtDec, fmtInt, mealForNow, todayISO } from "@/lib/format";
import { fetchers, invalidateEntries, keys } from "@/lib/queries";
import { fetchQuery, getCached, useQuery } from "@/lib/store";
import { burst, haptic, markJustSaved } from "@/lib/fx";
import type { AiStatus, AnalyzedLine, EntryRow, FoodRow, Meal, SavedMealRow } from "@/lib/types";

const DRAFT_KEY = "nutrify:draft";
const MEAL_KEY = "nutrify:draft-meal";

const QUESTION: Record<Meal, string> = {
  desayuno: "¿Qué desayunaste?",
  almuerzo: "¿Qué almorzaste?",
  merienda: "¿Qué merendaste?",
  colacion: "¿Qué comiste de colación?",
  cena: "¿Qué cenaste?",
};

const countLines = (t: string) => t.split(/\n|\+|,(?!\d)/).filter((x) => x.trim()).length;

export default function AnotarPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [meal, setMeal] = useState<Meal>(() => mealForNow());
  const [lines, setLines] = useState<AnalyzedLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [completing, setCompleting] = useState(false);
  const [askAi, setAskAi] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [flash, setFlash] = useState(0); // anima el texto cuando sumás un guardado
  const resultsRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const restored = useRef(false);

  const foods = useQuery<FoodRow[]>(keys.foods, fetchers.foods).data ?? [];
  const savedMeals = useQuery<SavedMealRow[]>(keys.saved, fetchers.saved).data ?? [];

  async function calculate(input = text) {
    if (!input.trim() || calculating) return;
    (document.activeElement as HTMLElement | null)?.blur(); // baja el teclado para ver el resultado
    setCalculating(true);
    setError(null);
    setLines(null);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const res = await analyzeText(input);
    setCalculating(false);
    if (res.error) {
      setError(res.error);
      setAi(null);
      return;
    }
    setLines(res.lines);
    setAi(res.ai ?? null);
  }

  // Modo "preguntarme": la IA solo se usa si lo confirmás en el aviso
  async function completeWithAi() {
    if (!text.trim() || completing) return;
    setCompleting(true);
    const res = await analyzeText(text, { allowAi: true });
    setCompleting(false);
    if (res.error) return setError(res.error);
    setLines(res.lines);
    setAi(res.ai ?? null);
  }

  // El borrador sobrevive si vas a Alimentos a guardar algo y volvés
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const params = new URLSearchParams(window.location.search);
    // Comida elegida desde el casillero de Hoy (o la que quedó del borrador)
    const fromParam = params.get("meal") as Meal | null;
    const stored = sessionStorage.getItem(MEAL_KEY) as Meal | null;
    const chosen = fromParam && fromParam in MEAL_LABEL ? fromParam : stored && stored in MEAL_LABEL ? stored : null;
    if (chosen) chooseMeal(chosen);
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) {
      setText(draft);
      if (params.get("recalc") === "1") calculate(draft);
    }
    if (params.toString()) router.replace("/anotar", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  }, [text]);

  function chooseMeal(m: Meal) {
    setMeal(m);
    sessionStorage.setItem(MEAL_KEY, m);
  }

  function editText(v: string) {
    setText(v);
    setLines(null);
    setAi(null);
    setError(null);
  }

  /** Suma líneas de un guardado al final del texto. */
  function addLines(add: string[]) {
    setText((t) => {
      const base = t.trimEnd();
      return (base ? `${base}\n` : "") + add.join("\n");
    });
    setLines(null);
    setAi(null);
    setError(null);
    setFlash((n) => n + 1);
  }

  async function confirm(el?: HTMLElement | null) {
    if (!lines?.length || saving) return;
    haptic("tap");
    setSaving(true);
    // Lo que tenías antes de guardar: en Hoy el anillo corre desde acá
    const fromKcal = sumEntries(getCached<EntryRow[]>(keys.entries(todayISO())) ?? []).kcal;
    const { error: dbError } = await saveLines(lines, { date: todayISO(), meal });
    if (dbError) {
      // 23514 = no pasa el check de la tabla (ej. "colación" sin el schema actualizado)
      setError(
        (dbError as { code?: string }).code === "23514"
          ? "Para guardar en colación falta actualizar la base: corré supabase/schema.sql en Supabase."
          : "No se pudo guardar. Probá de nuevo.",
      );
      setSaving(false);
      return;
    }
    sessionStorage.removeItem(DRAFT_KEY);
    sessionStorage.removeItem(MEAL_KEY);
    // Listo: check + partículas, y mientras tanto trae el día actualizado (Hoy aparece completo)
    setSaved(true);
    haptic("ok");
    burst("food", el);
    markJustSaved({ meal, fromKcal });
    const today = todayISO();
    invalidateEntries();
    await Promise.all([
      fetchQuery(keys.entries(today), () => fetchers.entries(today)).catch(() => {}),
      new Promise((r) => setTimeout(r, 650)),
    ]);
    router.push("/");
  }

  const totals = lines ? sumEntries(lines) : null;
  const missing = lines?.filter((l) => !l.found).length ?? 0;
  const pendingNames = new Set((ai?.pendingNames ?? []).map((n) => n.toLowerCase()));

  // Atajos debajo del texto: comidas guardadas para este momento y algunos de tus alimentos
  const quickMeals = sortMealsFor(savedMeals, meal)
    .filter((m) => !m.meal || m.meal === meal)
    .slice(0, 3);
  const quickFoods = foods.slice(0, Math.max(0, 5 - quickMeals.length));
  const savedCount = savedMeals.length + foods.length;

  return (
    <>
      <PageHeader eyebrow="Bloc de notas" title="Anotar" />

      {/* Escritorio: texto a la izquierda (fijo), resultado a la derecha */}
      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="lg:sticky lg:top-8">
          {/* Comida: arriba, para que la pregunta y lo que se guarda coincidan */}
          <div className="mt-3 grid grid-cols-5 gap-1 rounded-[18px] bg-white/55 p-1" role="radiogroup" aria-label="¿En qué comida?">
            {MEALS_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === meal}
                onClick={() => chooseMeal(m)}
                className={`min-h-[42px] truncate rounded-[14px] px-0.5 text-[12.5px] transition-all sm:text-[13.5px] ${
                  m === meal ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2 active:bg-white/60"
                }`}
              >
                {MEAL_LABEL[m]}
              </button>
            ))}
          </div>

          <section className="glass mt-3 p-4 md:p-5">
            <label htmlFor="what" key={meal} className="animate-fade block text-[19px] font-extrabold leading-tight text-ink">
              {QUESTION[meal]}
            </label>
            <div key={flash} className={`relative mt-3 rounded-[18px] ${flash ? "animate-pop" : ""}`}>
              <textarea
                ref={textRef}
                id="what"
                className="input min-h-[140px] resize-none !rounded-[18px] !bg-white/85 leading-relaxed"
                rows={5}
                placeholder={"2 huevos\n1 tostada con queso crema\n1 café con leche"}
                value={text}
                onChange={(e) => editText(e.target.value)}
                onKeyDown={(e) => {
                  // En compu: Ctrl/Cmd + Enter calcula
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    calculate();
                  }
                }}
                autoCapitalize="none"
                spellCheck={false}
              />
              {text && (
                <button
                  type="button"
                  onClick={() => {
                    editText("");
                    textRef.current?.focus();
                  }}
                  className="animate-fade absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink2 shadow-glass"
                  aria-label="Borrar el texto"
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-ink2">
              Una cosa por línea, con cantidad si la sabés.
            </p>

            {/* Tus guardados: un toque y se suman al texto */}
            {savedCount > 0 && (
              <div className="mt-3.5">
                <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-ink2">Tus guardados</p>
                <div className="flex flex-wrap gap-1.5">
                  {quickMeals.map((m, i) => (
                    <QuickChip key={m.id} index={i} icon="repeat" label={m.name} onClick={() => addLines(m.items)} />
                  ))}
                  {quickFoods.map((f, i) => (
                    <QuickChip key={f.id} index={quickMeals.length + i} icon="bookmark" label={f.name} onClick={() => addLines([foodLine(f)])} />
                  ))}
                  <button
                    type="button"
                    onClick={() => setPicker(true)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 text-[13px] font-bold text-accent active:bg-white/60"
                  >
                    Ver todos <span className="font-semibold opacity-70">{savedCount}</span>
                    <Icon name="chevron-right" size={15} />
                  </button>
                </div>
              </div>
            )}

            <button type="button" className="btn-accent mt-4 w-full" onClick={() => calculate()} disabled={calculating || !text.trim()}>
              {calculating ? (
                <>
                  Calculando
                  <span className="dot-pulse" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </>
              ) : (
                "Calcular"
              )}
            </button>
          </section>

          {error && (
            <p role="alert" className="animate-rise mt-3 rounded-2xl bg-[rgba(240,162,46,0.16)] px-4 py-3 text-[14px] font-semibold text-ink">
              {error}
            </p>
          )}
        </div>

        <div ref={resultsRef} className="scroll-mt-4">
          {calculating && <CalcLoader count={countLines(text)} />}

          {!lines && !calculating && (
            <div className="mt-3 hidden min-h-[300px] flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-white/80 px-8 text-center lg:flex">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/70 text-accent">
                <Icon name="list" size={22} />
              </span>
              <p className="mt-3 text-[15px] font-bold text-ink">Acá vas a ver lo que entendí</p>
              <p className="mt-1 text-[14px] text-ink2">Escribí lo que comiste y tocá Calcular (o Ctrl + Enter).</p>
            </div>
          )}

          {lines && totals && !calculating && (
            <div className="pb-2">
              {/* Total arriba: lo primero que se mira */}
              <TotalCard totals={totals} count={lines.length} />

              {ai && <AiBanner ai={ai} busy={completing} onComplete={() => setAskAi(true)} />}
              <SourcesSummary lines={lines} />

              <ul className="mt-3 space-y-2.5">
                {lines.map((l, i) => (
                  <LineCard
                    key={`${l.raw}-${i}`}
                    line={l}
                    index={i}
                    completing={completing && (pendingNames.has(l.food_name.toLowerCase()) || !l.found || l.origin?.qty === "supuesta")}
                    onRemove={() => setLines((ls) => (ls && ls.length > 1 ? ls.filter((_, j) => j !== i) : null))}
                  />
                ))}
              </ul>

              {missing > 0 && (
                <p className="mt-3 px-1 text-[13px] leading-snug text-ink2">
                  {missing === 1 ? "1 alimento quedó" : `${missing} quedaron`} en 0: quitalo o cargalo en Alimentos.
                </p>
              )}

              {/* Guardar: barra fija con el total */}
              <div className="animate-rise sticky bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 mt-5 md:bottom-6">
                <div className="flex items-center gap-3 rounded-[22px] border border-white/90 bg-[rgba(250,252,246,0.92)] p-2 pl-4 shadow-nav backdrop-blur-xl">
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-semibold text-ink2">{MEAL_LABEL[meal]}</p>
                    <p className="text-[17px] font-extrabold leading-tight text-ink">{fmtInt(totals.kcal)} kcal</p>
                  </div>
                  <button
                    type="button"
                    className={`btn-accent ml-auto min-w-0 flex-1 sm:flex-none sm:px-6 ${saved ? "btn-done !opacity-100" : ""}`}
                    onClick={(e) => confirm(e.currentTarget)}
                    disabled={saving || !lines.length}
                  >
                    {saved ? (
                      <>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path className="toast-check" d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                        ¡Guardado!
                      </>
                    ) : saving ? (
                      <>
                        Guardando
                        <span className="dot-pulse" aria-hidden>
                          <span />
                          <span />
                          <span />
                        </span>
                      </>
                    ) : (
                      <>
                        <Icon name="check" size={18} strokeWidth={2.4} /> Guardar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {askAi && ai && (
        <AiConfirmSheet
          ai={ai}
          onClose={() => setAskAi(false)}
          onConfirm={() => {
            setAskAi(false);
            completeWithAi();
          }}
        />
      )}
      {picker && (
        <SavedPicker meal={meal} foods={foods} meals={savedMeals} onAdd={addLines} onClose={() => setPicker(false)} />
      )}
    </>
  );
}

function QuickChip({ icon, label, index, onClick }: { icon: "repeat" | "bookmark"; label: string; index: number; onClick: () => void }) {
  const [tapped, setTapped] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        onClick();
        setTapped((n) => n + 1);
      }}
      className="animate-rise inline-flex min-h-[36px] max-w-full items-center gap-1.5 rounded-full border border-white/90 bg-white/70 px-3 text-[13px] font-semibold text-ink transition active:scale-[0.96]"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <span key={tapped} className={tapped ? "animate-pop text-mint" : "text-accent"}>
        <Icon name={tapped ? "check" : icon} size={14} strokeWidth={2.2} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/* ---------- Cargando: pasos reales del cálculo, con brillo ---------- */

const STEPS = ["Leyendo lo que escribiste", "Buscando en tus alimentos y la base", "Consultando USDA y Open Food Facts", "Sumando calorías y proteína"];

function CalcLoader({ count }: { count: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="glass animate-pop mt-3 p-4 md:p-5 lg:mt-0" role="status" aria-live="polite">
      <div className="calc-bar" aria-hidden />
      <ul className="mt-3.5 space-y-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 text-[14px] transition-opacity duration-300 ${i > step ? "opacity-35" : "opacity-100"}`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                i < step ? "grad-d text-white" : i === step ? "bg-white text-accent shadow-glass" : "bg-white/60"
              }`}
              aria-hidden
            >
              {i < step ? <Icon name="check" size={12} strokeWidth={3} /> : i === step ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" /> : null}
            </span>
            <span className={i === step ? "font-bold text-ink" : "text-ink2"}>{label}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 space-y-2" aria-hidden>
        {Array.from({ length: Math.min(Math.max(count, 1), 5) }).map((_, i) => (
          <li key={i} className="shimmer flex items-center gap-3 rounded-2xl bg-white/55 px-3.5 py-3" style={{ animationDelay: `${i * 80}ms` }}>
            <span className="h-9 w-1 rounded-full bg-white/90" />
            <span className="flex-1 space-y-1.5">
              <span className="block h-3 w-2/3 rounded-full bg-white/90" />
              <span className="block h-2.5 w-1/3 rounded-full bg-white/80" />
            </span>
            <span className="h-4 w-12 rounded-full bg-white/90" />
          </li>
        ))}
      </ul>
      <span className="sr-only">Calculando…</span>
    </div>
  );
}

/* ---------- Resultado ---------- */

function TotalCard({ totals, count }: { totals: { kcal: number; protein: number; carbs: number; fat: number }; count: number }) {
  // Reparto de calorías por macro (4/4/9) para la barrita
  const pk = totals.protein * 4;
  const ck = totals.carbs * 4;
  const fk = totals.fat * 9;
  const sum = pk + ck + fk || 1;
  return (
    <div className="glass animate-pop mt-3 p-4 md:p-5 lg:mt-0">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12.5px] font-semibold text-ink2">
            Total · {count} {count === 1 ? "alimento" : "alimentos"}
          </p>
          <p className="text-[34px] font-extrabold leading-none tracking-tight text-ink">
            {fmtInt(totals.kcal)}
            <span className="ml-1 text-[15px] font-bold text-ink2">kcal</span>
          </p>
        </div>
        <p className="text-right text-[13px] font-semibold text-ink2">
          <b className="text-[18px] font-extrabold text-ink">{fmtInt(totals.protein)} g</b>
          <br />
          proteína
        </p>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/80" aria-hidden>
        <span className="h-full bg-mango transition-all duration-700" style={{ width: `${(pk / sum) * 100}%` }} />
        <span className="h-full bg-mint transition-all duration-700" style={{ width: `${(ck / sum) * 100}%` }} />
        <span className="h-full bg-sage transition-all duration-700" style={{ width: `${(fk / sum) * 100}%` }} />
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3.5 text-[12.5px] text-ink2">
        <Macro color="bg-mango" label="Prot." g={totals.protein} />
        <Macro color="bg-mint" label="Carbos" g={totals.carbs} />
        <Macro color="bg-sage" label="Grasas" g={totals.fat} />
      </p>
    </div>
  );
}

function Macro({ color, label, g }: { color: string; label: string; g: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden />
      {label} <b className="font-semibold text-ink">{fmtInt(g)} g</b>
    </span>
  );
}

function LineCard({ line: l, index, completing, onRemove }: { line: AnalyzedLine; index: number; completing: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const o = l.origin;
  const review = l.source === "revisar";
  return (
    <li
      className={`glass animate-rise overflow-hidden ${completing ? "shimmer" : ""}`}
      style={{ animationDelay: `${Math.min(index, 10) * 55}ms` }}
    >
      <div className="flex items-start gap-3 py-3.5 pl-3.5 pr-1.5">
        <span className={`mt-0.5 w-1 self-stretch rounded-full ${l.found ? "grad-v" : "bg-sage/40"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 text-[15px] font-bold leading-snug text-ink">
              {l.food_name}
              <span className="font-medium text-ink2"> · {fmtInt(l.grams)} g</span>
            </p>
            <p className="shrink-0 text-[16px] font-extrabold text-ink">
              {fmtInt(l.kcal)}
              <span className="ml-0.5 text-[11.5px] font-semibold text-ink2">kcal</span>
            </p>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] italic text-ink2">“{l.raw}”</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink2">
            <Macro color="bg-mango" label="P" g={l.protein} />
            <Macro color="bg-mint" label="C" g={l.carbs} />
            <Macro color="bg-sage" label="G" g={l.fat} />
          </p>

          {/* De dónde sale: siempre a la vista en una línea; el detalle se despliega */}
          {o && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-2 flex w-full min-w-0 items-center gap-1.5 text-left text-[12.5px]"
            >
              <Badge kind={o.values === "ia" ? "ai" : o.values === "ninguno" ? "none" : "ok"}>{VALUES_LABEL[o.values]}</Badge>
              {(o.qty === "ia" || o.qty === "supuesta") && <Badge kind={o.qty === "ia" ? "ai" : "none"}>{o.qty === "ia" ? "Cantidad IA" : "Cantidad supuesta"}</Badge>}
              {review && <span className="tag tag-review !h-[20px]">revisar</span>}
              <span className="ml-auto shrink-0 font-bold text-accent">{open ? "Ocultar" : "De dónde sale"}</span>
            </button>
          )}
          {open && (
            <div className="animate-fade">
              <Origin line={l} />
            </div>
          )}

          {l.source !== "guardado" && (
            <Link
              href={saveFoodHref({ name: l.food_name, ...l.per100g }, "anotar")}
              className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-bold text-accent"
            >
              <Icon name="bookmark" size={15} /> {l.found ? "Guardar en Alimentos" : "Cargarlo en Alimentos"}
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="-mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink2 active:bg-white/70"
          aria-label={`Quitar ${l.food_name}`}
        >
          <Icon name="x" size={17} />
        </button>
      </div>
    </li>
  );
}

/* ---------- De dónde sale cada dato ---------- */

const VALUES_LABEL: Record<AnalyzedLine["origin"]["values"], string> = {
  propio: "Tus alimentos",
  usda: "USDA",
  off: "Open Food Facts",
  ia: "IA",
  ninguno: "Sin datos",
};

const VALUES_HELP: Record<AnalyzedLine["origin"]["values"], string> = {
  propio: "Cargado por vos.",
  usda: "Base pública de EE.UU.",
  off: "Etiqueta del producto.",
  ia: "Estimado por IA. Revisalo.",
  ninguno: "No lo encontré: quedó en 0.",
};

function Badge({ kind, children }: { kind: "ok" | "ai" | "none"; children: React.ReactNode }) {
  const cls =
    kind === "ai"
      ? "bg-[rgba(240,162,46,0.22)] text-accent font-extrabold"
      : kind === "none"
        ? "bg-white text-ink2 font-bold"
        : "bg-[rgba(31,157,107,0.14)] text-accent font-bold";
  return <span className={`inline-flex h-[20px] shrink-0 items-center rounded-full px-2 text-[11.5px] ${cls}`}>{children}</span>;
}

/** Por línea: de dónde salen los valores y de dónde sale la cantidad. */
function Origin({ line }: { line: AnalyzedLine }) {
  const o = line.origin;
  if (!o) return null; // respuesta de una versión vieja del servidor
  const vKind = o.values === "ia" ? "ai" : o.values === "ninguno" ? "none" : "ok";
  return (
    <dl className="mt-2 space-y-1.5 rounded-xl bg-white/60 px-3 py-2.5 text-[12.5px] leading-snug">
      <div className="flex items-start gap-2">
        <dt className="w-[62px] shrink-0 pt-px font-semibold text-ink2">Valores</dt>
        <dd className="min-w-0 flex-1">
          <Badge kind={vKind}>{VALUES_LABEL[o.values]}</Badge>{" "}
          {o.valuesDetail && o.values !== "propio" && <span className="text-ink">“{o.valuesDetail}”</span>}
          <span className="mt-0.5 block text-ink2">{VALUES_HELP[o.values]}</span>
        </dd>
      </div>
      <div className="flex items-start gap-2">
        <dt className="w-[62px] shrink-0 pt-px font-semibold text-ink2">Cantidad</dt>
        <dd className="min-w-0 flex-1">
          {o.qty === "ia" && <Badge kind="ai">IA</Badge>} {o.qty === "supuesta" && <Badge kind="none">Supuesto</Badge>}{" "}
          <span className={o.qty === "ia" || o.qty === "supuesta" ? "font-semibold text-accent" : "text-ink"}>{o.qtyDetail}</span>
        </dd>
      </div>
      {o.parsedByAi && (
        <div className="flex items-start gap-2">
          <dt className="w-[62px] shrink-0 pt-px font-semibold text-ink2">Texto</dt>
          <dd className="min-w-0 flex-1 text-ink2">
            <Badge kind="ai">IA</Badge> Lo interpretó la IA (separó el alimento y la cantidad).
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Resumen arriba de la lista: cuántos datos vienen de cada fuente. */
function SourcesSummary({ lines }: { lines: AnalyzedLine[] }) {
  const counts = new Map<string, number>();
  for (const l of lines) {
    if (!l.origin) continue;
    const k = VALUES_LABEL[l.origin.values];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const aiQty = lines.filter((l) => l.origin?.qty === "ia").length;
  if (!counts.size) return null;
  return (
    <details className="group animate-rise mt-3 rounded-2xl bg-white/45 px-3.5 py-2.5 text-[13px] text-ink2">
      <summary className="flex min-h-[28px] cursor-pointer list-none items-center justify-between gap-2">
        <span>
          <b className="text-ink">Fuentes:</b>{" "}
          {[...counts].map(([k, n]) => `${k} ${n}`).join(" · ")}
          {aiQty > 0 && ` · cantidad estimada por IA ${aiQty}`}
        </span>
        <span className="shrink-0 font-bold text-accent group-open:hidden">¿Qué es?</span>
        <span className="hidden shrink-0 font-bold text-accent group-open:inline">Cerrar</span>
      </summary>
      <ul className="mt-2 space-y-1.5 border-t border-white/80 pt-2 leading-snug">
        <li>
          <b className="text-ink">Tus alimentos:</b> se usan primero.
        </li>
        <li>
          <b className="text-ink">USDA:</b> base pública de EE.UU.
        </li>
        <li>
          <b className="text-ink">Open Food Facts:</b> productos envasados.
        </li>
        <li>
          <b className="text-ink">IA:</b> solo si no está en ninguna. Queda para revisar.
        </li>
      </ul>
    </details>
  );
}

const FAILED: Record<NonNullable<AiStatus["failed"]>, string> = {
  minuto: "Google pidió esperar. Probá en un minuto.",
  dia: "Se terminó la cuota de hoy.",
  clave: "Google no aceptó la clave.",
  error: "Google no respondió. Probá de nuevo.",
};

/** Aviso de IA: ofrece completar (siempre pidiendo permiso antes), avisa si se usó o si se llegó al tope. */
function AiBanner({ ai, busy, onComplete }: { ai: AiStatus; busy: boolean; onComplete: () => void }) {
  const count = `Hoy ${ai.usedToday} de ${ai.cap}`;
  const names = ai.pendingNames ?? [];
  const what = ai.pending === 1 ? "1 alimento" : `${ai.pending} alimentos`;

  if (ai.pending > 0 && (ai.blocked === "tope" || ai.mode === "off" || ai.blocked === "apagada")) {
    const msg =
      ai.blocked === "tope"
        ? `Llegaste al tope de IA de hoy (${ai.cap} pedidos). Mañana se renueva.`
        : ai.mode === "off"
          ? "La IA está apagada (lo elegiste en Perfil)."
          : "La IA no está disponible ahora.";
    return (
      <div className="animate-rise mt-3 flex items-start gap-3 rounded-[20px] bg-white/55 px-3.5 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-ink2">
          <Icon name="sparkle" size={16} />
        </span>
        <p className="text-[13px] leading-snug text-ink2">
          <b className="text-ink">Faltan datos de {what}.</b> {msg} Mientras, corregí a mano o cargalo en Alimentos.
        </p>
      </div>
    );
  }

  if (ai.pending > 0) {
    return (
      <div className="grad-border animate-rise mt-3 rounded-[20px] p-3.5 shadow-glass" aria-live="polite">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(240,162,46,0.18)] text-mango ${busy ? "animate-pulse" : ""}`}
          >
            <Icon name="sparkle" size={18} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-extrabold leading-snug text-ink">
              {busy ? (
                <>
                  La IA está completando
                  <span className="dot-pulse text-accent" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </span>
                </>
              ) : (
                `Faltan datos de ${what}`
              )}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink2">
              {ai.failed ? FAILED[ai.failed] : "La IA puede completarlos."}
            </p>
            {names.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {names.map((n) => (
                  <li key={n} className="rounded-full bg-white px-2.5 py-0.5 text-[12.5px] font-semibold text-ink">
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onComplete}
          disabled={busy}
          className="mt-3 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14.5px] font-bold text-accent shadow-glass transition active:scale-[0.98] disabled:opacity-60"
        >
          <Icon name="sparkle" size={17} strokeWidth={2} />
          {busy ? "Consultando…" : ai.failed ? "Ver estado de la IA" : "Completar con IA"}
        </button>
        <p className="mt-1.5 text-center text-[11.5px] text-ink2">{count}</p>
      </div>
    );
  }

  if (ai.used > 0) {
    return (
      <p className="animate-pop mt-3 inline-flex items-center gap-1.5 rounded-full bg-[rgba(31,157,107,0.12)] px-3 py-1.5 text-[12.5px] font-semibold text-accent">
        <Icon name="sparkle" size={14} strokeWidth={2} /> Completado con IA · {ai.used} {ai.used === 1 ? "pedido" : "pedidos"} ({count.toLowerCase()})
      </p>
    );
  }
  return null;
}
