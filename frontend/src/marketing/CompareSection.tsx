import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";

import {
  COMPARE_ROWS,
  COMPARE_VENDORS,
  PRICES_CHECKED_ON,
  type CompareCell,
} from "@/marketing/compareData";

const PRICE_PER_USER_CZK = 99;
const FIVE_SEATS_CZK = PRICE_PER_USER_CZK * 5;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-tertiary";

function CellContent({ cell }: { cell: CompareCell }) {
  const { t } = useTranslation("marketing");
  if (!cell.tier) {
    const note = cell.note ?? "notListed";
    if (note === "none") {
      return <span className="text-sm text-text-tertiary">—</span>;
    }
    return <span className="text-sm text-text-tertiary">{t(`compare.notes.${note}`)}</span>;
  }
  if (cell.note === "none") {
    return <span className="text-sm text-text-primary">{cell.tier}</span>;
  }
  return (
    <span className="text-sm text-text-primary">
      {cell.tier}
      {cell.note ? (
        <span className="text-xs text-text-tertiary"> · {t(`compare.notes.${cell.note}`)}</span>
      ) : null}
    </span>
  );
}

/**
 * Competitor price + feature comparison (§ 2980 obč. zák. comparative
 * advertising): word marks only, vendor-verified figures only, unverified
 * cells say "neuvádí", and the small print carries date + sources.
 */
export function CompareSection() {
  const { t } = useTranslation("marketing");
  const locale = useLocale();
  const checkedOn = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(
    new Date(`${PRICES_CHECKED_ON}T12:00:00`),
  );

  return (
    <section id="srovnani" className="mx-auto max-w-[1200px] px-4 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-text-tertiary">
          {t("compare.eyebrow")}
        </p>
        <h2 className="mt-2 text-3xl font-bold md:text-4xl">{t("compare.title")}</h2>
        <p className="mt-3 text-sm text-text-secondary">{t("compare.subtitle")}</p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <article
          data-testid={testIds.marketing.compare.simplecrmCard}
          className="rounded-xl border-2 border-accent bg-surface p-5 shadow-md"
        >
          <p className="text-base font-semibold text-text-primary">SimpleCRM</p>
          <p className="text-xs text-text-tertiary">{t("compare.simplecrmTier")}</p>
          <p className="mt-3 text-2xl font-bold tabular-nums text-text-primary">
            {formatMoney(FIVE_SEATS_CZK, "CZK", locale)}
          </p>
          <p className="text-xs text-text-tertiary">{t("compare.fiveSeats")}</p>
          <p className="mt-2 text-xs text-text-secondary">
            {t("compare.simplecrmNote", {
              perSeat: formatMoney(PRICE_PER_USER_CZK, "CZK", locale),
            })}
          </p>
        </article>

        {COMPARE_VENDORS.map((vendor) => (
          <article
            key={vendor.name}
            className="rounded-xl border border-border bg-surface p-5 shadow-sm"
          >
            <p className="text-base font-semibold text-text-primary">{vendor.name}</p>
            <p className="text-xs text-text-tertiary">{vendor.matchingTier}</p>
            <p className="mt-3 text-2xl font-bold tabular-nums text-text-primary">
              {formatMoney(vendor.fiveSeatsMonthly, vendor.currency, locale)}
            </p>
            <p className="text-xs text-text-tertiary">
              {t("compare.fiveSeats")}
              {vendor.vatExclusiveStated ? ` · ${t("compare.vatExclusive")}` : ""}
            </p>
            <p className="mt-2 text-xs text-text-secondary">
              {t("compare.perSeat", {
                perSeat: formatMoney(vendor.perSeatMonthly, vendor.currency, locale),
              })}
              {vendor.noteKey ? ` ${t(`compare.vendorNotes.${vendor.noteKey}`)}` : ""}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-10 overflow-x-auto rounded-lg border border-border bg-surface">
        <table
          data-testid={testIds.marketing.compare.table}
          className="min-w-full divide-y divide-border-subtle"
        >
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {t("compare.columnFeature")}
              </th>
              <th scope="col" className={`${TH} bg-accent-subtle`}>
                SimpleCRM
              </th>
              {COMPARE_VENDORS.map((vendor) => (
                <th key={vendor.name} scope="col" className={TH}>
                  {vendor.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {COMPARE_ROWS.map((row) => (
              <tr key={row.axisKey}>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {t(`compare.axes.${row.axisKey}`)}
                </td>
                <td className="bg-accent-subtle px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-accent">
                    <Check size={16} strokeWidth={1.75} aria-hidden />
                    {t("compare.included")}
                  </span>
                </td>
                {row.cells.map((cell, i) => (
                  <td key={COMPARE_VENDORS[i]?.name ?? i} className="px-4 py-3">
                    <CellContent cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mx-auto mt-6 max-w-3xl text-xs text-text-tertiary">
        <p>{t("compare.disclaimerPrices", { date: checkedOn })}</p>
        <p className="mt-1">{t("compare.disclaimerMethod")}</p>
        <p className="mt-1">
          {t("compare.disclaimerSources")}{" "}
          {COMPARE_VENDORS.map((vendor, i) => (
            <span key={vendor.name}>
              {i > 0 ? " · " : ""}
              <a
                href={vendor.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                {vendor.name}
              </a>
            </span>
          ))}
        </p>
        <p className="mt-1">{t("compare.disclaimerTrademarks")}</p>
      </div>
    </section>
  );
}
