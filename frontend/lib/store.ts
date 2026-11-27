"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * Caché de datos compartida entre pantallas ("stale-while-revalidate"):
 * - Al volver a una pantalla, los datos aparecen al instante y se actualizan en segundo plano.
 * - Se guarda en localStorage: al abrir la app en frío ya se ve lo último que cargaste.
 * - Pedidos iguales en vuelo se comparten (no se repiten).
 */
type Rec = { data?: unknown; has: boolean; ts: number; promise?: Promise<unknown>; error?: boolean; err?: unknown };

const STORAGE_KEY = "nutrify:cache:v1";
const MAX_AGE_PERSIST = 1000 * 60 * 60 * 24 * 3; // lo guardado de más de 3 días no se muestra

const recs = new Map<string, Rec>();
const listeners = new Map<string, Set<() => void>>();
let hydrated = false;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, { data: unknown; ts: number }>;
    const now = Date.now();
    for (const [key, v] of Object.entries(saved)) {
      // ts = 0: se muestra pero se considera viejo (se revalida al montar)
      if (now - v.ts < MAX_AGE_PERSIST) recs.set(key, { data: v.data, has: true, ts: 0 });
    }
  } catch {
    // caché corrupta: se ignora
  }
}

function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const out: Record<string, { data: unknown; ts: number }> = {};
      const now = Date.now();
      for (const [key, r] of recs) if (r.has) out[key] = { data: r.data, ts: r.ts || now };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
    } catch {
      // sin espacio o modo privado: no pasa nada
    }
  }, 300);
}

function rec(key: string): Rec {
  hydrate();
  let r = recs.get(key);
  if (!r) {
    r = { has: false, ts: 0 };
    recs.set(key, r);
  }
  return r;
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

export function getCached<T>(key: string): T | undefined {
  return rec(key).data as T | undefined;
}

export function setCached<T>(key: string, data: T) {
  recs.set(key, { data, has: true, ts: Date.now() });
  emit(key);
  persist();
}

/** Trae y guarda en caché. Si ya hay un pedido igual en vuelo, lo reutiliza. */
export function fetchQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const r = rec(key);
  if (r.promise) return r.promise as Promise<T>;
  const promise = fetcher()
    .then((data) => {
      setCached(key, data);
      return data;
    })
    .catch((err) => {
      // Objeto nuevo: useSyncExternalStore compara por referencia
      recs.set(key, { ...rec(key), promise: undefined, error: true, err });
      emit(key);
      throw err;
    });
  r.promise = promise;
  promise.finally(() => {
    const cur = recs.get(key);
    if (cur && cur.promise === promise) cur.promise = undefined;
  });
  return promise;
}

/** Trae solo si no hay datos frescos (para precargar la pantalla siguiente). */
export function prefetchQuery<T>(key: string, fetcher: () => Promise<T>, staleMs = 30_000) {
  const r = rec(key);
  if (r.promise || (r.has && Date.now() - r.ts < staleMs)) return;
  fetchQuery(key, fetcher).catch(() => {});
}

/** Marca como viejas las claves que empiezan con alguno de los prefijos; las pantallas abiertas se actualizan solas. */
export function invalidate(...prefixes: string[]) {
  for (const [key, r] of recs) {
    if (prefixes.some((p) => key === p || key.startsWith(p))) {
      recs.set(key, { ...r, ts: 0 });
      emit(key);
    }
  }
}

export function clearCache() {
  recs.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("nutrify:analyze:v1");
  } catch {}
}

function subscribe(key: string, cb: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(cb);
  return () => set!.delete(cb);
}

export type Query<T> = {
  data: T | undefined;
  /** true solo la primera vez (no hay nada para mostrar todavía) */
  loading: boolean;
  /** hubo error y no hay datos */
  error: boolean;
  /** el error original (para distinguir, por ejemplo, una tabla que falta) */
  err: unknown;
  refresh: () => Promise<T | undefined>;
};

export function useQuery<T>(key: string | null, fetcher: () => Promise<T>, staleMs = 30_000): Query<T> {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const snap = useSyncExternalStore(
    useCallback((cb) => (key ? subscribe(key, cb) : () => {}), [key]),
    () => (key ? rec(key) : undefined),
    () => undefined,
  );

  const refresh = useCallback(async () => {
    if (!key) return undefined;
    try {
      return await fetchQuery(key, () => fetcherRef.current());
    } catch {
      return undefined;
    }
  }, [key]);

  // Revalida al montar y cada vez que la clave queda vieja (invalidate)
  const ts = snap?.ts ?? 0;
  useEffect(() => {
    if (!key) return;
    const r = rec(key);
    if (!r.promise && (!r.has || Date.now() - r.ts >= staleMs)) refresh();
  }, [key, ts, staleMs, refresh]);

  return {
    data: snap?.data as T | undefined,
    loading: !snap?.has,
    error: Boolean(snap?.error && !snap?.has),
    err: snap?.error ? snap.err : undefined,
    refresh,
  };
}
