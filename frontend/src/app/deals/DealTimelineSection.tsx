import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ActivityRow } from "@/app/activities/ActivityRow";
import { type ActivitiesPage, useActivities } from "@/app/activities/useActivities";
import { TimelineDraftRow } from "@/app/deals/TimelineDraftRow";
import { TimelineEntryRow } from "@/app/deals/TimelineEntryRow";
import { EmailDetailModal } from "@/app/emails/EmailDetailModal";
import { testIds } from "@/lib/testids";

// Small first page — the timeline opens the detail and research says the
// whole thing should fit a laptop viewport; recency carries the story.
const INITIAL_PAGE = 4;
const PAGE_STEP = 15;

/**
 * What belongs on a deal's own timeline: the actions the user logged by hand
 * plus the pipeline movements the system adds by itself. Everything else —
 * field edits, owner changes, e-mails, calendar entries — is audit data or
 * lives in its own section below, and would drown the narrative here.
 *
 * `deal_created` is deliberately absent: on the deal's own page it says
 * nothing the header does not. The pipeline card preview imports this set so
 * "Poslední akce" can never disagree with the timeline.
 */
export const DEAL_TIMELINE_TYPES = [
  "manual_action",
  "note",
  "call_logged",
  "stage_change",
  "deal_won",
  "deal_lost",
  "deal_reopened",
] as const;

// Module-level copy so the query key holds the same array every render.
const TIMELINE_TYPES: string[] = [...DEAL_TIMELINE_TYPES];

/**
 * The deal's narrative — a log the user writes, newest first, with the
 * pipeline's own movements folded in. Entries the caller may edit render as
 * inline-editable rows (no Save button anywhere); everything else keeps the
 * shared read-only `ActivityRow`. The Události and E-maily sections below
 * stay: those are editable detail, this is the story of what happened.
 */
export function DealTimelineSection({ dealId }: { dealId: string }) {
  const { t } = useTranslation("deals");
  const [limit, setLimit] = useState(INITIAL_PAGE);
  const [openEmailId, setOpenEmailId] = useState<string | null>(null);
  const { data, isError, isFetching } = useActivities({
    entityType: "deal",
    entityId: dealId,
    limit,
    activityTypes: TIMELINE_TYPES,
  });

  // The activities query keys on `limit` and carries no placeholder data, so
  // "Načíst další" would blank the list until the wider page lands. Keep the
  // last page on screen across that gap.
  const lastPage = useRef<ActivitiesPage | null>(null);
  if (data) lastPage.current = data;
  const page = data ?? lastPage.current;

  return (
    <section
      data-testid={testIds.deals.detail.timeline}
      className="rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="text-base font-semibold">{t("dealDetail.timeline.title")}</h2>
      {/* Always present, including while the feed loads or fails — an empty
          timeline is the one that most needs to be writable. */}
      <div className="mt-3">
        <TimelineDraftRow dealId={dealId} />
      </div>
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
          <ol className="mt-3 space-y-2 border-l border-border-subtle pl-5">
            {page.items.map((activity) =>
              activity.can_edit ? (
                <TimelineEntryRow
                  key={activity.id}
                  activity={activity}
                  onOpenEmail={setOpenEmailId}
                />
              ) : (
                <ActivityRow
                  key={activity.id}
                  activity={activity}
                  hideDealName
                  marker="line"
                  onOpenEmail={setOpenEmailId}
                />
              ),
            )}
          </ol>
          {page.items.length < page.total ? (
            <button
              type="button"
              onClick={() => setLimit((current) => current + PAGE_STEP)}
              disabled={isFetching}
              data-testid={testIds.deals.detail.timelineLoadMore}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border bg-surface-overlay px-4 text-sm font-medium text-text-secondary transition-colors duration-fast hover:bg-surface-elevated hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isFetching ? t("dealDetail.timeline.loading") : t("dealDetail.timeline.loadMore")}
            </button>
          ) : null}
        </>
      )}
      <EmailDetailModal
        emailId={openEmailId}
        onClose={() => setOpenEmailId(null)}
        onSwitch={setOpenEmailId}
      />
    </section>
  );
}
