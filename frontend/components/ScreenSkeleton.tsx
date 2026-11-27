/** Esqueleto de pantalla: se muestra al instante mientras carga la pantalla siguiente. */
export default function ScreenSkeleton({ title }: { title?: string }) {
  return (
    <div aria-busy="true" aria-label="Cargando">
      <header className="flex min-h-[64px] items-start pt-1">
        <div>
          <div className="h-[14px] w-28 animate-pulse rounded-full bg-white/60" />
          {title ? (
            <h1 className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          ) : (
            <div className="mt-2 h-[26px] w-40 animate-pulse rounded-full bg-white/70" />
          )}
        </div>
      </header>
      <div className="mt-4 space-y-3">
        <div className="glass h-[150px] animate-pulse" />
        <div className="glass h-[72px] animate-pulse" />
        <div className="glass h-[72px] animate-pulse" />
      </div>
    </div>
  );
}
