"use client";

import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/fx";

/**
 * Número que "corre" hasta el valor nuevo cuando cambia (ej. 1.200 → 1.600 ml).
 * La primera vez muestra el valor directo, salvo que se pase `from` (venís de guardar en otra pantalla).
 */
export function useCountUp(value: number, opts: { ms?: number; from?: number | null } = {}) {
  const { ms = 750, from } = opts;
  const [shown, setShown] = useState(value);
  const cur = useRef(value);
  const raf = useRef(0);
  const usedFrom = useRef(false);

  useEffect(() => {
    let start = cur.current;
    if (from != null && !usedFrom.current) {
      usedFrom.current = true;
      start = from;
    }
    if (start === value || reducedMotion()) {
      cancelAnimationFrame(raf.current);
      cur.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3); // sale rápido y frena suave
      cur.current = start + (value - start) * e;
      setShown(cur.current);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, from, ms]);

  return shown;
}
