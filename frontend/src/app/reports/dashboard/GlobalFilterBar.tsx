import { useMemo } from "react";

import { useCurrentUser } from "@/auth/useCurrentUser";
import { cn } from "@/lib/utils";

import {
  PRESET_LABEL,
  type RangePreset,
  VISIBLE_PRESETS,
} from "@/app/reports/dashboard/dateRange";
import type { GlobalFilters } from "@/app/reports/dashboard/types";

interface GlobalFilterBarProps {
  value: GlobalFilters;
  onChange: (next: GlobalFilters) => void;
}

/**
 * Sticky header above the widget grid. Three controls — date range
 * preset (segmented), team dropdown (admin-only), owner dropdown
 * (limited to scope). Per REPORTS_TASK §5.1.
 *
 * The team and owner option lists come from the existing org
 * endpoints (`/api/v1/teams`, `/api/v1/users`); we lift those queries
 * into this component so the widget grid below stays a pure
 * consumer of `globalFilters`.
 */
export function GlobalFilterBar({ value, onChange }: GlobalFilterBarProps) {
  const { data: me } = useCurrentUser();
  const isAdmin = me?.role === "admin";

  const presets = useMemo(() => VISIBLE_PRESETS, []);

  function setPreset(preset: RangePreset) {
    onChange({
      ...value,
      dateRange: { preset, from: null, to: null },
    });
  }

  return (
    <div
      className="sticky top-0 z-10 -mx-4 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur md:-mx-8 md:px-8"
      role="toolbar"
      aria-label="Filtry reportů"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Časové období"
          className="flex flex-wrap gap-1"
        >
          {presets.map((preset) => {
            const active = value.dateRange?.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreset(preset)}
                className={cn(
                  "h-8 rounded-md border px-3 text-xs font-medium transition-colors duration-fast",
                  active
                    ? "border-accent bg-accent text-text-on-accent"
                    : "border-border bg-surface text-text-secondary hover:bg-surface-overlay",
                )}
              >
                {PRESET_LABEL[preset]}
              </button>
            );
          })}
        </div>

        {isAdmin ? (
          <span className="ml-auto text-xs text-text-tertiary">
            Filtry týmu a obchodníka přijdou v R5+ (work in progress).
          </span>
        ) : (
          <span className="ml-auto text-xs text-text-tertiary">
            Vidíte data svého týmu.
          </span>
        )}
      </div>
    </div>
  );
}
