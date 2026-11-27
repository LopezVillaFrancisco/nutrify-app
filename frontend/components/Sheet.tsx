"use client";

import { useEffect, useId, useRef } from "react";
import Icon from "@/components/Icon";

/** Hojas abiertas (la última es la de arriba). */
const OPEN: string[] = [];

/** Hoja inferior (bottom sheet): bloquea el scroll de fondo, cierra con Esc, botón atrás o tocando afuera. */
export default function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && OPEN[OPEN.length - 1] === titleId && closeRef.current();
    window.addEventListener("keydown", onKey);
    // El botón "atrás" de Android cierra la hoja de arriba (puede haber una hoja abierta sobre otra)
    OPEN.push(titleId);
    history.pushState({ sheet: titleId }, "");
    const onPop = () => {
      if (OPEN[OPEN.length - 1] === titleId && history.state?.sheet !== titleId) closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      const i = OPEN.indexOf(titleId);
      if (i >= 0) OPEN.splice(i, 1);
      if (history.state?.sheet === titleId) history.back();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6" role="presentation">
      <div className="animate-fade absolute inset-0 bg-[rgba(20,50,42,0.28)]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-sheet relative flex max-h-[88dvh] w-full max-w-[430px] flex-col rounded-t-[28px] border border-white/85 bg-[rgba(250,252,246,0.94)] shadow-nav backdrop-blur-xl md:max-h-[85dvh] md:max-w-[520px] md:rounded-[28px]"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-sage/50 md:hidden" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-3 md:px-6 md:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-extrabold leading-tight text-ink">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-[14px] text-ink2">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80 text-ink2"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4 md:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-white/80 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 md:px-6 md:pb-5">{footer}</div>
        )}
        {!footer && <div className="h-[max(8px,env(safe-area-inset-bottom))] shrink-0" />}
      </div>
    </div>
  );
}
