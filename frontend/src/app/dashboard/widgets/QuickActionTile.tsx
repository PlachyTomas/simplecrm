import type { LucideIcon } from "lucide-react";

import { testIds } from "@/lib/testids";
import { cn } from "@/lib/utils";

interface QuickActionTileProps {
  /** Action widget type — drives the test id. */
  type: string;
  label: string;
  icon: LucideIcon;
  onActivate: () => void;
  isEditMode: boolean;
}

/**
 * A whole-tile quick-action button: `bg-surface` card, Lucide icon in an
 * `bg-accent-subtle` box, label to the right. Indigo accent only. In edit
 * mode the click is inert (drag/remove happen through the edit chrome).
 */
export function QuickActionTile({ type, label, icon: Icon, onActivate, isEditMode }: QuickActionTileProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (!isEditMode) onActivate();
      }}
      aria-disabled={isEditMode || undefined}
      data-testid={testIds.dashboard.quickAction(type)}
      className={cn(
        "flex h-full min-h-[44px] w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left shadow-sm transition-colors duration-fast",
        isEditMode ? "cursor-default" : "hover:border-accent hover:bg-surface-overlay",
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent"
      >
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">{label}</span>
    </button>
  );
}
