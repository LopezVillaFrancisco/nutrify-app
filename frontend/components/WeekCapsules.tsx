import { WEEK_LETTERS, WEEK_NAMES, inRange, type DayMap } from "@/lib/days";
import { fmtInt } from "@/lib/format";
import type { Settings } from "@/lib/types";

type Props = {
  days: string[]; // 7 fechas, lunes a domingo
  data: DayMap;
  settings: Settings;
  today: string;
  size?: "sm" | "lg";
};

/** Cápsulas de la semana: se llenan de abajo hacia arriba con el degradé según el % de la meta. */
export default function WeekCapsules({ days, data, settings, today, size = "sm" }: Props) {
  const h = size === "lg" ? 112 : 40;
  const w = size === "lg" ? 30 : 20;
  return (
    <ol className="flex items-end justify-between" aria-label="Calorías por día">
      {days.map((date, i) => {
        const d = data[date];
        const pct = d && settings.kcal > 0 ? Math.min(d.kcal / settings.kcal, 1) : 0;
        const future = date > today;
        const isToday = date === today;
        const label = future
          ? `${WEEK_NAMES[i]}: todavía no llegó`
          : d
            ? `${WEEK_NAMES[i]}: ${fmtInt(d.kcal)} kcal${inRange(d.kcal, settings) ? ", en tu rango" : ""}`
            : `${WEEK_NAMES[i]}: sin anotar`;
        return (
          <li key={date} className="flex flex-col items-center gap-1.5" aria-label={label}>
            <div
              className="relative overflow-hidden rounded-full"
              style={{
                width: w,
                height: h,
                background: future ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.9)",
              }}
            >
              {pct > 0 && (
                <div
                  className="absolute inset-x-0 bottom-0 grad-v transition-[height] duration-500"
                  style={{ height: `${Math.max(pct * 100, 8)}%` }}
                />
              )}
              {isToday && <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 2px #1F9D6B" }} />}
            </div>
            <span className={`text-[12px] ${isToday ? "font-extrabold text-accent" : "font-semibold text-ink2"}`} aria-hidden>
              {WEEK_LETTERS[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
