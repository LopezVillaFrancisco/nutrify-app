"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import ProgressBar from "@/components/ProgressBar";
import { burst, haptic } from "@/lib/fx";
import { useCountUp } from "@/lib/useCountUp";
import Sheet from "@/components/Sheet";
import type { ToastData } from "@/components/Toast";
import { addWater, deleteWater } from "@/lib/activity";
import { fmtInt, hhmm, parseDecimal } from "@/lib/format";
import { waterStatus } from "@/lib/health";
import type { Cup, WaterRow } from "@/lib/types";

export default function WaterSheet({
  date,
  list,
  goal,
  goalAuto,
  cups,
  onClose,
  onToast,
}: {
  date: string;
  list: WaterRow[];
  goal: number;
  goalAuto: boolean;
  cups: Cup[];
  onClose: () => void;
  onToast: (t: ToastData | string) => void;
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const total = list.reduce((s, w) => s + w.ml, 0);
  const last = list.length ? list[list.length - 1].drank_at : null;
  const status = waterStatus(total, goal, last);
  const pct = Math.min(total / goal, 1);
  const shown = useCountUp(total);

  // Se ve al instante (la lista y el total cambian ya); se guarda en segundo plano
  async function add(ml: number, label: string | undefined, el: HTMLElement | null) {
    if (!(ml > 0) || busy) return;
    haptic("tap");
    burst("water", el, "water-sheet");
    setBusy(true);
    setCustom("");
    const { error } = await addWater(date, Math.round(ml));
    setBusy(false);
    if (error) return onToast("No se pudo guardar. Probá de nuevo.");
    if (total < goal && total + ml >= goal) {
      haptic("goal");
      burst("goal", el);
      onToast({ text: "¡Meta de agua cumplida!", icon: "goal" });
    } else onToast({ text: `+${fmtInt(ml)} ml de agua${label ? ` (${label})` : ""}`, icon: "drop" });
  }

  const customMl = parseDecimal(custom);

  return (
    <Sheet
      title="Agua"
      subtitle={
        <>
          <b data-fx-target="water-sheet" className="inline-block tabular-nums text-ink">{fmtInt(shown)}</b> de {fmtInt(goal)} ml
        </>
      }
      onClose={onClose}
    >
      <div className="pt-2">
        <ProgressBar pct={pct} h="h-3" className="" />
        <p className={`mt-2.5 text-[14px] font-semibold leading-snug ${status.tone === "nudge" ? "text-accent" : "text-ink"}`}>{status.text}</p>

        {/* Tus vasos (se cambian en Perfil). Si no lo terminaste, "Mitad". */}
        <div className={`mt-4 grid gap-2 ${cups.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {cups.map((c) => (
            <div key={`${c.name}-${c.ml}`} className="overflow-hidden rounded-2xl border border-white/90 bg-white/80">
              <button
                type="button"
                disabled={busy}
                onClick={(e) => add(c.ml, c.name, e.currentTarget)}
                className="flex min-h-[64px] w-full flex-col items-center justify-center px-2 font-bold text-ink active:bg-white disabled:opacity-60"
              >
                <span className="text-[16px]">+ {c.name}</span>
                <span className="text-[12.5px] font-semibold text-ink2">{fmtInt(c.ml)} ml</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => add(c.ml / 2, `media ${c.name.toLowerCase()}`, e.currentTarget)}
                className="min-h-[40px] w-full border-t border-white/90 text-[13px] font-semibold text-accent active:bg-white disabled:opacity-60"
              >
                Mitad · {fmtInt(c.ml / 2)} ml
              </button>
            </div>
          ))}
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(customMl, undefined, (e.currentTarget as HTMLFormElement).querySelector("button"));
          }}
        >
          <div className="relative flex-1">
            <input
              className="input !pr-12"
              inputMode="numeric"
              placeholder="Otra cantidad"
              aria-label="Otra cantidad en ml"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink2">ml</span>
          </div>
          <button type="submit" className="btn-accent" disabled={busy || !(customMl > 0 && customMl <= 5000)}>
            Sumar
          </button>
        </form>

        <h3 className="mt-6 text-[15px] font-bold text-ink">Hoy</h3>
        {list.length === 0 ? (
          <p className="mt-1 text-[14px] text-ink2">Todavía nada. Cada vaso que sumes aparece acá con su hora.</p>
        ) : (
          <ul className="mt-2 divide-y divide-white/80 rounded-2xl bg-white/70">
            {[...list].reverse().map((w) => (
              <li key={w.id} className={`${w.id.startsWith("tmp-") ? "animate-rise" : ""} flex items-center justify-between py-1 pl-4 pr-1`}>
                <span className="text-[15px] text-ink">
                  <b>{fmtInt(w.ml)} ml</b> <span className="text-ink2">· {hhmm(w.drank_at)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Borrar ${w.ml} ml de las ${hhmm(w.drank_at)}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink2 disabled:opacity-40"
                  disabled={w.id.startsWith("tmp-")}
                  onClick={async () => {
                    const { error } = await deleteWater(date, w.id);
                    if (error) onToast("No se pudo borrar.");
                  }}
                >
                  <Icon name="x" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 text-[12.5px] leading-snug text-ink2">
          La meta es un mínimo: pasarte está bien. {goalAuto ? "Se calcula con tu peso (35 ml por kg)." : ""} Vasos y meta: en Perfil.
        </p>
      </div>
    </Sheet>
  );
}
