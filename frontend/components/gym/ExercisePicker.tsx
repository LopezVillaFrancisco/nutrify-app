"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { MUSCLES, allExercises, exerciseKey, muscleOf, type Muscle } from "@/lib/exercises";
import { fmtDec } from "@/lib/format";
import type { Session } from "@/lib/gym";

export type Picked = { name: string; muscle: Muscle };

/**
 * Elegir ejercicios: buscador, músculos (chips que bajan de renglón), recientes arriba
 * y lo último que levantaste en cada uno. Se pueden elegir varios de una.
 */
export default function ExercisePicker({
  recent,
  lastOf,
  exclude = [],
  onPick,
  onClose,
}: {
  recent: { name: string; muscle?: string }[];
  lastOf: (name: string) => Session | undefined;
  exclude?: string[];
  onPick: (picked: Picked[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState<Muscle | "Todos">("Todos");
  const [sel, setSel] = useState<Picked[]>([]);
  const nq = exerciseKey(q);
  const excluded = new Set(exclude.map(exerciseKey));

  // Biblioteca + los tuyos que no están en ella
  const custom = recent
    .filter((r) => !allExercises(true).some((x) => exerciseKey(x.name) === exerciseKey(r.name)))
    .map((r) => ({ name: r.name, muscle: muscleOf(r.name, r.muscle) }));
  const all = [...allExercises().map((x) => ({ name: x.name, muscle: x.muscle })), ...custom];
  const matches = all.filter((x) => (muscle === "Todos" || x.muscle === muscle) && (!nq || exerciseKey(x.name).includes(nq)));
  const recentList =
    !nq && muscle === "Todos"
      ? recent.slice(0, 6).map((r) => ({ name: r.name, muscle: muscleOf(r.name, r.muscle) }))
      : [];
  const exact = all.some((x) => exerciseKey(x.name) === nq);

  const isSel = (name: string) => sel.some((s) => exerciseKey(s.name) === exerciseKey(name));
  const toggle = (p: Picked) => setSel((cur) => (isSel(p.name) ? cur.filter((s) => exerciseKey(s.name) !== exerciseKey(p.name)) : [...cur, p]));

  const groups = MUSCLES.map((m) => ({ m, items: matches.filter((x) => x.muscle === m) })).filter((g) => g.items.length);

  return (
    <Sheet
      title="Agregar ejercicios"
      subtitle={sel.length ? `${sel.length} elegido${sel.length > 1 ? "s" : ""}` : "Tocá uno o varios"}
      onClose={onClose}
      footer={
        <button type="button" className="btn-accent w-full" disabled={!sel.length} onClick={() => onPick(sel)}>
          <Icon name="plus" size={18} strokeWidth={2.4} /> Agregar{sel.length ? ` (${sel.length})` : ""}
        </button>
      }
    >
      <div className="sticky top-0 z-10 -mx-1 bg-[rgba(250,252,246,0.94)] px-1 pb-2 pt-1">
        <div className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2" />
          <input
            className="input !pl-11"
            type="search"
            placeholder="Buscar o escribir uno nuevo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar ejercicio"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Músculo">
          {(["Todos", ...MUSCLES.filter((m) => m !== "Otro" || custom.length)] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={muscle === m}
              onClick={() => setMuscle(m)}
              className={`min-h-[32px] rounded-full px-2.5 text-[12.5px] transition-colors ${
                muscle === m ? "bg-white font-bold text-accent shadow-glass" : "bg-white/45 font-semibold text-ink2"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {q.trim() && !exact && (
        <button
          type="button"
          onClick={() => toggle({ name: q.trim().replace(/^./, (c) => c.toUpperCase()), muscle: muscle === "Todos" ? "Otro" : muscle })}
          className="mb-2 mt-1 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-mint/50 bg-white/60 px-3.5 py-3 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-accent shadow-glass">
            <Icon name="plus" size={18} strokeWidth={2.4} />
          </span>
          <span className="text-[14.5px] text-ink">
            Crear <b>“{q.trim()}”</b>
            {isSel(q.trim()) && <span className="ml-1 font-bold text-accent">✓</span>}
          </span>
        </button>
      )}

      {recentList.length > 0 && (
        <Group title="Los que hacés">
          {recentList.map((x) => (
            <Item key={`r-${x.name}`} ex={x} last={lastOf(x.name)} selected={isSel(x.name)} added={excluded.has(exerciseKey(x.name))} onClick={() => toggle(x)} />
          ))}
        </Group>
      )}

      {groups.map((g) => (
        <Group key={g.m} title={g.m}>
          {g.items.map((x) => (
            <Item key={x.name} ex={x} last={lastOf(x.name)} selected={isSel(x.name)} added={excluded.has(exerciseKey(x.name))} onClick={() => toggle(x)} />
          ))}
        </Group>
      ))}
      {!groups.length && !q.trim() && <p className="py-6 text-center text-[14px] text-ink2">No hay ejercicios en este grupo.</p>}
    </Sheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 first:mt-1">
      <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-ink2">{title}</p>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function Item({
  ex,
  last,
  selected,
  added,
  onClick,
}: {
  ex: Picked;
  last?: Session;
  selected: boolean;
  added: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition active:scale-[0.99] ${
          selected ? "border-mint/60 bg-white shadow-glass" : "border-white/90 bg-white/65"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-bold text-ink">{ex.name}</span>
          <span className="block truncate text-[12.5px] text-ink2">
            {[added ? "Ya está en la lista" : null, last?.best ? `Última: ${fmtDec(last.best.kg ?? 0)} kg × ${last.best.reps ?? 0}` : added ? null : ex.muscle]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
            selected ? "animate-pop grad-d text-white" : "bg-white text-accent shadow-glass"
          }`}
          aria-hidden
        >
          <Icon name={selected ? "check" : "plus"} size={16} strokeWidth={2.6} />
        </span>
      </button>
    </li>
  );
}
