import { ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useState } from "react";

import { activityDetail, activityLabel, changeFieldLabel } from "@/app/activities/activityLabels";
import type { ActivityOut } from "@/app/activities/useActivities";
import { useLocale } from "@/lib/i18n/useLocale";

/**
 * The backend denormalizes the actor's name onto each activity row, but the
 * generated OpenAPI type may not include it yet, so we widen `ActivityOut`
 * locally. `payload` stays a loose record; every new field is optional and
 * treated defensively so legacy rows keep rendering.
 */
export type ActivityItem = ActivityOut & { user_name?: string | null };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** A changed field's `from`/`to` side → display string (blank/null → "—"). */
function sideValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

function DetailLine({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-sm text-text-secondary">{children}</p>;
}

/**
 * Per-field edit list ("Název: staré → nové"). More than three changed fields
 * collapse to the first two behind a "Zobrazit vše (N)" toggle.
 */
function ChangesDetail({ entries }: { entries: [string, unknown][] }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const collapsible = entries.length > 3;
  const visible = collapsible && !expanded ? entries.slice(0, 2) : entries;
  return (
    <div className="mt-0.5 space-y-0.5">
      {visible.map(([field, delta]) => {
        const d = (delta ?? {}) as Record<string, unknown>;
        return (
          <p key={field} className="text-sm text-text-secondary">
            <span className="text-text-tertiary">{changeFieldLabel(field)}:</span>{" "}
            {sideValue(d.from)} → {sideValue(d.to)}
          </p>
        );
      })}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-hover"
        >
          {expanded ? (
            <>
              <ChevronUp size={14} strokeWidth={1.75} aria-hidden /> Skrýt
            </>
          ) : (
            <>
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden /> Zobrazit vše (
              {entries.length})
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

function ActivityDetail({
  activity,
  payload,
  locale,
}: {
  activity: ActivityItem;
  payload: Record<string, unknown>;
  locale: string;
}): JSX.Element | null {
  const type = activity.activity_type;

  // Field-level edits: render the structured `changes` map when present,
  // otherwise fall back to the legacy names list (never raw enums/UUIDs).
  if (type === "deal_updated" || type === "company_updated") {
    const { changes } = payload;
    if (changes && typeof changes === "object" && !Array.isArray(changes)) {
      const entries = Object.entries(changes as Record<string, unknown>);
      if (entries.length > 0) return <ChangesDetail entries={entries} />;
    }
    const legacy = activityDetail(activity);
    return legacy ? <DetailLine>{legacy}</DetailLine> : null;
  }

  // Calendar events carry a title and an ISO start time.
  if (type === "event_created") {
    const title = asString(payload.title);
    const startsAt = asString(payload.starts_at);
    const parts = [title, startsAt ? formatDateTime(startsAt, locale) : null].filter(Boolean);
    return parts.length ? <DetailLine>{parts.join(" · ")}</DetailLine> : null;
  }

  const detail = activityDetail(activity);
  return detail ? <DetailLine>{detail}</DetailLine> : null;
}

/**
 * A single timeline row. Deal-scoped rows lead with the deal name
 * (`Obchod „X" · Změna fáze`); everything else shows the bare action label.
 * Renders as an `<li>` to slot into the timeline `<ol>` at the call site.
 */
export function ActivityRow({ activity }: { activity: ActivityItem }): JSX.Element {
  const locale = useLocale();
  const payload = (activity.payload ?? {}) as Record<string, unknown>;
  const dealName = asString(payload.deal_name);
  const label = activityLabel(activity.activity_type);
  const userName = asString(activity.user_name);

  return (
    <li className="relative">
      <span
        aria-hidden
        className="absolute -left-[26px] top-1 inline-block h-2.5 w-2.5 rounded-full bg-accent"
      />
      <p className="text-sm font-medium text-text-primary">
        {dealName ? (
          <>
            Obchod „{dealName}“<span className="font-normal text-text-secondary"> · {label}</span>
          </>
        ) : (
          label
        )}
      </p>
      <ActivityDetail activity={activity} payload={payload} locale={locale} />
      <p className="mt-0.5 text-xs text-text-tertiary">
        {userName ? <span>{userName} · </span> : null}
        {formatDateTime(activity.created_at, locale)}
      </p>
    </li>
  );
}
