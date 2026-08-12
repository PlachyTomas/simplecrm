import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useActivities, type ActivityOut } from "@/app/activities/useActivities";
import { formatDate, formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

/**
 * The company Aktivita tab is deliberately narrow: only the three moments
 * that matter at the company level (a deal was created, won, or lost).
 * Everything else — field edits, calls, emails, calendar entries — belongs
 * to the deal's own timeline or the dedicated Emails tab, not here.
 */
const COMPANY_TIMELINE_TYPES = ["deal_created", "deal_won", "deal_lost"] as const;
type CompanyTimelineType = (typeof COMPANY_TIMELINE_TYPES)[number];

function isCompanyTimelineType(type: string): type is CompanyTimelineType {
  return (COMPANY_TIMELINE_TYPES as readonly string[]).includes(type);
}

/**
 * Won and lost must be distinguishable by color alone (owner requirement),
 * so both the dot AND the row wash carry the signal. `deal_created` stays
 * neutral — it's informational, not an outcome. Won is `--color-win`
 * (magenta, aliased from the brand accent) per the design skill: WON IS
 * NEVER GREEN.
 */
const ROW_STYLE: Record<
  CompanyTimelineType,
  {
    dot: string;
    row: string;
    labelKey:
      | "companyDetail.activityTab.dealCreated"
      | "companyDetail.activityTab.dealWon"
      | "companyDetail.activityTab.dealLost";
  }
> = {
  deal_created: { dot: "bg-accent", row: "", labelKey: "companyDetail.activityTab.dealCreated" },
  deal_won: {
    dot: "bg-win",
    row: "bg-win-subtle",
    labelKey: "companyDetail.activityTab.dealWon",
  },
  deal_lost: {
    dot: "bg-danger",
    row: "bg-danger-subtle",
    labelKey: "companyDetail.activityTab.dealLost",
  },
};

/**
 * Only `deal_won` payloads reliably carry both `value` and `currency` — see
 * `POST /deals/{id}` (created) and `/mark-lost` in `backend/app/api/v1/deals.py`,
 * which omit one or the other. Money renders only when both are present and
 * parse to a positive number, matching "the value, when the payload carries
 * one" rather than guessing a currency.
 */
function moneyFromPayload(
  payload: Record<string, unknown>,
): { value: number; currency: string } | null {
  const currency = payload.currency;
  if (typeof currency !== "string" || !currency) return null;
  const raw = payload.value;
  const numeric = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return { value: numeric, currency };
}

function CompanyActivityRow({
  activity,
  locale,
}: {
  activity: ActivityOut & { user_name?: string | null };
  locale: string;
}) {
  const { t } = useTranslation("companies");
  const type = activity.activity_type;
  // Defense in depth: the backend already filters by `activity_types`, but
  // the row renderer must never surface anything outside the three kinds
  // this tab owns.
  if (!isCompanyTimelineType(type)) return null;

  const style = ROW_STYLE[type];
  const payload = (activity.payload ?? {}) as Record<string, unknown>;
  const dealName =
    typeof payload.deal_name === "string" && payload.deal_name ? payload.deal_name : "—";
  const money = moneyFromPayload(payload);
  const userName =
    typeof activity.user_name === "string" && activity.user_name ? activity.user_name : null;
  const metaParts = [
    money ? formatMoney(money.value, money.currency, locale) : null,
    formatDate(activity.occurred_at, locale, { dateStyle: "medium" }),
    userName,
  ].filter((part): part is string => Boolean(part));

  return (
    <li
      data-testid={testIds.companies.activityRow(activity.id)}
      className={cn("flex items-start gap-3 rounded-md px-3 py-2", style.row)}
    >
      <span aria-hidden className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", style.dot)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t(style.labelKey)}</p>
        <p className="mt-0.5 truncate text-sm">
          <Link
            to={`/app/deals/${activity.entity_id}`}
            className="font-medium text-accent hover:text-accent-hover"
          >
            {dealName}
          </Link>
        </p>
        {metaParts.length > 0 ? (
          <p className="mt-0.5 text-xs text-text-tertiary">{metaParts.join(" · ")}</p>
        ) : null}
      </div>
    </li>
  );
}

export function CompanyActivityTab({ companyId }: { companyId: string }) {
  const { t } = useTranslation("companies");
  const locale = useLocale();
  const { data, isPending, isError } = useActivities({
    companyId,
    limit: 50,
    activityTypes: [...COMPANY_TIMELINE_TYPES],
  });

  if (isPending) {
    return <p className="text-sm text-text-tertiary">{t("companyDetail.activityTab.loading")}</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-danger">{t("companyDetail.activityTab.loadError")}</p>;
  }
  if (data.items.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("companyDetail.activityTab.title")}</h2>
        <p className="mt-4 text-sm text-text-secondary">{t("companyDetail.activityTab.empty")}</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("companyDetail.activityTab.title")}</h2>
      <ul className="mt-4 space-y-1">
        {data.items.map((activity) => (
          <CompanyActivityRow key={activity.id} activity={activity} locale={locale} />
        ))}
      </ul>
    </section>
  );
}
