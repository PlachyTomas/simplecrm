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
import { useTranslation } from "react-i18next";

import { WidgetError, WidgetFrame, WidgetSkeleton } from "@/components/widget-dashboard/WidgetFrame";
import {
  type GlobalFilters,
  type WidgetEntry,
  WIDGET_LABEL_KEY,
} from "@/app/reports/dashboard/types";
import { useWidgetQuery } from "@/app/reports/dashboard/useWidgetQuery";
import { type ListColumn, ListWidget } from "@/app/reports/dashboard/widgets/ListWidget";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
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
    throw new Error(`widget config type mismatch: expected ${expected}, got ${config.type}`);
  }
  return config as Extract<Config, { type: T }>;
}

// ---------- stale_deals ----------

export function StaleDealsWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "stale_deals");
  const navigate = useNavigate();
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["StaleDealsResponse"]>({
    type: "stale_deals",
    endpoint: "stale-deals",
    config,
    globalFilters: props.globalFilters,
  });

  type Row = ApiSchemas["StaleDealItem"];

  const columns: ListColumn<Row>[] = [
    {
      header: t("list.staleDeals.columnDeal"),
      render: (r) => <span className="font-medium text-text-primary">{r.deal_name}</span>,
    },
    {
      header: t("list.staleDeals.columnCompany"),
      render: (r) => <span className="text-text-secondary">{r.company_name}</span>,
    },
    {
      header: t("list.staleDeals.columnStage"),
      render: (r) => <span className="text-text-tertiary">{r.stage_name}</span>,
      nowrap: true,
    },
    {
      header: t("list.staleDeals.columnValue"),
      align: "right",
      nowrap: true,
      render: (r) => (
        <span className="tabular-nums text-text-secondary">
          {formatMoney(r.value, r.currency, locale)}
        </span>
      ),
    },
    {
      header: t("list.staleDeals.columnOwner"),
      render: (r) => <span className="text-text-tertiary">{r.owner_name}</span>,
      nowrap: true,
    },
    {
      header: t("list.staleDeals.columnDaysSinceChange"),
      align: "right",
      nowrap: true,
      render: (r) => (
        <span
          className={cn(
            "inline-flex tabular-nums",
            r.days_since_change >= 90 && "font-medium text-danger",
            r.days_since_change >= 60 && r.days_since_change < 90 && "font-medium text-warning",
          )}
        >
          {formatNumber(r.days_since_change, locale)}
        </span>
      ),
    },
  ];

  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY.stale_deals)}
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
          emptyMessage={t("list.staleDeals.empty", { count: q.data.threshold_days })}
        />
      )}
    </WidgetFrame>
  );
}

// ---------- companies_at_risk ----------

export function CompaniesAtRiskWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "companies_at_risk");
  const navigate = useNavigate();
  const { t } = useTranslation("reports");
  const locale = useLocale();
  const q = useWidgetQuery<ApiSchemas["CompaniesAtRiskResponse"]>({
    type: "companies_at_risk",
    endpoint: "companies-at-risk",
    config,
    globalFilters: props.globalFilters,
  });

  type Row = ApiSchemas["CompanyAtRiskItem"];

  const columns: ListColumn<Row>[] = [
    {
      header: t("list.companiesAtRisk.columnCompany"),
      render: (r) => <span className="font-medium text-text-primary">{r.company_name}</span>,
    },
    {
      header: t("list.companiesAtRisk.columnOwner"),
      render: (r) => <span className="text-text-tertiary">{r.owner_name}</span>,
      nowrap: true,
    },
    {
      header: t("list.companiesAtRisk.columnDaysRemaining"),
      align: "right",
      nowrap: true,
      render: (r) => (
        <span
          className={cn(
            "inline-flex font-medium tabular-nums",
            r.days_until_freeing <= 7 && "text-danger",
            r.days_until_freeing > 7 && r.days_until_freeing <= 14 && "text-warning",
            r.days_until_freeing > 14 && r.days_until_freeing <= 30 && "text-text-secondary",
            r.days_until_freeing > 30 && "text-text-tertiary",
          )}
        >
          {r.days_until_freeing}
        </span>
      ),
    },
    {
      header: t("list.companiesAtRisk.columnLastActivity"),
      align: "right",
      nowrap: true,
      render: (r) => (
        <span className="text-text-tertiary">
          {formatDate(r.last_activity_at, locale, { day: "numeric", month: "numeric", year: "2-digit" })}
        </span>
      ),
    },
  ];

  return (
    <WidgetFrame
      label={t(WIDGET_LABEL_KEY.companies_at_risk)}
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
          emptyMessage={t("list.companiesAtRisk.empty", { count: q.data.threshold_days })}
        />
      )}
    </WidgetFrame>
  );
}
