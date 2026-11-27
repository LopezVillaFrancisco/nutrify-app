"use client";

import { useEffect, useRef, useState } from "react";

/** Barra de progreso: cuando sube, se llena con un pequeño rebote y la recorre un brillo. */
export default function ProgressBar({ pct, h = "h-2", className = "mt-2" }: { pct: number; h?: string; className?: string }) {
  const prev = useRef(pct);
  const [glint, setGlint] = useState(0);
  useEffect(() => {
    if (pct > prev.current + 0.001) setGlint((n) => n + 1);
    prev.current = pct;
  }, [pct]);
  return (
    <span className={`${className} block ${h} overflow-hidden rounded-full bg-white/90`} aria-hidden>
      <span className="bar-fill block h-full rounded-full grad-d" style={{ width: `${Math.min(Math.max(pct, 0), 1) * 100}%` }}>
        {glint > 0 && <span key={glint} className="bar-glint" />}
      </span>
    </span>
  );
}
