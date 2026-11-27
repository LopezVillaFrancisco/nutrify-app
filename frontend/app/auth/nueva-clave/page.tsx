"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { authMessage } from "@/lib/auth-errors";

/** Se llega desde el link de "Recuperar contraseña" (ya con sesión iniciada por /auth/callback). */
export default function NuevaClavePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ok = password.length >= 6;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(authMessage(err));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center px-5">
      <form onSubmit={submit} className="glass rounded-[28px] p-5 pb-6">
        <h1 className="text-[22px] font-extrabold text-ink">Elegí tu nueva contraseña</h1>
        <p className="mt-1 text-[14px] text-ink2">Mínimo 6 caracteres.</p>
        <label htmlFor="new-pass" className="label mt-5">
          Contraseña nueva
        </label>
        <div className="relative">
          <input
            id="new-pass"
            className="input !pr-12"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            enterKeyHint="go"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink2"
          >
            <Icon name={show ? "eye-off" : "eye"} size={20} />
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-[rgba(240,162,46,0.12)] px-4 py-3 text-[14px] font-semibold text-ink">
            {error}
          </p>
        )}
        <button type="submit" className="btn-accent mt-5 w-full" disabled={!ok || busy}>
          {busy ? "Guardando…" : "Guardar y entrar"}
        </button>
      </form>
    </main>
  );
}
