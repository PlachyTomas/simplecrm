import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityRow } from "@/app/activities/ActivityRow";
import { type ActivitiesPage, useActivities } from "@/app/activities/useActivities";
import { testIds } from "@/lib/testids";

const PAGE_SIZE = 20;

/**
 * The deal's narrative — every activity logged against it, newest first, in the
 * same `ActivityRow` the company Aktivita tab uses so a deal reads identically
 * in both places. The Události and E-maily sections below stay: those are
 * editable detail, this is the story of what happened.
 */
export function DealTimelineSection({ dealId }: { dealId: string }) {
  const { t } = useTranslation("deals");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isError, isFetching } = useActivities({
    entityType: "deal",
    entityId: dealId,
    limit,
  });

  // The activities query keys on `limit` and carries no placeholder data, so
  // "Načíst další" would blank the list until the wider page lands. Keep the
  // last page on screen across that gap.
  const lastPage = useRef<ActivitiesPage | null>(null);
  if (data) lastPage.current = data;
  const page = data ?? lastPage.current;

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">{t("dealDetail.timeline.title")}</h2>
      {!page ? (
        isError ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {t("dealDetail.timeline.loadError")}
          </p>
        ) : (
          <p className="mt-3 text-sm text-text-tertiary" role="status">
            {t("dealDetail.timeline.loading")}
          </p>
        )
      ) : page.items.length === 0 ? (
        <p className="mt-3 text-sm text-text-secondary">{t("dealDetail.timeline.empty")}</p>
      ) : (
        <>
          <ol className="mt-3 space-y-3 border-l border-border-subtle pl-5">
            {page.items.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} hideDealName />
            ))}
          </ol>
          {page.items.length < page.total ? (
            <button
              type="button"
              onClick={() => setLimit((current) => current + PAGE_SIZE)}
              disabled={isFetching}
              data-testid={testIds.deals.detail.timelineLoadMore}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFetching ? t("dealDetail.timeline.loading") : t("dealDetail.timeline.loadMore")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
