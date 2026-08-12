import { CalendarDays, History, StickyNote } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { ACTIVITY_LABEL_KEY } from "@/app/activities/activityLabels";
import { useActivities } from "@/app/activities/useActivities";
import { DEAL_TIMELINE_TYPES } from "@/app/deals/DealTimelineSection";
import { useEvents } from "@/app/events/useEvents";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/useLocale";
import { testIds } from "@/lib/testids";

/** How many rows each section shows before collapsing into "…a další". */
const MAX_ROWS = 3;
/** Desktop hover dwell before the preview opens. */
const HOVER_DELAY_MS = 300;
/** Mobile long-press dwell. Longer than dnd-kit's 250ms touch sensor so a
 *  press that turns into a drag never also pops the preview. */
const LONG_PRESS_MS = 400;
const PANEL_WIDTH = 264;
/** Rough panel height used only to decide whether to flip above the card.
 *  Bumped with the "Poslední akce" section. */
const PANEL_HEIGHT_ESTIMATE = 260;
/** Same set the deal timeline shows, so "Poslední akce" cannot surface a
 *  field edit the timeline itself no longer lists. */
const PREVIEW_ACTIVITY_TYPES: string[] = [...DEAL_TIMELINE_TYPES];

interface Anchor {
  /** Panel left edge, already clamped into the viewport. */
  left: number;
  /** Distance from the viewport top when opening downwards. */
  top?: number;
  /** Distance from the viewport bottom when flipped above the card. */
  bottom?: number;
}

function anchorFrom(rect: DOMRect): Anchor {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8));
  const flip = rect.bottom + PANEL_HEIGHT_ESTIMATE > window.innerHeight - 8;
  return flip
    ? { left, bottom: window.innerHeight - rect.top + 6 }
    : { left, top: rect.bottom + 6 };
}

/**
 * Hover/long-press plumbing for the card preview. Returns the props to spread
 * on the card plus the state the popover needs. The card element is the
 * anchor, so the caller passes its ref.
 */
// The hook ships next to the popover it drives — they share the anchor math
// and are never used apart. eslint-disable-next-line keeps fast refresh quiet
// about the non-component export (same trade-off as lib/toast.tsx).
// eslint-disable-next-line react-refresh/only-export-components
export function useDealCardPreview(ref: React.RefObject<HTMLElement>) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // True while the current touch press has opened the preview — the release
  // of that press must NOT also count as a tap on the card (the browser
  // still synthesizes a click after touchend, which opened the deal detail
  // dialog on top of the preview).
  const longPressFired = useRef(false);
  const tooltipId = useId();

  const clearTimer = useCallback(() => window.clearTimeout(timer.current), []);
  const close = useCallback(() => {
    clearTimer();
    setAnchor(null);
  }, [clearTimer]);

  const openAfter = useCallback(
    (delay: number) => {
      clearTimer();
      timer.current = window.setTimeout(() => {
        const rect = ref.current?.getBoundingClientRect();
        if (rect) setAnchor(anchorFrom(rect));
      }, delay);
    },
    [clearTimer, ref],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // While open: Escape, any scroll (the panel is fixed and would drift away
  // from its card) and the next pointer press all dismiss it.
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("scroll", close, true);
    document.addEventListener("pointerdown", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("pointerdown", close, true);
    };
  }, [anchor, close]);

  return {
    open: anchor !== null,
    anchor,
    tooltipId,
    close,
    /**
     * Desktop: dwell-then-show on hover, instant on keyboard focus. Spread on
     * the card root — these never collide with dnd-kit, which drags off
     * mousedown/touchstart.
     */
    hoverHandlers: {
      onMouseEnter: () => openAfter(HOVER_DELAY_MS),
      onMouseLeave: close,
      onFocus: () => openAfter(0),
      onBlur: close,
    },
    /**
     * Touch long-press, for the (non-draggable) mobile card only. Releasing
     * the finger leaves an opened panel on screen so it can be read; the next
     * tap or scroll dismisses it. A press that opened the preview swallows
     * its own release (preventDefault on touchend + a click-capture guard) so
     * the ghost click can't also open the deal detail underneath.
     */
    longPressHandlers: {
      onTouchStart: () => {
        longPressFired.current = false;
        clearTimer();
        timer.current = window.setTimeout(() => {
          const rect = ref.current?.getBoundingClientRect();
          if (rect) {
            longPressFired.current = true;
            setAnchor(anchorFrom(rect));
          }
        }, LONG_PRESS_MS);
      },
      onTouchMove: close,
      onTouchEnd: (e: React.TouchEvent) => {
        clearTimer();
        // touchend is not on React's passive-listener list, so this reliably
        // cancels the synthesized click on browsers that honor it…
        if (longPressFired.current) e.preventDefault();
      },
      onTouchCancel: close,
      // …and this capture-phase guard catches the click on browsers that
      // synthesize it anyway, before it reaches the deal-name button.
      onClickCapture: (e: React.MouseEvent) => {
        if (longPressFired.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressFired.current = false;
        }
      },
    },
  };
}

interface PreviewRow {
  key: string;
  title: string;
  meta: string;
}

/**
 * Read-only popover listing a deal's calendar events and notes. Mounted only
 * while open, so the two queries fire on first hover and are then served from
 * the react-query cache (shared with the deal detail page, same keys).
 *
 * `position: fixed` off the card's rect — the stage column scrolls and clips,
 * so an absolutely-positioned panel would be cut off. `pointer-events-none`
 * keeps it from swallowing hover/drag on the board underneath.
 */
export function DealCardPreview({
  dealId,
  anchor,
  tooltipId,
}: {
  dealId: string;
  anchor: Anchor;
  tooltipId: string;
}) {
  const { t } = useTranslation("deals");
  // Activity-type labels live in the shared `common` catalog (see ActivityRow).
  const { t: tCommon } = useTranslation("common");
  const locale = useLocale();
  const { data: eventsPage, isPending: eventsPending } = useEvents({ dealId, limit: 50 });
  const { data: activitiesPage, isPending: notesPending } = useActivities({
    entityType: "deal",
    entityId: dealId,
    limit: 50,
    activityTypes: PREVIEW_ACTIVITY_TYPES,
  });

  const events = useMemo<PreviewRow[]>(() => {
    const items = eventsPage?.items ?? [];
    const now = Date.now();
    const upcoming = items
      .filter((e) => new Date(e.ends_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const past = items
      .filter((e) => new Date(e.ends_at).getTime() < now)
      .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
    return [...upcoming, ...past].map((e) => ({
      key: e.id,
      title: e.title,
      meta: formatDate(e.starts_at, locale, { dateStyle: "medium", timeStyle: "short" }),
    }));
  }, [eventsPage, locale]);

  const notes = useMemo<PreviewRow[]>(() => {
    const items = activitiesPage?.items ?? [];
    return items
      .filter((a) => a.activity_type === "note")
      .map((a) => {
        const payload = (a.payload ?? {}) as Record<string, unknown>;
        const body = typeof payload.note === "string" ? payload.note : "";
        // First line only — the card preview is a glance, not the timeline.
        const firstLine = body.split("\n").find((line) => line.trim() !== "") ?? "";
        return {
          key: a.id,
          title: firstLine.trim(),
          meta: formatDate(a.created_at, locale, { dateStyle: "medium" }),
        };
      })
      .filter((row) => row.title !== "");
  }, [activitiesPage, locale]);

  // Newest activity of any type — the endpoint returns them created_at desc,
  // so `items[0]` is it. Answers "what last happened here" without opening
  // the deal; the notes section below only ever shows note-type rows.
  const lastAction = useMemo<PreviewRow | null>(() => {
    const latest = activitiesPage?.items?.[0];
    if (!latest) return null;
    return {
      key: latest.id,
      title: tCommon(ACTIVITY_LABEL_KEY[latest.activity_type]),
      meta: formatDate(latest.created_at, locale, { dateStyle: "medium" }),
    };
  }, [activitiesPage, locale, tCommon]);

  const pending = eventsPending || notesPending;
  const isEmpty = !pending && !lastAction && events.length === 0 && notes.length === 0;

  return createPortal(
    <div
      id={tooltipId}
      role="tooltip"
      data-testid={testIds.pipeline.preview.popover}
      style={{
        position: "fixed",
        left: anchor.left,
        top: anchor.top,
        bottom: anchor.bottom,
        width: PANEL_WIDTH,
        zIndex: 80,
      }}
      // The panel floats over deal cards that share its surface color (light
      // theme: both are white), so it needs more edge than a default popover:
      // strong border + a second hairline ring outside it + the top shadow step.
      className="pointer-events-none rounded-md border border-border-strong bg-surface-elevated p-3 text-xs shadow-lg ring-1 ring-border"
    >
      {pending ? (
        <p className="text-text-tertiary">{t("cardPreview.loading")}</p>
      ) : isEmpty ? (
        <p className="text-text-tertiary">{t("cardPreview.empty")}</p>
      ) : (
        <div className="space-y-3">
          {lastAction ? (
            <PreviewSection
              icon={<History size={12} strokeWidth={1.75} aria-hidden />}
              title={t("cardPreview.lastActionTitle")}
              rows={[lastAction]}
              moreLabel={(count) => t("cardPreview.more", { count })}
            />
          ) : null}
          {events.length > 0 ? (
            <PreviewSection
              icon={<CalendarDays size={12} strokeWidth={1.75} aria-hidden />}
              title={t("cardPreview.eventsTitle")}
              rows={events}
              moreLabel={(count) => t("cardPreview.more", { count })}
            />
          ) : null}
          {notes.length > 0 ? (
            <PreviewSection
              icon={<StickyNote size={12} strokeWidth={1.75} aria-hidden />}
              title={t("cardPreview.notesTitle")}
              rows={notes}
              moreLabel={(count) => t("cardPreview.more", { count })}
            />
          ) : null}
        </div>
      )}
    </div>,
    document.body,
  );
}

function PreviewSection({
  icon,
  title,
  rows,
  moreLabel,
}: {
  icon: React.ReactNode;
  title: string;
  rows: PreviewRow[];
  moreLabel: (count: number) => string;
}) {
  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;
  return (
    <section>
      <p className="flex items-center gap-1.5 font-medium uppercase tracking-wider text-text-tertiary">
        {icon}
        {title}
      </p>
      <ul className="mt-1 space-y-1">
        {visible.map((row) => (
          <li key={row.key}>
            <span className="block truncate text-text-primary">{row.title}</span>
            <span className="block text-text-tertiary">{row.meta}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p className="mt-1 text-text-tertiary">{moreLabel(hidden)}</p> : null}
    </section>
  );
}
