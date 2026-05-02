/**
 * The two list widgets — `stale_deals` and `companies_at_risk`.
 * Each renders a table inside `WidgetFrame`; rows click through to
 * the deal or company detail page so managers can act on what they
 * see.
 *
 * Backend caps both lists at 20 rows server-side (REPORTS_TASK §4
 * widgets #11, #12), so the frontend never needs pagination here.
 */

import { useNavigate } from "react-router-dom";

import { formatMoney, formatNumber } from "@/app/reports/dashboard/format";
import {
  WidgetError,
  WidgetFrame,
  WidgetSkeleton,
} from "@/app/reports/dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL,
} from "@/app/reports/dashboard/types";
import { useWidgetQuery } from "@/app/reports/dashboard/useWidgetQuery";
import {
  type ListColumn,
  ListWidget,
} from "@/app/reports/dashboard/widgets/ListWidget";
import { useCurrentUser } from "@/auth/useCurrentUser";
import { cn } from "@/lib/utils";
import type { components } from "@/types/api.generated";

type ApiSchemas = components["schemas"];
type Config = ApiSchemas["WidgetEntry"]["config"];

interface BaseWidgetProps {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
}

function narrowConfig<T extends Config["type"]>(
  config: Config,
  expected: T,
): Extract<Config, { type: T }> {
  if (config.type !== expected) {
    throw new Error(
      `widget config type mismatch: expected ${expected}, got ${config.type}`,
    );
  }
  return config as Extract<Config, { type: T }>;
}

function useOrgLocale(): string {
  const { data } = useCurrentUser();
  return data?.organization?.locale ?? "cs-CZ";
}

function formatCsDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

// ---------- stale_deals ----------

export function StaleDealsWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "stale_deals");
  const navigate = useNavigate();
  const locale = useOrgLocale();
  const q = useWidgetQuery<ApiSchemas["StaleDealsResponse"]>({
    type: "stale_deals",
    endpoint: "stale-deals",
    config,
    globalFilters: props.globalFilters,
  });

  type Row = ApiSchemas["StaleDealItem"];

  const columns: ListColumn<Row>[] = [
    {
      header: "Obchod",
      render: (r) => (
        <span className="font-medium text-text-primary">{r.deal_name}</span>
      ),
    },
    {
      header: "Firma",
      render: (r) => <span className="text-text-secondary">{r.company_name}</span>,
    },
    {
      header: "Fáze",
      render: (r) => <span className="text-text-tertiary">{r.stage_name}</span>,
      nowrap: true,
    },
    {
      header: "Hodnota",
      align: "right",
      nowrap: true,
      render: (r) => (
        <span className="tabular-nums text-text-secondary">
          {formatMoney(r.value, r.currency, locale)}
        </span>
      ),
    },
    {
      header: "Obchodník",
      render: (r) => (
        <span className="text-text-tertiary">{r.owner_name}</span>
      ),
      nowrap: true,
    },
    {
      header: "Dní bez pohybu",
      align: "right",
      nowrap: true,
      render: (r) => (
        <span
          className={cn(
            "inline-flex tabular-nums",
            r.days_since_change >= 90 && "font-medium text-danger",
            r.days_since_change >= 60 &&
              r.days_since_change < 90 &&
              "font-medium text-warning",
          )}
        >
          {formatNumber(r.days_since_change, locale)}
        </span>
      ),
    },
  ];

  return (
    <WidgetFrame
      label={WIDGET_LABEL.stale_deals}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <ListWidget<Row>
          rows={q.data.items}
          columns={columns}
          rowKey={(r) => r.deal_id}
          onRowClick={(r) => navigate(`/app/deals/${r.deal_id}`)}
          emptyMessage={`Žádné obchody bez pohybu déle než ${q.data.threshold_days} dní.`}
        />
      )}
    </WidgetFrame>
  );
}

// ---------- companies_at_risk ----------

export function CompaniesAtRiskWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "companies_at_risk");
  const navigate = useNavigate();
  const q = useWidgetQuery<ApiSchemas["CompaniesAtRiskResponse"]>({
    type: "companies_at_risk",
    endpoint: "companies-at-risk",
    config,
    globalFilters: props.globalFilters,
  });

  type Row = ApiSchemas["CompanyAtRiskItem"];

  const columns: ListColumn<Row>[] = [
    {
      header: "Firma",
      render: (r) => (
        <span className="font-medium text-text-primary">{r.company_name}</span>
      ),
    },
    {
      header: "Obchodník",
      render: (r) => (
        <span className="text-text-tertiary">{r.owner_name}</span>
      ),
      nowrap: true,
    },
    {
      header: "Zbývá dní",
      align: "right",
      nowrap: true,
      render: (r) => (
        <span
          className={cn(
            "inline-flex tabular-nums font-medium",
            r.days_until_freeing <= 7 && "text-danger",
            r.days_until_freeing > 7 &&
              r.days_until_freeing <= 14 &&
              "text-warning",
            r.days_until_freeing > 14 &&
              r.days_until_freeing <= 30 &&
              "text-text-secondary",
            r.days_until_freeing > 30 && "text-text-tertiary",
          )}
        >
          {r.days_until_freeing}
        </span>
      ),
    },
    {
      header: "Poslední aktivita",
      align: "right",
      nowrap: true,
      render: (r) => (
        <span className="text-text-tertiary">
          {formatCsDate(r.last_activity_at)}
        </span>
      ),
    },
  ];

  return (
    <WidgetFrame
      label={WIDGET_LABEL.companies_at_risk}
      isEditMode={props.isEditMode}
      onRemove={props.onRemove}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <ListWidget<Row>
          rows={q.data.items}
          columns={columns}
          rowKey={(r) => r.company_id}
          onRowClick={(r) => navigate(`/app/companies/${r.company_id}`)}
          emptyMessage={`Žádné firmy s vlastnictvím končícím do ${q.data.threshold_days} dní.`}
        />
      )}
    </WidgetFrame>
  );
}
