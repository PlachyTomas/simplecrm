import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "default" | "highlight";
}

export function KpiCard({ label, value, hint, icon: Icon, accent = "default" }: KpiCardProps) {
  // The "highlight" accent is the screen's magenta moment — used by the
  // Trophy icon on the "Výnosy tento měsíc" celebration KPI. Magenta tinted
  // background, magenta icon (currentColor on the lucide stroke).
  const bg =
    accent === "highlight"
      ? "bg-brand-accent-subtle text-brand-accent"
      : "bg-accent-subtle text-accent";
  return (
    <article className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">{label}</p>
        <span
          aria-hidden
          className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${bg}`}
        >
          <Icon size={16} strokeWidth={1.75} />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-text-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-text-tertiary">{hint}</p> : null}
    </article>
  );
}
