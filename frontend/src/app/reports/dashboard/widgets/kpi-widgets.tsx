/**
 * The seven KPI tile widgets — `pipeline_value`, `deals_won`,
 * `win_rate`, `avg_deal_size`, `sales_cycle_length`,
 * `lead_to_deal_conversion`, `new_companies`. They all share the same
 * shape: fetch one widget endpoint via `useWidgetQuery`, render the
 * primary number + optional sparkline through `KPITile`, and the
 * comparison delta in `WidgetFrame.footer`.
 *
 * Empty-denominator cases (no closed deals → `win_rate.value === null`,
 * etc.) render an em-dash and a plain hint per REPORTS_TASK §4.
 */

import { DeltaBadge } from "@/app/reports/dashboard/DeltaBadge";
import {
  formatDays,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/app/reports/dashboard/format";
import {
  WidgetEmpty,
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
import { useCurrentUser } from "@/auth/useCurrentUser";
import type { components } from "@/types/api.generated";

import { KPITile } from "@/app/reports/dashboard/widgets/KPITile";

type ApiSchemas = components["schemas"];
type Config = ApiSchemas["WidgetEntry"]["config"];

interface BaseWidgetProps {
  entry: WidgetEntry;
  globalFilters: GlobalFilters;
  isEditMode: boolean;
  onRemove: () => void;
}

/**
 * Type-narrowing hook: pull a config of a specific widget type out of
 * the discriminated union without prop-drilling the cast everywhere.
 */
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

// --------- pipeline_value ---------

export function PipelineValueWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "pipeline_value");
  const locale = useOrgLocale();
  const q = useWidgetQuery<ApiSchemas["PipelineValueResponse"]>({
    type: "pipeline_value",
    endpoint: "pipeline-value",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="pipeline_value" footer={<DeltaBadge comparison={q.data?.comparison} />}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={formatMoney(q.data.value, q.data.currency, locale)}
          sparkline={q.data.sparkline}
          sparklineLabel="Trend hodnoty pipeline"
          hint="Otevřené obchody v období"
        />
      )}
    </Frame>
  );
}

// --------- deals_won ---------

export function DealsWonWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "deals_won");
  const locale = useOrgLocale();
  const q = useWidgetQuery<ApiSchemas["DealsWonResponse"]>({
    type: "deals_won",
    endpoint: "deals-won",
    config,
    globalFilters: props.globalFilters,
  });
  const display = config.display;
  return (
    <Frame {...props} type="deals_won" footer={<DeltaBadge comparison={q.data?.comparison} />}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={
            display === "value"
              ? formatMoney(q.data.value, q.data.currency, locale)
              : formatNumber(q.data.count, locale)
          }
          secondary={
            display === "both"
              ? formatMoney(q.data.value, q.data.currency, locale)
              : undefined
          }
          sparkline={q.data.sparkline}
          sparklineLabel="Trend vyhraných obchodů"
        />
      )}
    </Frame>
  );
}

// --------- win_rate ---------

export function WinRateWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "win_rate");
  const q = useWidgetQuery<ApiSchemas["WinRateResponse"]>({
    type: "win_rate",
    endpoint: "win-rate",
    config,
    globalFilters: props.globalFilters,
  });
  const totalClosed =
    (q.data?.won_count ?? 0) + (q.data?.lost_count ?? 0);
  const empty = q.data?.value === null;
  return (
    <Frame {...props} type="win_rate" footer={<DeltaBadge comparison={q.data?.comparison} />}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : empty ? (
        <WidgetEmpty message="V tomto období žádné uzavřené obchody." />
      ) : (
        <KPITile
          value={formatPercent(q.data.value, 1)}
          hint={`${q.data.won_count} výher z ${totalClosed} uzavřených`}
        />
      )}
    </Frame>
  );
}

// --------- avg_deal_size ---------

export function AvgDealSizeWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "avg_deal_size");
  const locale = useOrgLocale();
  const q = useWidgetQuery<ApiSchemas["AvgDealSizeResponse"]>({
    type: "avg_deal_size",
    endpoint: "avg-deal-size",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="avg_deal_size" footer={<DeltaBadge comparison={q.data?.comparison} />}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.sample_count === 0 ? (
        <WidgetEmpty
          message={
            config.scope === "won"
              ? "V tomto období žádné vyhrané obchody."
              : "V tomto období žádné otevřené obchody."
          }
        />
      ) : (
        <KPITile
          value={formatMoney(q.data.value, q.data.currency, locale)}
          hint={`${q.data.sample_count} ${pluralizeDeal(q.data.sample_count)} ${
            config.scope === "won" ? "(vyhrané)" : "(otevřené)"
          }`}
        />
      )}
    </Frame>
  );
}

// --------- sales_cycle_length ---------

export function SalesCycleLengthWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "sales_cycle_length");
  const q = useWidgetQuery<ApiSchemas["SalesCycleLengthResponse"]>({
    type: "sales_cycle_length",
    endpoint: "sales-cycle-length",
    config,
    globalFilters: props.globalFilters,
  });
  // Shorter cycle = good, so the trend arrow logic flips here.
  return (
    <Frame {...props} type="sales_cycle_length" footer={null}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.value === null ? (
        <WidgetEmpty message="V tomto období žádné uzavřené obchody." />
      ) : (
        <KPITile
          value={formatDays(q.data.value)}
          hint={
            config.metric === "median"
              ? `Průměr ${formatDays(q.data.mean_days)}, vzorek ${q.data.sample_count}`
              : `Medián ${formatDays(q.data.median_days)}, vzorek ${q.data.sample_count}`
          }
        />
      )}
    </Frame>
  );
}

// --------- lead_to_deal_conversion ---------

export function LeadToDealConversionWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "lead_to_deal_conversion");
  const q = useWidgetQuery<ApiSchemas["LeadToDealConversionResponse"]>({
    type: "lead_to_deal_conversion",
    endpoint: "lead-to-deal-conversion",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame
      {...props}
      type="lead_to_deal_conversion"
      footer={<DeltaBadge comparison={q.data?.comparison} />}
    >
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : q.data.value === null ? (
        <WidgetEmpty message="V tomto období žádné nové firmy." />
      ) : (
        <KPITile
          value={formatPercent(q.data.value, 1)}
          hint={`${q.data.converted_count} z ${q.data.total_count} nových firem získalo obchod`}
        />
      )}
    </Frame>
  );
}

// --------- new_companies ---------

export function NewCompaniesWidget(props: BaseWidgetProps) {
  const config = narrowConfig(props.entry.config, "new_companies");
  const locale = useOrgLocale();
  const q = useWidgetQuery<ApiSchemas["NewCompaniesResponse"]>({
    type: "new_companies",
    endpoint: "new-companies",
    config,
    globalFilters: props.globalFilters,
  });
  return (
    <Frame {...props} type="new_companies" footer={<DeltaBadge comparison={q.data?.comparison} />}>
      {q.isPending ? (
        <WidgetSkeleton />
      ) : q.isError || !q.data ? (
        <WidgetError onRetry={() => void q.refetch()} />
      ) : (
        <KPITile
          value={formatNumber(q.data.value, locale)}
          sparkline={q.data.sparkline}
          sparklineLabel="Trend nových firem"
          hint="Firmy přidané v období"
        />
      )}
    </Frame>
  );
}

// --------- shared frame wrapper ---------

interface FrameProps extends BaseWidgetProps {
  type: ApiSchemas["WidgetEntry"]["config"]["type"];
  footer: React.ReactNode;
  children: React.ReactNode;
}

function Frame({ entry: _entry, isEditMode, onRemove, type, footer, children }: FrameProps) {
  return (
    <WidgetFrame
      label={WIDGET_LABEL[type]}
      isEditMode={isEditMode}
      onRemove={onRemove}
      footer={footer}
    >
      {children}
    </WidgetFrame>
  );
}

function pluralizeDeal(n: number): string {
  if (n === 1) return "obchod";
  if (n >= 2 && n <= 4) return "obchody";
  return "obchodů";
}
