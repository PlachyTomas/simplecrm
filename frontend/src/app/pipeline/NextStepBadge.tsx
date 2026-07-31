/**
 * "Next step" line for a pipeline card — activity-based selling made
 * visible (see docs/research/2026-07-31-crm-user-wants-research.md).
 *
 * A deal WITH an upcoming event shows when the next step happens — quiet,
 * informational. A deal WITHOUT one shows a warning: research puts
 * broken follow-up as the single largest preventable pipeline leak, so
 * "nobody has planned what happens next" is a state worth one loud-ish
 * line. Same single-line discipline as RottingBadge: rotting says "this
 * sat too long" (lagging), this says "nothing is planned" (leading).
 *
 * Callers gate on open deals — the API already sends NULL for closed
 * ones, but a lost deal sitting in an open column also shouldn't nag.
 */

import { CalendarClock, CalendarOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDate } from "@/lib/format";
import { testIds } from "@/lib/testids";

export function NextStepBadge({
  dealId,
  nextEventAt,
  locale,
}: {
  dealId: string;
  nextEventAt: string | null | undefined;
  locale: string;
}) {
  const { t } = useTranslation("deals");
  if (nextEventAt) {
    return (
      <p
        data-testid={testIds.pipeline.nextStep(dealId)}
        className="mt-1.5 inline-flex items-center gap-1 text-xs text-text-tertiary"
      >
        <CalendarClock size={12} strokeWidth={1.75} aria-hidden />
        {t("pipelinePage.nextStep.label", {
          date: formatDate(nextEventAt, locale, {
            weekday: "short",
            day: "numeric",
            month: "numeric",
          }),
        })}
      </p>
    );
  }
  return (
    <p
      data-testid={testIds.pipeline.nextStep(dealId)}
      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-warning"
    >
      <CalendarOff size={12} strokeWidth={1.75} aria-hidden />
      {t("pipelinePage.nextStep.missing")}
    </p>
  );
}
