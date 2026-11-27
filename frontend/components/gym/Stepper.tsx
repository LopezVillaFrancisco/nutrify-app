"use client";

import { useEffect, useState } from "react";
import { fmtDec, parseDecimal } from "@/lib/format";

/**
 * Número con botones − / + (pensado para el gym: un toque sube 2,5 kg o 1 rep).
 * Se puede escribir igual ("62,5"). placeholder = lo sugerido (la vez anterior o el objetivo).
 */
export default function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max = 999,
  placeholder,
  label,
  decimal,
  compact,
  done,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  placeholder?: number | null;
  label: string;
  decimal?: boolean;
  compact?: boolean;
  done?: boolean;
}) {
  const fmt = (n: number | null) => (n === null ? "" : decimal ? fmtDec(n) : String(Math.round(n)));
  const [text, setText] = useState(fmt(value));
  useEffect(() => setText(fmt(value)), [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const base = value ?? placeholder ?? 0;
  const bump = (d: number) => onChange(clamp(base + d));
  const commit = () => {
    if (!text.trim()) return onChange(null);
    const n = parseDecimal(text);
    if (Number.isFinite(n)) onChange(clamp(decimal ? n : Math.round(n)));
    else setText(fmt(value));
  };

  const btn = `flex shrink-0 items-center justify-center rounded-xl text-[18px] font-bold text-ink2 transition active:scale-90 active:bg-white ${
    compact ? "h-10 w-8" : "h-11 w-10"
  }`;

  return (
    <div
      className={`flex min-w-0 items-center rounded-2xl border transition-colors ${
        done ? "border-mint/40 bg-[rgba(31,157,107,0.10)]" : "border-white/90 bg-white/75"
      }`}
    >
      <button type="button" className={btn} onClick={() => bump(-step)} aria-label={`Bajar ${label}`} tabIndex={-1}>
        −
      </button>
      <input
        className={`min-w-0 flex-1 bg-transparent text-center font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink2/45 ${
          compact ? "h-10 text-[15px]" : "h-11 text-[16px]"
        }`}
        inputMode={decimal ? "decimal" : "numeric"}
        value={text}
        placeholder={placeholder !== null && placeholder !== undefined ? fmt(placeholder) : "–"}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button type="button" className={btn} onClick={() => bump(step)} aria-label={`Subir ${label}`} tabIndex={-1}>
        +
      </button>
    </div>
  );
}
