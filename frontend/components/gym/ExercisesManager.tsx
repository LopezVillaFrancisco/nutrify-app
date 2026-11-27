"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import { MUSCLES, STEPS, allExercises, exerciseKey, type ExerciseItem, type Muscle } from "@/lib/exercises";
import { resetExercise, saveExercise, setHidden } from "@/lib/exercise-store";
/** 1,25 (no 1,3): los saltos de kilos se muestran exactos. */
const kgStep = (v: number) => String(Number(v)).replace(".", ",");

/** "Mis ejercicios": toda la lista (la de la app + los tuyos), con buscador; tocás uno para editarlo. */
export default function ExercisesManager({ onClose, onToast }: { onClose: () => void; onToast: (msg: string) => void }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ExerciseItem | "new" | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const nq = exerciseKey(q);
  const all = allExercises(true);
  const visible = all.filter((x) => !x.hidden && (!nq || exerciseKey(x.name).includes(nq)));
  const hidden = all.filter((x) => x.hidden && (!nq || exerciseKey(x.name).includes(nq)));
  const groups = MUSCLES.map((m) => ({ m, items: visible.filter((x) => x.muscle === m) })).filter((g) => g.items.length);
  const mine = all.filter((x) => x.custom && !x.hidden).length;

  return (
    <>
      <Sheet
        title="Mis ejercicios"
        subtitle={`${visible.length} en tu lista${mine ? ` · ${mine} ${mine === 1 ? "creado" : "creados"} por vos` : ""}`}
        onClose={onClose}
        footer={
          <button type="button" className="btn-accent w-full" onClick={() => setEditing("new")}>
            <Icon name="plus" size={18} strokeWidth={2.4} /> Nuevo ejercicio
          </button>
        }
      >
        <div className="sticky top-0 z-10 -mx-1 bg-[rgba(250,252,246,0.94)] px-1 pb-2 pt-1">
          <div className="relative">
            <Icon name="search" size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2" />
            <input className="input !pl-11" type="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ejercicio" />
          </div>
        </div>

        {groups.map((g) => (
          <div key={g.m} className="mt-3">
            <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wide text-ink2">{g.m}</p>
            <ul className="space-y-1.5">
              {g.items.map((x) => (
                <Row key={x.name} x={x} onClick={() => setEditing(x)} />
              ))}
            </ul>
          </div>
        ))}
        {!groups.length && <p className="py-6 text-center text-[14px] text-ink2">Nada coincide.</p>}

        {hidden.length > 0 && (
          <div className="mt-5">
            <button type="button" onClick={() => setShowHidden((v) => !v)} className="min-h-[40px] px-1 text-[13.5px] font-bold text-accent">
              {showHidden ? "Esconder ocultos" : `Ver ocultos (${hidden.length})`}
            </button>
            {showHidden && (
              <ul className="mt-1 space-y-1.5">
                {hidden.map((x) => (
                  <Row key={x.name} x={x} onClick={() => setEditing(x)} />
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>

      {editing && (
        <ExerciseEdit
          item={editing === "new" ? null : editing}
          initialName={editing === "new" ? q.trim().replace(/^./, (c) => c.toUpperCase()) : ""}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            onToast(msg);
          }}
        />
      )}
    </>
  );
}

function Row({ x, onClick }: { x: ExerciseItem; onClick: () => void }) {
  const tag = x.hidden ? "Oculto" : x.custom ? "Tuyo" : x.id ? "Editado" : null;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-2xl border border-white/90 px-3.5 py-2.5 text-left transition active:scale-[0.99] ${
          x.hidden ? "bg-white/35 opacity-70" : "bg-white/65"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-[14.5px] font-bold text-ink">{x.name}</span>
            {tag && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${
                  tag === "Tuyo" ? "bg-[rgba(31,157,107,0.14)] text-accent" : "bg-white text-ink2"
                }`}
              >
                {tag}
              </span>
            )}
          </span>
          <span className="block truncate text-[12.5px] text-ink2">
            {x.muscle} · los kilos suben de a {kgStep(x.step)}
            {x.base && ` · antes “${x.base}”`}
          </span>
        </span>
        <Icon name="edit" size={16} className="shrink-0 text-ink2/70" />
      </button>
    </li>
  );
}

/** Crear / editar un ejercicio. */
function ExerciseEdit({
  item,
  initialName,
  onClose,
  onDone,
}: {
  item: ExerciseItem | null;
  initialName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [name, setName] = useState(item?.name ?? initialName);
  const [muscle, setMuscle] = useState<Muscle>(item?.muscle ?? "Pecho");
  const [step, setStep] = useState(item?.step ?? 2.5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renaming = item && exerciseKey(item.name) !== exerciseKey(name) && name.trim();

  async function run(fn: () => Promise<string | null>, msg: string) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else onDone(msg);
  }

  return (
    <Sheet
      title={item ? "Editar ejercicio" : "Nuevo ejercicio"}
      subtitle={item ? (item.custom ? "Lo creaste vos" : item.id ? "De la lista de la app (editado)" : "De la lista de la app") : undefined}
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn-accent w-full"
          disabled={busy || !name.trim()}
          onClick={() => run(() => saveExercise(item?.name ?? null, { name, muscle, step, hidden: item?.hidden }), item ? "Ejercicio guardado" : `Creado: ${name.trim()}`)}
        >
          {busy ? "Guardando…" : item ? "Guardar" : "Crear ejercicio"}
        </button>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <label htmlFor="ex-name" className="label">
            Nombre
          </label>
          <input id="ex-name" className="input" placeholder="ej. Press en multipower" value={name} onChange={(e) => setName(e.target.value)} />
          {renaming && (
            <p className="mt-1 text-[12.5px] text-ink2">Se cambia también en tus entrenos.</p>
          )}
        </div>

        <div>
          <p className="label">Músculo</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Músculo">
            {MUSCLES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={muscle === m}
                onClick={() => setMuscle(m)}
                className={`min-h-[40px] rounded-xl px-1 text-[12.5px] leading-tight transition-colors ${
                  muscle === m ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="label">Los botones − / + de kilos suben de a</p>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Salto de kilos">
            {STEPS.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={step === v}
                onClick={() => setStep(v)}
                className={`min-h-[40px] rounded-xl text-[13.5px] transition-colors ${
                  step === v ? "bg-white font-bold text-accent shadow-glass ring-2 ring-mint/50" : "bg-white/55 font-semibold text-ink2"
                }`}
              >
                {kgStep(v)} kg
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}

        {item && (
          <div className="flex flex-col items-start gap-1 border-t border-white/80 pt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setHidden(item.name, !item.hidden), item.hidden ? `Vuelve a aparecer: ${item.name}` : `Ocultado: ${item.name}`)}
              className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2"
            >
              <Icon name={item.hidden ? "eye" : "eye-off"} size={18} /> {item.hidden ? "Mostrar en la lista" : "Ocultar (no lo uso)"}
            </button>
            {item.id && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => resetExercise(item.name), item.custom ? `Borrado: ${item.name}` : "Volvió a como venía")}
                className="inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ink2"
              >
                <Icon name={item.custom ? "trash" : "repeat"} size={18} />{" "}
                {item.custom ? "Borrar de la lista (tus entrenos quedan)" : "Volver a como venía en la app"}
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
