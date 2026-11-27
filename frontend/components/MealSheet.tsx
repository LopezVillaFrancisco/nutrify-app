"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/Icon";
import Sheet from "@/components/Sheet";
import type { ToastData } from "@/components/Toast";
import { analyzeText, deleteEntry, replaceEntry, saveFoodHref, sumEntries } from "@/lib/entries";
import { MEAL_LABEL, fmtDec, fmtInt, hhmm } from "@/lib/format";
import type { EntryRow, Meal } from "@/lib/types";

type Props = {
  meal: Meal;
  entries: EntryRow[];
  date: string;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onToast: (t: ToastData | string) => void;
};

/** Hoja inferior: ver cada alimento de la comida, corregirlo (cantidad o alimento) o borrarlo. */
export default function MealSheet({ meal, entries, date, onClose, onChanged, onToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const t = sumEntries(entries);

  // Corregir: se recalcula el texto corregido y reemplaza la línea original
  async function saveEdit(entry: EntryRow) {
    if (!draft.trim() || working) return;
    setWorking(true);
    const { lines, error } = await analyzeText(draft);
    if (error || !lines.length) {
      onToast(error ?? "No entendí esa línea. Probá con cantidad y alimento, ej. 150 g pollo.");
      setWorking(false);
      return;
    }
    // Se reemplaza en una sola transacción: no puede quedar duplicada ni borrada a medias
    const { error: insErr } = await replaceEntry(entry.id, lines, { date, meal, eatenAt: entry.eaten_at });
    if (insErr) {
      onToast("No se pudo guardar el cambio.");
      setWorking(false);
      return;
    }
    setEditingId(null);
    setWorking(false);
    await onChanged();
    const fixed = lines.find((l) => l.source !== "guardado");
    onToast(fixed ? `Corregido. Guardá “${fixed.food_name}” en Alimentos para que salga bien la próxima.` : "Corregido.");
  }

  async function remove(entry: EntryRow) {
    setWorking(true);
    const { error } = await deleteEntry(entry.id);
    setWorking(false);
    setConfirmId(null);
    if (error) {
      onToast("No se pudo borrar.");
      return;
    }
    await onChanged();
    if (entries.length === 1) onClose();
  }

  const first = entries[0]?.eaten_at;

  return (
    <Sheet
      title={MEAL_LABEL[meal]}
      subtitle={
        <>
          {first && <>{hhmm(first)} · </>}
          <b className="text-ink">{fmtInt(t.kcal)} kcal</b> · {fmtInt(t.protein)} g proteína
        </>
      }
      onClose={onClose}
      footer={
        <Link href={`/anotar?meal=${meal}`} className="btn-accent w-full">
          <Icon name="plus" size={20} strokeWidth={2.4} /> Agregar más a {MEAL_LABEL[meal].toLowerCase()}
        </Link>
      }
    >
      <ul className="space-y-2.5 pt-2">
        {entries.map((e) => {
          const grams = Number(e.grams) || 0;
          const per100 = (v: number) => (grams > 0 ? (Number(v) * 100) / grams : 0);
          return (
            <li key={e.id} className="rounded-[18px] border border-white/90 bg-white/75 p-3.5">
              {editingId === e.id ? (
                <form
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    saveEdit(e);
                  }}
                  className="space-y-2.5"
                >
                  <label htmlFor={`edit-${e.id}`} className="label !mb-0">
                    Corregí cantidad o alimento
                  </label>
                  <input
                    id={`edit-${e.id}`}
                    className="input"
                    value={draft}
                    onChange={(ev) => setDraft(ev.target.value)}
                    placeholder="ej. 150 g pollo"
                    autoFocus
                    enterKeyHint="done"
                    autoCapitalize="none"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="btn-accent flex-1" disabled={working || !draft.trim()}>
                      {working ? "Calculando…" : "Recalcular y guardar"}
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold leading-snug text-ink">
                        {e.food_name}
                        {grams > 0 && <span className="font-medium text-ink2"> · {fmtInt(grams)} g</span>}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink2">
                        <span>
                          {fmtInt(e.kcal)} kcal · {fmtDec(Number(e.protein))} g prot.
                        </span>
                        <span className={`tag ${e.source === "revisar" ? "tag-review" : ""}`}>{e.source}</span>
                      </p>
                    </div>
                    <div className="-mr-1.5 -mt-1 flex shrink-0">
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-ink2 active:bg-white"
                        onClick={() => {
                          setEditingId(e.id);
                          setConfirmId(null);
                          setDraft(e.raw_text ?? `${fmtInt(grams)} g ${e.food_name}`);
                        }}
                        aria-label={`Corregir ${e.food_name}`}
                      >
                        <Icon name="edit" size={20} />
                      </button>
                      <button
                        type="button"
                        className="flex h-11 w-11 items-center justify-center rounded-full text-ink2 active:bg-white"
                        disabled={working}
                        onClick={() => setConfirmId(confirmId === e.id ? null : e.id)}
                        aria-label={`Borrar ${e.food_name}`}
                        aria-expanded={confirmId === e.id}
                      >
                        <Icon name="trash" size={20} />
                      </button>
                    </div>
                  </div>

                  {confirmId === e.id && (
                    <div className="animate-fade mt-3 flex items-center justify-between gap-2 rounded-2xl bg-[rgba(240,162,46,0.14)] py-1.5 pl-3.5 pr-1.5">
                      <span className="text-[14px] font-semibold text-ink">¿Borrar este alimento?</span>
                      <span className="flex gap-1">
                        <button type="button" className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-ink2" onClick={() => setConfirmId(null)}>
                          No
                        </button>
                        <button
                          type="button"
                          className="min-h-[44px] rounded-xl bg-white px-4 text-[14px] font-bold text-ink"
                          onClick={() => remove(e)}
                          disabled={working}
                        >
                          Borrar
                        </button>
                      </span>
                    </div>
                  )}

                  {e.source !== "guardado" && grams > 0 && confirmId !== e.id && (
                    <Link
                      href={saveFoodHref(
                        { name: e.food_name, kcal: per100(e.kcal), protein: per100(e.protein), carbs: per100(e.carbs), fat: per100(e.fat) },
                        "hoy",
                      )}
                      className="mt-1 inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-bold text-accent"
                    >
                      <Icon name="bookmark" size={16} /> Guardar en Alimentos
                    </Link>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
