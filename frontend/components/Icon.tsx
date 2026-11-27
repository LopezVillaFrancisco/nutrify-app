/** Íconos de línea (trazo 1.8, 24x24). Heredan el color con currentColor. */
export type IconName =
  | "home"
  | "list"
  | "plus"
  | "chart"
  | "user"
  | "mail"
  | "lock"
  | "eye"
  | "eye-off"
  | "chevron-left"
  | "chevron-right"
  | "x"
  | "check"
  | "trash"
  | "edit"
  | "repeat"
  | "bookmark"
  | "drop"
  | "steps"
  | "dumbbell"
  | "play"
  | "clock"
  | "sparkle"
  | "search";

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3.5 11 12 4l8.5 7v8.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z" />,
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="4.5" cy="18" r="0.9" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chart: <path d="M5 20v-8M12 20V5M19 20v-5" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.4-3.6 4.3-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "eye-off": (
    <>
      <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.6M6.4 7.1C3.9 8.8 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" />
    </>
  ),
  "chevron-left": <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  "chevron-right": <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  trash: (
    <>
      <path d="M4 7h16M10 11v6M14 11v6M9 7V4.5h6V7" />
      <path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
    </>
  ),
  edit: <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 7.5l3 3" />,
  repeat: <path d="M4 11V9a3 3 0 0 1 3-3h12m-3-3 3 3-3 3M20 13v2a3 3 0 0 1-3 3H5m3 3-3-3 3-3" />,
  bookmark: <path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1Z" />,
  drop: <path d="M12 3.5s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11Z" />,
  steps: (
    <>
      <path d="M8.5 3.5c1.8 0 2.8 1.8 2.8 4.2 0 2-.8 3.6-1 4.8H6.4c-.3-1.3-.9-2.7-.9-4.6 0-2.5 1.2-4.4 3-4.4Z" />
      <path d="M6.6 15.5h3.6v1.3a1.8 1.8 0 0 1-3.6 0z" />
      <path d="M15.5 7.5c1.8 0 3 1.9 3 4.4 0 1.9-.6 3.3-.9 4.6h-3.9c-.2-1.2-1-2.8-1-4.8 0-2.4 1-4.2 2.8-4.2Z" />
      <path d="M13.8 19.5h3.6v.2a1.8 1.8 0 0 1-3.6 0z" />
    </>
  ),
  dumbbell: <path d="M6.5 7v10M4 9v6M17.5 7v10M20 9v6M6.5 12h11" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  sparkle: <path d="M12 3.5 13.8 9a2 2 0 0 0 1.2 1.2l5.5 1.8-5.5 1.8a2 2 0 0 0-1.2 1.2L12 20.5 10.2 15A2 2 0 0 0 9 13.8L3.5 12 9 10.2A2 2 0 0 0 10.2 9ZM19 3v3M17.5 4.5h3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
};

export default function Icon({
  name,
  size = 22,
  strokeWidth = 1.8,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
