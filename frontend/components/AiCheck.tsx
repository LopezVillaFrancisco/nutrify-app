"use client";

import { useCallback, useEffect, useState } from "react";
import Sheet from "@/components/Sheet";
import { apiFetch } from "@/lib/api";
import type { AiHealth, AiStatus } from "@/lib/types";

/** Consulta el estado de la IA (no le pide nada a la IA: no gasta cuota). */
export function useAiHealth(enabled = true) {
  const [health, setHealth] = useState<AiHealth | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/ai-status${force ? "?force=1" : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      setHealth((await res.json()) as AiHealth);
    } catch {
      setError("No pudimos revisar el estado. Revisá internet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { health, loading, error, refresh };
}

type Tone = "ok" | "warn" | "neutral";
const DOT: Record<Tone, string> = { ok: "bg-mint", warn: "bg-mango", neutral: "bg-sage" };

const hhmm = (ms: number) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "numeric", minute: "2-digit" }).format(new Date(ms));
const secs = (until?: number) => Math.max(1, Math.ceil(((until ?? Date.now()) - Date.now()) / 1000));

function rows(h: AiHealth): { label: string; value: string; tone: Tone }[] {
  const conn: Record<AiHealth["connection"], [string, Tone]> = {
    ok: ["Responde", "ok"],
    clave: ["No acepta la clave", "warn"],
    modelo: ["Modelo no disponible", "warn"],
    sin_conexion: ["Sin conexión", "warn"],
    sin_clave: ["Falta la clave", "warn"],
    apagada: ["Apagada en el servidor", "neutral"],
  };
  const p = h.problem;
  const google: [string, Tone] = !p
    ? ["Sin cortes", "ok"]
    : p.kind === "dia"
      ? [`Cuota diaria agotada hasta las ${hhmm(p.until ?? Date.now())}`, "warn"]
      : p.kind === "minuto"
        ? [`Pidió esperar (${secs(p.until)} s)`, "warn"]
        : p.kind === "clave"
          ? ["Rechazó la clave", "warn"]
          : [`Falló a las ${hhmm(p.at)} (puede andar)`, "neutral"];
  const left = Math.max(0, h.cap - h.usedToday);
  return [
    { label: "Conexión con Google", value: conn[h.connection][0], tone: conn[h.connection][1] },
    { label: "Límite de Google", value: google[0], tone: google[1] },
    {
      label: "Pedidos por minuto",
      value: h.minute.free > 0 ? `${h.minute.free} de ${h.minute.max} libres` : `Esperá ${h.minute.waitSec} s`,
      tone: h.minute.free > 2 ? "ok" : h.minute.free > 0 ? "neutral" : "warn",
    },
    {
      label: "Hoy",
      value: `${h.usedToday} de ${h.cap} usados`,
      tone: left > 5 ? "ok" : left > 0 ? "neutral" : "warn",
    },
  ];
}

/** Filas de estado + veredicto. */
export function AiHealthPanel({
  health,
  loading,
  error,
  onRefresh,
  compact = false,
}: {
  health: AiHealth | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "glass p-4"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-bold text-ink">Estado de la IA</p>
        <button type="button" onClick={onRefresh} disabled={loading} className="min-h-[36px] px-2 text-[13px] font-bold text-accent disabled:opacity-50">
          {loading ? "Revisando…" : "Revisar"}
        </button>
      </div>

      {error && !health && <p className="mt-1 text-[13px] text-ink2">{error}</p>}

      {!health && loading && (
        <ul className="mt-2 space-y-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="h-[20px] animate-pulse rounded-full bg-white/60" />
          ))}
        </ul>
      )}

      {health && (
        <>
          <ul className={`mt-1.5 space-y-1.5 transition-opacity ${loading ? "opacity-60" : ""}`}>
            {rows(health).map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-ink2">{r.label}</span>
                <span className="flex min-w-0 items-center gap-1.5 text-right font-semibold text-ink">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[r.tone]}`} aria-hidden />
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
          <p
            className={`mt-3 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug ${
              health.canUse ? "bg-[rgba(31,157,107,0.12)] text-accent" : "bg-[rgba(240,162,46,0.14)] text-ink"
            }`}
            role="status"
          >
            {health.canUse ? <b>Se puede usar ahora.</b> : <><b>Ahora no se puede.</b> {health.reason}</>}
          </p>
          <p className="mt-2 text-[11.5px] text-ink2">Revisar no gasta pedidos.</p>
        </>
      )}
    </div>
  );
}

/** Pide permiso antes de usar la IA: muestra qué va a completar, cuánto gasta y si Google la va a dejar usar. */
export function AiConfirmSheet({ ai, onConfirm, onClose }: { ai: AiStatus; onConfirm: () => void; onClose: () => void }) {
  const { health, loading, error, refresh } = useAiHealth(true);
  const calls = Math.max(1, ai.callsNeeded ?? 2);
  const names = ai.pendingNames ?? [];
  const usedToday = health?.usedToday ?? ai.usedToday;
  const left = Math.max(0, ai.cap - usedToday);
  const ready = Boolean(health?.canUse) && !loading;

  return (
    <Sheet
      title="¿Consultar a la IA?"
      subtitle="Mirá si va a poder antes de gastar."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" className="btn-accent w-full sm:flex-1" disabled={!ready} onClick={onConfirm}>
            {loading && !health ? "Revisando…" : `Consultar (${calls} ${calls === 1 ? "pedido" : "pedidos"})`}
          </button>
          <button type="button" className="btn-ghost w-full sm:flex-1" onClick={onClose}>
            Ahora no
          </button>
        </div>
      }
    >
      <p className="text-[14px] font-bold text-ink">Va a completar</p>
      {names.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <li key={n} className="rounded-full bg-white/75 px-3 py-1 text-[13px] font-semibold text-ink">
              {n}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[13px] text-ink2">
          {ai.pending === 1 ? "1 alimento" : `${ai.pending} alimentos`} sin datos.
        </p>
      )}
      <p className="mt-3 text-[13px] text-ink2">
        Usa <b className="text-ink">{calls === 1 ? "1 pedido" : `hasta ${calls}`}</b> de los {left} que te quedan hoy.
      </p>

      <div className="mt-4 rounded-[20px] bg-white/55 p-3.5">
        <AiHealthPanel health={health} loading={loading} error={error} onRefresh={() => refresh(true)} compact />
      </div>
    </Sheet>
  );
}
