export default function PageHeader({
  eyebrow,
  title,
  right,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-[64px] items-start justify-between gap-3 pt-1">
      <div className="min-w-0">
        {eyebrow && <p className="truncate text-[13px] font-medium text-ink2">{eyebrow}</p>}
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
      </div>
      {right}
    </header>
  );
}
