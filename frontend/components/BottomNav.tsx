"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { todayISO } from "@/lib/format";
import { prefetchScreen } from "@/lib/queries";

type Item = { href: string; label: string; icon: IconName };

const LEFT: Item[] = [
  { href: "/", label: "Hoy", icon: "home" },
  { href: "/alimentos", label: "Comida", icon: "list" },
];
const RIGHT: Item[] = [
  { href: "/gym", label: "Gym", icon: "dumbbell" },
  { href: "/semana", label: "Progreso", icon: "chart" },
];
// Perfil: en el celular se abre desde el ícono de Hoy; en compu está en la barra lateral
const SIDE_EXTRA: Item[] = [{ href: "/perfil", label: "Perfil", icon: "user" }];

/**
 * Navegación principal.
 * - Celular: barra inferior flotante con el botón central "Anotar".
 * - Desde 768 px: barra lateral fija (la barra inferior se oculta).
 */
export default function BottomNav() {
  const path = usePathname();
  // Tab tocada: se marca al instante (sin esperar a que cargue la pantalla)
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [path]);
  const current = pending ?? path;
  const is = (p: string) => (p === "/" ? current === "/" : current === p || current.startsWith(p + "/"));
  const navigating = pending !== null && pending !== path;

  // Al apoyar el dedo (o pasar el mouse) ya se piden los datos de la pantalla
  const press = (href: string) => ({
    onPointerDown: () => prefetchScreen(href, todayISO()),
    onMouseEnter: () => prefetchScreen(href, todayISO()),
    onClick: () => {
      if (href !== path) setPending(href);
    },
  });

  const tab = (t: Item) => {
    const active = is(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        {...press(t.href)}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11.5px] transition-colors ${
          active ? "font-bold text-accent" : "font-semibold text-ink2"
        }`}
      >
        <Icon name={t.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
        {t.label}
      </Link>
    );
  };

  const sideItem = (t: Item) => {
    const active = is(t.href);
    return (
      <Link
        key={t.href}
        href={t.href}
        {...press(t.href)}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[48px] items-center gap-3 rounded-2xl px-3.5 text-[15px] transition-colors ${
          active ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2 hover:bg-white/60"
        }`}
      >
        <Icon name={t.icon} size={22} strokeWidth={active ? 2.2 : 1.8} />
        {t.label}
      </Link>
    );
  };

  const anotarActive = is("/anotar");

  return (
    <>
      {navigating && <div className="nav-progress" aria-hidden />}

      {/* Escritorio / tablet: barra lateral */}
      <nav
        aria-label="Principal"
        className="fixed inset-y-4 left-4 z-40 hidden w-[232px] flex-col rounded-[28px] border border-white/85 p-4 md:flex"
        style={{
          background: "rgba(255,255,255,0.7)",
          boxShadow: "0 10px 28px rgba(18,104,74,0.16)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-6 pt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nutrify-icon-512.png" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-[20px] font-extrabold tracking-tight text-ink">Nutrify</span>
        </Link>

        <Link
          href="/anotar"
          {...press("/anotar")}
          aria-current={anotarActive ? "page" : undefined}
          className={`btn-accent mb-5 w-full ${anotarActive ? "ring-2 ring-white" : ""}`}
        >
          <Icon name="plus" size={22} strokeWidth={2.6} /> Anotar
        </Link>

        <div className="flex flex-col gap-1">{[...LEFT, ...RIGHT].map(sideItem)}</div>
        <div className="mt-auto flex flex-col gap-1 border-t border-white/80 pt-3">{SIDE_EXTRA.map(sideItem)}</div>
      </nav>

      {/* Celular: barra inferior flotante */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-4 z-40 mx-auto max-w-[398px] md:hidden"
        style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <div
          className="relative flex items-stretch rounded-[28px] border border-white/85 px-1.5 py-1"
          style={{
            background: "rgba(255,255,255,0.78)",
            boxShadow: "0 10px 28px rgba(18,104,74,0.20)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {LEFT.map(tab)}

          {/* Hueco para el botón central */}
          <Link
            href="/anotar"
            {...press("/anotar")}
            aria-label="Anotar"
            aria-current={anotarActive ? "page" : undefined}
            className={`flex min-h-[52px] w-[72px] shrink-0 flex-col items-center justify-end pb-1.5 text-[11.5px] ${
              anotarActive ? "font-bold text-accent" : "font-semibold text-ink2"
            }`}
          >
            Anotar
          </Link>

          {RIGHT.map(tab)}

          <Link
            href="/anotar"
            {...press("/anotar")}
            aria-hidden
            tabIndex={-1}
            className="absolute left-1/2 top-[-26px] flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full text-ink transition-transform active:scale-95"
            style={{
              background: "linear-gradient(135deg, #F0A22E, #1F9D6B)",
              boxShadow: "0 8px 20px rgba(31,157,107,0.40)",
            }}
          >
            <Icon name="plus" size={26} strokeWidth={2.6} />
          </Link>
        </div>
      </nav>
    </>
  );
}
