"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import PageHeader from "@/components/PageHeader";
import Sheet from "@/components/Sheet";
import { Toast, useToast } from "@/components/Toast";
import { apiResult } from "@/lib/api";
import { fmtDec, fmtInt, parseDecimal } from "@/lib/format";
import { fetchers, keys } from "@/lib/queries";
import { invalidate, useQuery } from "@/lib/store";
import { clearAnalyzeCache } from "@/lib/entries";
import { CATEGORIES, categoryOf, guessCategory, type FoodCategory } from "@/lib/categories";
import { MEAL_LABEL, MEALS_ORDER } from "@/lib/format";
import type { FoodRow, Meal, SavedMealRow } from "@/lib/types";


type FoodPayload = Omit<FoodRow, "id">;
type Prefill = { name: string; kcal: string; protein: string; carbs: string; fat: string };
type FoodEditor = { food: FoodRow | null; prefill?: Prefill };
type MealEditor = { meal: SavedMealRow | null };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export default function AlimentosPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"foods" | "meals">("foods");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<FoodCategory | "all">("all");
  const [foodEditor, setFoodEditor] = useState<FoodEditor | null>(null);
  const [mealEditor, setMealEditor] = useState<MealEditor | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const { toast, show, hide } = useToast();

  const foods = useQuery<FoodRow[]>(keys.foods, fetchers.foods).data ?? null;
  const meals = useQuery<SavedMealRow[]>(keys.saved, fetchers.saved).data ?? null;

  // Llegaste desde Anotar / Hoy con "Guardar en Alimentos": se abre el formulario precargado
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("nuevo") !== "1") return;
    setTab("foods");
    setFoodEditor({
      food: null,
      prefill: {
        name: params.get("name") ?? "",
        kcal: params.get("kcal") ?? "",
        protein: params.get("protein") ?? "",
        carbs: params.get("carbs") ?? "",
        fat: params.get("fat") ?? "",
      },
    });
    const from = params.get("from");
    setReturnTo(from === "anotar" ? "/anotar?recalc=1" : from === "hoy" ? "/" : null);
    router.replace("/alimentos", { scroll: false });
  }, [router]);

  async function saveFood(row: FoodPayload, id?: string) {
    const { error } = id
      ? await apiResult(`/api/foods/${id}`, { method: "PUT", body: row })
      : await apiResult("/api/foods", { method: "POST", body: row });
    if (error) return error.message || "No se pudo guardar. Probá de nuevo.";
    invalidate(keys.foods);
    clearAnalyzeCache(); // los cálculos guardados podrían cambiar con este alimento
    if (returnTo) {
      // Volver a donde estabas (Anotar recalcula con el alimento nuevo). La hoja se desmonta con la página.
      router.push(returnTo);
      return null;
    }
    setFoodEditor(null);
    show(`Guardado: ${row.name}`);
    return null;
  }

  async function deleteFood(f: FoodRow) {
    const { error } = await apiResult(`/api/foods/${f.id}`, { method: "DELETE" });
    if (error) return "No se pudo borrar.";
    setFoodEditor(null);
    show(`Borraste ${f.name}`);
    invalidate(keys.foods);
    clearAnalyzeCache();
    return null;
  }

  async function saveMeal(name: string, items: string[], meal: Meal | null, id?: string) {
    const body = { name, items, meal };
    const { error } = id
      ? await apiResult(`/api/saved-meals/${id}`, { method: "PUT", body })
      : await apiResult("/api/saved-meals", { method: "POST", body });
    if (error) return error.message || "No se pudo guardar. Probá de nuevo.";
    setMealEditor(null);
    show(`Guardada: ${name}`);
    invalidate(keys.saved);
    return null;
  }

  async function deleteMeal(m: SavedMealRow) {
    const { error } = await apiResult(`/api/saved-meals/${m.id}`, { method: "DELETE" });
    if (error) return "No se pudo borrar.";
    setMealEditor(null);
    show(`Borraste ${m.name}`);
    invalidate(keys.saved);
    return null;
  }

  const q = norm(query);
  const searched = (foods ?? []).filter((f) => !q || norm(f.name).includes(q) || f.aliases.some((a) => norm(a).includes(q)));
  // Agrupado por tipo (en el orden de CATEGORIES); los chips filtran por tipo
  const byCat = CATEGORIES.map((c) => ({ ...c, items: searched.filter((f) => categoryOf(f) === c.key) })).filter((g) => g.items.length);
  // (si el tipo elegido se quedó sin alimentos, se vuelve a "Todos")
  const activeCat = cat !== "all" && byCat.some((g) => g.key === cat) ? cat : "all";
  const groups = activeCat === "all" ? byCat : byCat.filter((g) => g.key === activeCat);
  const filtered = groups.flatMap((g) => g.items);

  // Comidas guardadas por momento del día
  const mealGroups = [...MEALS_ORDER, null].map((m) => ({
    key: m ?? "any",
    label: m ? MEAL_LABEL[m] : "Cualquier momento",
    items: (meals ?? []).filter((x) => (x.meal ?? null) === m),
  })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        eyebrow="Tus alimentos y comidas"
        title="Comida"
        right={
          <button
            type="button"
            className="btn-accent hidden shrink-0 md:inline-flex"
            onClick={() => (tab === "foods" ? setFoodEditor({ food: null }) : setMealEditor({ meal: null }))}
          >
            <Icon name="plus" size={20} strokeWidth={2.4} /> {tab === "foods" ? "Nuevo alimento" : "Nueva comida guardada"}
          </button>
        }
      />

      {/* Escritorio: pestañas y búsqueda en una sola fila */}
      <div className="md:mt-2 md:flex md:items-center md:gap-4">
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-[18px] bg-white/55 p-1 md:mt-0 md:w-[400px] md:shrink-0" role="tablist">
        {(
          [
            ["foods", "Alimentos", foods?.length],
            ["meals", "Comidas guardadas", meals?.length],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-[44px] rounded-[14px] text-[14px] transition-colors ${
              tab === key ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"
            }`}
          >
            {label}
            {n ? <span className="ml-1 font-semibold opacity-60">{n}</span> : null}
          </button>
        ))}
      </div>
      {tab === "foods" && foods && foods.length > 5 && (
        <input
          className="input mt-3 md:ml-auto md:mt-0 md:max-w-sm"
          type="search"
          placeholder="Buscar en tus alimentos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar alimentos"
        />
      )}
      </div>

      {tab === "foods" ? (
        <section className="mt-4 md:mt-5">
          <button type="button" className="btn-accent w-full md:hidden" onClick={() => setFoodEditor({ food: null })}>
            <Icon name="plus" size={20} strokeWidth={2.4} /> Nuevo alimento
          </button>

          {foods === null ? (
            <SkeletonList />
          ) : foods.length === 0 ? (
            <Empty
              title="Todavía no guardaste alimentos"
              text="Guardá lo que comés seguido con sus valores reales."
            />
          ) : (
            <>
              {/* Filtro por tipo: chips que bajan de renglón (sin scroll lateral) */}
              {byCat.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5 md:mt-0" role="group" aria-label="Filtrar por tipo">
                  {[{ key: "all" as const, short: "Todos", n: searched.length }, ...byCat.map((g) => ({ key: g.key, short: g.short, n: g.items.length }))].map(
                    (c) => (
                      <button
                        key={c.key}
                        type="button"
                        aria-pressed={activeCat === c.key}
                        onClick={() => setCat(c.key)}
                        className={`min-h-[38px] rounded-full px-3.5 text-[13.5px] transition-colors ${
                          activeCat === c.key ? "bg-white font-bold text-accent shadow-glass" : "bg-white/45 font-semibold text-ink2"
                        }`}
                      >
                        {c.short} <span className="opacity-60">{c.n}</span>
                      </button>
                    ),
                  )}
                </div>
              )}

              {groups.map((g) => (
                <div key={g.key} className="mt-5">
                  <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-ink2">{g.label}</h2>
                  <ul className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
                    {g.items.map((f) => (
                      <li key={f.id}>
                        <FoodCard food={f} query={q} onOpen={() => setFoodEditor({ food: f })} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {filtered.length === 0 && <p className="px-1 py-4 text-[14px] text-ink2">Nada coincide con “{query}”.</p>}
            </>
          )}
        </section>
      ) : (
        <section className="mt-4 md:mt-5">
          <button type="button" className="btn-accent w-full md:hidden" onClick={() => setMealEditor({ meal: null })}>
            <Icon name="plus" size={20} strokeWidth={2.4} /> Nueva comida guardada
          </button>
          {meals === null ? (
            <SkeletonList />
          ) : meals.length === 0 ? (
            <Empty title="Sin comidas guardadas" text="Ej.: “Mi batido” = 1 scoop whey + 300 ml leche. Después la repetís en Hoy con un toque." />
          ) : (
            mealGroups.map((g) => (
              <div key={g.key} className="mt-5 md:first:mt-0">
                <h2 className="mb-2 px-1 text-[13px] font-bold uppercase tracking-wide text-ink2">{g.label}</h2>
                <ul className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
                  {g.items.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => setMealEditor({ meal: m })}
                        className="glass flex h-full w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/75 active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-bold text-ink">{m.name}</p>
                          <ul className="mt-1.5 flex flex-wrap gap-1">
                            {m.items.slice(0, 4).map((it, i) => (
                              <li key={i} className="max-w-full truncate rounded-full bg-white/70 px-2.5 py-0.5 text-[12.5px] text-ink2">
                                {it}
                              </li>
                            ))}
                            {m.items.length > 4 && (
                              <li className="rounded-full bg-white/70 px-2.5 py-0.5 text-[12.5px] font-semibold text-ink2">+{m.items.length - 4}</li>
                            )}
                          </ul>
                        </div>
                        <Icon name="chevron-right" size={20} className="mt-0.5 shrink-0 text-ink2/70" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {foodEditor && (
        <FoodSheet
          editor={foodEditor}
          existing={foods ?? []}
          onClose={() => {
            setFoodEditor(null);
            setReturnTo(null);
          }}
          onSave={saveFood}
          onDelete={deleteFood}
        />
      )}
      {mealEditor && <MealSheetForm editor={mealEditor} onClose={() => setMealEditor(null)} onSave={saveMeal} onDelete={deleteMeal} />}

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

/** Tarjeta de alimento: lo importante (kcal y proteína de 1 porción) a la vista, sin texto de relleno. */
function FoodCard({ food: f, query, onOpen }: { food: FoodRow; query: string; onOpen: () => void }) {
  const g = f.default_portion_g ? Number(f.default_portion_g) : 100;
  const kcal = (Number(f.kcal_per_100g) * g) / 100;
  const prot = (Number(f.protein_per_100g) * g) / 100;
  // Si lo encontraste por otro nombre, se muestra cuál
  const alias = query && !norm(f.name).includes(query) ? f.aliases.find((a) => norm(a).includes(query)) : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass flex h-full w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/75 active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{f.name}</p>
        <p className="mt-0.5 truncate text-[13px] text-ink2">
          {f.default_portion_g ? `1 ${f.unit_label || "unidad"} · ${fmtInt(g)} g` : "cada 100 g"}
          {alias && <span className="text-ink2/80"> · “{alias}”</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[17px] font-extrabold leading-tight text-ink">
          {fmtInt(kcal)}
          <span className="text-[12px] font-semibold text-ink2"> kcal</span>
        </p>
        <p className="text-[12.5px] font-semibold text-ink2">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-mango align-middle" aria-hidden />
          {fmtDec(prot)} g prot.
        </p>
      </div>
      <Icon name="chevron-right" size={20} className="shrink-0 text-ink2/70" />
    </button>
  );
}

function SkeletonList() {
  return (
    <div className="mt-3 space-y-2.5 md:mt-0 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="glass h-[68px] animate-pulse" />
      ))}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="glass mt-3 px-5 py-5 text-center md:mt-0 md:py-12">
      <p className="text-[15px] font-bold text-ink">{title}</p>
      <p className="mt-1 text-[14px] leading-snug text-ink2">{text}</p>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[12.5px] leading-snug text-ink2">{hint}</p>}
    </div>
  );
}

function DeleteRow({ label, onConfirm }: { label: string; onConfirm: () => Promise<string | null> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2">
        <Icon name="trash" size={18} /> {label}
      </button>
    );
  }
  return (
    <div className="animate-fade mt-4 flex items-center justify-between gap-2 rounded-2xl bg-[rgba(240,162,46,0.14)] py-1.5 pl-3.5 pr-1.5">
      <span className="text-[14px] font-semibold text-ink">¿Seguro? No se puede deshacer.</span>
      <span className="flex gap-1">
        <button type="button" className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-ink2" onClick={() => setAsking(false)}>
          No
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold text-ink"
          onClick={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
          }}
        >
          Borrar
        </button>
      </span>
    </div>
  );
}

function FoodSheet({
  editor,
  existing,
  onClose,
  onSave,
  onDelete,
}: {
  editor: FoodEditor;
  existing: FoodRow[];
  onClose: () => void;
  onSave: (row: FoodPayload, id?: string) => Promise<string | null>;
  onDelete: (f: FoodRow) => Promise<string | null>;
}) {
  const { food, prefill } = editor;
  const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)).replace(".", ","));
  const [name, setName] = useState(food?.name ?? prefill?.name ?? "");
  const [aliases, setAliases] = useState(food?.aliases.join(", ") ?? "");
  const [unit, setUnit] = useState(food?.unit_label ?? "");
  const [portion, setPortion] = useState(str(food?.default_portion_g));
  const [basis, setBasis] = useState<"100g" | "unit">("100g");
  const [kcal, setKcal] = useState(food ? str(food.kcal_per_100g) : prefill?.kcal.replace(".", ",") ?? "");
  const [protein, setProtein] = useState(food ? str(food.protein_per_100g) : prefill?.protein.replace(".", ",") ?? "");
  const [carbs, setCarbs] = useState(food ? str(food.carbs_per_100g) : prefill?.carbs.replace(".", ",") ?? "");
  const [fat, setFat] = useState(food ? str(food.fat_per_100g) : prefill?.fat.replace(".", ",") ?? "");
  // null = automático (se adivina por el nombre)
  const [category, setCategory] = useState<FoodCategory | null>(
    food?.category && CATEGORIES.some((c) => c.key === food.category) ? (food.category as FoodCategory) : null,
  );
  const shownCat = category ?? guessCategory(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const g = parseDecimal(portion);
  const nums = { kcal: parseDecimal(kcal), protein: parseDecimal(protein || "0"), carbs: parseDecimal(carbs || "0"), fat: parseDecimal(fat || "0") };
  const portionOk = !portion.trim() || (Number.isFinite(g) && g > 0);
  const problems = {
    name: !name.trim() ? "Poné un nombre." : null,
    kcal: !Number.isFinite(nums.kcal) || nums.kcal < 0 ? "Poné las kcal (un número)." : null,
    macros: [nums.protein, nums.carbs, nums.fat].some((v) => !Number.isFinite(v) || v < 0) ? "Revisá proteína, carbos y grasas: tienen que ser números." : null,
    portion: !portionOk
      ? "Los gramos por unidad tienen que ser un número mayor a 0."
      : basis === "unit" && !(g > 0)
        ? "Para cargar valores por unidad, decí cuántos gramos pesa 1 unidad."
        : null,
  };
  const firstProblem = Object.values(problems).find(Boolean) ?? null;

  // Valores siempre se guardan por 100 g
  const factor = basis === "unit" && g > 0 ? 100 / g : 1;
  const macroSum = (nums.protein + nums.carbs + nums.fat) * factor;
  const duplicate = !food && existing.some((f) => norm(f.name) === norm(name));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (firstProblem || saving) return;
    setSaving(true);
    setError(null);
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const err = await onSave(
      {
        name: name.trim(),
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        kcal_per_100g: r1(nums.kcal * factor),
        protein_per_100g: r1(nums.protein * factor),
        carbs_per_100g: r1(nums.carbs * factor),
        fat_per_100g: r1(nums.fat * factor),
        default_portion_g: g > 0 ? r1(g) : null,
        unit_label: unit.trim() || null,
        category,
      },
      food?.id,
    );
    setSaving(false);
    if (err) setError(err);
  }

  const per = basis === "100g" ? "por 100 g" : `por 1 ${unit.trim() || "unidad"}`;

  return (
    <Sheet
      title={food ? "Editar alimento" : "Nuevo alimento"}
      subtitle={prefill ? "Revisá los valores y ajustalos con la etiqueta si la tenés." : undefined}
      onClose={onClose}
      footer={
        <button type="submit" form="food-form" className="btn-accent w-full" disabled={saving}>
          {saving ? "Guardando…" : food ? "Guardar cambios" : "Guardar alimento"}
        </button>
      }
    >
      <form id="food-form" onSubmit={submit} noValidate className="space-y-4 pt-2">
        <Field id="f-name" label="Nombre" hint={duplicate ? "Ya tenés un alimento con ese nombre." : undefined}>
          <input
            id="f-name"
            className="input"
            placeholder="ej. Whey Star Nutrition"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={tried && !!problems.name}
            enterKeyHint="next"
          />
        </Field>
        <Field id="f-alias" label="Otros nombres (opcional)" hint="Separados por coma. Ej.: whey, proteína">
          <input id="f-alias" className="input" placeholder="whey, proteína" value={aliases} onChange={(e) => setAliases(e.target.value)} autoCapitalize="none" />
        </Field>

        <div>
          <p className="label">Tipo</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de alimento">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={shownCat === c.key}
                onClick={() => setCategory(c.key)}
                className={`min-h-[40px] rounded-xl px-2 text-[13px] leading-tight transition-colors ${
                  shownCat === c.key ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                }`}
              >
                {c.short}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12.5px] text-ink2">
            {category === null ? "Elegido solo por el nombre. Tocá otro si no va ahí." : "Lo elegiste vos."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="f-unit" label="Unidad (opcional)">
            <input id="f-unit" className="input" placeholder="scoop, feta…" value={unit} onChange={(e) => setUnit(e.target.value)} autoCapitalize="none" />
          </Field>
          <Field id="f-portion" label="Gramos por unidad">
            <input
              id="f-portion"
              className="input"
              inputMode="decimal"
              placeholder="ej. 30"
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              aria-invalid={tried && !!problems.portion}
            />
          </Field>
        </div>

        <div>
          <p className="label">Valores nutricionales</p>
          <div className="grid grid-cols-2 gap-1 rounded-[16px] bg-white/60 p-1">
            {(["100g", "unit"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBasis(b)}
                aria-pressed={basis === b}
                className={`min-h-[44px] rounded-[12px] text-[14px] ${basis === b ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"}`}
              >
                {b === "100g" ? "Por 100 g" : `Por ${unit.trim() || "unidad"}`}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {(
              [
                ["kcal", "Calorías (kcal)", kcal, setKcal, "#14322A"],
                ["prot", "Proteína (g)", protein, setProtein, "#F0A22E"],
                ["carb", "Carbos (g)", carbs, setCarbs, "#1F9D6B"],
                ["fat", "Grasas (g)", fat, setFat, "#8CA39A"],
              ] as const
            ).map(([key, label, value, set, color]) => (
              <div key={key}>
                <label htmlFor={`f-${key}`} className="label flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
                  {label}
                </label>
                <input
                  id={`f-${key}`}
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  aria-invalid={tried && ((key === "kcal" && !!problems.kcal) || (key !== "kcal" && !!problems.macros))}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink2">Valores {per}. Se guardan normalizados a 100 g.</p>
          {macroSum > 100.5 && (
            <p className="mt-1 text-[12.5px] font-semibold text-accent">Proteína + carbos + grasas suman más de 100 g cada 100 g. Revisá los números.</p>
          )}
        </div>

        {tried && firstProblem && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {firstProblem}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}

        {food && <DeleteRow label="Borrar alimento" onConfirm={() => onDelete(food)} />}
      </form>
    </Sheet>
  );
}

function MealSheetForm({
  editor,
  onClose,
  onSave,
  onDelete,
}: {
  editor: MealEditor;
  onClose: () => void;
  onSave: (name: string, items: string[], moment: Meal | null, id?: string) => Promise<string | null>;
  onDelete: (m: SavedMealRow) => Promise<string | null>;
}) {
  const { meal } = editor;
  const [name, setName] = useState(meal?.name ?? "");
  const [moment, setMoment] = useState<Meal | null>(meal?.meal ?? null);
  const [items, setItems] = useState(meal?.items.join("\n") ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = items
    .split(/\n|\+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const valid = name.trim() !== "" && lines.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const err = await onSave(name.trim(), lines, moment, meal?.id);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <Sheet
      title={meal ? "Editar comida guardada" : "Nueva comida guardada"}
      subtitle="Aparece en “Repetir” en Hoy."
      onClose={onClose}
      footer={
        <button type="submit" form="meal-form" className="btn-accent w-full" disabled={!valid || saving}>
          {saving ? "Guardando…" : meal ? "Guardar cambios" : "Guardar comida"}
        </button>
      }
    >
      <form id="meal-form" onSubmit={submit} className="space-y-4 pt-2">
        <Field id="m-name" label="Nombre">
          <input id="m-name" className="input" placeholder="ej. Mi batido" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <p className="label">¿Cuándo la comés?</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Momento del día">
            {[null, ...MEALS_ORDER].map((m) => (
              <button
                key={m ?? "any"}
                type="button"
                role="radio"
                aria-checked={moment === m}
                onClick={() => setMoment(m)}
                className={`min-h-[40px] rounded-xl px-1 text-[13px] transition-colors ${
                  moment === m ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                }`}
              >
                {m ? MEAL_LABEL[m] : "Cualquiera"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[12.5px] text-ink2">En Hoy aparece primero en “Repetir” a esa hora.</p>
        </div>
        <Field id="m-items" label="Qué lleva" hint="Un alimento por línea, con cantidad.">
          <textarea
            id="m-items"
            className="input min-h-[120px] resize-none leading-relaxed"
            rows={4}
            placeholder={"1 scoop whey\n300 ml leche"}
            value={items}
            onChange={(e) => setItems(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}
        {meal && <DeleteRow label="Borrar comida guardada" onConfirm={() => onDelete(meal)} />}
      </form>
    </Sheet>
  );
}
