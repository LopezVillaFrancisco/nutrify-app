"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { AiHealthPanel, useAiHealth } from "@/components/AiCheck";
import { Toast, useToast } from "@/components/Toast";
import { createClient } from "@/lib/supabase/browser";
import { apiResult } from "@/lib/api";
import { fmtInt, parseDecimal } from "@/lib/format";
import { waterGoal } from "@/lib/health";
import { fetchers, keys } from "@/lib/queries";
import { clearCache, setCached, useQuery } from "@/lib/store";
import { AI_DAILY_CAP, type AiMode, type Cup, type Settings } from "@/lib/types";
import { DEFAULT_CUPS } from "@/lib/settings";

type Form = { kcal: string; protein: string; low: string; high: string; weight: string; height: string; steps: string; water: string; ai: AiMode; cups: CupForm[] };
type CupForm = { name: string; ml: string };

const AI_OPTIONS: { value: AiMode; label: string; help: string }[] = [
  { value: "ask", label: "Preguntarme", help: "Te pregunta antes de usarla." },
  { value: "auto", label: "Automática", help: "Completa sola lo que no encuentra." },
  { value: "off", label: "Nunca", help: "Lo que no encuentre queda en 0." },
];

const str = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

export default function PerfilPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const settingsQ = useQuery<Settings>(keys.settings, fetchers.settings, 5 * 60_000);
  const email = useQuery<string>(keys.email, fetchers.email, Infinity).data ?? "";
  const aiHealth = useAiHealth(true);
  // Pedidos a la IA de hoy (los cuenta el backend)
  const usage = aiHealth.health?.usedToday;
  const [f, setF] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { toast, show, hide } = useToast();

  // El formulario se completa apenas hay datos (de la caché, al instante)
  const s = settingsQ.data;
  useEffect(() => {
    if (!s || f) return;
    setF({
      kcal: String(s.kcal),
      protein: String(s.protein),
      low: String(s.rangeLow),
      high: String(s.rangeHigh),
      weight: str(s.weightKg),
      height: str(s.heightCm),
      steps: String(s.stepsGoal),
      water: str(s.waterGoalMl),
      ai: s.aiMode,
      cups: (s.cups?.length ? s.cups : DEFAULT_CUPS).map((c) => ({ name: c.name, ml: String(c.ml) })),
    });
  }, [s, f]);

  const set = (k: keyof Form) => (v: string) => setF((cur) => (cur ? { ...cur, [k]: v } : cur));
  const n = (v: string | undefined) => parseDecimal(v ?? "");
  const opt = (v: string | undefined) => ((v ?? "").trim() === "" ? null : n(v));

  const k = n(f?.kcal);
  const lo = n(f?.low);
  const hi = n(f?.high);
  const weight = opt(f?.weight);
  const autoWater = waterGoal({ ...(s ?? ({} as Settings)), waterGoalMl: null, weightKg: weight && weight > 0 ? weight : null });

  // Vasos válidos (nombre y ml entre 50 y 3000)
  const cups: Cup[] = (f?.cups ?? [])
    .map((c) => ({ name: c.name.trim().slice(0, 24), ml: Math.round(n(c.ml)) }))
    .filter((c) => c.name && c.ml >= 50 && c.ml <= 3000);
  const setCup = (i: number, k: keyof CupForm) => (v: string) =>
    setF((cur) => (cur ? { ...cur, cups: cur.cups.map((c, j) => (j === i ? { ...c, [k]: v } : c)) } : cur));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    const p = n(f.protein);
    const height = opt(f.height);
    const steps = n(f.steps);
    const water = opt(f.water);
    if (!(k >= 500 && k <= 10000)) return setError("Las calorías tienen que estar entre 500 y 10.000.");
    if (!(p > 0 && p <= 600)) return setError("La proteína tiene que estar entre 1 y 600 g.");
    if (!(lo > 0 && hi > lo && hi <= 300)) return setError("El rango tiene que ir de menor a mayor (ej. 80% a 110%).");
    if (weight !== null && !(weight >= 25 && weight <= 350)) return setError("Revisá el peso (en kg).");
    if (height !== null && !(height >= 100 && height <= 250)) return setError("Revisá la altura (en cm, ej. 175).");
    if (!(steps >= 500 && steps <= 100000)) return setError("La meta de pasos tiene que estar entre 500 y 100.000.");
    if (water !== null && !(water >= 500 && water <= 8000)) return setError("La meta de agua tiene que estar entre 500 y 8.000 ml.");
    setError(null);
    setSaving(true);

    const { data: saved, error: err } = await apiResult<Settings>("/api/settings", {
      method: "PUT",
      body: {
        kcal: Math.round(k),
        protein: Math.round(p),
        rangeLow: Math.round(lo),
        rangeHigh: Math.round(hi),
        weightKg: weight,
        heightCm: height === null ? null : Math.round(height),
        stepsGoal: Math.round(steps),
        waterGoalMl: water === null ? null : Math.round(water),
        aiMode: f.ai,
        cups: cups.length ? cups : DEFAULT_CUPS,
      },
    });
    setSaving(false);
    if (err || !saved) return setError(err?.message ?? "No se pudo guardar. Probá de nuevo.");

    setCached<Settings>(keys.settings, saved);
    show("Guardado");
    aiHealth.refresh();
  }

  async function signOut() {
    setLeaving(true);
    await supabase.auth.signOut();
    clearCache();
    router.replace("/login");
    router.refresh();
  }

  const disabled = !f;

  return (
    <>
      <header className="flex min-h-[64px] items-start pt-1">
        <div>
          <Link href="/" className="-ml-1 inline-flex min-h-[32px] items-center gap-0.5 text-[13px] font-semibold text-ink2 md:hidden">
            <Icon name="chevron-left" size={16} /> Hoy
          </Link>
          <p className="hidden text-[13px] font-medium text-ink2 md:block">Tus metas y tu cuenta</p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">Perfil</h1>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <form onSubmit={save} noValidate className="glass mt-4 p-5 md:p-6">
          <div className="space-y-6 md:grid md:grid-cols-2 md:gap-x-8 md:gap-y-7 md:space-y-0">
            <Group title="Comida">
              <Num id="kcal" label="Calorías" suffix="kcal" value={f?.kcal} onChange={set("kcal")} disabled={disabled} />
              <Num id="protein" label="Proteína" suffix="g" value={f?.protein} onChange={set("protein")} disabled={disabled} />
            </Group>

            <Group
              title="Día “en tu rango”"
              hint={k > 0 && lo > 0 && hi > lo ? `Entre ${fmtInt((k * lo) / 100)} y ${fmtInt((k * hi) / 100)} kcal por día.` : " "}
            >
              <Num id="low" label="Desde" suffix="%" value={f?.low} onChange={set("low")} disabled={disabled} />
              <Num id="high" label="Hasta" suffix="%" value={f?.high} onChange={set("high")} disabled={disabled} />
            </Group>

            <Group title="Tu cuerpo" hint="Para los pasos y la meta de agua.">
              <Num id="weight" label="Peso" suffix="kg" placeholder="ej. 78" decimal value={f?.weight} onChange={set("weight")} disabled={disabled} />
              <Num id="height" label="Altura" suffix="cm" placeholder="ej. 175" value={f?.height} onChange={set("height")} disabled={disabled} />
            </Group>

            <Group
              title="Actividad"
              hint={
                (f?.water ?? "").trim() === ""
                  ? `Agua automática: ${fmtInt(autoWater.ml)} ml.`
                  : "Vacía = se calcula con tu peso."
              }
            >
              <Num id="steps" label="Pasos" value={f?.steps} onChange={set("steps")} disabled={disabled} />
              <Num id="water" label="Agua" suffix="ml" placeholder={String(autoWater.ml)} value={f?.water} onChange={set("water")} disabled={disabled} />
            </Group>

            <fieldset>
              <legend className="text-[17px] font-extrabold text-ink">Tus vasos</legend>
              <p className="mt-1 text-[12.5px] leading-snug text-ink2">Aparecen en Hoy para sumar agua de un toque (los 2 primeros).</p>
              <ul className="mt-3 space-y-2">
                {(f?.cups ?? []).map((c, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input
                      className="input min-w-0 flex-[3]"
                      aria-label={`Nombre del vaso ${i + 1}`}
                      placeholder="ej. Copa"
                      maxLength={24}
                      value={c.name}
                      onChange={(e) => setCup(i, "name")(e.target.value)}
                      disabled={disabled}
                    />
                    <div className="relative min-w-0 flex-[2]">
                      <input
                        className="input !pr-11"
                        inputMode="numeric"
                        aria-label={`Mililitros del vaso ${i + 1}`}
                        aria-invalid={c.ml.trim() !== "" && !(n(c.ml) >= 50 && n(c.ml) <= 3000)}
                        placeholder="400"
                        value={c.ml}
                        onChange={(e) => setCup(i, "ml")(e.target.value)}
                        disabled={disabled}
                      />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink2">ml</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`Quitar ${c.name || "vaso"}`}
                      disabled={disabled || (f?.cups.length ?? 0) <= 1}
                      onClick={() => setF((cur) => (cur ? { ...cur, cups: cur.cups.filter((_, j) => j !== i) } : cur))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink2 disabled:opacity-30"
                    >
                      <Icon name="x" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              {(f?.cups.length ?? 0) < 4 && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setF((cur) => (cur ? { ...cur, cups: [...cur.cups, { name: "", ml: "" }] } : cur))}
                  className="mt-2 min-h-[44px] text-[14px] font-bold text-accent"
                >
                  + Agregar vaso
                </button>
              )}
            </fieldset>
          </div>

          <fieldset className="mt-7">
            <legend className="text-[17px] font-extrabold text-ink">Inteligencia artificial</legend>
            <p className="mt-1 text-[12.5px] leading-snug text-ink2">
              Solo para lo que no encuentra en las bases. Hoy:{" "}
              <b className="text-ink">
                {usage ?? 0} de {AI_DAILY_CAP}
              </b>{" "}
              pedidos.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-[16px] bg-white/60 p-1" role="radiogroup" aria-label="Uso de IA">
              {AI_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={f?.ai === o.value}
                  disabled={disabled}
                  onClick={() => setF((cur) => (cur ? { ...cur, ai: o.value } : cur))}
                  className={`min-h-[44px] rounded-[12px] px-1 text-[13.5px] ${f?.ai === o.value ? "bg-white font-bold text-accent shadow-glass" : "font-semibold text-ink2"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-ink2">{AI_OPTIONS.find((o) => o.value === f?.ai)?.help}</p>
            <div className="mt-2 rounded-[20px] bg-white/45 p-3.5">
              <AiHealthPanel {...aiHealth} onRefresh={() => aiHealth.refresh(true)} compact />
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="mt-5 rounded-2xl bg-[rgba(240,162,46,0.14)] px-4 py-3 text-[14px] font-semibold text-ink">
              {error}
            </p>
          )}

          <div className="mt-6 md:flex md:justify-end">
            <button type="submit" className="btn-accent w-full md:w-auto md:min-w-[220px]" disabled={saving || disabled}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>

        <section className="glass mt-4 p-5 md:p-6" aria-labelledby="cuenta">
          <h2 id="cuenta" className="text-[17px] font-extrabold text-ink">
            Cuenta
          </h2>
          <p className="mt-1 break-all text-[14px] text-ink2">{email || " "}</p>
          <button type="button" className="btn-ghost mt-4 w-full text-ink2" onClick={signOut} disabled={leaving}>
            {leaving ? "Saliendo…" : "Salir de la cuenta"}
          </button>
        </section>
      </div>

      <Toast toast={toast} onHide={hide} />
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-[17px] font-extrabold text-ink">{title}</legend>
      <div className="mt-3 grid grid-cols-2 gap-3">{children}</div>
      {hint !== undefined && <p className="mt-1.5 min-h-[18px] text-[12.5px] leading-snug text-ink2">{hint}</p>}
    </fieldset>
  );
}

function Num({
  id,
  label,
  suffix,
  placeholder,
  decimal,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  suffix?: string;
  placeholder?: string;
  decimal?: boolean;
  value: string | undefined;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`input ${suffix ? (suffix.length > 2 ? "!pr-14" : "!pr-10") : ""}`}
          inputMode={decimal ? "decimal" : "numeric"}
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink2">{suffix}</span>
        )}
      </div>
    </div>
  );
}
