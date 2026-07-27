/**
 * "Rotting" indicator for a pipeline card — a deal nobody has moved for a
 * while, so it doesn't die quietly.
 *
 * The day count comes straight from the board payload
 * (`days_since_last_move`, NULL for closed deals — a won or lost deal is
 * finished, not rotting) and is the exact number the `stale_deals` report
 * shows for the same deal; both go through one backend helper.
 *
 * The threshold is per-org (`deal_rotting_days`, default 14, 0 = off). Past
 * the threshold the badge is a warning; past 2× it escalates to danger,
 * because a deal that has sat still for a month under a 14-day policy is a
 * different conversation from one that just crossed the line.
 *
 * Deliberately a single quiet line, not a restyle of the card: it has to
 * coexist with the paid/won treatments already on these cards.
 */

import { AlertTriangle, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isCriticallyRotting, isRotting } from "@/app/pipeline/rotting";
import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

export function RottingBadge({
  dealId,
  days,
  threshold,
}: {
  dealId: string;
  days: number | null | undefined;
  threshold: number;
}) {
  const { t } = useTranslation("deals");
  if (!isRotting(days, threshold)) return null;
  const critical = isCriticallyRotting(days as number, threshold);
  const Icon = critical ? AlertTriangle : Clock;

  return (
    <p
      data-testid={testIds.pipeline.rottingBadge(dealId)}
      className={cn(
        "mt-1.5 inline-flex items-center gap-1 text-xs font-medium",
        critical ? "text-danger" : "text-warning",
      )}
    >
      <Icon size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span>{t("pipelinePage.card.rotting", { count: days as number })}</span>
    </p>
  );
}
