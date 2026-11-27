"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import { MEAL_LABEL, fmtInt } from "@/lib/format";
import type { FoodRow, Meal, SavedMealRow } from "@/lib/types";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Línea de texto que la app entiende para 1 porción de tu alimento ("1 bife angosto", "100 g whey"). */
export function foodLine(f: FoodRow) {
  return f.default_portion_g ? `1 ${f.name.toLowerCase()}` : `100 g ${f.name.toLowerCase()}`;
}

/** Comidas guardadas: primero las de este momento, después las de cualquier momento, después el resto. */
export function sortMealsFor(meals: SavedMealRow[], meal: Meal) {
  const rank = (m?: Meal | null) => (m === meal ? 0 : m ? 2 : 1);
  return [...meals].sort((a, b) => rank(a.meal) - rank(b.meal));
}

const portionText = (f: FoodRow) => {
  const g = f.default_portion_g ? Number(f.default_portion_g) : 100;
  const kcal = Math.round((Number(f.kcal_per_100g) * g) / 100);
  return f.default_portion_g ? `1 ${f.unit_label || "porción"} · ${fmtInt(kcal)} kcal` : `100 g · ${fmtInt(kcal)} kcal`;
};

/** Hoja para sumar al texto tus comidas guardadas o tus alimentos (con buscador). */
export default function SavedPicker({
  meal,
  foods,
  meals,
  onAdd,
  onClose,
}: {
  meal: Meal;
  foods: FoodRow[];
  meals: SavedMealRow[];
  onAdd: (lines: string[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"meals" | "foods">(meals.length ? "meals" : "foods");
  const [q, setQ] = useState("");
  const [added, setAdded] = useState<Record<string, number>>({});
  const nq = norm(q);

  function add(key: string, lines: string[]) {
    onAdd(lines);
    setAdded((a) => ({ ...a, [key]: (a[key] ?? 0) + 1 }));
  }

  const mealList = sortMealsFor(meals, meal).filter(
    (m) => !nq || norm(m.name).includes(nq) || m.items.some((i) => norm(i).includes(nq)),
  );
  const foodList = foods.filter((f) => !nq || norm(f.name).includes(nq) || f.aliases.some((a) => norm(a).includes(nq)));
  const foodGroups = CATEGORIES.map((c) => ({ ...c, items: foodList.filter((f) => categoryOf(f) === c.key) })).filter((g) => g.items.length);
  const total = Object.values(added).reduce((s, n) => s + n, 0);

  return (
    <Sheet
      title="Tus guardados"
      subtitle={total ? `${total} ${total === 1 ? "agregado" : "agregados"} al texto` : "Tocá para sumarlo al texto"}
      onClose={onClose}
      footer={
        <button type="button" className="btn-accent w-full" onClick={onClose}>
          {total ? "Listo" : "Cerrar"}
        </button>
      }
    >
      <div className="sticky top-0 z-10 -mx-1 bg-[rgba(250,252,246,0.94)] px-1 pb-2 pt-1">
        <div className="grid grid-cols-2 gap-1 rounded-[16px] bg-white/60 p-1" role="tablist">
          {(
            [
              ["meals", "Comidas", meals.length],
              ["foods", "Alimentos", foods.length],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-[42px] rounded-[12px] text-[14px] transition-colors ${
                tab === k ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"
              }`}
            >
              {label} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
        <div className="relative mt-2">
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2" />
          <input className="input !pl-11" type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar guardados" />
        </div>
      </div>

      {tab === "meals" ? (
        mealList.length === 0 ? (
          <Empty text={meals.length ? "Nada coincide." : "Sin comidas guardadas todavía."} />
        ) : (
          <ul className="mt-1 space-y-2">
            {mealList.map((m, i) => (
              <Row
                key={m.id}
                index={i}
                title={m.name}
                badge={m.meal === meal ? `Para ${MEAL_LABEL[meal].toLowerCase()}` : undefined}
                subtitle={m.items.join(" + ")}
                count={added[m.id]}
                onClick={() => add(m.id, m.items)}
              />
            ))}
          </ul>
        )
      ) : foodGroups.length === 0 ? (
        <Empty text={foods.length ? "Nada coincide." : "Sin alimentos guardados todavía."} />
      ) : (
        foodGroups.map((g) => (
          <div key={g.key} className="mt-3 first:mt-1">
            <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-ink2">{g.short}</p>
            <ul className="space-y-2">
              {g.items.map((f, i) => (
                <Row key={f.id} index={i} title={f.name} subtitle={portionText(f)} count={added[f.id]} onClick={() => add(f.id, [foodLine(f)])} />
              ))}
            </ul>
          </div>
        ))
      )}
    </Sheet>
  );
}

function Row({
  index,
  title,
  subtitle,
  badge,
  count,
  onClick,
}: {
  index: number;
  title: string;
  subtitle: string;
  badge?: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <li className="animate-rise" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/90 bg-white/75 px-3.5 py-3 text-left transition active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] font-bold text-ink">{title}</span>
            {badge && <span className="shrink-0 rounded-full bg-[rgba(31,157,107,0.14)] px-2 py-0.5 text-[11px] font-bold text-accent">{badge}</span>}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-ink2">{subtitle}</span>
        </span>
        <span
          key={count ?? 0}
          className={`flex h-9 min-w-[36px] shrink-0 items-center justify-center rounded-full px-2 text-[13px] font-bold ${
            count ? "animate-pop grad-d text-white" : "bg-white text-accent shadow-glass"
          }`}
          aria-label={count ? `Agregado ${count}` : "Agregar"}
        >
          {count ? (
            <>
              <Icon name="check" size={16} strokeWidth={2.6} />
              {count > 1 && <span className="ml-0.5">{count}</span>}
            </>
          ) : (
            <Icon name="plus" size={18} strokeWidth={2.4} />
          )}
        </span>
      </button>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-6 text-center text-[14px] text-ink2">{text}</p>;
}
