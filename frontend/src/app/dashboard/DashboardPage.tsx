import { Handshake, Target, Trophy, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { type KpiSummary, useKpiSummary } from "@/app/dashboard/useKpi";
import { useCurrentUser } from "@/auth/useCurrentUser";

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "default" | "highlight";
}

function KpiCard({ label, value, hint, icon: Icon, accent = "default" }: KpiCardProps) {
  const bg =
    accent === "highlight"
      ? "bg-highlight-subtle text-text-primary"
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

function formatMoney(value: string, currency: string, locale: string): string {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${numeric.toLocaleString(locale)} ${currency}`;
  }
}

export function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: kpi, isPending, isError } = useKpiSummary();

  const locale = user?.organization.locale ?? "cs-CZ";
  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" })
        .format(new Date())
        .replace(/^\w/, (c) => c.toUpperCase());
    } catch {
      return "";
    }
  }, [locale]);

  if (isPending || !user) {
    return (
      <div className="p-8 text-sm text-text-tertiary" role="status">
        Načítání přehledu…
      </div>
    );
  }

  if (isError || !kpi) {
    return (
      <div
        className="m-4 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-sm text-danger md:m-8"
        role="alert"
      >
        Přehled KPI se nepodařilo načíst.
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Vítejte zpět, {user.name}</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Rychlý přehled za {monthLabel.toLowerCase() || "tento měsíc"}.
        </p>
      </header>

      <section
        aria-label="Klíčové ukazatele"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          label="Otevřené obchody"
          value={String(kpi.open_deal_count)}
          icon={Handshake}
          hint="V probíhající pipeline"
        />
        <KpiCard
          label="Hodnota pipeline"
          value={formatMoney(kpi.open_pipeline_value, kpi.currency, locale)}
          icon={Workflow}
          hint="Součet otevřených obchodů"
        />
        <KpiCard
          label="Vyhráno tento měsíc"
          value={String(kpi.won_this_month_count)}
          icon={Target}
          hint="Počet uzavřených obchodů"
        />
        <KpiCard
          label="Výnosy tento měsíc"
          value={formatMoney(kpi.won_this_month_value, kpi.currency, locale)}
          icon={Trophy}
          accent="highlight"
          hint="Součet vyhraných obchodů"
        />
      </section>
    </div>
  );
}

export type { KpiSummary };
