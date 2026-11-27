import { createClient } from "@/lib/supabase/browser";

/**
 * Cliente del backend Java (../backend). Supabase queda solo para iniciar sesión:
 * cada pedido lleva el token de la sesión y el backend lo valida y consulta la base con RLS.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080").trim().replace(/\/+$/, "");

/** Error con el mensaje que devolvió el backend ({"error": "..."}), listo para mostrar. status 0 = sin conexión. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** fetch al backend con el token de la sesión de Supabase. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await createClient().auth.getSession();
  const headers = new Headers(init.headers);
  const token = data.session?.access_token;
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(API_URL + path, { ...init, headers });
}

type Opts = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown };

/** Pedido JSON. Si falla, tira ApiError con el mensaje del backend. Sin sesión, manda a /login. */
export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(path, {
      method: opts.method ?? "GET",
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Sin conexión. Revisá internet y probá de nuevo.", 0);
  }
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? "No se pudo completar. Probá de nuevo.", res.status);
  return data as T;
}

/** Igual que api(), pero devuelve { data, error } (como hacía supabase-js) para no tener que usar try/catch. */
export async function apiResult<T = unknown>(path: string, opts: Opts = {}): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    return { data: await api<T>(path, opts), error: null };
  } catch (e) {
    return { data: null, error: e instanceof ApiError ? e : new ApiError("No se pudo completar. Probá de nuevo.", 0) };
  }
}
