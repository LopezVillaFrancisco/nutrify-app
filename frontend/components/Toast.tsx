"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";

export type ToastIcon = "check" | "drop" | "steps" | "food" | "gym" | "star" | "goal" | "trash" | "warn";
export type ToastData = { text: string; icon?: ToastIcon; action?: { label: string; run: () => void } };

/** Si no se indica ícono: los errores ("No se pudo…", "Falta…") llevan aviso; el resto, un check. */
const guessIcon = (text: string): ToastIcon =>
  /^(no |falta|sin señal|revisá)/i.test(text) ? "warn" : /quitad|borrad|eliminad/i.test(text) ? "trash" : "check";

/** Estado de un aviso efímero. Con acción (ej. "Deshacer") dura más. */
export function useToast() {
  const [toast, setToast] = useState<(ToastData & { id: number; ms: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((t: ToastData | string) => {
    const data = typeof t === "string" ? { text: t } : t;
    const ms = data.action ? 5000 : 2600;
    setToast({ ...data, icon: data.icon ?? guessIcon(data.text), id: Date.now(), ms });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), ms);
  }, []);
  const hide = useCallback(() => setToast(null), []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, show, hide };
}

const BADGE: Record<ToastIcon, { bg: string; icon?: IconName; glyph?: string }> = {
  check: { bg: "linear-gradient(135deg,#F0A22E,#1F9D6B)" },
  drop: { bg: "linear-gradient(135deg,#7FD3E0,#1F9D6B)", icon: "drop" },
  steps: { bg: "linear-gradient(135deg,#F6C25E,#F0A22E)", icon: "steps" },
  food: { bg: "linear-gradient(135deg,#F0A22E,#1F9D6B)", icon: "sparkle" },
  gym: { bg: "linear-gradient(135deg,#7CCB8F,#1F9D6B)", icon: "dumbbell" },
  star: { bg: "linear-gradient(135deg,#FFD66B,#F0A22E)", glyph: "★" },
  goal: { bg: "linear-gradient(135deg,#FFD66B,#F0A22E,#1F9D6B)", glyph: "★" },
  trash: { bg: "rgba(255,255,255,0.18)", icon: "trash" },
  warn: { bg: "rgba(240,162,46,0.9)", glyph: "!" },
};

/** Aviso flotante sobre la barra inferior: entra con rebote, sale suave, con ícono y tiempo de "Deshacer". */
export function Toast({ toast, onHide }: { toast: (ToastData & { id?: number; ms?: number }) | null; onHide: () => void }) {
  // Se queda montado un momento para animar la salida
  const [shown, setShown] = useState(toast);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (toast) {
      setShown(toast);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => setShown(null), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!shown) return null;
  const icon = shown.icon ?? guessIcon(shown.text);
  const b = BADGE[icon];
  return (
    <div
      key={shown.id}
      role="status"
      aria-live="polite"
      className={`${leaving ? "animate-toast-out" : "animate-toast"} fixed inset-x-4 bottom-[calc(108px+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-[398px] overflow-hidden rounded-[20px] bg-ink text-[15px] font-semibold text-white shadow-nav md:bottom-6 md:left-[264px]`}
    >
      <div className="flex items-center gap-3 py-2 pl-2.5 pr-4">
        <span
          className="toast-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold text-ink"
          style={{ background: b.bg }}
          aria-hidden
        >
          {icon === "check" ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path className="toast-check" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : b.icon ? (
            <Icon name={b.icon} size={19} strokeWidth={2.2} className={icon === "trash" ? "text-white" : ""} />
          ) : (
            b.glyph
          )}
        </span>
        <span className="min-w-0 flex-1 py-1.5 leading-snug">{shown.text}</span>
        {shown.action && (
          <button
            type="button"
            className="-mr-2 min-h-[44px] shrink-0 rounded-xl px-3 font-bold text-[#F6D58E] active:scale-95"
            onClick={() => {
              shown.action!.run();
              onHide();
            }}
          >
            {shown.action.label}
          </button>
        )}
      </div>
      {/* Tiempo que queda para deshacer */}
      {shown.action && !leaving && (
        <span className="toast-timer absolute inset-x-0 bottom-0 h-[3px] origin-left" style={{ animationDuration: `${shown.ms ?? 5000}ms` }} aria-hidden />
      )}
    </div>
  );
}
