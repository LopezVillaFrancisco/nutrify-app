"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/browser";
import { authMessage, isEmailNotConfirmed } from "@/lib/auth-errors";
import { clearCache } from "@/lib/store";

type Mode = "in" | "up" | "reset";
type Sent = { kind: "signup" | "reset"; email: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [sent, setSent] = useState<Sent>(null);

  // Se lee al montar (sin useSearchParams, la pantalla sale pre-renderizada y aparece al instante)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("error") === "link") {
      setError("Ese link ya se usó o venció. Pedí uno nuevo y abrilo desde este celular.");
    }
  }, []);

  const emailOk = EMAIL_RE.test(email.trim());
  const passOk = password.length >= 6;
  const canSubmit = emailOk && (mode === "reset" || passOk);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setUnconfirmed(false);
  }

  const redirectTo = (next?: string) =>
    `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    const supabase = createClient();
    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "in") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (err) {
          setUnconfirmed(isEmailNotConfirmed(err));
          setError(authMessage(err));
          return;
        }
        clearCache(); // por si antes entró otra cuenta en este teléfono
        router.replace("/");
        router.refresh();
        return;
      }

      if (mode === "up") {
        const { data, error: err } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: redirectTo() },
        });
        if (err) {
          setError(authMessage(err));
          return;
        }
        // Con confirmación de email activa, Supabase no da error si el mail ya existe: devuelve identities vacío
        if (data.user && data.user.identities?.length === 0) {
          setError("Ya hay una cuenta con ese email. Probá entrar.");
          return;
        }
        if (data.session) {
          clearCache();
          router.replace("/");
          router.refresh();
          return;
        }
        setSent({ kind: "signup", email: cleanEmail });
        return;
      }

      const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectTo("/auth/nueva-clave"),
      });
      if (err) {
        setError(authMessage(err));
        return;
      }
      setSent({ kind: "reset", email: cleanEmail });
    } catch (err) {
      setError(authMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  async function resend(target: string) {
    const supabase = createClient();
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email: target,
      options: { emailRedirectTo: redirectTo() },
    });
    return err ? authMessage(err) : null;
  }

  if (sent) {
    return (
      <Shell>
        <SentCard
          sent={sent}
          onResend={sent.kind === "signup" ? () => resend(sent.email) : undefined}
          onBack={() => {
            setSent(null);
            setPassword("");
            switchMode("in");
          }}
        />
      </Shell>
    );
  }

  const title = mode === "in" ? "Hola de nuevo" : mode === "up" ? "Creá tu cuenta" : "Recuperar contraseña";
  const subtitle =
    mode === "in"
      ? "Entrá para ver tu día."
      : mode === "up"
        ? "Es gratis y te lleva un minuto."
        : "Te mandamos un link para elegir una nueva.";

  return (
    <Shell>
      <form onSubmit={submit} noValidate className="glass rounded-[28px] p-5 pb-6">
        {mode !== "reset" ? (
          <div className="relative grid grid-cols-2 rounded-[18px] bg-white/55 p-1" role="tablist" aria-label="Modo">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[14px] bg-white shadow-glass transition-transform duration-200 ease-out"
              style={{ transform: mode === "in" ? "translateX(0)" : "translateX(100%)" }}
            />
            {(["in", "up"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={`relative z-10 min-h-[44px] rounded-[14px] text-[15px] font-bold transition-colors ${
                  mode === m ? "text-accent" : "text-ink2"
                }`}
              >
                {m === "in" ? "Entrar" : "Crear cuenta"}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => switchMode("in")}
            className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2 text-[15px] font-semibold text-accent"
          >
            <Icon name="chevron-left" size={20} /> Volver
          </button>
        )}

        <div className="mt-4">
          <h2 className="text-[22px] font-extrabold leading-tight text-ink">{title}</h2>
          <p className="mt-1 text-[14px] text-ink2">{subtitle}</p>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2/70">
                <Icon name="mail" size={20} />
              </span>
              <input
                id="email"
                className="input !pl-12"
                type="email"
                inputMode="email"
                autoComplete={mode === "up" ? "email" : "username"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint={mode === "reset" ? "send" : "next"}
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {mode !== "reset" && (
            <div>
              <div className="flex items-end justify-between">
                <label htmlFor="password" className="label">
                  Contraseña
                </label>
                {mode === "in" && (
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    className="-mr-1 mb-0.5 min-h-[32px] px-1 text-[13px] font-semibold text-accent"
                  >
                    ¿La olvidaste?
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink2/70">
                  <Icon name="lock" size={20} />
                </span>
                <input
                  id="password"
                  className="input !px-12"
                  type={show ? "text" : "password"}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  enterKeyHint="go"
                  placeholder={mode === "up" ? "Elegí una contraseña" : "Tu contraseña"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby={mode === "up" ? "pass-hint" : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  aria-pressed={show}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink2"
                >
                  <Icon name={show ? "eye-off" : "eye"} size={20} />
                </button>
              </div>
              {mode === "up" && (
                <p id="pass-hint" className={`mt-1.5 text-[12.5px] ${passOk ? "text-accent" : "text-ink2"}`}>
                  {passOk ? "✓ Contraseña lista" : `Mínimo 6 caracteres${password ? ` (te faltan ${6 - password.length})` : ""}`}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="animate-fade mt-4 rounded-2xl border border-mango/40 bg-[rgba(240,162,46,0.12)] px-4 py-3 text-[14px] font-semibold leading-snug text-ink"
          >
            {error}
            {unconfirmed && (
              <ResendInline onResend={() => resend(email.trim().toLowerCase())} />
            )}
          </div>
        )}

        <button type="submit" className="btn-accent mt-5 w-full" disabled={busy || !canSubmit}>
          {busy && <Spinner />}
          {busy
            ? "Un momento…"
            : mode === "in"
              ? "Entrar"
              : mode === "up"
                ? "Crear mi cuenta"
                : "Mandarme el link"}
        </button>
      </form>

      {mode !== "reset" && (
        <p className="mt-3 text-center text-[14px] text-ink2">
          {mode === "in" ? "¿Primera vez? " : "¿Ya tenés cuenta? "}
          <button
            type="button"
            className="min-h-[44px] font-bold text-accent underline decoration-2 underline-offset-4"
            onClick={() => switchMode(mode === "in" ? "up" : "in")}
          >
            {mode === "in" ? "Creá tu cuenta" : "Entrá"}
          </button>
        </p>
      )}
    </Shell>
  );
}

/** Marco: celular = marca arriba y formulario abajo (cerca del pulgar); tablet = centrado; escritorio = marca a la izquierda. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 md:justify-center lg:max-w-[1040px] lg:flex-row lg:items-center lg:gap-20 lg:px-10">
      <header className="flex flex-1 flex-col items-center justify-center py-5 text-center md:flex-none md:pb-8 lg:flex-1 lg:items-start lg:text-left">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/nutrify-icon-512.png"
          alt=""
          width={60}
          height={60}
          className="h-[60px] w-[60px] drop-shadow-[0_10px_22px_rgba(18,104,74,0.25)] lg:h-[76px] lg:w-[76px]"
        />
        <h1 className="mt-2.5 text-[28px] font-extrabold leading-none tracking-tight text-ink lg:mt-5 lg:text-[52px]">Nutrify</h1>
        <p className="mt-2 max-w-[280px] text-[15px] font-medium leading-snug text-ink2 lg:mt-4 lg:max-w-[400px] lg:text-[21px]">
          Escribí lo que comiste. Nosotros hacemos la cuenta.
        </p>
      </header>
      <div className="pb-2 md:mx-auto md:w-full md:max-w-[420px] lg:mx-0 lg:w-[420px] lg:shrink-0">{children}</div>
    </main>
  );
}

function SentCard({
  sent,
  onResend,
  onBack,
}: {
  sent: NonNullable<Sent>;
  onResend?: () => Promise<string | null>;
  onBack: () => void;
}) {
  return (
    <div className="glass animate-fade rounded-[28px] p-6 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full grad-d text-ink shadow-fab">
        <Icon name="mail" size={26} strokeWidth={2} />
      </span>
      <h2 className="mt-4 text-[22px] font-extrabold text-ink">Revisá tu correo</h2>
      <p className="mt-2 text-[15px] leading-snug text-ink2">
        Te mandamos un link a <b className="break-all text-ink">{sent.email}</b>.{" "}
        {sent.kind === "signup" ? "Abrilo desde este celular para activar tu cuenta." : "Abrilo desde este celular para elegir una contraseña nueva."}
      </p>
      <p className="mt-2 text-[13px] text-ink2">Si no llega en un par de minutos, mirá en spam.</p>
      {onResend && <ResendInline onResend={onResend} block />}
      <button type="button" onClick={onBack} className="btn-ghost mt-3 w-full">
        Volver a entrar
      </button>
    </div>
  );
}

/** Botón "Reenviar" con espera de 30 s entre envíos. */
function ResendInline({ onResend, block }: { onResend: () => Promise<string | null>; block?: boolean }) {
  const [wait, setWait] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className={block ? "mt-5" : "mt-2"}>
      <button
        type="button"
        disabled={busy || wait > 0}
        onClick={async () => {
          setBusy(true);
          const err = await onResend();
          setBusy(false);
          setMsg(err ?? "Listo, te lo mandamos de nuevo.");
          if (!err) setWait(30);
        }}
        className={
          block
            ? "btn-accent w-full"
            : "min-h-[44px] text-[14px] font-bold text-accent underline decoration-2 underline-offset-4 disabled:opacity-50"
        }
      >
        {busy ? "Enviando…" : wait > 0 ? `Reenviar en ${wait} s` : "Reenviar el mail"}
      </button>
      {msg && <p className="mt-2 text-[13px] font-medium text-ink2">{msg}</p>}
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/25 border-t-ink" aria-hidden />;
}
